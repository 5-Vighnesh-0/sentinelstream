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

type Props = { alerts: AlertItem[]; clock: number; capture: boolean; focus: Focus | null; onFocus: (focus: Focus | null) => void; partial?: boolean };

/** New alerts per bucket, stacked High at the bottom. Heights are linear from zero, so a bar's size is its count.
 *  Bars grow in as buckets open; the current one breathes. Each busy bar narrows the feed to its time. */
export default memo(function AlertTimeline({ alerts, clock, capture, focus, onFocus, partial = false }: Props) {
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
          New alerts per {per}, {capture ? "across this capture" : "last hour"}, from the {alerts.length.toLocaleString("en-US")} {alerts.length === 1 ? "alert" : "alerts"} in this view · peak {peak}{partial && " · older alerts not loaded"}
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
          {/* Labels on one step (quarters) so you can tell when things happened, not only where the window ends. */}
          <div className="relative mt-1 h-5 border-t border-hairline pt-1 font-mono text-xs text-muted">
            {[0, ...(narrow ? (capture ? [] : [0.5]) : [0.25, 0.5, 0.75])].map((f) => {
              const i = Math.round(f * buckets.length);
              return <span key={f} className="absolute" style={{ left: `${(i / buckets.length) * 100}%` }}>{clockTime(buckets[i].start, capture)}</span>;
            })}
            <span className="absolute right-0">{capture ? clockTime(end, capture) : "now"}</span>
          </div>
        </>
      )}
    </section>
  );
});
