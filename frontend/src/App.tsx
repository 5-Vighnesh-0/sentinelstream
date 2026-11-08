import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ackAlert, createRule, deleteRule, listRules, listUploads, mutedBy, type Rule, type RuleIn } from "./api";
import AlertFeed, { clockTime, type AlertItem } from "./components/AlertFeed";
import AlertTimeline from "./components/AlertTimeline";
import AttackDistribution from "./components/AttackDistribution";
import AttackMap from "./components/AttackMap";
import Banners from "./components/Banners";
import InEffectStrip from "./components/InEffectStrip";
import InkDefs from "./components/InkDefs";
import Masthead from "./components/Masthead";
import MutedPatterns from "./components/MutedPatterns";
import PCAPUpload, { type Batch } from "./components/PCAPUpload";
import StatusPill from "./components/StatusPill";
import TokenForm from "./components/TokenForm";
import TrafficChart, { type TrafficPoint } from "./components/TrafficChart";
import TopTalkers from "./components/TopTalkers";
import { API_URL, STALE_AFTER_MS, TRAFFIC_WINDOW_S, WS_URL } from "./config";
import type { Focus } from "./insights";
import { authHeader, loadToken, saveToken } from "./token";
import { useWebSocket } from "./useWebSocket";

const KEPT_ALERTS = 1000; // per view, in memory; the feed renders at most 200
const KEPT_CHANGED = 200; // rows held lit until looked at

/** Newest activity first; an aggregated update (same id, higher count) replaces the old copy.
 *  The cap is per view (live, each upload) so a busy live stream never evicts an upload's alerts. */
export function upsert(list: AlertItem[], incoming: AlertItem[]): AlertItem[] {
  const ids = new Set(incoming.map((a) => a.id));
  const kept = new Map<number | null, number>();
  return [...incoming, ...list.filter((a) => !ids.has(a.id))].filter((a) => {
    const n = (kept.get(a.batch_id) ?? 0) + 1;
    kept.set(a.batch_id, n);
    return n <= KEPT_ALERTS;
  });
}

export default function App() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [traffic, setTraffic] = useState<TrafficPoint[]>([]);
  const [iface, setIface] = useState<string | null>(null);
  const [lastStatAt, setLastStatAt] = useState<number | null>(null);
  const [modelLoaded, setModelLoaded] = useState<boolean | null>(null);
  const [batches, setBatches] = useState<Record<number, Batch>>({});
  const [token, setToken] = useState(loadToken);
  const [rejected, setRejected] = useState(false);
  const [view, setView] = useState<number | null>(null); // null = live traffic, else an upload batch id
  const [severity, setSeverity] = useState("all");
  const [activeOnly, setActiveOnly] = useState(false); // the strip filters to what it counts: in effect only
  const [rules, setRules] = useState<Rule[]>([]);
  const [showMuted, setShowMuted] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null); // set by the timeline, map or talkers; narrows the feed
  const [changed, setChanged] = useState<Map<string, "new" | "updated">>(new Map());
  const [announcement, setAnnouncement] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const known = useRef(new Map<string, number>()); // id -> count, to tell a new alert from an update

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000); // in-effect windows and "ago" text count down
    return () => clearInterval(timer);
  }, []);

  const loadAlerts = useCallback(async (batchId: number | null) => {
    const query = batchId === null ? "limit=200" : `limit=500&batch_id=${batchId}`;
    try {
      const response = await fetch(`${API_URL}/alerts?${query}`, { headers: authHeader(token) });
      if (response.status === 401) {
        setRejected(true);
        return;
      }
      const page = await response.json();
      for (const a of page.items as AlertItem[]) known.current.set(a.id, a.count);
      setAlerts((prev) => upsert(prev, page.items));
    } catch {
      // the connection banner already says the backend is unreachable
    }
  }, [token]);

  const onOpen = useCallback(() => {
    fetch(`${API_URL}/health`).then((r) => r.json()).then((h) => setModelLoaded(h.model_loaded)).catch(() => {});
    loadAlerts(null); // catch up on anything missed while disconnected
  }, [loadAlerts]);

  // A rejected WebSocket handshake never fires onopen, so check the token over REST on its own too.
  useEffect(() => {
    if (!token || rejected) return;
    loadAlerts(null);
    listRules(token).then(setRules).catch(() => {});
    // Past uploads come back as tabs after a reload; statuses already heard over the WebSocket are newer, so they win.
    listUploads(token)
      .then((uploads) => setBatches((prev) => ({ ...Object.fromEntries(uploads.map((u) => [u.id, { name: u.filename, status: u.status }])), ...prev })))
      .catch(() => {});
  }, [token, rejected, loadAlerts]);

  const onMessage = useCallback((message: { type: string; data: any }) => {
    if (message.type === "alert") {
      const a: AlertItem = message.data;
      const before = known.current.get(a.id);
      known.current.set(a.id, a.count);
      if (a.batch_id === null && (before === undefined || a.count > before)) {
        setChanged((prev) => {
          const next = new Map(prev).set(a.id, before === undefined ? "new" : "updated");
          if (next.size > KEPT_CHANGED) next.delete(next.keys().next().value!);
          return next;
        });
        if (before === undefined && a.severity === "high") {
          setAnnouncement(`New High alert: ${a.attack_type} from ${a.src_ip}`);
        }
      }
      setAlerts((prev) => upsert(prev, [a]));
    } else if (message.type === "stats") {
      setIface(message.data.iface);
      setLastStatAt(Date.now());
      const time = clockTime(message.data.timestamp);
      setTraffic((prev) => [...prev, { time, pps: message.data.packets_per_s }].slice(-TRAFFIC_WINDOW_S));
    } else if (message.type === "batch") {
      const { batch_id: id, status } = message.data;
      setBatches((prev) => ({ ...prev, [id]: { name: prev[id]?.name ?? `Upload ${id}`, status } }));
    }
  }, []);

  const status = useWebSocket(token && !rejected ? WS_URL : null, { onMessage, onOpen, onClose: () => loadAlerts(null) }, ["sentinelstream", token]);
  const stale = status === "open" && lastStatAt !== null && now - lastStatAt > STALE_AFTER_MS;
  // While no data arrives, "in effect" is judged at the last data, so a dead connection never decays into an all-clear.
  const frozen = stale || (status === "reconnecting" && lastStatAt !== null);
  const clock = frozen ? lastStatAt! : now;
  // Stable lists between ticks, so memoised children only re-render when alerts change, not every second.
  // Mute rules are matched here too, so alerts already loaded update the moment a rule changes.
  const marked = useMemo(
    () => alerts.map((a) => {
      const rule = mutedBy(rules, a);
      return rule === a.suppressed_by ? a : { ...a, suppressed_by: rule };
    }),
    [alerts, rules],
  );
  const live = useMemo(() => marked.filter((a) => a.batch_id === null), [marked]);
  const inView = useMemo(() => (view === null ? live : marked.filter((a) => a.batch_id === view)), [marked, live, view]);
  const unmuted = useMemo(() => inView.filter((a) => a.suppressed_by === null), [inView]);
  const visible = showMuted ? inView : unmuted;
  // A High stays in the title until someone acknowledges it, in effect or not.
  const highUnacked = live.filter((a) => a.severity === "high" && a.suppressed_by === null && a.acknowledged_at === null).length;
  const locked = !token || rejected;

  useEffect(() => {
    document.title = highUnacked ? `(${highUnacked} High) SentinelStream` : "SentinelStream";
  }, [highUnacked]);

  const onAck = useCallback(async (id: string, acknowledged: boolean) => {
    const updated = await ackAlert(token, id, acknowledged);
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, [token]);

  const onMute = useCallback(async (rule: RuleIn) => {
    const created = await createRule(token, rule);
    setRules((prev) => [...prev, created].sort((a, b) => a.id - b.id));
  }, [token]);

  const onDeleteRule = useCallback(async (id: number) => {
    await deleteRule(token, id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, [token]);

  function saveNewToken(t: string) {
    saveToken(t);
    setToken(t);
    setRejected(false);
  }

  function viewBatch(batchId: number | null) {
    setView(batchId);
    filter("all", false);
    setShowMuted(false);
    setFocus(null);
    if (batchId !== null) loadAlerts(batchId);
  }

  function filter(level: string, onlyActive: boolean) {
    setSeverity(level);
    setActiveOnly(onlyActive);
  }

  const seen = useCallback((id: string) => {
    setChanged((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const tabs: [number | null, string][] = [
    [null, "Live"],
    ...Object.entries(batches)
      .filter(([, b]) => b.status === "done")
      .map(([id, b]) => [Number(id), b.name] as [number, string]),
  ];

  function onTabKey(e: React.KeyboardEvent, index: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = (index + step + tabs.length) % tabs.length;
    viewBatch(tabs[next][0]);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  }

  return (
    <>
      <InkDefs />
      <Masthead
        nav={!locked && tabs.length > 1 && (
          <div role="tablist" aria-label="View" className="flex max-w-full gap-1 overflow-x-auto">
            {tabs.map(([id, label], i) => (
              <button
                key={id ?? "live"}
                type="button"
                role="tab"
                aria-selected={view === id}
                tabIndex={view === id ? 0 : -1}
                onClick={() => viewBatch(id)}
                onKeyDown={(e) => onTabKey(e, i)}
                title={label}
                className={`max-w-48 truncate rounded-md px-3 py-1.5 text-sm font-medium ${view === id ? "bg-accent text-white" : "text-muted hover:bg-sunk hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        status={<StatusPill status={status} iface={iface} lastStatAt={lastStatAt} now={now} stale={stale} />}
      />
      <main>
      {!locked && (
        <InEffectStrip
          alerts={visible}
          clock={clock}
          frozen={frozen}
          capture={view !== null}
          severity={severity}
          activeOnly={activeOnly}
          onFilter={filter}
          note={iface === "lo" ? "Demo mode: capturing loopback traffic only, so alerts come from programs on this computer." : null}
        />
      )}
      <div className="mx-auto max-w-[1440px] space-y-4 p-4 sm:px-6">
      <Banners status={status} modelLoaded={modelLoaded} />
      <p aria-live="polite" className="sr-only">{announcement}</p>
        {/* grid-cols-1 = minmax(0, 1fr): without it the column grows to the table's width on phones */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {!locked && <AlertTimeline alerts={visible} clock={clock} capture={view !== null} focus={focus} onFocus={setFocus} />}
            {locked ? (
              <TokenForm onSave={saveNewToken} rejected={rejected} />
            ) : (
              <AlertFeed
                key={view ?? "live"}
                alerts={visible}
                captureTime={view !== null}
                clock={clock}
                frozen={frozen}
                severity={severity}
                activeOnly={activeOnly}
                onFilter={filter}
                changed={changed}
                onSeen={seen}
                mutedCount={inView.length - unmuted.length}
                showMuted={showMuted}
                onShowMuted={setShowMuted}
                onAck={onAck}
                onMute={onMute}
                exportName={view === null ? "live" : `upload-${view}`}
                focus={focus}
                onFocus={setFocus}
              />
            )}
          </div>
          <div className="space-y-4">
            {!locked && <AttackMap alerts={visible} clock={clock} capture={view !== null} focus={focus} onFocus={setFocus} />}
            <TrafficChart points={traffic} stale={stale || status === "reconnecting"} />
            {!locked && <TopTalkers alerts={visible} focus={focus} onFocus={setFocus} />}
            <AttackDistribution alerts={visible} />
            {!locked && (
              <PCAPUpload
                batches={batches}
                onUploaded={(id, name) => setBatches((prev) => ({ ...prev, [id]: { name, status: prev[id]?.status ?? "pending" } }))}
                token={token}
                onRejected={() => setRejected(true)}
              />
            )}
            {!locked && <MutedPatterns rules={rules} onDelete={onDeleteRule} />}
          </div>
        </div>
      </div>
      </main>
    </>
  );
}
