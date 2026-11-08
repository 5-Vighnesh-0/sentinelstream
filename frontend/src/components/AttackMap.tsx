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

/** Sources on the left, targeted services on the right, one ink stroke per pair. Weight is detections, linear from zero
 *  (0.75px is only a visibility floor); vermilion only while a High on that pair is in effect.
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
    gsap.fromTo(fresh, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: "power2.out", stagger: Math.min(0.04, 0.6 / fresh.length) });
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
        title={`${n.key}: ${n.count.toLocaleString("en-US")} ${n.count === 1 ? "detection" : "detections"}`}
        aria-label={`${n.key} ${n.count} ${n.count === 1 ? "detection" : "detections"}`}
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
        strokeWidth={Math.max(0.75, 4 * (l.count / heaviest))}
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
