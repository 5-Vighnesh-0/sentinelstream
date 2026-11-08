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
        <ol role="list" className="mt-1 space-y-0.5">
          {items.map((t) => {
            const label = kind === "port" ? `port ${t.value}` : t.value;
            const selected = focus !== null && focus.kind === kind && focus.value === t.value;
            return (
              <li key={t.value}>
                <button
                  type="button"
                  aria-label={`${label} ${t.count} ${t.count === 1 ? "detection" : "detections"}`}
                  aria-pressed={selected}
                  title={`${label}: ${t.count.toLocaleString("en-US")} ${t.count === 1 ? "detection" : "detections"}`}
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
