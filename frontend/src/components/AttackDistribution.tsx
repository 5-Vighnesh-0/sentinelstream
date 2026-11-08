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
        <ol ref={list} role="list" className="space-y-2">
          {data.map((d) => (
            <li key={d.type} data-flip-id={d.type} className="grid grid-cols-[6rem_minmax(0,1fr)_3.5rem] items-center gap-x-3">
              <span title={d.type} className="truncate text-right text-xs text-muted">{d.type}</span>
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
