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

export type AlertItem = {
  id: string;
  timestamp: string;
  last_seen: string;
  src_ip: string;
  dst_ip: string;
  src_port: number;
  dst_port: number;
  protocol: string;
  attack_type: string;
  confidence: number;
  severity: Level;
  source: string;
  count: number;
  batch_id: number | null;
  acknowledged_at: string | null;
  suppressed_by: number | null;
};

export const DETECTOR = { rule: "Port-scan rule", random_forest: "Classifier", isolation_forest: "Anomaly model" } as Record<string, string>;

/** The score means something different per source (docs/ARCHITECTURE.md#detection-logic), so it is never one bare %.
 *  Returns [short cell text, full explanation]. The text names its detector, so the detector is labelled once. */
export function evidence(alert: AlertItem): [string, string] {
  if (alert.source === "rule") return ["rule match", "Port-scan rule fired; no score is measured"]; // stored as 1.0
  if (alert.source === "isolation_forest") {
    // percentile among benign training scores; round down so it never claims 100%
    const pct = alert.confidence >= 1 ? "100" : String(Math.floor(alert.confidence * 1000 + 1e-9) / 10);
    const rarer = alert.confidence >= 1 ? "rarer than all" : `rarer than ${pct}%`;
    return [rarer, `Anomaly model: score ${alert.confidence >= 1 ? "above every" : `above ${pct}% of`} normal training flow${alert.confidence >= 1 ? "" : "s"}`];
  }
  const p = `${Math.round(alert.confidence * 100)}%`;
  return [`classifier ${p}`, `Classifier's probability for ${alert.attack_type}: ${p}`];
}

// One formatter for every row: building an Intl formatter per call cost ~3 ms, and 200 rows re-render every second.
const TIME = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const DATE_TIME = new Intl.DateTimeFormat([], { dateStyle: "short", timeStyle: "medium" });

export function clockTime(iso: string | number, withDate = false) {
  return (withDate ? DATE_TIME : TIME).format(new Date(iso));
}

gsap.registerPlugin(Flip);

const SEEN_AFTER_MS = 700; // a pointer passing over a row is not reading it

const KEYS: [string, string][] = [
  ["/", "Search"],
  ["j / k", "Next / previous alert"],
  ["Enter", "Open or close details"],
  ["a", "Acknowledge or undo"],
  ["Esc", "Close details"],
];

type RowProps = {
  alert: AlertItem;
  active: boolean;
  secondsLeft: number; // 0 unless active, so expired rows keep equal props and skip re-rendering every second
  frozen: boolean;
  captureTime: boolean;
  changed: "new" | "updated" | undefined;
  open: boolean;
  onToggle: (id: string) => void;
  onSeen: (id: string) => void;
};

/** Below 1280 px a row becomes two lines (level, attack, time / endpoints, evidence), so nothing time-critical is cut off. */
const AlertRow = memo(function AlertRow({ alert, active, secondsLeft, frozen, captureTime, changed, open, onToggle, onSeen }: RowProps) {
  const [text, why] = evidence(alert);
  const dwell = useRef<ReturnType<typeof setTimeout>>();
  const seen = () => changed && onSeen(alert.id);
  const Chevron = open ? ChevronDown : ChevronRight;
  const cell = "max-xl:p-0 xl:py-2 xl:pr-3";
  return (
    <tr
      data-flip-id={alert.id}
      className={`border-t border-row max-xl:grid max-xl:grid-cols-[auto_minmax(0,1fr)_auto] max-xl:items-center max-xl:gap-x-3 max-xl:gap-y-1 max-xl:px-3 max-xl:py-2.5 ${changed ? "bg-changed" : open ? "bg-page" : ""}`}
      onMouseEnter={() => (dwell.current = setTimeout(seen, SEEN_AFTER_MS))}
      onMouseLeave={() => clearTimeout(dwell.current)}
      // focus gets the same dwell as hover: tabbing past rows must not erase their New/Updated marks
      onFocus={() => (dwell.current = setTimeout(seen, SEEN_AFTER_MS))}
      onBlur={() => clearTimeout(dwell.current)}
    >
      <td className={`${cell} xl:pl-3`}>
        <LevelChip level={alert.severity} state={captureTime ? "history" : active ? "active" : "expired"} />
      </td>
      <td className={cell}>
        <button
          type="button"
          data-alert={alert.id}
          onClick={() => {
            seen();
            onToggle(alert.id);
          }}
          aria-expanded={open}
          aria-label={`${LEVEL[alert.severity].label} ${typeLabel(alert.attack_type)} from ${endpoint(alert.src_ip, alert.src_port)} at ${clockTime(alert.last_seen, captureTime)}: details`}
          className={`-my-1 inline-flex min-h-7 items-center gap-1 rounded py-1 hover:underline hover:underline-offset-4 ${(active || captureTime) && !alert.acknowledged_at ? "font-semibold text-ink" : "text-muted"}`}
        >
          {typeLabel(alert.attack_type)}
          <Chevron aria-hidden size={14} className="text-muted" />
        </button>
      </td>
      <td className={`${cell} font-mono text-[13px] max-xl:order-4 max-xl:col-span-2 xl:whitespace-nowrap ${active || captureTime ? "" : "text-muted"}`}>
        {/* each endpoint stays whole; a narrow row wraps only at the arrow */}
        <span className="whitespace-nowrap">{endpoint(alert.src_ip, alert.src_port)} <span aria-hidden>→</span></span>
        <span className="sr-only">to</span> <span className="whitespace-nowrap">{endpoint(alert.dst_ip, alert.dst_port)}</span>
        <span className="ml-2 text-muted xl:hidden">×{alert.count}</span>
      </td>
      <td className={`${cell} text-right font-mono text-[13px] max-xl:hidden ${alert.count > 1 ? "" : "text-muted"}`}>×{alert.count}</td>
      <td className={`${cell} whitespace-nowrap max-xl:order-5 max-xl:text-right max-xl:text-xs xl:text-right text-muted`} title={why}>
        {text}
      </td>
      <td className={`${cell} whitespace-nowrap max-xl:order-3 max-xl:text-right ${active || captureTime ? "" : "text-muted"}`}>
        <span className="font-mono text-[13px] text-muted">{clockTime(alert.last_seen, captureTime)}</span>
        {changed && (
          <span className="ml-2 text-xs font-semibold text-ink">
            {changed === "new" ? "New" : "Updated"}
          </span>
        )}
        {alert.acknowledged_at && <span className="ml-2 text-xs text-muted">Acknowledged</span>}
        {alert.suppressed_by !== null && <span className="ml-2 text-xs text-muted">Muted</span>}
        {!captureTime && active && (
          // the in-effect window as a draining rail; the text says the same for anyone who can't see it
          <span className="mt-1 flex items-center gap-2 text-xs text-muted max-xl:justify-end">
            <span aria-hidden className="h-0.5 w-12 overflow-hidden rounded-full bg-hairline">
              <span
                // drains smoothly between the once-a-second updates; transform, not width, so it never reflows the row
                className={`block h-full origin-left transition-transform duration-1000 ease-linear motion-reduce:transition-none ${frozen ? "bg-edge" : alert.severity === "high" ? "bg-sev-high" : alert.severity === "medium" ? "bg-sev-medium" : "bg-sev-low"}`}
                style={{ transform: `scaleX(${Math.min(1, (secondsLeft * 1000) / IN_EFFECT_MS)})` }}
              />
            </span>
            {frozen ? "held" : `${secondsLeft} s left`}
          </span>
        )}
      </td>
    </tr>
  );
});

type Props = {
  alerts: AlertItem[];
  captureTime: boolean;
  clock: number;
  frozen: boolean;
  severity: string;
  activeOnly: boolean;
  onFilter: (severity: string, activeOnly: boolean) => void;
  changed: Map<string, "new" | "updated">;
  onSeen: (id: string) => void;
  mutedCount: number; // muted alerts in this view; `alerts` excludes them unless showMuted
  showMuted: boolean;
  onShowMuted: (show: boolean) => void;
  onAck: (id: string, acknowledged: boolean) => Promise<void>;
  onMute: (rule: RuleIn) => Promise<void>;
  exportName: string;
  focus: Focus | null; // set by the timeline, map or talkers
  onFocus: (focus: Focus | null) => void;
};

/** Alerts by latest activity (last_seen) first; filters apply before the 200-row cap so a filter never hides matches beyond it.
 *  In effect alerts are always the newest, so one divider separates them from history. */
export default function AlertFeed(props: Props) {
  const { alerts, captureTime, clock, frozen, severity, activeOnly, onFilter, changed, onSeen } = props;
  const [attackType, setAttackType] = useState("all");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const attackTypes = useMemo(() => [...new Set(alerts.map((a) => a.attack_type))].sort(), [alerts]);
  const matching = useMemo(
    () =>
      alerts
        .filter(
          (a) =>
            (severity === "all" || a.severity === severity) &&
            (attackType === "all" || a.attack_type === attackType) &&
            (!activeOnly || inEffect(a, clock)) &&
            (!needsAttention || a.acknowledged_at === null) &&
            matchesSearch(a, query) &&
            matchesFocus(a, props.focus),
        )
        // The API pages by first-seen timestamp, but the feed shows last_seen: order by what is shown.
        .sort((a, b) => Date.parse(b.last_seen) - Date.parse(a.last_seen)),
    [alerts, severity, attackType, activeOnly, clock, needsAttention, query, props.focus],
  );
  const shown = matching.slice(0, FEED_LIMIT);
  const firstExpired = captureTime ? -1 : shown.findIndex((a) => !inEffect(a, clock));
  const filtered = severity !== "all" || attackType !== "all" || activeOnly || needsAttention || props.showMuted || query.trim() !== "" || props.focus !== null;
  const toggleButton = (pressed: boolean) =>
    `min-h-9 rounded px-3 text-sm font-medium ring-1 ${pressed ? "bg-accent text-white ring-accent" : "text-accent ring-edge hover:bg-accent-tint"}`;
  const select = "mt-1 min-h-9 rounded border border-edge bg-surface px-2 text-sm text-ink";

  const toggle = useCallback((id: string) => setOpenId((cur) => (cur === id ? null : id)), []);

  // Rows slide to their new place when activity reorders the feed, instead of jumping (GSAP Flip).
  // Positions are read during render, while the DOM still shows the previous order; the effect animates from them.
  const body = useRef<HTMLTableSectionElement>(null);
  const order = shown.map((a) => a.id).join(",");
  const lastOrder = useRef(order);
  const flipState = useRef<Flip.FlipState | null>(null);
  if (order !== lastOrder.current && body.current) flipState.current = Flip.getState(body.current.querySelectorAll("tr[data-flip-id]"));
  useLayoutEffect(() => {
    const state = flipState.current;
    flipState.current = null;
    lastOrder.current = order;
    if (!state || !body.current || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    Flip.from(state, {
      targets: body.current.querySelectorAll("tr[data-flip-id]"),
      duration: 0.45,
      ease: "expo.out",
      onEnter: (rows) => gsap.fromTo(rows, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }),
    });
  }, [order]);

  function close() {
    // the row's button stays mounted, so hand focus back before the details unmount
    document.querySelector<HTMLElement>(`[data-alert="${openId}"]`)?.focus();
    setOpenId(null);
  }

  // Shortcuts read the latest rows through a ref, so the listener is bound once.
  const latest = useRef({ shown, openId, onAck: props.onAck, close });
  latest.current = { shown, openId, onAck: props.onAck, close };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest?.("input, select, textarea, [contenteditable='true']")) return;
      const rows = [...(body.current?.querySelectorAll<HTMLElement>("[data-alert]") ?? [])];
      let at = rows.indexOf(document.activeElement as HTMLElement);
      // focus is on the details (or elsewhere): carry on from the open row, not the top
      if (at === -1) at = rows.findIndex((r) => r.dataset.alert === latest.current.openId);
      if (e.key === "Escape") {
        // inside the details their own handler already closes
        if (latest.current.openId && !e.defaultPrevented && !target.closest?.("[aria-labelledby^='detail-']")) latest.current.close();
      } else if (e.key === "/") {
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

  return (
    <section className="ink-panel ink-panel-brush bg-surface" aria-labelledby="alerts-heading">
      <div className="flex flex-wrap items-end gap-3 px-4 pt-4 pb-3">
        <div className="mr-auto">
          <h2 id="alerts-heading" className="text-lg font-semibold">Alerts</h2>
          <p className="text-sm text-muted">
            Showing {shown.length.toLocaleString("en-US")} of {matching.length.toLocaleString("en-US")}
            {activeOnly ? ", in effect only" : ", latest activity first"}
          </p>
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
        </div>
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
        <button type="button" aria-pressed={needsAttention} onClick={() => setNeedsAttention(!needsAttention)} className={toggleButton(needsAttention)}>
          Needs attention
        </button>
        {props.mutedCount > 0 && (
          <button type="button" aria-pressed={props.showMuted} onClick={() => props.onShowMuted(!props.showMuted)} className={toggleButton(props.showMuted)}>
            {props.mutedCount.toLocaleString("en-US")} muted · {props.showMuted ? "Hide" : "Show"}
          </button>
        )}
        <label className="flex flex-col text-xs font-medium text-muted">
          Severity
          <select className={select} value={severity} onChange={(e) => onFilter(e.target.value, activeOnly)}>
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium text-muted">
          Attack type
          <select className={select} value={attackType} onChange={(e) => setAttackType(e.target.value)}>
            <option value="all">All</option>
            {attackTypes.map((t) => (
              <option key={t} value={t}>{typeLabel(t)}</option>
            ))}
          </select>
        </label>
        {filtered && (
          <button
            type="button"
            className="min-h-9 rounded px-2 text-sm font-medium text-accent hover:bg-accent-tint"
            onClick={() => {
              onFilter("all", false);
              setAttackType("all");
              setNeedsAttention(false);
              setQuery("");
              props.onFocus(null);
              props.onShowMuted(false);
            }}
          >
            Clear filters
          </button>
        )}
        <button
          type="button"
          disabled={matching.length === 0}
          onClick={() => downloadCsv(matching, props.exportName)}
          className="min-h-9 rounded px-3 text-sm font-medium text-accent ring-1 ring-edge hover:bg-accent-tint disabled:text-muted disabled:ring-hairline"
        >
          Export CSV
        </button>
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
      </div>
      <div className="feed-scroll overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Alerts, latest activity first. Each attack name opens the alert's details.</caption>
          <thead className="border-b border-hairline text-xs text-muted max-xl:sr-only">
            <tr>
              <th className="py-2 pr-3 pl-3 font-medium">Level</th>
              <th className="py-2 pr-3 font-medium">Attack</th>
              <th className="py-2 pr-3 font-medium">Source → destination</th>
              <th className="py-2 pr-3 text-right font-medium">Repeats</th>
              <th className="py-2 pr-3 text-right font-medium">Evidence</th>
              <th className="py-2 pr-3 font-medium">{captureTime ? "Capture time" : "Last activity"}</th>
            </tr>
          </thead>
          <tbody ref={body}>
            {shown.map((a, i) => (
              <Fragment key={a.id}>
                {i === firstExpired && (
                  <tr className="max-xl:block">
                    <td colSpan={6} className="border-t border-row bg-page px-3 py-1.5 text-xs font-medium text-muted max-xl:block">
                      Expired: no activity for 30 s
                    </td>
                  </tr>
                )}
                <AlertRow
                  alert={a}
                  active={inEffect(a, clock)}
                  secondsLeft={inEffect(a, clock) ? Math.ceil((IN_EFFECT_MS - (clock - Date.parse(a.last_seen))) / 1000) : 0}
                  frozen={frozen}
                  captureTime={captureTime}
                  changed={changed.get(a.id)}
                  open={a.id === openId}
                  onToggle={toggle}
                  onSeen={onSeen}
                />
                {a.id === openId && (
                  <tr className="max-xl:block">
                    <td colSpan={6} className="border-t border-row bg-sunk p-3 max-xl:block">
                      <AlertDetail alert={a} clock={clock} onClose={close} onAck={props.onAck} onMute={props.onMute} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            {!alerts.length && props.mutedCount
              ? "Every alert in this view is muted. Show muted alerts, or delete a rule in Muted patterns."
              : alerts.length
              ? activeOnly
                ? "Nothing at this level is in effect. Clear the filter to see its history."
                : needsAttention
                  ? "Everything here has been acknowledged."
                  : "No alerts match these filters."
              : captureTime
                ? "This capture produced no alerts."
                : "No alerts yet. New detections appear here as they happen; run the simulator to see one."}
          </p>
        )}
      </div>
    </section>
  );
}
