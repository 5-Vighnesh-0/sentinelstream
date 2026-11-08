import gzip
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.api import auth, main, uploads

SAMPLE = Path(__file__).resolve().parent / "fixtures" / "sample.pcap"
DASHBOARD = {"origin": "http://localhost:3000"}
UPLOAD_HEADERS = {**DASHBOARD, "x-sentinel-upload": "1"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path / "uploads")
    with TestClient(main.create_app(capture=False), base_url="http://localhost") as c:
        c.headers["Authorization"] = f"Bearer {c.app.state.token}"
        yield c


def ws(client, origin="http://localhost:3000", token=None):
    token = client.app.state.token if token is None else token
    protocols = ["sentinelstream", token] if token else []
    return client.websocket_connect("ws://localhost/ws/alerts", headers={"origin": origin}, subprotocols=protocols)


def row(seconds, attack_type="anomaly", src="10.0.0.9"):
    return {"timestamp": f"2026-10-29T12:00:{seconds:02d}.000Z", "src_ip": src, "dst_ip": "10.0.0.1",
            "src_port": 40000, "dst_port": 80, "protocol": "TCP", "attack_type": attack_type, "score": 0.991,
            "severity": "low", "source": "isolation_forest", "flow_key": f"TCP|{src}|40000|10.0.0.1|80", "features": {}}


def wait_for(fn, timeout=30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if result := fn():
            return result
        time.sleep(0.2)
    raise AssertionError("condition not met in time")


def test_root_outside_a_container_is_warned(monkeypatch, tmp_path, caplog):
    monkeypatch.setenv("SENTINEL_DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setattr(main.os, "geteuid", lambda: 0)
    monkeypatch.setattr(main, "DOCKERENV", tmp_path / "absent")
    main.create_app(capture=False)
    assert "running as root" in caplog.text


def test_health(client):
    assert client.get("/health").json() == {"status": "ok", "model_loaded": True}


def test_unknown_host_rejected(client):
    assert client.get("/health", headers={"host": "evil.example"}).status_code == 400


def test_alerts_query_filters_and_paginates(client):
    hub = client.app.state.hub
    hub.publish(row(0, src="10.0.0.1"))
    hub.publish(row(1, attack_type="PortScan", src="10.0.0.2"))
    hub.publish(row(2, src="10.0.0.3"))
    wait_for(lambda: client.get("/alerts").json()["total"] == 3)

    page = client.get("/alerts", params={"limit": 2}).json()
    assert (page["total"], len(page["items"]), page["items"][0]["src_ip"]) == (3, 2, "10.0.0.3")  # newest first
    assert client.get("/alerts", params={"attack_type": "PortScan"}).json()["total"] == 1
    assert client.get("/alerts", params={"severity": "critical"}).status_code == 422
    assert client.get("/alerts", params={"limit": 0}).status_code == 422


def test_websocket_rejects_foreign_origin(client):
    with pytest.raises(WebSocketDisconnect) as e, ws(client, origin="http://evil.example") as s:
        s.receive_json()
    assert e.value.code == 1008


def test_websocket_receives_alert_published_from_another_thread(client):
    with ws(client) as s:
        threading.Thread(target=client.app.state.hub.publish, args=(row(5),)).start()
        message = s.receive_json()
        while message["type"] != "alert":
            message = s.receive_json()
    assert (message["data"]["src_ip"], message["data"]["count"]) == ("10.0.0.9", 1)


def test_alerts_and_upload_need_the_token(client):
    assert client.get("/alerts", headers={"Authorization": ""}).status_code == 401
    assert client.get("/alerts", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/health", headers={"Authorization": ""}).status_code == 200
    files = {"file": ("x.pcap", SAMPLE.read_bytes())}
    assert client.post("/upload-pcap", files=files, headers={**UPLOAD_HEADERS, "Authorization": ""}).status_code == 401


def test_websocket_needs_the_token_as_subprotocol(client):
    for token in ("", "wrong"):
        with pytest.raises(WebSocketDisconnect) as e, ws(client, token=token) as s:
            s.receive_json()
        assert e.value.code == 1008
    with ws(client) as s:
        assert s.accepted_subprotocol == "sentinelstream"


def test_websocket_clients_are_capped(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_WS_CLIENTS", 1)
    with ws(client):
        with pytest.raises(WebSocketDisconnect) as e, ws(client) as second:
            second.receive_json()
        assert e.value.code == 1013


def test_pruned_websocket_client_still_counts_against_the_cap(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_WS_CLIENTS", 1)
    with ws(client):
        client.app.state.hub.clients.clear()  # what sender() does to a slow client
        with pytest.raises(WebSocketDisconnect) as e, ws(client) as second:
            second.receive_json()
        assert e.value.code == 1013
    with ws(client):  # the slot is released once the first socket really closes
        pass


def test_token_file_is_owner_only_reused_and_rotatable(tmp_path, monkeypatch):
    monkeypatch.setenv("SENTINEL_DB_PATH", str(tmp_path / "data" / "t.db"))
    first = main.create_app(capture=False).state.token
    token_file = tmp_path / "data" / "api-token"
    assert token_file.stat().st_mode & 0o777 == 0o600
    assert main.create_app(capture=False).state.token == first
    token_file.unlink()
    assert main.create_app(capture=False).state.token != first


def test_existing_data_dir_is_tightened_to_owner_only(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir(mode=0o775)
    data.chmod(0o775)  # mkdir's mode is masked by the umask
    monkeypatch.setenv("SENTINEL_DB_PATH", str(data / "t.db"))
    main.create_app(capture=False)
    assert data.stat().st_mode & 0o777 == 0o700


def test_upload_needs_dashboard_origin_and_header(client):
    files = {"file": ("x.pcap", SAMPLE.read_bytes())}
    assert client.post("/upload-pcap", files=files).status_code == 403
    assert client.post("/upload-pcap", files=files, headers=DASHBOARD).status_code == 403


def test_upload_rejects_bad_extension_gzip_and_oversize(client, monkeypatch):
    post = lambda name, data: client.post("/upload-pcap", files={"file": (name, data)}, headers=UPLOAD_HEADERS)
    assert post("x.txt", SAMPLE.read_bytes()).status_code == 400
    assert post("x.pcap", gzip.compress(SAMPLE.read_bytes())).status_code == 400
    monkeypatch.setattr(uploads, "MAX_UPLOAD_BYTES", 1000)
    assert post("x.pcap", SAMPLE.read_bytes()).status_code == 413


def test_upload_is_analysed_into_its_own_batch(client):
    response = client.post("/upload-pcap", files={"file": ("../../etc/passwd\nx.pcap", SAMPLE.read_bytes())},
                           headers=UPLOAD_HEADERS)
    assert response.status_code == 202
    batch_id = response.json()["batch_id"]
    alerts = wait_for(lambda: (items := client.get("/alerts", params={"batch_id": batch_id}).json()["items"])
                      and len(items) == 3 and items)
    # The 50 probes the Random Forest labels WebAttack share src/dst/type, so they merge into one alert (D4).
    assert sorted((a["source"], a["attack_type"], a["count"]) for a in alerts) == [
        ("random_forest", "DoS", 1), ("random_forest", "WebAttack", 50), ("rule", "PortScan", 1)]
    assert list(uploads.UPLOAD_DIR.iterdir()) == []  # temp file removed


def test_upload_backlog_full_returns_429(client, monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(main, "analyse_upload", lambda path, model: release.wait(10) and [])
    post = lambda: client.post("/upload-pcap", files={"file": ("x.pcap", SAMPLE.read_bytes())}, headers=UPLOAD_HEADERS)
    assert post().status_code == 202
    wait_for(lambda: client.app.state.uploads.empty())  # the worker is busy with the first upload
    assert [post().status_code for _ in range(3)] == [202, 202, 429]
    release.set()


def test_model_path_outside_models_dir_refused(monkeypatch, tmp_path):
    monkeypatch.setenv("SENTINEL_MODEL_PATH", str(tmp_path / "evil.joblib"))
    with pytest.raises(ValueError, match="must be under"):
        main.create_app(capture=False)


def test_existing_sticky_dir_keeps_its_mode(tmp_path, monkeypatch):
    shared = tmp_path / "shared"
    shared.mkdir()
    shared.chmod(0o1777)
    monkeypatch.setenv("SENTINEL_DB_PATH", str(shared / "t.db"))
    main.create_app(capture=False)
    assert shared.stat().st_mode & 0o7777 == 0o1777


def test_from_subprotocols_only_accepts_exactly_sentinelstream_then_token():
    assert auth.from_subprotocols("sentinelstream,  t ") == "t"
    assert auth.from_subprotocols("sentinelstream, t, x") is None
    assert auth.from_subprotocols("t, sentinelstream") is None
    assert auth.from_subprotocols("sentinelstream") is None
    assert auth.from_subprotocols("") is None
    assert auth.from_subprotocols(None) is None


def test_from_bearer_is_case_sensitive():
    assert auth.from_bearer("Bearer t") == "t"
    assert auth.from_bearer("bearer t") is None
    assert auth.from_bearer(None) is None


def test_empty_token_file_is_replaced(tmp_path):
    (tmp_path / "api-token").write_text("")
    token = auth.load_or_create_token(tmp_path)
    assert token and (tmp_path / "api-token").read_text() == token


def published_alert(client, **kw):
    client.app.state.hub.publish(row(0, **kw))
    return wait_for(lambda: client.get("/alerts").json()["items"])[0]


def test_acknowledge_sets_and_clears(client):
    alert = published_alert(client)
    assert alert["acknowledged_at"] is None and alert["suppressed_by"] is None
    acked = client.put(f"/alerts/{alert['id']}/ack", json={"acknowledged": True})
    assert acked.status_code == 200 and acked.json()["acknowledged_at"]
    assert client.put(f"/alerts/{alert['id']}/ack", json={"acknowledged": False}).json()["acknowledged_at"] is None
    assert client.put("/alerts/nope/ack", json={"acknowledged": True}).status_code == 404


def test_mute_rules_match_at_read_time_and_never_delete(client):
    alert = published_alert(client)
    created = client.post("/suppressions", json={"dst_ip": "10.0.0.1", "attack_type": "anomaly"})
    assert created.status_code == 201
    rule = created.json()
    assert (rule["dst_ip"], rule["attack_type"], rule["src_ip"]) == ("10.0.0.1", "anomaly", None)
    assert client.get("/suppressions").json() == [rule]
    assert client.get("/alerts").json()["items"][0]["suppressed_by"] == rule["id"]
    assert client.delete(f"/suppressions/{rule['id']}").status_code == 204
    assert client.delete(f"/suppressions/{rule['id']}").status_code == 404
    after = client.get("/alerts").json()["items"][0]
    assert (after["id"], after["suppressed_by"]) == (alert["id"], None)  # still stored, unmuted


def test_an_all_any_rule_is_refused(client):
    assert client.post("/suppressions", json={}).status_code == 422
    assert client.post("/suppressions", json={"dst_port": 70000}).status_code == 422


def test_broadcast_alerts_carry_the_matching_rule(client):
    rule = client.post("/suppressions", json={"attack_type": "anomaly"}).json()
    with ws(client) as s:
        threading.Thread(target=client.app.state.hub.publish, args=(row(5),)).start()
        message = s.receive_json()
        while message["type"] != "alert":
            message = s.receive_json()
    assert message["data"]["suppressed_by"] == rule["id"]


def test_uploads_are_listed_newest_first(client):
    with main.connect(client.app.state.db_path) as conn:
        conn.executemany("INSERT INTO upload_batches (filename, uploaded_at, status) VALUES (?, ?, ?)",
                         [("a.pcap", "2026-10-29T12:00:00.000Z", "done"), ("b.pcap", "2026-10-29T12:01:00.000Z", "failed")])
    assert [(u["filename"], u["status"]) for u in client.get("/uploads").json()] == [("b.pcap", "failed"), ("a.pcap", "done")]


def test_new_endpoints_need_the_token(client):
    del client.headers["Authorization"]
    for method, path in (("put", "/alerts/x/ack"), ("get", "/suppressions"), ("post", "/suppressions"),
                         ("delete", "/suppressions/1"), ("get", "/uploads")):
        kwargs = {"json": {"acknowledged": True}} if method in ("put", "post") else {}
        assert getattr(client, method)(path, **kwargs).status_code == 401, path


def test_stats_carry_cumulative_packets(client, monkeypatch):
    monkeypatch.setattr(main, "STATS_EVERY_S", 0.05)
    fake = SimpleNamespace(stats={"packets": 1234, "dropped_flows": 0}, table={},
                           capture=SimpleNamespace(dropped=5, kernel_dropped=lambda: 7), stop=lambda: None)
    client.app.state.hub.pipeline = fake
    with ws(client) as socket:
        for _ in range(100):
            message = socket.receive_json()
            if message["type"] == "stats" and message["data"]["packets"] == 1234:
                break
        else:
            raise AssertionError("no stats message carried packets")
    assert message["data"]["dropped_packets"] == 5
    assert message["data"]["kernel_dropped_packets"] == 7
