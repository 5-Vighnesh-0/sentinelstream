# Dashboard Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an alert timeline, an animated attack map, capture health, top talkers, search with keyboard shortcuts, and animated attack-type bars to the SentinelStream dashboard.

**Architecture:** Pure functions in `frontend/src/insights.ts` turn the alerts the dashboard already holds into timeline buckets, rankings and map links; each new panel is one component that renders one of them. One `Focus` value in `App` (a minute, a source, a service or a port) is set by the panels and filters the alert feed. The backend adds one field, cumulative `packets`, to the `stats` WebSocket message.

**Tech Stack:** React 18, Tailwind v4, GSAP 3 (+ Flip), Recharts (traffic line only), Vitest + Testing Library; FastAPI + pytest.

**Spec:** [docs/superpowers/specs/2026-11-03-dashboard-insights-design.md](../specs/2026-11-03-dashboard-insights-design.md)

## Global Constraints

- No new dependencies (npm or Python), no new endpoints, no SQLite schema change.
- No true 3D and no perspective: depth comes from layering and motion only; every bar and stroke is linear in its value from zero.
- Panels compute from the alerts already loaded (`visible` in `App.tsx`: latest 200 live, 500 per upload) and say that scope in their description line.
- Light theme only, existing tokens only (`index.css` `@theme`); vermilion (`sev-high`) only for High and for kernel drops above 5%.
- Every animation is off or instant under `prefers-reduced-motion: reduce`.
- A value is never blank: zero prints as `0` / `0%`.
- IPv6 endpoints are bracketed with `endpoint()`.
- Keyboard shortcuts do nothing while focus is in an `input`, `select`, `textarea` or contenteditable, or with Ctrl/Meta/Alt held.
- `docs/API_SPEC.md` changes in the same commit as the backend field.
- Commit messages: plain imperative subject, no attribution lines.

## File map

| File | Change | Responsibility |
|---|---|---|
| `backend/api/main.py` | modify `Hub.stats` | add cumulative `packets` to `stats` |
| `tests/test_api.py` | add test | stats carries `packets` |
| `docs/API_SPEC.md` | modify `stats` section | document `packets` |
| `frontend/src/insights.ts` | create | `endpoint`, `Focus`, `matchesFocus`, `matchesSearch`, `timeline`, `timelineWindow`, `topTalkers`, `attackMap`, `linkTone`, `Health`, `dropShare`, `formatShare` |
| `frontend/src/insights.test.ts` | create | unit tests for the above |
| `frontend/src/components/AlertFeed.tsx` | modify | search box, focus chip, keyboard shortcuts, `endpoint` re-export |
| `frontend/src/components/AlertFeed.test.tsx` | modify | search, focus, keyboard tests |
| `frontend/src/components/AlertTimeline.tsx` | create | timeline panel |
| `frontend/src/components/AttackMap.tsx` | create | attack map panel |
| `frontend/src/components/TopTalkers.tsx` | create | top talkers panel |
| `frontend/src/components/Insights.test.tsx` | create | tests for the three new panels, Capture and Attack types |
| `frontend/src/components/TrafficChart.tsx` | modify | becomes the Capture panel (health figures) |
| `frontend/src/components/AttackDistribution.tsx` | rewrite | HTML bars re-ranked with GSAP Flip |
| `frontend/src/index.css` | modify | `tl-grow`, `tl-now` keyframes |
| `frontend/src/App.tsx` | modify | `focus` and `health` state, layout |
| `DESIGN.md`, `PROGRESS.md` | modify | final task |

Commands (from repo root): Python tests `.venv/bin/python -m pytest -q`; frontend tests `npm --prefix frontend test`; build `npm --prefix frontend run build`.

---

### Task 0: Start from the merged dashboard

The branch `dashboard-insights` holds only the spec and this plan. The code in this plan builds on PR #10 (`dashboard-motion`).

- [ ] **Step 1:** Confirm PR #10 is merged: `gh pr view 10 --json state --jq .state` → `MERGED`. If not, stop and report.
- [ ] **Step 2:** `git fetch origin && git rebase origin/main` on `dashboard-insights`. Expected: two commits (spec, plan) replayed, no conflicts.
- [ ] **Step 3:** `npm --prefix frontend test` → all pass (44 tests).

---

### Task 1: `packets` in the stats message

**Files:**
- Modify: `backend/api/main.py` (`Hub.stats`, around line 191)
- Modify: `docs/API_SPEC.md` (`### stats` section)
- Test: `tests/test_api.py`

**Interfaces:**
- Produces: `stats.data.packets: int`, cumulative packets the pipeline has processed since the backend started (`pipeline.stats["packets"]`; 0 without capture).

- [ ] **Step 1: Write the failing test** (append to `tests/test_api.py`)

```python
def test_stats_carry_cumulative_packets(client, monkeypatch):
    monkeypatch.setattr(main, "STATS_EVERY_S", 0.05)
    fake = SimpleNamespace(stats={"packets": 1234, "dropped_flows": 0}, table={},
                           capture=SimpleNamespace(dropped=5, kernel_dropped=lambda: 7), stop=lambda: None)
    client.app.state.hub.pipeline = fake
    with ws(client) as socket:
        for _ in range(100):
            message = socket.receive_json()
            if message["type"] == "stats" and message["data"]["packets"] == 1234:
                break
        else:
            raise AssertionError("no stats message carried packets")
    assert message["data"]["dropped_packets"] == 5
    assert message["data"]["kernel_dropped_packets"] == 7
```

Add `from types import SimpleNamespace` to the imports at the top of `tests/test_api.py`.

- [ ] **Step 2: Run it to see it fail**

Run: `.venv/bin/python -m pytest tests/test_api.py::test_stats_carry_cumulative_packets -q`
Expected: FAIL with `KeyError: 'packets'`.

- [ ] **Step 3: Implement** — in `Hub.stats` in `backend/api/main.py`, add one line to the `data` dict, after `"packets_per_s"`:

```python
                "packets_per_s": (packets - last) / STATS_EVERY_S,
                "packets": packets,
```

- [ ] **Step 4: Run the test**

Run: `.venv/bin/python -m pytest tests/test_api.py -q`
Expected: all pass.

- [ ] **Step 5: Document it** — in `docs/API_SPEC.md`, `### stats` example, add `"packets": 98925,` after `"packets_per_s": 412.0,`, and replace the sentence under the example with:

```markdown
`packets` (processed by the pipeline), `dropped_packets` (our queue) and `kernel_dropped_packets` (the capture socket) are cumulative since the backend started. The dashboard shows each drop count as a share of their sum.
```

- [ ] **Step 6: Commit**

```bash
git add backend/api/main.py tests/test_api.py docs/API_SPEC.md
git commit -m "Stats message: add cumulative packets"
```

---

### Task 2: `insights.ts` — the pure functions

**Files:**
- Create: `frontend/src/insights.ts`
- Test: `frontend/src/insights.test.ts`

**Interfaces:**
- Consumes: `AlertItem` (type, `components/AlertFeed.tsx`), `inEffect`, `typeLabel`, `Level` (`components/Level.tsx`).
- Produces (exact):
  - `endpoint(ip: string, port: number): string`
  - `type Focus = { kind: "minute"; start: number; end: number; label: string } | { kind: "source" | "service" | "port"; value: string; label: string }`
  - `matchesFocus(a: AlertItem, focus: Focus | null): boolean`
  - `matchesSearch(a: AlertItem, query: string): boolean`
  - `type Bucket = { start: number; end: number; high: number; medium: number; low: number }`
  - `timeline(alerts: AlertItem[], end: number, size: number, count: number): Bucket[]`
  - `timelineWindow(alerts: AlertItem[], live: boolean, clock: number, narrow: boolean): { end: number; size: number; count: number }`
  - `type Talker = { value: string; count: number }`
  - `topTalkers(alerts: AlertItem[], n?: number): { sources: Talker[]; ports: Talker[] }`
  - `MORE = "__more__"`, `type MapNode = { key: string; count: number }`, `type MapLink = { source: string; service: string; count: number; alerts: AlertItem[] }`
  - `attackMap(alerts: AlertItem[], n?: number): { sources: MapNode[]; services: MapNode[]; links: MapLink[]; moreSources: number; moreServices: number }`
  - `linkTone(link: MapLink, clock: number, capture: boolean): "high" | "active" | "expired"`
  - `type Health = { packets: number; activeFlows: number; queueDropped: number; kernelDropped: number }`
  - `KERNEL_DROP_WARN = 5`, `dropShare(dropped: number, h: Health): number`, `formatShare(pct: number): string`

- [ ] **Step 1: Write the failing tests** — `frontend/src/insights.test.ts`:

```ts
import { expect, test } from "vitest";
import type { AlertItem } from "./components/AlertFeed";
import {
  MORE, attackMap, dropShare, endpoint, formatShare, linkTone, matchesFocus, matchesSearch, timeline, timelineWindow, topTalkers,
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
```

- [ ] **Step 2: Run to see them fail**

Run: `npm --prefix frontend test -- src/insights.test.ts`
Expected: FAIL, cannot resolve `./insights`.

- [ ] **Step 3: Implement** — `frontend/src/insights.ts`:

```ts
import type { AlertItem } from "./components/AlertFeed";
import { inEffect, typeLabel, type Level } from "./components/Level";

/** IPv6 needs brackets before the port, or "::1:52362" is ambiguous. */
export function endpoint(ip: string, port: number) {
  return ip.includes(":") ? `[${ip}]:${port}` : `${ip}:${port}`;
}

/** What a click on the timeline, the map or the talkers narrows the feed to. One at a time; a new one replaces the old. */
export type Focus =
  | { kind: "minute"; start: number; end: number; label: string }
  | { kind: "source" | "service" | "port"; value: string; label: string };

export function matchesFocus(a: AlertItem, focus: Focus | null): boolean {
  if (!focus) return true;
  switch (focus.kind) {
    case "minute": {
      const t = Date.parse(a.timestamp);
      return t >= focus.start && t < focus.end;
    }
    case "source":
      return a.src_ip === focus.value;
    case "service":
      return endpoint(a.dst_ip, a.dst_port) === focus.value;
    case "port":
      return String(a.dst_port) === focus.value;
  }
}

/** Case-insensitive substring over what a row shows: both endpoints (address and port) and the attack name. */
export function matchesSearch(a: AlertItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [endpoint(a.src_ip, a.src_port), endpoint(a.dst_ip, a.dst_port), typeLabel(a.attack_type)].some((s) => s.toLowerCase().includes(q));
}

export type Bucket = { start: number; end: number } & Record<Level, number>;

/** `count` buckets of `size` ms ending at `end`, counting alerts by first-seen time. An aggregated alert keeps only
 *  its first and last time, so repeats cannot be placed in minutes: this counts new alerts, not detections. */
export function timeline(alerts: AlertItem[], end: number, size: number, count: number): Bucket[] {
  const start = end - size * count;
  const buckets = Array.from({ length: count }, (_, i) => ({ start: start + i * size, end: start + (i + 1) * size, high: 0, medium: 0, low: 0 }));
  for (const a of alerts) {
    const i = Math.floor((Date.parse(a.timestamp) - start) / size);
    if (i >= 0 && i < count) buckets[i][a.severity] += 1;
  }
  return buckets;
}

const MINUTE = 60_000;

/** Live: the last hour, up to the end of the current bucket. An upload: its own first-to-last span, in whole minutes.
 *  Phones get half as many buckets, twice as wide. */
export function timelineWindow(alerts: AlertItem[], live: boolean, clock: number, narrow: boolean) {
  const count = narrow ? 30 : 60;
  if (live) {
    const size = narrow ? 2 * MINUTE : MINUTE;
    return { end: Math.floor(clock / size) * size + size, size, count };
  }
  const times = alerts.map((a) => Date.parse(a.timestamp));
  if (!times.length) return { end: clock, size: MINUTE, count };
  const first = Math.floor(Math.min(...times) / MINUTE) * MINUTE;
  const span = Math.max(...times) - first + 1;
  const size = Math.max(MINUTE, Math.ceil(span / count / MINUTE) * MINUTE);
  return { end: first + size * count, size, count };
}

export type Talker = { value: string; count: number };

/** Summed detections (repeats count) per key, most first; ties go to the most recent activity. */
function rank(alerts: AlertItem[], key: (a: AlertItem) => string, n: number): Talker[] {
  const totals = new Map<string, { count: number; last: number }>();
  for (const a of alerts) {
    const k = key(a);
    const t = totals.get(k) ?? { count: 0, last: 0 };
    totals.set(k, { count: t.count + a.count, last: Math.max(t.last, Date.parse(a.last_seen)) });
  }
  return [...totals]
    .sort(([, x], [, y]) => y.count - x.count || y.last - x.last)
    .slice(0, n)
    .map(([value, t]) => ({ value, count: t.count }));
}

export function topTalkers(alerts: AlertItem[], n = 5) {
  return { sources: rank(alerts, (a) => a.src_ip, n), ports: rank(alerts, (a) => String(a.dst_port), n) };
}

export const MORE = "__more__"; // the "+N more" node on either side of the map
export type MapNode = { key: string; count: number };
export type MapLink = { source: string; service: string; count: number; alerts: AlertItem[] };

/** Sources (IP) to services (IP:port): the top `n` each side, the rest folded into one MORE node per side. */
export function attackMap(alerts: AlertItem[], n = 8) {
  const sources = rank(alerts, (a) => a.src_ip, Infinity);
  const services = rank(alerts, (a) => endpoint(a.dst_ip, a.dst_port), Infinity);
  const keepSources = new Set(sources.slice(0, n).map((t) => t.value));
  const keepServices = new Set(services.slice(0, n).map((t) => t.value));
  const links = new Map<string, MapLink>();
  for (const a of alerts) {
    const service = endpoint(a.dst_ip, a.dst_port);
    const s = keepSources.has(a.src_ip) ? a.src_ip : MORE;
    const v = keepServices.has(service) ? service : MORE;
    const link = links.get(`${s}|${v}`) ?? { source: s, service: v, count: 0, alerts: [] };
    link.count += a.count;
    link.alerts.push(a);
    links.set(`${s}|${v}`, link);
  }
  const fold = (all: Talker[]): MapNode[] => {
    const kept = all.slice(0, n).map((t) => ({ key: t.value, count: t.count }));
    const rest = all.slice(n);
    return rest.length ? [...kept, { key: MORE, count: rest.reduce((sum, t) => sum + t.count, 0) }] : kept;
  };
  return {
    sources: fold(sources),
    services: fold(services),
    links: [...links.values()],
    moreSources: Math.max(0, sources.length - n),
    moreServices: Math.max(0, services.length - n),
  };
}

/** Vermilion while a High on the pair is in effect, ink while anything on it is, grey once all of it expired.
 *  An upload is history: nothing is in effect, so its links are plain ink. */
export function linkTone(link: MapLink, clock: number, capture: boolean): "high" | "active" | "expired" {
  if (capture) return "active";
  const live = link.alerts.filter((a) => inEffect(a, clock));
  return live.some((a) => a.severity === "high") ? "high" : live.length ? "active" : "expired";
}

export type Health = { packets: number; activeFlows: number; queueDropped: number; kernelDropped: number };
export const KERNEL_DROP_WARN = 5; // percent; above it, most alert rates are undercounts (docs/LIMITATIONS.md)

/** A drop count as a share of everything that arrived: processed, dropped by our queue, dropped by the kernel. */
export function dropShare(dropped: number, h: Health): number {
  const total = h.packets + h.queueDropped + h.kernelDropped;
  return total ? (dropped / total) * 100 : 0;
}

export function formatShare(pct: number): string {
  return pct === 0 ? "0%" : pct < 0.1 ? "<0.1%" : `${pct.toFixed(1)}%`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix frontend test -- src/insights.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/insights.ts frontend/src/insights.test.ts
git commit -m "Dashboard insights: pure functions for timeline, talkers, map, search, focus and drop share"
```

---

### Task 3: Search, focus chip and keyboard in the alert feed

**Files:**
- Modify: `frontend/src/components/AlertFeed.tsx`
- Test: `frontend/src/components/AlertFeed.test.tsx`

**Interfaces:**
- Consumes: `endpoint`, `matchesFocus`, `matchesSearch`, `Focus` from `../insights`.
- Produces: `AlertFeed` gains required props `focus: Focus | null` and `onFocus: (focus: Focus | null) => void`. `endpoint` stays importable from `./AlertFeed` (re-export), so `AlertDetail`, `MuteEditor`, `MutedPatterns` and the tests need no change.

- [ ] **Step 1: Update the test helper and write the failing tests** — in `frontend/src/components/AlertFeed.test.tsx`:

Change the imports at the top to:

```ts
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { act } from "react";
import { expect, test, vi } from "vitest";
import type { Focus } from "../insights";
import AlertFeed, { type AlertItem, endpoint, evidence } from "./AlertFeed";
```

Replace the `Feed` helper with:

```tsx
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
```

Append these tests:

```tsx
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
```

`bodyRows()` and `makeAlerts()` already exist in this file; keep them. Check `makeAlerts` gives each alert a distinct `src_ip` or not: the tests above set `src_ip` explicitly where it matters.

- [ ] **Step 2: Run to see them fail**

Run: `npm --prefix frontend test -- src/components/AlertFeed.test.tsx`
Expected: the four new tests FAIL (no searchbox; no chip).

- [ ] **Step 3: Implement** — in `frontend/src/components/AlertFeed.tsx`:

(a) Imports and `endpoint`: replace the first import line and the `import ... from "../config"` block so the top reads

```ts
import { ChevronDown, ChevronRight, X } from "lucide-react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FEED_LIMIT, IN_EFFECT_MS } from "../config";
import type { RuleIn } from "../api";
import { downloadCsv } from "../csv";
import { endpoint, matchesFocus, matchesSearch, type Focus } from "../insights";
import AlertDetail from "./AlertDetail";
import { LEVEL, LevelChip, inEffect, typeLabel, type Level } from "./Level";

export { endpoint }; // its home is insights.ts; kept here for the components that import it from the feed
```

and delete the local `endpoint` function (its comment and body, `/** IPv6 needs brackets ... */ export function endpoint ...`).

(b) Add, after `const SEEN_AFTER_MS = 700; ...`:

```ts
const KEYS: [string, string][] = [
  ["/", "Search"],
  ["j / k", "Next / previous alert"],
  ["Enter", "Open or close details"],
  ["a", "Acknowledge or undo"],
  ["Esc", "Close details"],
];
```

(c) In `type Props`, add after `exportName: string;`:

```ts
  focus: Focus | null; // set by the timeline, map or talkers
  onFocus: (focus: Focus | null) => void;
```

(d) In `AlertFeed`, add state after `const [openId, setOpenId] = useState<string | null>(null);`:

```ts
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
```

Replace the `matching` memo's filter predicate and deps with:

```ts
            (!needsAttention || a.acknowledged_at === null) &&
            matchesSearch(a, query) &&
            matchesFocus(a, props.focus),
        )
        // The API pages by first-seen timestamp, but the feed shows last_seen: order by what is shown.
        .sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen)),
    [alerts, severity, attackType, activeOnly, clock, needsAttention, query, props.focus],
```

Replace the `filtered` line with:

```ts
  const filtered = severity !== "all" || attackType !== "all" || activeOnly || needsAttention || props.showMuted || query.trim() !== "" || props.focus !== null;
```

(e) Keyboard: add after the `close()` function:

```ts
  // Shortcuts read the latest rows through a ref, so the listener is bound once.
  const latest = useRef({ shown, openId, onAck: props.onAck });
  latest.current = { shown, openId, onAck: props.onAck };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest?.("input, select, textarea, [contenteditable='true']")) return;
      const rows = [...(body.current?.querySelectorAll<HTMLElement>("[data-alert]") ?? [])];
      const at = rows.indexOf(document.activeElement as HTMLElement);
      if (e.key === "/") {
        e.preventDefault();
        search.current?.focus();
      } else if ((e.key === "j" || e.key === "k") && rows.length) {
        e.preventDefault();
        rows[at === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, at + (e.key === "j" ? 1 : -1)))].focus();
      } else if (e.key === "a") {
        const id = (document.activeElement as HTMLElement | null)?.dataset.alert ?? latest.current.openId;
        const alert = latest.current.shown.find((x) => x.id === id);
        if (!alert) return;
        e.preventDefault();
        // a failed save leaves the row as it was; the details panel's own button reports failures in words
        latest.current.onAck(alert.id, alert.acknowledged_at === null).catch(() => {});
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
```

(f) Header markup. Inside the `<div className="mr-auto">` block, after the `<p className="text-sm text-muted">…</p>`, add:

```tsx
          {props.focus && (
            <button
              type="button"
              onClick={() => props.onFocus(null)}
              aria-label={`Remove filter ${props.focus.label}`}
              className="mt-1.5 inline-flex min-h-7 items-center gap-1.5 rounded bg-accent px-2 font-mono text-xs font-semibold text-white"
            >
              {props.focus.label}
              <X aria-hidden size={12} />
            </button>
          )}
```

Before the `Needs attention` button, add the search box:

```tsx
        <label className="flex flex-col text-xs font-medium text-muted">
          Search
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="IP, port or attack"
            className={`${select} w-44 font-normal placeholder:text-muted`}
          />
        </label>
```

In the `Clear filters` button's `onClick`, add `setQuery("");` and `props.onFocus(null);` after `setNeedsAttention(false);`.

After the `Export CSV` button, add the key list:

```tsx
        <details className="relative">
          <summary
            aria-label="Keyboard shortcuts"
            className="flex min-h-9 min-w-9 cursor-pointer list-none items-center justify-center rounded text-sm font-semibold text-accent ring-1 ring-edge hover:bg-accent-tint"
          >
            ?
          </summary>
          <dl className="absolute right-0 z-10 mt-2 grid w-60 grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-md border border-hairline bg-surface p-3 text-xs">
            {KEYS.map(([key, what]) => (
              <Fragment key={key}>
                <dt><kbd className="font-mono font-semibold">{key}</kbd></dt>
                <dd className="text-muted">{what}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
```

- [ ] **Step 4: Run the feed tests**

Run: `npm --prefix frontend test -- src/components/AlertFeed.test.tsx`
Expected: all pass. (App passes the two new props in Task 4; until then App shows a stray "Clear filters" button because `props.focus` is `undefined`, not `null`. Don't patch around it here.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AlertFeed.tsx frontend/src/components/AlertFeed.test.tsx
git commit -m "Alert feed: search box, focus chip and keyboard shortcuts"
```

---

### Task 4: Alert timeline panel and the focus state in App

**Files:**
- Create: `frontend/src/components/AlertTimeline.tsx`
- Create: `frontend/src/components/Insights.test.tsx`
- Modify: `frontend/src/index.css` (append keyframes)
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `timeline`, `timelineWindow`, `Focus` (`../insights`); `clockTime`, `AlertItem` (`./AlertFeed`); `LEVEL`, `LEVELS` (`./Level`).
- Produces: `AlertTimeline` default export, props `{ alerts: AlertItem[]; clock: number; capture: boolean; focus: Focus | null; onFocus: (f: Focus | null) => void }`. `App` gains `const [focus, setFocus] = useState<Focus | null>(null)`, used by Tasks 5 and 6.

- [ ] **Step 1: Write the failing test** — `frontend/src/components/Insights.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { AlertItem } from "./AlertFeed";
import AlertTimeline from "./AlertTimeline";

const T0 = Date.parse("2026-11-03T12:00:00.000Z");

export function alert(over: Partial<AlertItem> = {}): AlertItem {
  return {
    id: Math.random().toString(36).slice(2), timestamp: new Date(T0).toISOString(), last_seen: new Date(T0).toISOString(),
    src_ip: "10.0.0.9", dst_ip: "10.0.0.1", src_port: 40000, dst_port: 80, protocol: "TCP", attack_type: "PortScan",
    confidence: 1, severity: "low", source: "rule", count: 1, batch_id: null, acknowledged_at: null, suppressed_by: null, ...over,
  };
}

test("timeline: a bar per busy minute, and clicking one focuses the feed on it", () => {
  const onFocus = vi.fn();
  render(<AlertTimeline alerts={[alert({ severity: "high" }), alert()]} clock={T0 + 30_000} capture={false} focus={null} onFocus={onFocus} />);
  const bar = screen.getByRole("button", { name: /2 new \(1 High, 0 Medium, 1 Low\)/ });
  fireEvent.click(bar);
  expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ kind: "minute", start: T0, end: T0 + 60_000 }));
});

test("timeline: says so when the hour is empty", () => {
  render(<AlertTimeline alerts={[]} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
  expect(screen.getByText("No alerts in the last hour.")).toBeTruthy();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm --prefix frontend test -- src/components/Insights.test.tsx`
Expected: FAIL, cannot resolve `./AlertTimeline`.

- [ ] **Step 3: Implement the component** — `frontend/src/components/AlertTimeline.tsx`:

```tsx
import { memo, useSyncExternalStore } from "react";
import { timeline, timelineWindow, type Focus } from "../insights";
import { clockTime, type AlertItem } from "./AlertFeed";
import { LEVEL, LEVELS } from "./Level";

const NARROW = "(max-width: 639px)";

function useNarrow() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener?.("change", onChange);
      return () => query.removeEventListener?.("change", onChange);
    },
    () => window.matchMedia(NARROW).matches,
  );
}

const FILL = { high: "bg-sev-high", medium: "bg-sev-medium", low: "bg-sev-low" } as const;

type Props = { alerts: AlertItem[]; clock: number; capture: boolean; focus: Focus | null; onFocus: (focus: Focus | null) => void };

/** New alerts per bucket, stacked High at the bottom. Heights are linear from zero, so a bar's size is its count.
 *  Bars grow in as buckets open; the current one breathes. Each busy bar narrows the feed to its time. */
export default memo(function AlertTimeline({ alerts, clock, capture, focus, onFocus }: Props) {
  const narrow = useNarrow();
  const { end, size, count } = timelineWindow(alerts, !capture, clock, narrow);
  const buckets = timeline(alerts, end, size, count);
  const totals = buckets.map((b) => b.high + b.medium + b.low);
  const peak = Math.max(0, ...totals);
  const minutes = size / 60_000;
  const per = minutes === 1 ? "minute" : `${minutes} minutes`;

  return (
    <section className="ink-panel bg-surface p-4" aria-labelledby="timeline-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="timeline-heading" className="text-lg font-semibold">Alert timeline</h2>
        <span className="text-sm text-muted">
          New alerts per {per}, {capture ? "across this capture" : "last hour"} · peak {peak}
        </span>
      </div>
      {peak === 0 ? (
        <p className="py-6 text-sm text-muted">{capture ? "No alerts in this capture." : "No alerts in the last hour."}</p>
      ) : (
        <>
          <div className="mt-3 flex h-20 items-end gap-px" role="group" aria-label="Alerts over time. Each bar narrows the feed to its time.">
            {buckets.map((b, i) => {
              if (totals[i] === 0) return <div key={b.start} className="h-full flex-1" />;
              const label = `${clockTime(b.start, capture)}: ${totals[i]} new (${LEVELS.map((l) => `${b[l]} ${LEVEL[l].label}`).join(", ")})`;
              const selected = focus?.kind === "minute" && focus.start === b.start;
              const current = !capture && i === buckets.length - 1;
              return (
                <button
                  key={b.start}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={selected}
                  onClick={() => onFocus(selected ? null : { kind: "minute", start: b.start, end: b.end, label: `${clockTime(b.start)}–${clockTime(b.end)}` })}
                  className={`tl-bar flex h-full min-w-0 flex-1 flex-col-reverse hover:bg-sunk ${current ? "tl-now" : ""} ${selected ? "outline-2 outline-offset-1 outline-ink" : ""}`}
                >
                  {LEVELS.map((l) => b[l] > 0 && (
                    <span
                      key={l}
                      className={`block w-full ${FILL[l]} transition-[height] duration-500 ease-out motion-reduce:transition-none`}
                      style={{ height: `${(b[l] / peak) * 100}%` }}
                    />
                  ))}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between border-t border-hairline pt-1 font-mono text-xs text-muted">
            <span>{clockTime(buckets[0].start, capture)}</span>
            <span>{capture ? clockTime(end, capture) : "now"}</span>
          </div>
        </>
      )}
    </section>
  );
});
```

- [ ] **Step 4: Add the keyframes** — append to `frontend/src/index.css`:

```css
/* Timeline bars rise from the baseline when their bucket opens; the current bucket breathes so "now" is findable. */
@keyframes tl-grow {
  from { transform: scaleY(0); }
}

.tl-bar {
  transform-origin: bottom;
  animation: tl-grow 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes tl-now {
  50% { opacity: 0.55; }
}

.tl-now > span { animation: tl-now 2s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .tl-bar,
  .tl-now > span { animation: none; }
}
```

- [ ] **Step 5: Wire it into App** — in `frontend/src/App.tsx`:

Add imports:

```ts
import AlertTimeline from "./components/AlertTimeline";
import type { Focus } from "./insights";
```

Add state after `const [showMuted, setShowMuted] = useState(false);`:

```ts
  const [focus, setFocus] = useState<Focus | null>(null); // set by the timeline, map or talkers; narrows the feed
```

In `viewBatch`, after `setShowMuted(false);` add `setFocus(null);`.

In the left column, replace

```tsx
          <div className="space-y-4">
            {locked ? (
```

with

```tsx
          <div className="space-y-4">
            {!locked && <AlertTimeline alerts={visible} clock={clock} capture={view !== null} focus={focus} onFocus={setFocus} />}
            {locked ? (
```

and add to the `<AlertFeed ...>` props, after `exportName=...`:

```tsx
                focus={focus}
                onFocus={setFocus}
```

- [ ] **Step 6: Run all frontend tests and the build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: all tests pass; `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/AlertTimeline.tsx frontend/src/components/Insights.test.tsx frontend/src/index.css frontend/src/App.tsx
git commit -m "Dashboard: alert timeline that narrows the feed to a minute"
```

---

### Task 5: Attack map

**Files:**
- Create: `frontend/src/components/AttackMap.tsx`
- Modify: `frontend/src/components/Insights.test.tsx` (append)
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `attackMap`, `linkTone`, `MORE`, `Focus`, `MapNode`, `MapLink` (`../insights`); `AlertItem` (`./AlertFeed`); `focus`/`setFocus` from Task 4.
- Produces: `AttackMap` default export, props `{ alerts: AlertItem[]; clock: number; capture: boolean; focus: Focus | null; onFocus: (f: Focus | null) => void }`.

- [ ] **Step 1: Write the failing tests** — append to `frontend/src/components/Insights.test.tsx` (add `import AttackMap from "./AttackMap";` to the imports):

```tsx
test("map: one button per source and service, +N more past eight, and a click focuses the feed", () => {
  const onFocus = vi.fn();
  const alerts = Array.from({ length: 10 }, (_, i) => alert({ src_ip: `10.0.0.${i + 1}`, count: 10 - i }));
  render(<AttackMap alerts={alerts} clock={T0 + 1_000} capture={false} focus={null} onFocus={onFocus} />);
  expect(screen.getByText("+2 more")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^10\.0\.0\.1 / }));
  expect(onFocus).toHaveBeenCalledWith({ kind: "source", value: "10.0.0.1", label: "10.0.0.1" });
  fireEvent.click(screen.getByRole("button", { name: /^10\.0\.0\.1:80 / }));
  expect(onFocus).toHaveBeenCalledWith({ kind: "service", value: "10.0.0.1:80", label: "10.0.0.1:80" });
});

test("map: says so when there is nothing to map", () => {
  render(<AttackMap alerts={[]} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
  expect(screen.getByText("No attacks to map yet.")).toBeTruthy();
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm --prefix frontend test -- src/components/Insights.test.tsx`
Expected: FAIL, cannot resolve `./AttackMap`.

- [ ] **Step 3: Implement** — `frontend/src/components/AttackMap.tsx`:

```tsx
import gsap from "gsap";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { MORE, attackMap, linkTone, type Focus, type MapLink, type MapNode } from "../insights";
import type { AlertItem } from "./AlertFeed";

const ROW = 28; // px per node; node rows and stroke ends share it
const TONE = { high: "stroke-sev-high", active: "stroke-ink", expired: "stroke-edge" } as const;
const LAYER = { expired: 0, active: 1, high: 2 } as const; // expired strokes sit beneath, Highs on top

/** The middle column's width, so strokes are drawn in real pixels (scaling an SVG would stretch their weight). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(96);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return; // jsdom: keep the default
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type Props = { alerts: AlertItem[]; clock: number; capture: boolean; focus: Focus | null; onFocus: (focus: Focus | null) => void };

/** Sources on the left, targeted services on the right, one ink stroke per pair. Weight is detections (square root,
 *  so one loud pair doesn't erase the rest); vermilion only while a High on that pair is in effect.
 *  New strokes draw themselves from source to target; the depth is layering, never perspective. */
export default memo(function AttackMap({ alerts, clock, capture, focus, onFocus }: Props) {
  const map = attackMap(alerts);
  const height = Math.max(map.sources.length, map.services.length) * ROW;
  const [mid, width] = useWidth();
  const svg = useRef<SVGSVGElement>(null);
  const drawn = useRef(new Set<string>());
  const heaviest = Math.max(1, ...map.links.map((l) => l.count));
  const y = (nodes: MapNode[], key: string) => (nodes.findIndex((n) => n.key === key) + 0.5) * ROW;
  const ids = map.links.map((l) => `${l.source}|${l.service}`).join(",");

  useLayoutEffect(() => {
    const paths = [...(svg.current?.querySelectorAll<SVGPathElement>("path[data-link]") ?? [])];
    const fresh = paths.filter((p) => !drawn.current.has(p.dataset.link!));
    fresh.forEach((p) => drawn.current.add(p.dataset.link!));
    if (!fresh.length || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(fresh, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out", stagger: 0.04 });
  }, [ids]);

  function node(n: MapNode, side: "source" | "service", more: number) {
    if (n.key === MORE) {
      return <span key={MORE} className="flex h-7 items-center px-1 text-xs text-muted" style={{ justifyContent: side === "service" ? "flex-end" : undefined }}>+{more} more</span>;
    }
    const selected = focus !== null && focus.kind === side && focus.value === n.key;
    return (
      <button
        key={n.key}
        type="button"
        title={`${n.key}: ${n.count.toLocaleString("en-US")} detections`}
        aria-label={`${n.key} ${n.count} detections`}
        aria-pressed={selected}
        onClick={() => onFocus(selected ? null : { kind: side, value: n.key, label: n.key })}
        className={`flex h-7 min-w-0 items-center gap-1.5 rounded px-1 font-mono text-[12px] ${side === "service" ? "flex-row-reverse" : ""} ${selected ? "bg-accent text-white" : "hover:bg-sunk"}`}
      >
        <span className="truncate">{n.key}</span>
        <span className={`shrink-0 ${selected ? "" : "text-muted"}`}>{n.count.toLocaleString("en-US")}</span>
      </button>
    );
  }

  const stroke = (l: MapLink) => {
    const tone = linkTone(l, clock, capture);
    const y1 = y(map.sources, l.source), y2 = y(map.services, l.service);
    return (
      <path
        key={`${l.source}|${l.service}`}
        data-link={`${l.source}|${l.service}`}
        d={`M0 ${y1} C ${width / 2} ${y1}, ${width / 2} ${y2}, ${width} ${y2}`}
        pathLength={1}
        strokeDasharray={1}
        fill="none"
        strokeLinecap="round"
        strokeWidth={1 + 3 * Math.sqrt(l.count / heaviest)}
        className={`${TONE[tone]} ${tone === "expired" ? "opacity-60" : ""}`}
      />
    );
  };

  return (
    <section className="ink-panel bg-surface p-4" aria-labelledby="map-heading">
      <h2 id="map-heading" className="text-lg font-semibold">Attack map</h2>
      <p className="text-sm text-muted">
        Who targets what, across the {alerts.length.toLocaleString("en-US")} {alerts.length === 1 ? "alert" : "alerts"} in this view.
        Stroke weight is detections; red is a High in effect.
      </p>
      {map.links.length === 0 ? (
        <p className="py-4 text-sm text-muted">No attacks to map yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(3rem,0.7fr)_minmax(0,1fr)]" role="group" aria-label="Attack map: sources on the left, targeted services on the right">
          <div className="flex min-w-0 flex-col">{map.sources.map((n) => node(n, "source", map.moreSources))}</div>
          <div ref={mid} style={{ height }}>
            <svg ref={svg} width={width} height={height} aria-hidden className="overflow-visible">
              {[...map.links].sort((a, b) => LAYER[linkTone(a, clock, capture)] - LAYER[linkTone(b, clock, capture)]).map(stroke)}
              {map.sources.map((n) => <circle key={`s${n.key}`} cx={0} cy={y(map.sources, n.key)} r={2.5} className="fill-ink" />)}
              {map.services.map((n) => <circle key={`v${n.key}`} cx={width} cy={y(map.services, n.key)} r={2.5} className="fill-ink" />)}
            </svg>
          </div>
          <div className="flex min-w-0 flex-col items-end">{map.services.map((n) => node(n, "service", map.moreServices))}</div>
        </div>
      )}
    </section>
  );
});
```

- [ ] **Step 4: Wire into App** — in `frontend/src/App.tsx` add `import AttackMap from "./components/AttackMap";` and, as the first child of the right column `<div className="space-y-4">`, before `<TrafficChart ...>`:

```tsx
            {!locked && <AttackMap alerts={visible} clock={clock} capture={view !== null} focus={focus} onFocus={setFocus} />}
```

- [ ] **Step 5: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: all pass; `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AttackMap.tsx frontend/src/components/Insights.test.tsx frontend/src/App.tsx
git commit -m "Dashboard: attack map with strokes that draw in as alerts arrive"
```

---

### Task 6: Top talkers

**Files:**
- Create: `frontend/src/components/TopTalkers.tsx`
- Modify: `frontend/src/components/Insights.test.tsx` (append)
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `topTalkers`, `Talker`, `Focus` (`../insights`); `AlertItem`.
- Produces: `TopTalkers` default export, props `{ alerts: AlertItem[]; focus: Focus | null; onFocus: (f: Focus | null) => void }`.

- [ ] **Step 1: Write the failing test** — append to `Insights.test.tsx` (add `import TopTalkers from "./TopTalkers";`):

```tsx
test("talkers: ranked sources and ports; a click focuses the feed", () => {
  const onFocus = vi.fn();
  render(<TopTalkers alerts={[alert({ count: 4 }), alert({ src_ip: "10.0.0.5", dst_port: 443 })]} focus={null} onFocus={onFocus} />);
  fireEvent.click(screen.getByRole("button", { name: /^port 443 / }));
  expect(onFocus).toHaveBeenCalledWith({ kind: "port", value: "443", label: "port 443" });
  expect(screen.getByRole("button", { name: /^10\.0\.0\.9 4 detections/ })).toBeTruthy();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm --prefix frontend test -- src/components/Insights.test.tsx`
Expected: FAIL, cannot resolve `./TopTalkers`.

- [ ] **Step 3: Implement** — `frontend/src/components/TopTalkers.tsx`:

```tsx
import { memo } from "react";
import { topTalkers, type Focus, type Talker } from "../insights";
import type { AlertItem } from "./AlertFeed";

type Props = { alerts: AlertItem[]; focus: Focus | null; onFocus: (focus: Focus | null) => void };

/** The busiest sources and most-targeted ports, by detections (repeats count). Bars are linear from zero. */
export default memo(function TopTalkers({ alerts, focus, onFocus }: Props) {
  const { sources, ports } = topTalkers(alerts);
  const n = alerts.length;

  function list(title: string, kind: "source" | "port", items: Talker[]) {
    const most = Math.max(1, ...items.map((t) => t.count));
    return (
      <div className="min-w-0">
        <h3 className="text-xs font-medium text-muted">{title}</h3>
        <ol className="mt-1 space-y-0.5">
          {items.map((t) => {
            const label = kind === "port" ? `port ${t.value}` : t.value;
            const selected = focus !== null && focus.kind === kind && focus.value === t.value;
            return (
              <li key={t.value}>
                <button
                  type="button"
                  aria-label={`${label} ${t.count} detections`}
                  aria-pressed={selected}
                  title={`${label}: ${t.count.toLocaleString("en-US")} detections`}
                  onClick={() => onFocus(selected ? null : { kind, value: t.value, label })}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded px-1 py-1 text-left font-mono text-[12px] ${selected ? "bg-accent text-white" : "hover:bg-sunk"}`}
                >
                  <span className="truncate">{t.value}</span>
                  <span className={selected ? "" : "text-muted"}>{t.count.toLocaleString("en-US")}</span>
                  <span aria-hidden className="col-span-2 block h-0.5 bg-hairline">
                    <span
                      className={`block h-full origin-left transition-transform duration-500 ease-out motion-reduce:transition-none ${selected ? "bg-white" : "bg-ink"}`}
                      style={{ transform: `scaleX(${t.count / most})` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <section className="ink-panel bg-surface p-4" aria-labelledby="talkers-heading">
      <h2 id="talkers-heading" className="text-lg font-semibold">Top talkers</h2>
      <p className="text-sm text-muted">
        Detections, counting repeats, across the {n.toLocaleString("en-US")} {n === 1 ? "alert" : "alerts"} in this view.
      </p>
      {sources.length === 0 ? (
        <p className="py-4 text-sm text-muted">No detections in this view yet.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4">
          {list("Sources", "source", sources)}
          {list("Targeted ports", "port", ports)}
        </div>
      )}
    </section>
  );
});
```

- [ ] **Step 4: Wire into App** — add `import TopTalkers from "./components/TopTalkers";` and, directly after the `<TrafficChart ... />` line in the right column:

```tsx
            {!locked && <TopTalkers alerts={visible} focus={focus} onFocus={setFocus} />}
```

- [ ] **Step 5: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: all pass; `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TopTalkers.tsx frontend/src/components/Insights.test.tsx frontend/src/App.tsx
git commit -m "Dashboard: top talkers that narrow the feed to a source or port"
```

---

### Task 7: Capture panel (traffic + health)

**Files:**
- Modify: `frontend/src/components/TrafficChart.tsx`
- Modify: `frontend/src/components/Insights.test.tsx` (append)
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Health`, `KERNEL_DROP_WARN`, `dropShare`, `formatShare` (`../insights`); `stats.data.packets` from Task 1.
- Produces: `TrafficChart` props become `{ points: TrafficPoint[]; stale: boolean; health: Health | null }`; heading "Capture".

- [ ] **Step 1: Write the failing test** — append to `Insights.test.tsx` (add `import TrafficChart from "./TrafficChart";`):

```tsx
test("capture: flows and both drop shares, kernel drops flagged above 5%", () => {
  render(<TrafficChart points={[{ time: "12:00:00", pps: 40 }]} stale={false} health={{ packets: 280, activeFlows: 12, queueDropped: 0, kernelDropped: 720 }} />);
  expect(screen.getByRole("heading", { name: "Capture" })).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
  expect(screen.getByText("0%")).toBeTruthy();
  const kernel = screen.getByText("72.0%");
  expect(kernel.closest("dd")?.className).toContain("text-sev-high");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm --prefix frontend test -- src/components/Insights.test.tsx`
Expected: FAIL, no heading "Capture".

- [ ] **Step 3: Implement** — replace `frontend/src/components/TrafficChart.tsx` with:

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KERNEL_DROP_WARN, dropShare, formatShare, type Health } from "../insights";

export type TrafficPoint = { time: string; pps: number };

const INK = "#141414", MUTED = "#575757", HAIRLINE = "#d6d6d4"; // index.css tokens; Recharts needs literal colours

function Figure({ label, value, warn = false, title }: { label: string; value: string; warn?: boolean; title: string }) {
  return (
    <div title={title}>
      <dt className="text-xs text-muted">{label}</dt>
      {/* keyed by value: each change ticks in, like the band's counts */}
      <dd className={`font-mono text-sm ${warn ? "font-semibold text-sev-high" : ""}`}>
        <span key={value} className="count-tick">{value}</span>
      </dd>
    </div>
  );
}

/** The capture itself: packets per second over the last 60 s, and whether it can be trusted (flows in flight, and how
 *  much traffic never reached the detectors). When stats stop arriving it dims and says when its data ends. */
export default function TrafficChart({ points, stale, health }: { points: TrafficPoint[]; stale: boolean; health: Health | null }) {
  const latest = points.length ? points[points.length - 1] : null;
  const label = latest === null ? "waiting for data" : stale ? `stopped at ${latest.time}` : `${Math.round(latest.pps).toLocaleString()} packets/s now`;
  const kernel = health ? dropShare(health.kernelDropped, health) : 0;
  return (
    <section className="ink-panel bg-surface p-4" aria-labelledby="traffic-heading">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="traffic-heading" className="text-lg font-semibold">Capture</h2>
        <span className={`text-sm ${stale ? "text-stale" : "text-muted"}`}>{label}</span>
      </div>
      <div className={`h-36 ${stale ? "opacity-50" : ""}`} role="img" aria-label={`Packets per second over the last minute, ${label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={HAIRLINE} />
            <XAxis dataKey="time" tick={{ fill: MUTED, fontSize: 12, fontFamily: "JetBrains Mono Variable, monospace" }} tickLine={false} axisLine={{ stroke: HAIRLINE }} minTickGap={48} padding={{ left: 12 }} tickMargin={6} />
            <YAxis tick={{ fill: MUTED, fontSize: 12, fontFamily: "JetBrains Mono Variable, monospace" }} tickLine={false} axisLine={false} width={44} allowDecimals={false} tickCount={4} interval={0} />
            <Tooltip formatter={(v) => [Math.round(Number(v)).toLocaleString(), "packets/s"]} cursor={{ stroke: HAIRLINE }} />
            {/* No animation: the 60 s window slides one sample a second, which is the motion. */}
            <Line type="linear" /* samples are 1 s apart: draw straight between them, never a curve through values nobody measured */ dataKey="pps" stroke={INK} strokeWidth={1.75} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {health && (
        <dl className={`mt-3 grid grid-cols-3 gap-3 border-t border-row pt-3 ${stale ? "opacity-50" : ""}`}>
          <Figure label="Active flows" value={health.activeFlows.toLocaleString("en-US")} title="Flows being tracked right now" />
          <Figure
            label="Queue drops"
            value={formatShare(dropShare(health.queueDropped, health))}
            title={`${health.queueDropped.toLocaleString("en-US")} packets dropped by SentinelStream's own queue since the backend started`}
          />
          <Figure
            label="Kernel drops"
            value={formatShare(kernel)}
            warn={kernel > KERNEL_DROP_WARN}
            title={`${health.kernelDropped.toLocaleString("en-US")} packets the kernel dropped before SentinelStream read them; above ${KERNEL_DROP_WARN}%, alert counts are undercounts`}
          />
        </dl>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Wire into App** — in `frontend/src/App.tsx`:

Add `type Health` to the insights import: `import type { Focus, Health } from "./insights";`

Add state after `const [lastStatAt, ...]`:

```ts
  const [health, setHealth] = useState<Health | null>(null);
```

In `onMessage`'s `stats` branch, after `setLastStatAt(Date.now());`:

```ts
      const d = message.data;
      setHealth({ packets: d.packets, activeFlows: d.active_flows, queueDropped: d.dropped_packets, kernelDropped: d.kernel_dropped_packets });
```

Replace the `<TrafficChart ... />` line with (an upload has no live stats, so the panel is hidden there):

```tsx
            {view === null && <TrafficChart points={traffic} stale={stale || status === "reconnecting"} health={health} />}
```

- [ ] **Step 5: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: all pass; `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/TrafficChart.tsx frontend/src/components/Insights.test.tsx frontend/src/App.tsx
git commit -m "Dashboard: Capture panel with flows and drop shares"
```

---

### Task 8: Attack types as re-ranking bars

**Files:**
- Rewrite: `frontend/src/components/AttackDistribution.tsx`
- Modify: `frontend/src/components/Insights.test.tsx` (append)

**Interfaces:**
- Consumes: `AlertItem`, `typeLabel`. Props unchanged: `{ alerts: AlertItem[] }`.

- [ ] **Step 1: Write the failing test** — append (add `import AttackDistribution from "./AttackDistribution";`):

```tsx
test("attack types: one row per type, most detections first, counting repeats", () => {
  render(<AttackDistribution alerts={[alert({ attack_type: "DoS", count: 2 }), alert({ attack_type: "anomaly", count: 5 })]} />);
  const rows = screen.getAllByRole("listitem");
  expect(rows.map((r) => r.textContent)).toEqual(["Anomaly5", "DoS2"]);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm --prefix frontend test -- src/components/Insights.test.tsx`
Expected: FAIL (Recharts renders no list items).

- [ ] **Step 3: Implement** — replace `frontend/src/components/AttackDistribution.tsx` with:

```tsx
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { memo, useLayoutEffect, useRef } from "react";
import { typeLabel } from "./Level";
import type { AlertItem } from "./AlertFeed";

gsap.registerPlugin(Flip);

/** Detections per attack type in the current view. Bars encode magnitude, linear from zero, in one neutral ink.
 *  A detection is one flow; an aggregated alert counts each of its repeats. When the ranking changes, rows slide to
 *  their new place (GSAP Flip, as the feed's rows do) and bars ease to their new length. */
export default memo(function AttackDistribution({ alerts }: { alerts: AlertItem[] }) {
  const totals = new Map<string, number>();
  for (const a of alerts) totals.set(a.attack_type, (totals.get(a.attack_type) ?? 0) + a.count);
  const data = [...totals].map(([type, detections]) => ({ type: typeLabel(type), detections })).sort((a, b) => b.detections - a.detections);
  const most = Math.max(1, ...data.map((d) => d.detections));
  const n = alerts.length;

  const list = useRef<HTMLOListElement>(null);
  const order = data.map((d) => d.type).join(",");
  const lastOrder = useRef(order);
  const flipState = useRef<Flip.FlipState | null>(null);
  if (order !== lastOrder.current && list.current) flipState.current = Flip.getState([...list.current.children]);
  useLayoutEffect(() => {
    const state = flipState.current;
    flipState.current = null;
    lastOrder.current = order;
    if (!state || !list.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    Flip.from(state, { targets: [...list.current.children], duration: 0.45, ease: "expo.out" });
  }, [order]);

  return (
    <section className="ink-panel bg-surface p-4" aria-labelledby="types-heading">
      <h2 id="types-heading" className="text-lg font-semibold">Attack types</h2>
      <p className="mb-3 text-sm text-muted">
        Detections, counting repeats, across the {n.toLocaleString("en-US")} {n === 1 ? "alert" : "alerts"} in this view.
      </p>
      {data.length === 0 ? (
        <p className="py-4 text-sm text-muted">No detections in this view yet.</p>
      ) : (
        <ol ref={list} className="space-y-2">
          {data.map((d) => (
            <li key={d.type} data-flip-id={d.type} className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-x-3">
              <span className="truncate text-right text-xs text-muted">{d.type}</span>
              <span aria-hidden className="block h-4">
                <span
                  className="block h-full origin-left bg-ink transition-transform duration-500 ease-out motion-reduce:transition-none"
                  style={{ transform: `scaleX(${d.detections / most})` }}
                />
              </span>
              <span key={d.detections} className="count-tick font-mono text-xs">{d.detections.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});
```

- [ ] **Step 4: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: all pass; `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AttackDistribution.tsx frontend/src/components/Insights.test.tsx
git commit -m "Attack types: HTML bars that re-rank with GSAP Flip"
```

---

### Task 9: Polish pass, visual check and docs (controller)

Run by the session controller, not a subagent: it needs the browser and the design skills.

- [ ] **Step 1: Full checks** — `.venv/bin/python -m pytest -q`, `npm --prefix frontend test`, `npm --prefix frontend run build`, `.venv/bin/ruff check backend tests`. All must pass.
- [ ] **Step 2: Docker demo** — `docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build -d`; capture desktop (1440 px) and phone (390 px) full-page screenshots with the scratchpad CDP script (the token is read from the container into a 0600 scratchpad file; never printed or put in a URL).
- [ ] **Step 3: Detectors** — `impeccable detect --json frontend/src` must print `[]`; `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app` must report 0 FAIL (mono warnings on IPs, ports and times are accepted, as before).
- [ ] **Step 4: impeccable critique** of the screenshots against DESIGN.md; fix every P0/P1 finding in the components above, re-run Step 1 and Step 2, and keep before/after screenshots.
- [ ] **Step 5: DESIGN.md** — add the five panels, the focus chip, the key list, the motion inventory (timeline grow and breathe, stroke draw-in, Flip on attack types, count ticks) and the rule "no perspective or 3D: depth is layering"; update the right-column order.
- [ ] **Step 6: PROGRESS.md** — append "Post-v1 sub-project: dashboard insights" with tasks completed, the real output of Step 1 and Step 3, and the screenshot paths.
- [ ] **Step 7: Commit, push, open the PR** (ask the human before pushing), then the six required checks.
