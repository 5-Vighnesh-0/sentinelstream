# API Specification

Base URL: `http://127.0.0.1:8000` (the dashboard uses the IP, not `localhost`, so browsers never try `::1`). Implemented in Phase 3 (`backend/api/main.py`).

- Authentication: `GET /alerts` and `POST /upload-pcap` need `Authorization: Bearer <token>` → else **401**. The token (`secrets.token_urlsafe(32)`) is in `api-token` (mode 600) next to the database (`data/api-token` by default, i.e. `dirname(SENTINEL_DB_PATH)`) and printed to stderr at startup as `Dashboard token: … (stored in …; delete the file to rotate it)`; deleting the file and restarting rotates it. `/health` is open. The backend also binds `127.0.0.1` only. See [ARCHITECTURE.md](ARCHITECTURE.md#trust-boundary).
- CORS allows origins `http://localhost:3000` and `http://127.0.0.1:3000` only, and the `Authorization`, `Content-Type` and `X-Sentinel-Upload` request headers, and methods GET, POST, PUT and DELETE; never `*`. Write endpoints need the Bearer token, which forces a CORS preflight only the dashboard origins pass, so they need no extra CSRF header.
- Host header must be `localhost` or `127.0.0.1` (TrustedHostMiddleware) → else **400**. Blocks DNS rebinding.
- Errors use FastAPI's default shape: `{"detail": "..."}` (validation errors: `{"detail": [ ... ]}` with status 422).
- Timestamps are ISO-8601 UTC strings. Field definitions are in [DATA_MODEL.md](DATA_MODEL.md).

## Alert object

Used by `GET /alerts` and the WebSocket `alert` message.

```json
{
  "id": "3f2b9c1e8a7d4e0f9b6a5c4d3e2f1a0b",
  "timestamp": "2026-10-28T10:15:30.123Z",
  "src_ip": "127.0.0.1",
  "dst_ip": "127.0.0.1",
  "src_port": 54321,
  "dst_port": 22,
  "protocol": "TCP",
  "attack_type": "PortScan",
  "confidence": 0.93,
  "severity": "high",
  "source": "rule",
  "count": 1,
  "last_seen": "2026-10-28T10:15:30.123Z",
  "batch_id": null,
  "flow_id": "9a8b7c6d5e4f40312a1b0c9d8e7f6a5b",
  "acknowledged_at": null,
  "suppressed_by": null
}
```

`acknowledged_at`: when an analyst acknowledged it (null = needs attention; a later repeat clears it). `suppressed_by`: id of the mute rule that hides it, or null. Muted alerts are still stored, returned and broadcast; the dashboard hides them.

## `GET /health`

Liveness check.

**200**

```json
{"status": "ok", "model_loaded": true}
```

`model_loaded` is false when no model file is present; the dashboard banner shows it.

## `GET /alerts`

Paginated alert history, newest first (`timestamp DESC`).

| Query param | Type | Default | Rules |
|---|---|---|---|
| `limit` | int | 50 | 1–500 |
| `offset` | int | 0 | ≥ 0 |
| `severity` | string | — | `low` \| `medium` \| `high` |
| `attack_type` | string | — | Any value from [attack types](DATA_MODEL.md#attack-types) |
| `batch_id` | int | — | Only alerts from that upload |

Filters combine with AND.

**200**

```json
{
  "items": [ { "...": "Alert object" } ],
  "total": 1234,
  "limit": 50,
  "offset": 0
}
```

**422** invalid parameter (e.g. `severity=critical`, `limit=0`).

## `POST /upload-pcap`

Upload a capture for offline analysis. `multipart/form-data` with one field `file`.

Validation, in order:

0. `Origin` must be `http://localhost:3000` or `http://127.0.0.1:3000` and header `X-Sentinel-Upload: 1` must be present → else **403**. (A plain multipart POST needs no CORS preflight, so this blocks cross-site uploads.)
1. Extension (case-insensitive) must be `.pcap` or `.pcapng` → else **400** `{"detail": "File must be .pcap or .pcapng"}`.
2. Size is counted while streaming to disk; over 50 MB the write stops, the partial file is deleted → **413** `{"detail": "File exceeds 50 MB limit"}`.
3. The file is saved under a temp directory as `<uuid4 hex>.<ext>`. The client filename is never used as a path; it is stored in `upload_batches.filename` for display only, after sanitising to `[A-Za-z0-9._ -]`.
4. The first 4 bytes must be a pcap/pcapng magic number → else **400** `{"detail": "Not a pcap/pcapng file"}` (gzip is rejected; Scapy would decompress it past the size cap).
5. At most 1 upload processing and 2 queued → else **429**.
6. Parsing runs in a subprocess with memory and CPU limits and a timeout; any failure marks the batch `failed`. The temp directory is wiped and stale `pending`/`processing` batches are marked `failed` at startup.

Processing runs in the background PCAP worker. Alerts it produces carry the new `batch_id` and are both stored and broadcast on the WebSocket. The temp file is deleted when processing ends.

**202**

```json
{"batch_id": 7, "status": "pending"}
```

**422** missing `file` field.

## `PUT /alerts/{id}/ack`

Acknowledge or un-acknowledge an alert. Body `{"acknowledged": true}` or `{"acknowledged": false}`. Needs the dashboard token.

**200** the updated alert object. **404** unknown id.

## `GET /suppressions` · `POST /suppressions` · `DELETE /suppressions/{id}`

Mute rules. Each needs the dashboard token.

- `GET` → **200** `[{"id": 1, "src_ip": "127.0.0.1", "dst_ip": "127.0.0.1", "dst_port": 42361, "attack_type": "anomaly", "created_at": "…"}]`, sorted by id.
- `POST` body: any of `src_ip`, `dst_ip`, `dst_port`, `attack_type` (omitted or null = any) → **201** the rule. **422** when every field is null, an IP doesn't parse, the port is outside 0–65535, or `attack_type` is empty or over 64 characters.
- `DELETE` → **204**; **404** unknown id. Matching alerts are unmuted immediately.

## `GET /uploads`

Upload batches, newest first. Needs the dashboard token.

**200** `[{"id": 7, "filename": "capture.pcap", "uploaded_at": "…", "status": "done"}]`

## `WS /ws/alerts`

Server → client JSON messages. Messages the client sends are ignored. The client offers the subprotocols `sentinelstream, <token>` and the server accepts `sentinelstream`. The server refuses the handshake unless `Origin` is `http://localhost:3000` or `http://127.0.0.1:3000` (CORS does not protect WebSockets) and the offered token is correct; it also refuses it when 20 clients are already connected. It refuses by closing before accept (code **1008** for Origin or token, **1013** for the client cap, as Starlette's test client reports them); uvicorn sends that to a real client as an **HTTP 403** handshake response.

A browser sees a refused handshake only as close code 1006, so the dashboard detects a bad token through the 401 on `GET /alerts`, probing on load and after each failed reconnect.

Every message has the shape `{"type": "...", "data": {...}}`.

### `alert`

Sent for each new alert (live or upload), as soon as the inference thread produces it, before the batched DB insert.

```json
{"type": "alert", "data": { "...": "Alert object" }}
```

### `stats`

Sent every 1 second. Feeds the traffic chart and the Demo Mode banner (shown when `iface` is `lo`).

```json
{
  "type": "stats",
  "data": {
    "timestamp": "2026-10-28T10:15:31.000Z",
    "packets_per_s": 412.0,
    "packets": 98925,
    "dropped_flows": 0,
    "dropped_alerts": 0,
    "active_flows": 17,
    "dropped_packets": 0,
    "kernel_dropped_packets": 0,
    "iface": "lo"
  }
}
```

`packets` (processed by the pipeline), `dropped_packets` (our queue) and `kernel_dropped_packets` (the capture socket) are cumulative since the backend started. The dashboard shows each drop count as a share of their sum.

### `batch`

Sent when an upload batch changes status.

```json
{"type": "batch", "data": {"batch_id": 7, "status": "done"}}
```

### Connection behaviour

- No history is replayed on connect. The dashboard loads history with `GET /alerts` and then applies live messages, deduplicating by `id`.
- Aggregated alerts (D4) are re-sent with the new `count` at most once per second per alert.
- A client that cannot keep up is disconnected. The dashboard reconnects with exponential backoff (1 s, 2 s, 4 s … capped at 30 s) and re-fetches `GET /alerts`.
