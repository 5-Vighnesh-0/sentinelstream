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
