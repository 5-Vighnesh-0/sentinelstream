"""SentinelStream API: REST + WebSocket over the live pipeline, SQLite persistence and PCAP uploads.

Run (live capture needs root or CAP_NET_RAW; without it the API still serves history and uploads):
  sudo .venv/bin/uvicorn backend.api.main:app --host 127.0.0.1 --port 8000
"""
import asyncio
import logging
import os
import queue
import sqlite3
import sys
import threading
import uuid
from contextlib import asynccontextmanager, closing, suppress
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel

from backend.api import uploads
from backend.api.auth import SUBPROTOCOL, TOKEN_FILE, from_bearer, from_subprotocols, load_or_create_token, matches
from backend.api.suppressions import suppressed_by, validate
from backend.api.uploads import analyse_upload, reset_upload_dir, sanitise_filename
from backend.db.writer import ALERT_FIELDS, AlertAggregator, Writer, connect, now_iso
from backend.features.extractor import check_capture_file
from backend.features.feature_set import load_model
from backend.pipeline import Pipeline

log = logging.getLogger("sentinelstream.api")

REPO = Path(__file__).resolve().parents[2]
MODELS_DIR = (REPO / "models").resolve()
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
ALLOWED_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
UPLOAD_BACKLOG = 2  # waiting; one more is processing
MESSAGE_QUEUE_SIZE = 1_000
STATS_EVERY_S = 1.0
WS_SEND_TIMEOUT_S = 2.0
DOCKERENV = Path("/.dockerenv")
MAX_WS_CLIENTS = 20


class Alert(BaseModel):
    id: str
    timestamp: str
    src_ip: str
    dst_ip: str
    src_port: int
    dst_port: int
    protocol: str
    attack_type: str
    confidence: float
    severity: str
    source: str
    count: int
    last_seen: str
    batch_id: int | None
    flow_id: str | None
    acknowledged_at: str | None = None
    suppressed_by: int | None = None  # the mute rule that hides it; muted alerts are kept


class AckBody(BaseModel):
    acknowledged: bool


class RuleIn(BaseModel):
    src_ip: str | None = None
    dst_ip: str | None = None
    dst_port: int | None = None
    attack_type: str | None = None


class Rule(RuleIn):
    id: int
    created_at: str


class Upload(BaseModel):
    id: int
    filename: str
    uploaded_at: str
    status: str


class AlertPage(BaseModel):
    items: list[Alert]
    total: int
    limit: int
    offset: int


class Health(BaseModel):
    status: str
    model_loaded: bool


class UploadAccepted(BaseModel):
    batch_id: int
    status: str


def repo_path(env: str, default: str) -> Path:
    path = Path(os.environ.get(env, default))
    return (path if path.is_absolute() else REPO / path).resolve()


def resolve_model_path() -> Path:
    """SENTINEL_MODEL_PATH must point inside models/: joblib files run code when loaded."""
    path = repo_path("SENTINEL_MODEL_PATH", "models/random_forest.joblib")
    if not path.is_relative_to(MODELS_DIR):
        raise ValueError(f"SENTINEL_MODEL_PATH must be under {MODELS_DIR}, got {path}")
    if not path.exists() and path.name == "random_forest.joblib":
        path = MODELS_DIR / "isolation_forest.joblib"  # live default until Phase 5 trains the Random Forest
    return path


class UploadSizeLimit:
    """Reject upload bodies over the cap while they stream in, before anything reaches disk."""

    def __init__(self, app, limit: int):
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["path"] != "/upload-pcap":
            return await self.app(scope, receive, send)
        limit = self.limit + 64 * 1024  # multipart headers and boundaries
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > limit:
                raise HTTPException(413, f"File exceeds {self.limit // (1024 * 1024)} MB limit")
            return message

        await self.app(scope, limited_receive, send)


async def close_quietly(ws: WebSocket) -> None:
    with suppress(Exception):  # already closed
        await ws.close(code=1013)


class Hub:
    """Fans each alert out to SQLite and WebSocket clients, from any thread."""

    def __init__(self, db_path: Path):
        self.writer = Writer(db_path)
        self.aggregator = AlertAggregator()
        self.lock = threading.Lock()  # live inference and the upload worker both publish
        self.loop: asyncio.AbstractEventLoop | None = None
        self.messages: asyncio.Queue | None = None
        self.clients: set[WebSocket] = set()  # sockets the sender still serves
        self.open_sockets: set[WebSocket] = set()  # every connection, for the cap
        self.dropped_messages = 0
        self.pipeline: Pipeline | None = None
        self.rules: list[dict] = []  # mute rules sorted by id, loaded at startup and kept in step with the table

    def publish(self, row: dict, batch_id: int | None = None) -> None:
        with self.lock:
            alert, flow = self.aggregator.add(row, batch_id)
        self.writer.submit(alert, flow)
        self.send_threadsafe({"type": "alert", "data": {**alert, "suppressed_by": suppressed_by(self.rules, alert)}})

    def send_threadsafe(self, message: dict) -> None:
        self.loop.call_soon_threadsafe(self.enqueue, message)

    def enqueue(self, message: dict) -> None:
        """Runs on the event loop. A full queue drops the message rather than blocking inference."""
        try:
            self.messages.put_nowait(message)
        except asyncio.QueueFull:
            self.dropped_messages += 1

    async def sender(self) -> None:
        while True:
            message = await self.messages.get()
            for ws in list(self.clients):
                try:
                    await asyncio.wait_for(ws.send_json(message), WS_SEND_TIMEOUT_S)
                except Exception:  # noqa: BLE001 - slow or gone: close it so the dashboard reconnects and re-fetches GET /alerts
                    self.clients.discard(ws)
                    asyncio.create_task(close_quietly(ws))

    async def stats(self, iface: str) -> None:
        last = 0
        while True:
            await asyncio.sleep(STATS_EVERY_S)
            p = self.pipeline
            packets = p.stats["packets"] if p else 0
            self.enqueue({"type": "stats", "data": {
                "timestamp": now_iso(),
                "packets_per_s": (packets - last) / STATS_EVERY_S,
                "packets": packets,
                "active_flows": len(p.table) if p else 0,
                "dropped_packets": p.capture.dropped if p else 0,
                "kernel_dropped_packets": p.capture.kernel_dropped() if p else 0,
                "dropped_flows": p.stats["dropped_flows"] if p else 0,
                "dropped_alerts": self.dropped_messages + self.writer.dropped,
                "iface": iface,
            }})
            last = packets


def create_app(capture: bool = True) -> FastAPI:
    os.umask(0o077)  # data/, the database and the token file are owner-only
    if os.geteuid() == 0 and not DOCKERENV.exists():
        log.warning("running as root: start uvicorn with only CAP_NET_RAW instead (see docs/DEMO.md)")
    db_path = repo_path("SENTINEL_DB_PATH", "data/sentinelstream.db")
    token = load_or_create_token(db_path.parent)
    # stderr, not logging: uvicorn's default config would hide an INFO line from this logger.
    print(f"Dashboard token: {token} (stored in {db_path.parent / TOKEN_FILE}; delete the file to rotate it)",
          file=sys.stderr, flush=True)
    model_path = resolve_model_path()
    iface = os.environ.get("SENTINEL_IFACE", "lo")
    hub = Hub(db_path)
    with closing(connect(db_path)) as conn:  # create or migrate now: the read-only API connections must never see an old schema
        conn.row_factory = sqlite3.Row
        hub.rules = [dict(r) for r in conn.execute("SELECT * FROM suppressions ORDER BY id")]
    uploads_queue: queue.Queue = queue.Queue(maxsize=UPLOAD_BACKLOG)
    upload_lock = threading.Lock()

    def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
        if not matches(token, from_bearer(authorization)):
            raise HTTPException(401, "Missing or wrong dashboard token")

    try:
        load_model(model_path)
        model_loaded = True
    except (OSError, ValueError) as e:
        log.error("no usable model at %s: %s", model_path, e)
        model_loaded = False

    def set_batch_status(batch_id: int, status: str) -> None:
        with closing(sqlite3.connect(db_path)) as conn, conn:
            conn.execute("UPDATE upload_batches SET status = ? WHERE id = ?", (status, batch_id))
        hub.send_threadsafe({"type": "batch", "data": {"batch_id": batch_id, "status": status}})

    def upload_worker() -> None:
        while (job := uploads_queue.get()) is not None:
            batch_id, path = job
            set_batch_status(batch_id, "processing")
            try:
                for row in analyse_upload(path, model_path):
                    hub.publish(row, batch_id)
                status = "done"
            except Exception:
                log.exception("upload batch %d failed", batch_id)
                status = "failed"
            finally:
                path.unlink(missing_ok=True)
            set_batch_status(batch_id, status)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        with closing(connect(db_path)) as conn, conn:
            conn.execute("UPDATE upload_batches SET status = 'failed' WHERE status IN ('pending', 'processing')")
        reset_upload_dir()
        hub.loop = asyncio.get_running_loop()
        hub.messages = asyncio.Queue(maxsize=MESSAGE_QUEUE_SIZE)
        hub.writer.start()
        worker = threading.Thread(target=upload_worker, name="upload-worker", daemon=True)
        worker.start()
        if capture and model_loaded:
            hub.pipeline = Pipeline(iface, model_path, on_alert=hub.publish)
            hub.pipeline.start()
        tasks = [asyncio.create_task(hub.sender()), asyncio.create_task(hub.stats(iface))]
        yield
        if hub.pipeline:
            await asyncio.to_thread(hub.pipeline.stop)
        uploads_queue.put(None)
        await asyncio.to_thread(worker.join, 5)
        await asyncio.to_thread(hub.writer.stop)
        for task in tasks:
            task.cancel()

    app = FastAPI(title="SentinelStream", lifespan=lifespan)
    app.state.hub = hub
    app.state.token = token
    app.state.db_path = db_path
    app.state.uploads = uploads_queue
    app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["GET", "POST", "PUT", "DELETE"],
                       allow_headers=["X-Sentinel-Upload", "Authorization", "Content-Type"])
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)  # blocks DNS rebinding
    app.add_middleware(UploadSizeLimit, limit=uploads.MAX_UPLOAD_BYTES)

    @app.get("/health")
    def health() -> Health:
        return Health(status="ok", model_loaded=model_loaded)

    @app.get("/alerts", dependencies=[Depends(require_token)])
    def list_alerts(
        limit: Annotated[int, Query(ge=1, le=500)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
        severity: Annotated[Literal["low", "medium", "high"] | None, Query()] = None,
        attack_type: Annotated[str | None, Query(max_length=32)] = None,
        batch_id: Annotated[int | None, Query(ge=1)] = None,
    ) -> AlertPage:
        filters = {"severity": severity, "attack_type": attack_type, "batch_id": batch_id}
        where = [f"{column} = ?" for column, value in filters.items() if value is not None]
        params = [value for value in filters.values() if value is not None]
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        with closing(sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)) as conn:
            conn.row_factory = sqlite3.Row
            total = conn.execute(f"SELECT COUNT(*) FROM alerts {clause}", params).fetchone()[0]
            rows = conn.execute(f"SELECT {', '.join(ALERT_FIELDS)} FROM alerts {clause} "
                                "ORDER BY timestamp DESC LIMIT ? OFFSET ?", [*params, limit, offset]).fetchall()
        items = [Alert(**dict(r), suppressed_by=suppressed_by(hub.rules, dict(r))) for r in rows]
        return AlertPage(items=items, total=total, limit=limit, offset=offset)

    # Analyst writes are rare and need an immediate answer, so they use a short connection of their own;
    # the writer thread stays the only writer of detections.
    @app.put("/alerts/{alert_id}/ack", dependencies=[Depends(require_token)])
    def acknowledge(alert_id: str, body: AckBody) -> Alert:
        with closing(connect(db_path)) as conn, conn:
            conn.row_factory = sqlite3.Row
            cur = conn.execute("UPDATE alerts SET acknowledged_at = ? WHERE id = ?",
                               (now_iso() if body.acknowledged else None, alert_id))
            if cur.rowcount == 0:
                raise HTTPException(404, "No such alert")
            r = dict(conn.execute(f"SELECT {', '.join(ALERT_FIELDS)} FROM alerts WHERE id = ?", (alert_id,)).fetchone())
        return Alert(**r, suppressed_by=suppressed_by(hub.rules, r))

    @app.get("/suppressions", dependencies=[Depends(require_token)])
    def list_rules() -> list[Rule]:
        return [Rule(**r) for r in hub.rules]

    @app.post("/suppressions", status_code=201, dependencies=[Depends(require_token)])
    def create_rule(body: RuleIn) -> Rule:
        try:
            rule = validate(body.model_dump())
        except ValueError as e:
            raise HTTPException(422, str(e)) from None
        rule["created_at"] = now_iso()
        with closing(connect(db_path)) as conn, conn:
            rule["id"] = conn.execute("INSERT INTO suppressions (src_ip, dst_ip, dst_port, attack_type, created_at) "
                                      "VALUES (:src_ip, :dst_ip, :dst_port, :attack_type, :created_at)", rule).lastrowid
        hub.rules = sorted([*hub.rules, rule], key=lambda r: r["id"])
        return Rule(**rule)

    @app.delete("/suppressions/{rule_id}", status_code=204, dependencies=[Depends(require_token)])
    def delete_rule(rule_id: int) -> None:
        with closing(connect(db_path)) as conn, conn:
            if conn.execute("DELETE FROM suppressions WHERE id = ?", (rule_id,)).rowcount == 0:
                raise HTTPException(404, "No such rule")
        hub.rules = [r for r in hub.rules if r["id"] != rule_id]

    @app.get("/uploads", dependencies=[Depends(require_token)])
    def list_uploads() -> list[Upload]:
        with closing(sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute("SELECT id, filename, uploaded_at, status FROM upload_batches ORDER BY id DESC").fetchall()
        return [Upload(**dict(r)) for r in rows]

    @app.post("/upload-pcap", status_code=202, dependencies=[Depends(require_token)])
    def upload_pcap(
        file: UploadFile,
        request: Request,
        x_sentinel_upload: Annotated[str | None, Header()] = None,
    ) -> UploadAccepted:
        # A plain multipart POST needs no CORS preflight, so check the origin and a custom header ourselves (CSRF).
        if request.headers.get("origin") not in ALLOWED_ORIGINS or x_sentinel_upload != "1":
            raise HTTPException(403, "Uploads must come from the dashboard")
        ext = Path(file.filename or "").suffix.lower()
        if ext not in uploads.EXTENSIONS:
            raise HTTPException(400, "File must be .pcap or .pcapng")
        path = uploads.UPLOAD_DIR / f"{uuid.uuid4().hex}{ext}"  # never the client's filename
        written = 0
        with path.open("wb") as out:
            while chunk := file.file.read(1024 * 1024):
                written += len(chunk)
                if written > uploads.MAX_UPLOAD_BYTES:
                    break
                out.write(chunk)
        if written > uploads.MAX_UPLOAD_BYTES:
            path.unlink()
            raise HTTPException(413, f"File exceeds {uploads.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")
        try:
            check_capture_file(path)
        except ValueError:
            path.unlink()
            raise HTTPException(400, "Not a pcap/pcapng file")
        with upload_lock:
            if uploads_queue.full():
                path.unlink()
                raise HTTPException(429, "Too many uploads in progress")
            with closing(sqlite3.connect(db_path)) as conn, conn:
                batch_id = conn.execute(
                    "INSERT INTO upload_batches (filename, uploaded_at, status) VALUES (?, ?, 'pending')",
                    (sanitise_filename(file.filename), now_iso()),
                ).lastrowid
            uploads_queue.put_nowait((batch_id, path))
        log.info("upload batch %d queued: %r", batch_id, sanitise_filename(file.filename))
        return UploadAccepted(batch_id=batch_id, status="pending")

    @app.websocket("/ws/alerts")
    async def ws_alerts(websocket: WebSocket) -> None:
        offered = from_subprotocols(websocket.headers.get("sec-websocket-protocol"))
        # CORS doesn't cover WebSockets, and browsers can only send the token as a subprotocol.
        if websocket.headers.get("origin") not in ALLOWED_ORIGINS or not matches(token, offered):
            await websocket.close(code=1008)
            return
        if len(hub.open_sockets) >= MAX_WS_CLIENTS:  # counts every open socket, not just those the sender still serves
            await websocket.close(code=1013)
            return
        hub.open_sockets.add(websocket)  # before accept, so in-flight handshakes count too
        try:
            await websocket.accept(subprotocol=SUBPROTOCOL)
            hub.clients.add(websocket)
            while True:
                await websocket.receive_text()  # client messages are ignored
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(websocket)
            hub.open_sockets.discard(websocket)

    return app


app = create_app()
