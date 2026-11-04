import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { act } from "react";
import { expect, test, vi } from "vitest";
import type { Focus } from "../insights";
import AlertFeed, { type AlertItem, endpoint, evidence } from "./AlertFeed";

const NOW = Date.parse("2026-10-29T12:00:10.000Z");

function Feed({ alerts, captureTime = false, changed = new Map(), initialFocus = null, onAck = async () => {} }: {
  alerts: AlertItem[]; captureTime?: boolean; changed?: Map<string, "new" | "updated">; initialFocus?: Focus | null;
  onAck?: (id: string, acknowledged: boolean) => Promise<void>;
}) {
  const [severity, setSeverity] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [held, setHeld] = useState(changed);
  const [focus, setFocus] = useState<Focus | null>(initialFocus);
  return (
    <AlertFeed
      alerts={alerts}
      captureTime={captureTime}
      clock={NOW}
      frozen={false}
      severity={severity}
      activeOnly={activeOnly}
      onFilter={(s, a) => { setSeverity(s); setActiveOnly(a); }}
      changed={held}
      onSeen={(id) => setHeld((m) => { const n = new Map(m); n.delete(id); return n; })}
      mutedCount={0}
      showMuted={false}
      onShowMuted={() => {}}
      onAck={onAck}
      onMute={async () => {}}
      exportName="live"
      focus={focus}
      onFocus={setFocus}
    />
  );
}

const severities = ["high", "medium", "low"] as const;

function makeAlerts(n: number): AlertItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `a${i}`,
    timestamp: "2026-10-29T12:00:00.000Z",
    last_seen: "2026-10-29T12:00:00.000Z",
    src_ip: "127.0.0.1",
    dst_ip: "127.0.0.1",
    src_port: 40000 + i,
    dst_port: 80,
    protocol: "TCP",
    attack_type: i % 2 ? "anomaly" : "PortScan",
    confidence: 0.99,
    severity: severities[i % 3],
    source: i % 2 ? "isolation_forest" : "rule",
    count: 1,
    batch_id: null,
    acknowledged_at: null,
    suppressed_by: null,
  }));
}

const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]).queryAllByRole("row").filter((r) => !r.textContent?.startsWith("Expired:"));

test("renders at most the latest 200 of 1,000 alerts", () => {
  render(<Feed alerts={makeAlerts(1000)} />);
  expect(bodyRows()).toHaveLength(200);
  expect(screen.getByText(/showing 200 of 1,000/i)).toBeTruthy();
}, 20_000); // jsdom draws 400 SVG icons slowly; the browser render is measured live

test("severity is written out, not only a colour", () => {
  render(<Feed alerts={makeAlerts(3)} />);
  const body = screen.getAllByRole("rowgroup")[1];
  expect(within(body).getAllByText("High")).toHaveLength(1);
  expect(within(body).getAllByText("Medium")).toHaveLength(1);
});

test("severity and attack-type filters narrow the list", () => {
  render(<Feed alerts={makeAlerts(30)} />);
  fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "high" } });
  expect(bodyRows()).toHaveLength(10);
  fireEvent.change(screen.getByLabelText("Attack type"), { target: { value: "PortScan" } });
  expect(bodyRows()).toHaveLength(5);
  expect(bodyRows().every((row) => within(row).queryByText("PortScan"))).toBe(true);
});

test("upload view labels the time column as capture time", () => {
  render(<Feed alerts={makeAlerts(1)} captureTime />);
  expect(screen.getByRole("columnheader", { name: "Capture time" })).toBeTruthy();
});

test("evidence never shows an unmeasured percentage", () => {
  const [a] = makeAlerts(1);
  expect(evidence({ ...a, source: "rule", confidence: 1 })[0]).toBe("rule match");
  expect(evidence({ ...a, source: "isolation_forest", confidence: 0.9969 })).toEqual(["rarer than 99.6%", "Anomaly model: score above 99.6% of normal training flows"]);
  expect(evidence({ ...a, source: "isolation_forest", confidence: 1 })[0]).toBe("rarer than all");
  expect(evidence({ ...a, source: "random_forest", confidence: 0.8 })[0]).toBe("classifier 80%");
});

test("rows are ordered by latest activity, not first seen", () => {
  const [a, b] = makeAlerts(2);
  const older = { ...a, attack_type: "Older", timestamp: "2026-10-29T12:00:00.000Z", last_seen: "2026-10-29T12:00:05.000Z" };
  const updated = { ...b, attack_type: "Updated", timestamp: "2026-10-29T11:59:00.000Z", last_seen: "2026-10-29T12:01:00.000Z" };
  render(<Feed alerts={[older, updated]} />);
  expect(bodyRows().map((row) => within(row).queryByText(/Older|Updated/)?.textContent)).toEqual(["Updated", "Older"]);
});

test("an alert is in effect for 30 s after its last activity, then expired", () => {
  const [a, b] = makeAlerts(2);
  const fresh = { ...a, last_seen: "2026-10-29T12:00:00.000Z" }; // 10 s before NOW
  const old = { ...b, last_seen: "2026-10-29T11:59:30.000Z" }; // 40 s before NOW
  render(<Feed alerts={[fresh, old]} />);
  const [first, second] = bodyRows();
  expect(within(first).getByText("20 s left")).toBeTruthy();
  expect(within(second).queryByText(/s left/)).toBeNull();
  expect(screen.getByText("Expired: no activity for 30 s")).toBeTruthy(); // one divider between in effect and history
});

test("a changed row stays marked until it is looked at", () => {
  const [a] = makeAlerts(1);
  render(<Feed alerts={[a]} changed={new Map([[a.id, "updated" as const]])} />);
  const row = bodyRows()[0];
  expect(within(row).getByText("Updated")).toBeTruthy();
  vi.useFakeTimers();
  const button = within(row).getByRole("button");
  fireEvent.focus(button); // tabbing past is not looking
  fireEvent.blur(button);
  act(() => vi.advanceTimersByTime(1000));
  expect(within(row).getByText("Updated")).toBeTruthy();
  fireEvent.focus(button); // resting on it is
  act(() => vi.advanceTimersByTime(1000));
  vi.useRealTimers();
  expect(within(row).queryByText("Updated")).toBeNull();
});

test("IPv6 endpoints are bracketed", () => {
  expect(endpoint("::1", 52362)).toBe("[::1]:52362");
  expect(endpoint("10.0.0.1", 80)).toBe("10.0.0.1:80");
});

test("details open under the row and Escape closes them, returning focus to the row", () => {
  const [a] = makeAlerts(1);
  render(<Feed alerts={[a]} />);
  const button = screen.getByRole("button", { name: /details$/ });
  fireEvent.click(button);
  const heading = screen.getByRole("heading", { name: /details$/ });
  expect(document.activeElement).toBe(heading);
  fireEvent.keyDown(heading, { key: "Escape" });
  expect(screen.queryByRole("heading", { name: /details$/ })).toBeNull();
  expect(document.activeElement).toBe(button);
});

test("search narrows the feed to matching endpoints or attack names", () => {
  const alerts = makeAlerts(3).map((a, i) => ({ ...a, src_ip: `10.0.0.${i + 1}` }));
  render(<Feed alerts={alerts} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), { target: { value: "10.0.0.2" } });
  expect(bodyRows()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(bodyRows()).toHaveLength(3);
});

test("a focus shows as a chip that removes it", () => {
  const alerts = makeAlerts(2).map((a, i) => ({ ...a, src_ip: `10.0.0.${i + 1}` }));
  render(<Feed alerts={alerts} initialFocus={{ kind: "source", value: "10.0.0.1", label: "10.0.0.1" }} />);
  expect(bodyRows()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove filter 10.0.0.1" }));
  expect(bodyRows()).toHaveLength(2);
});

test("/ focuses search; j and k move between rows; a acknowledges the focused row", () => {
  const onAck = vi.fn(async () => {});
  render(<Feed alerts={makeAlerts(3)} onAck={onAck} />);
  fireEvent.keyDown(document.body, { key: "/" });
  expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search" }));
  (document.activeElement as HTMLElement).blur();
  const buttons = bodyRows().map((r) => within(r).getByRole("button"));
  fireEvent.keyDown(document.body, { key: "j" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0], { key: "j" });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1], { key: "k" });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0], { key: "a" });
  expect(onAck).toHaveBeenCalledWith(buttons[0].dataset.alert, true);
});

test("shortcuts do nothing while typing in the search box", () => {
  render(<Feed alerts={makeAlerts(2)} />);
  const search = screen.getByRole("searchbox", { name: "Search" });
  search.focus();
  fireEvent.keyDown(search, { key: "j" });
  expect(document.activeElement).toBe(search);
});
