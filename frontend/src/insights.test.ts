import { expect, test } from "vitest";
import type { AlertItem } from "./components/AlertFeed";
import {
  MORE, attackMap, dropShare, endpoint, formatShare, linkTone, matchesFocus, matchesSearch, niceTicks, timeline, timelineWindow, topTalkers,
} from "./insights";

const T0 = Date.parse("2026-11-03T12:00:00.000Z");

function alert(over: Partial<AlertItem> = {}): AlertItem {
  return {
    id: Math.random().toString(36).slice(2), timestamp: new Date(T0).toISOString(), last_seen: new Date(T0).toISOString(),
    src_ip: "10.0.0.9", dst_ip: "10.0.0.1", src_port: 40000, dst_port: 80, protocol: "TCP", attack_type: "PortScan",
    confidence: 1, severity: "low", source: "rule", count: 1, batch_id: null, acknowledged_at: null, suppressed_by: null, ...over,
  };
}
const at = (ms: number) => new Date(T0 + ms).toISOString();

test("endpoint brackets IPv6", () => {
  expect(endpoint("::1", 443)).toBe("[::1]:443");
  expect(endpoint("10.0.0.1", 80)).toBe("10.0.0.1:80");
});

test("timeline buckets by first-seen minute and splits severity", () => {
  const alerts = [
    alert({ timestamp: at(0), severity: "high" }),
    alert({ timestamp: at(59_999), severity: "low" }),
    alert({ timestamp: at(60_000), severity: "medium" }),
    alert({ timestamp: at(-1), severity: "high" }), // before the window
  ];
  const b = timeline(alerts, T0 + 120_000, 60_000, 2);
  expect(b.map(({ high, medium, low }) => [high, medium, low])).toEqual([[1, 0, 1], [0, 1, 0]]);
  expect(b[0].start).toBe(T0);
  expect(b[1].end).toBe(T0 + 120_000);
});

test("live window ends at the next bucket edge; phones get 30 two-minute buckets", () => {
  expect(timelineWindow([], true, T0 + 30_000, false)).toEqual({ end: T0 + 60_000, size: 60_000, count: 60 });
  expect(timelineWindow([], true, T0 + 30_000, true)).toEqual({ end: T0 + 120_000, size: 120_000, count: 30 });
});

test("an upload's window spans its own alerts", () => {
  const alerts = [alert({ timestamp: at(10_000) }), alert({ timestamp: at(3 * 3600_000) })];
  const w = timelineWindow(alerts, false, 0, false);
  const start = w.end - w.size * w.count;
  expect(start).toBe(T0);
  expect(w.end).toBeGreaterThan(T0 + 3 * 3600_000);
  expect(w.size % 60_000).toBe(0);
  expect(timeline(alerts, w.end, w.size, w.count).reduce((s, b) => s + b.high + b.medium + b.low, 0)).toBe(2);
});

test("top talkers sum repeats and break ties by latest activity", () => {
  const alerts = [
    alert({ src_ip: "10.0.0.2", count: 3, last_seen: at(0) }),
    alert({ src_ip: "10.0.0.3", count: 3, last_seen: at(5_000) }),
    alert({ src_ip: "10.0.0.2", count: 1, dst_port: 443 }),
  ];
  const { sources, ports } = topTalkers(alerts);
  expect(sources).toEqual([{ value: "10.0.0.2", count: 4 }, { value: "10.0.0.3", count: 3 }]);
  expect(ports).toEqual([{ value: "80", count: 6 }, { value: "443", count: 1 }]);

  // Equal totals: the source seen more recently ranks first, whichever order the alerts arrive in.
  const tied = (earlier: string, later: string) =>
    topTalkers([
      alert({ src_ip: earlier, count: 2, last_seen: at(0) }),
      alert({ src_ip: later, count: 2, last_seen: at(5_000) }),
    ]).sources.map((t) => t.value);
  expect(tied("10.0.0.2", "10.0.0.3")).toEqual(["10.0.0.3", "10.0.0.2"]);
  expect(tied("10.0.0.3", "10.0.0.2")).toEqual(["10.0.0.2", "10.0.0.3"]);
});

test("attack map keeps the top n per side and folds the rest into +N more", () => {
  const alerts = Array.from({ length: 10 }, (_, i) => alert({ src_ip: `10.0.0.${i + 1}`, count: 10 - i }));
  const map = attackMap(alerts, 8);
  expect(map.sources).toHaveLength(9);
  expect(map.sources[8]).toEqual({ key: MORE, count: 2 + 1 });
  expect(map.moreSources).toBe(2);
  expect(map.services).toEqual([{ key: "10.0.0.1:80", count: 55 }]);
  expect(map.links.find((l) => l.source === MORE)?.count).toBe(3);
});

test("link tone: High in effect, then active, then expired; uploads are history", () => {
  const link = (alerts: AlertItem[]) => ({ source: "a", service: "b", count: 1, alerts });
  const clock = T0 + 10_000;
  expect(linkTone(link([alert({ severity: "high" })]), clock, false)).toBe("high");
  expect(linkTone(link([alert()]), clock, false)).toBe("active");
  expect(linkTone(link([alert()]), T0 + 60_000, false)).toBe("expired");
  expect(linkTone(link([alert({ batch_id: 1 })]), clock, true)).toBe("active");
});

test("search matches either endpoint or the attack name, case-insensitively", () => {
  const a = alert({ src_ip: "192.168.1.7", dst_port: 8443, attack_type: "anomaly" });
  expect(matchesSearch(a, "")).toBe(true);
  expect(matchesSearch(a, "168.1")).toBe(true);
  expect(matchesSearch(a, "8443")).toBe(true);
  expect(matchesSearch(a, "ANOMALY")).toBe(true);
  expect(matchesSearch(a, "portscan")).toBe(false);
});

test("focus matches a minute, a source, a service or a port", () => {
  const a = alert({ timestamp: at(30_000) });
  expect(matchesFocus(a, null)).toBe(true);
  expect(matchesFocus(a, { kind: "minute", start: T0, end: T0 + 60_000, label: "" })).toBe(true);
  expect(matchesFocus(a, { kind: "minute", start: T0 + 60_000, end: T0 + 120_000, label: "" })).toBe(false);
  expect(matchesFocus(a, { kind: "source", value: "10.0.0.9", label: "" })).toBe(true);
  expect(matchesFocus(a, { kind: "service", value: "10.0.0.1:80", label: "" })).toBe(true);
  expect(matchesFocus(a, { kind: "port", value: "443", label: "" })).toBe(false);
});

test("drop share is a share of everything that arrived, never blank", () => {
  const h = { packets: 900, activeFlows: 3, queueDropped: 0, kernelDropped: 100 };
  expect(dropShare(100, h)).toBe(10);
  expect(formatShare(dropShare(0, h))).toBe("0%");
  expect(formatShare(dropShare(1, { packets: 0, activeFlows: 0, queueDropped: 0, kernelDropped: 0 }))).toBe("0%");
  expect(formatShare(0.05)).toBe("<0.1%");
  expect(formatShare(71.64)).toBe("71.6%");
});

test("niceTicks steps round and whole, with the top above the maximum", () => {
    expect(niceTicks(165)).toEqual([0, 50, 100, 150, 200]);
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(8)).toEqual([0, 5, 10, 15, 20]);
    expect(niceTicks(0)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(4_000)).toEqual([0, 2_000, 4_000, 6_000, 8_000]);
});
