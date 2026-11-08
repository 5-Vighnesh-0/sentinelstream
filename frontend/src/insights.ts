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
