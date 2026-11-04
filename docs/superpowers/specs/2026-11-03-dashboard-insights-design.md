# Dashboard insights — design

Post-v1 sub-project (dashboard insights). Status: approved in conversation on 2026-11-03, awaiting review of this file.

## Goal

The dashboard shows what is attacking what, when, and whether the capture itself can be trusted, with motion that makes change visible, without new dependencies, schema changes or chart tricks that misstate numbers.

## Decisions (human-approved)

| Question | Decision |
|---|---|
| Features | Alert timeline, attack map, capture health, top talkers, search + keyboard |
| Visuals | Attack map plus animated charts. No true 3D (no three.js): depth comes from layering and motion, never perspective that distorts values |
| Data source | Computed in the browser from the alerts the dashboard already holds (latest 200 live, 500 per upload), each panel labelled with that scope. One backend change: cumulative `packets` in the `stats` message |
| Polish | impeccable critique and taste lint/inspect on the finished build, then fixes; DESIGN.md updated |

## Part 1: what is added and where

1. **Alert timeline**, full width above the Alerts table. New alerts per minute (by first-seen `timestamp`) over the last 60 minutes, stacked High / Medium / Low (vermilion, charcoal, grey). Bars grow in as minutes pass; the current minute pulses. Clicking a minute sets the focus filter to it.
2. **Attack map**, top of the right column. Sources (IP) on the left, targeted services (IP:port) on the right, at most 8 of each; the rest collapse into one "+N more" node per side. One ink stroke per source–service pair, its weight scaled by summed `count`; vermilion while a High on that pair is in effect, grey once every alert on it has expired. New links draw in with GSAP (stroke-dash). Clicking a node sets the focus filter to it. Hand-built SVG, no chart library.
3. **Capture** panel (replaces "Packets per second"): the packets/s line, scrolling live, plus three figures: active flows, queue drops and kernel drops, each drop shown as a % of `packets + kernel_dropped_packets`. Kernel drops turn vermilion above 5%.
4. **Top talkers**: top 5 sources and top 5 destination ports by summed `count`, each with a thin inline bar. Clicking one sets the focus filter.
5. **Search and keyboard**: a search box in the Alerts header matching IP, port or attack name (case-insensitive substring). `/` focuses search, `j`/`k` move between rows, Enter opens the row, `a` acknowledges or un-acknowledges it, Esc closes it. A "?" button lists the keys.
6. **Animated charts**: Attack types becomes HTML bars that re-rank with GSAP Flip, like feed rows; counts roll to their new value.

Right column, top to bottom: Attack map, Capture, Top talkers, Attack types, Analyse a capture file, Muted patterns.

Out of scope: three.js or any new dependency, new endpoints, schema changes, GeoIP, server-side aggregation.

## Part 2: data flow, edge cases, testing

### Data flow

- `App` keeps holding alerts. New `frontend/src/insights.ts` holds pure functions: `timeline(alerts, now, minutes)` → buckets of `{start, high, medium, low}`; `topTalkers(alerts, n)` → `{sources, ports}` ranked by summed `count`, ties by most recent `last_seen`; `attackMap(alerts, n)` → `{sources, services, links, moreSources, moreServices}`.
- All three read the same filtered view as Attack types, so the panels always agree.
- Backend: `stats` messages gain `packets` (int, cumulative since the backend started, counted where packets enter the capture queue). `docs/API_SPEC.md` changes in the same PR.

### One focus filter

Clicking a minute, node or talker sets one focus: `{kind: "minute" | "source" | "service" | "port", value}`. It shows as a removable chip in the Alerts header (e.g. "127.0.0.1 ×"), combines with the existing filters and search by AND, and Clear filters removes it. Setting a new focus replaces the old one.

### Edge cases

- No alerts: each panel says so in a sentence ("No alerts in the last hour", "No attacks to map yet"), never empty axes.
- Frozen (no stats for the stale window): Capture holds its last figures and says "as of HH:MM:SS", like the band.
- Upload tabs: the timeline spans the capture's own first-to-last timestamp in at most 60 buckets; Capture is hidden (no live stats for an upload).
- IPv6 addresses bracketed (existing `endpoint` helper); long labels truncate with the full value in `title`.
- Drop % is `0%` when nothing has arrived; a value is never blank.
- Keyboard shortcuts are ignored while focus is in an input, select or textarea.
- Phone (< 640px): the map keeps two columns with narrower labels; the timeline uses 2-minute buckets.
- Reduced motion: strokes appear without drawing, bars jump to place, counts change without rolling.

### Testing

- Vitest: timeline bucketing (minute edges, severity split, upload span); top talkers summing `count` and tie order; attack-map limits and "+N more"; search matching IP, port, name; shortcuts inert inside inputs; drop % with zero packets; focus chip set, replace and clear.
- pytest: the `stats` message carries a cumulative `packets` that grows with captured packets.
- Visual: Docker demo screenshots at 1440 and 390 px; impeccable critique and taste lint with fixes; DESIGN.md updated.
- CI: the six required checks; `e2e` unchanged.
