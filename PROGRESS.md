# Progress

Current phase: **Complete — all seven phases accepted**

Phase 7 accepted ("Accept Phase 7") on 2026-10-29 and pushed.

Phase 6 accepted ("Accept Phase 6") on 2026-10-29 and pushed.

Phase 5 accepted ("Accept Phase 5") on 2026-10-29 and pushed.

Phase 4 accepted ("Accept Phase 4") on 2026-10-29 and pushed.

Phase 3 (and the corrected Phase 2) accepted ("Accept Phase 3") on 2026-10-29 and pushed.

Phase 2 accepted ("Accept Phase 2") on 2026-10-29 and pushed.

Phase 1 accepted ("phase 1 accepted") on 2026-10-29 and pushed.

Phase 0 accepted ("documentation approved") on 2026-10-28.

## Environment (recorded 2026-10-28)

| Tool | Version |
|---|---|
| OS | Linux 7.0.0-38-generic |
| Python | 3.14.4 (project requires 3.11+; Docker image will use 3.12-slim) |
| Node | v26.11.1 |
| Docker | 29.1.3 |
| git | 2.53.0 |

## Available skills and plugins

Checked at the start of Phase 0. Skill used per area:

| Area | Matching skills found | Use |
|---|---|---|
| Documentation | `engineering:documentation`, `agent-skills:documentation-and-adrs` | `engineering:documentation` used for Phase 0 |
| FastAPI | `fastapi`, `fastapi-templates` | Phase 3 |
| React / Vite | `vite`, `frontend-design`, `agent-skills:frontend-ui-engineering` | Phase 4 |
| Charts | `dataviz` | Phase 4 (TrafficChart, AttackDistribution) |
| Docker | `multi-stage-dockerfile` | Phase 7 |
| Testing | `python-testing-patterns`, `vitest`, `webapp-testing`, `superpowers:test-driven-development` | Phases 1–7 |
| CI | `agent-skills:ci-cd-and-automation` | Phase 7 |
| Security | `security-and-hardening` | Phase 3 (upload route), Phase 6 (simulator target check) |

Plugins: the GitHub MCP connector (`plugin:engineering:github`) is installed but not authorised in this session; `gh` CLI is logged in and can be used instead. No packet-capture or ML-specific skill exists, so Scapy and scikit-learn work is done manually.

## Decisions made with the human (Phase 0)

| Question | Answer |
|---|---|
| Git | Use the existing GitHub repo `sentinelstream`. Local repo initialised on `main`; remote not added yet (see open questions). |
| Phase 1 benign training data | CICIDS2017 MachineLearningCSV.zip (~225 MB) — ask before downloading in Phase 1, with exact size. Sample PCAP is synthetic (Scapy). |
| Extra dependencies | Approved: python-multipart, httpx, uvicorn[standard], ruff, @testing-library/react, jsdom. |
| Alerts ↔ flows link | Add nullable `alerts.flow_id` → `flows.id`. |

## Open questions

1. ~~GitHub remote URL~~ Resolved: `origin` = https://github.com/5-Vighnesh-0/sentinalstream. Phase 0 pushed as 405ab1d on top of the repo's initial commit.

---

## Phase 0 — Docs and scaffolding

Plan: [plans/phase-0-PLAN.md](plans/phase-0-PLAN.md)

### Tasks completed

- [x] Skills/plugins recorded (above)
- [x] `git init -b main`, `.gitignore`, empty dirs with `.gitkeep`
- [x] README.md
- [x] docs/PRD.md, docs/ARCHITECTURE.md, docs/DATA_MODEL.md, docs/API_SPEC.md
- [x] docs/PHASES.md, docs/EVALUATION.md, docs/LIMITATIONS.md
- [x] AGENTS.md, PROGRESS.md
- [x] Consistency check and no-logic-code check (evidence below)

### Blockers

None.

### Evidence

```text
$ find . -path ./.git -prune -o -type f \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" \) -print
(no output = no logic code)

$ find . -path ./.git -prune -o -print | sort
.
./AGENTS.md
./backend
./backend/.gitkeep
./data
./data/.gitkeep
./docs
./docs/API_SPEC.md
./docs/ARCHITECTURE.md
./docs/DATA_MODEL.md
./docs/EVALUATION.md
./docs/LIMITATIONS.md
./docs/PHASES.md
./docs/PRD.md
./frontend
./frontend/.gitkeep
./.gitignore
./ml
./ml/.gitkeep
./models
./models/.gitkeep
./plans
./plans/.gitkeep
./plans/phase-0-PLAN.md
./PROGRESS.md
./README.md
./simulator
./simulator/.gitkeep
./tests
./tests/.gitkeep

$ grep -c for shared contract terms per doc (feature_set.py / flow_id / 50 MB / 3000 / 8000)
README.md              feature_set=0 flow_id=0 50MB=0 port3000=1 port8000=0
AGENTS.md              feature_set=1 flow_id=0 50MB=1 port3000=1 port8000=1
docs/API_SPEC.md       feature_set=0 flow_id=1 50MB=1 port3000=1 port8000=1
docs/ARCHITECTURE.md   feature_set=1 flow_id=0 50MB=1 port3000=5 port8000=3
docs/DATA_MODEL.md     feature_set=3 flow_id=1 50MB=0 port3000=0 port8000=0
docs/EVALUATION.md     feature_set=0 flow_id=0 50MB=0 port3000=0 port8000=0
docs/LIMITATIONS.md    feature_set=0 flow_id=0 50MB=0 port3000=0 port8000=1
docs/PHASES.md         feature_set=1 flow_id=0 50MB=0 port3000=1 port8000=0
docs/PRD.md            feature_set=0 flow_id=0 50MB=0 port3000=1 port8000=1

$ grep -rhoE "SENTINEL_[A-Z_]+" --include=*.md . | sort | uniq -c
      3 SENTINEL_DB_PATH
      4 SENTINEL_IFACE
      2 SENTINEL_MODEL_PATH

$ grep -rn "critical" docs AGENTS.md README.md   # severity enum is low|medium|high only
docs/API_SPEC.md:66:**422** invalid parameter (e.g. `severity=critical`, `limit=0`).
```

The only `critical` hit is the API_SPEC example of an *invalid* severity value, as intended.

---

## Phase 1 — Offline detection

Plan: [plans/phase-1-PLAN.md](plans/phase-1-PLAN.md) · Results: [docs/PHASE1_RESULTS.md](docs/PHASE1_RESULTS.md)

### Tasks completed

- [x] `.venv` + `requirements.txt` (scapy 2.8.0, pandas 3.1.0, numpy 2.5.4, scikit-learn 1.9.1, pytest 9.2.0), `pytest.ini`
- [x] `backend/features/feature_set.py`, `backend/features/extractor.py`
- [x] `backend/ml/train_baseline.py`, `backend/detect_offline.py`
- [x] `tests/fixtures/make_sample_pcap.py` → `tests/fixtures/sample.pcap` (600 packets, 71 flows)
- [x] `tests/test_features.py`, `tests/test_detect_offline.py` — 10 passed
- [x] CICIDS2017 zip provided by the human (official form-gated download): 235,102,953 bytes, sha256 `c3f26274b36c837ccf28ffd2dbf4582941c30b3ee70a635c6e5b2f87c4727928`. Only the Monday CSV extracted.
- [x] Isolation Forest trained on 50,000 benign Monday rows
- [x] Gate run, reproduced from a clean clone, docs/PHASE1_RESULTS.md written
- [x] Docs updated for the design changes below (DATA_MODEL, ARCHITECTURE, EVALUATION, LIMITATIONS, AGENTS, README)

### Design changes (human-approved 2026-10-28)

1. **TCP flag counts dropped from the shared subset (9 → 5 features).** In CICIDS2017 the `SYN/ACK/FIN/RST Flag Count` columns hold only 0/1 and are unreliable, so real per-flow counts from packets made every normal TCP session look anomalous. Human chose "drop the 4 flag features" over "0/1 presence" and "keep counts".
2. **Isolation Forest flag rule:** anomaly score > 99th percentile of benign training scores (stored as `threshold` in the sidecar) instead of `predict() == -1` with `contamination="auto"`.

### Investigation (one-off, scratch script — not a claimed result)

First gate run with the original 9 features and `contamination="auto"`: `71 flows scored, 71 flagged`. Monday flag-column check (benign rows after cleaning):

```text
syn_count {0: 495915, 1: 33988}
ack_count {0: 367498, 1: 162405}
fin_count {0: 517743, 1: 12160}
rst_count {0: 529831, 1: 72}
multi-packet flows 120717
syn_count {0: 118412, 1: 2305}
```

Variant comparison (scratch script in the session scratchpad, using the repo's `from_cicids` / `flows_from_pcap`; 50,000 Monday benign rows, `random_state=42`):

```text
contamination="auto":
A counts (current)   flagged benign 20/20  scan 50/50  flood 1/1  | flagged on its own Monday training rows: 23.5%
B binary flags       flagged benign 20/20  scan 50/50  flood 1/1  | flagged on its own Monday training rows: 23.5%
C no flags           flagged benign 20/20  scan 0/50  flood 1/1  | flagged on its own Monday training rows: 31.1%
threshold at benign-score percentile:
A counts (current)   p99: benign 20/20  scan 0/50  flood 1/1  | Monday train flagged 0.90%
B binary flags       p99: benign 20/20  scan 0/50  flood 1/1  | Monday train flagged 0.90%
C no flags           p99: benign 0/20  scan 0/50  flood 1/1  | Monday train flagged 1.00%
(p99.9 flagged nothing in any variant, including the flood)
```

### Evidence — gate run

```text
$ .venv/bin/pytest -q
..........                                                               [100%]
10 passed in 7.78s

$ .venv/bin/python backend/ml/train_baseline.py --csv data/raw/cicids2017/MachineLearningCVE/Monday-WorkingHours.pcap_ISCX.csv
read 529918 rows, dropped 15 invalid, 529903 benign; trained on 50000; saved models/isolation_forest.joblib

$ .venv/bin/python backend/detect_offline.py --pcap tests/fixtures/sample.pcap --out data/phase1_detections.csv
71 flows scored, 1 flagged -> data/phase1_detections.csv

$ cat data/phase1_detections.csv
timestamp,src_ip,dst_ip,attack_type,score,severity
2023-11-14T22:14:20.299Z,127.0.0.1,127.0.0.1,anomaly,0.991,high

$ python -c "...threshold from sidecar..."
{'feature_order': ['flow_duration_s', 'fwd_packets', 'bwd_packets', 'total_bytes', 'packets_per_s'], 'n_train_rows': 50000, 'rows_read': 529918, 'rows_dropped_invalid': 15, 'benign_rows': 529903, 'flag_quantile': 0.99, 'threshold': 0.6738411569235067, 'sklearn_version': '1.9.1'}

$ grep -rliE "fastapi|react" backend/ tests/ || echo "no FastAPI/React code"
no FastAPI/React code
```

### Evidence — clean checkout

```text
$ git clone (clean checkout of HEAD) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
$ unzip Monday CSV
$ .venv/bin/pytest -q
10 passed in 3.63s
$ .venv/bin/python backend/ml/train_baseline.py --csv data/raw/cicids2017/MachineLearningCVE/Monday-WorkingHours.pcap_ISCX.csv
read 529918 rows, dropped 15 invalid, 529903 benign; trained on 50000; saved models/isolation_forest.joblib
$ .venv/bin/python backend/detect_offline.py --pcap tests/fixtures/sample.pcap --out data/phase1_detections.csv
71 flows scored, 1 flagged -> data/phase1_detections.csv
$ diff <clean>/data/phase1_detections.csv <workdir>/data/phase1_detections.csv && echo identical
identical
```

### Gate verdict

`python backend/detect_offline.py --pcap tests/fixtures/sample.pcap` yields a CSV with 1 flagged flow (the SYN flood); PHASE1_RESULTS.md matches the CSV; no FastAPI or React code. Reproducible from a clean clone given the CICIDS zip.

### Blockers

None.

### Known gaps (documented in LIMITATIONS.md)

- Port scan flows are not flagged by Isolation Forest (0/50).
- Every Isolation Forest alert has confidence ≥ 0.99, so severity is always `high`.
- The sample's benign traffic is synthetic and near-identical; it is not evidence of a low false-positive rate.

---

## Phase 1 — hardening pass

Design: [weak-spot design](docs/superpowers/specs/2026-10-28-weak-spot-hardening-design.md) · Plan: [hardening plan](docs/superpowers/plans/2026-10-28-weak-spot-hardening.md)

Method: superpowers brainstorming, informed by three read-only reviews (agent-skills code-reviewer, security-auditor, doubt-driven-development). Their claims that I re-ran: Ethernet padding counted as payload, loopback ping one-way, gzip auto-decompression in Scapy, `::ffff:127.0.0.1` treated as loopback — all confirmed. One claim not confirmed: a 0x96 byte in the Thursday WebAttacks CSV (none found; recheck in Phase 5).

### Decisions (human, 2026-10-28/29)

- D1 hardening pass now; later-phase fixes go into PHASES.md gates.
- D2 cross-flow port-scan rule + Phase 5 Random Forest; the rule may name `PortScan`.
- D3 models committed to git, compressed, sha256-checked.
- D4 alert aggregation (`count`, `last_seen`) before the Phase 3 schema freeze.
- D5 one timestamp-driven flow table for offline, upload and live (Phase 2).
- D6 Isolation-Forest-only alerts are `low`/`medium`, never `high`.
- Ponytail ultra trims approved (recorded in the design doc).

### Tasks completed

- [x] Task 1 — packet parsing: Ethernet padding, IPv6 transport detection, non-first fragments skipped, out-of-order timestamps, per-packet error handling, timestamp range check, pcap/pcapng magic check (gzip rejected) — `6378576`
- [x] Task 2 — severity tiers (D6), compressed models with sha256 check — `f0827ad`
- [x] Task 3 — Isolation Forest threshold taken from the confidence grid — `f2326db`
- [x] Task 4 — `backend/detection/scan_rule.py` with bounded per-source state — `9fc4323`
- [x] Task 5 — CLI: TCP/UDP-only scoring, IF + scan rule, `source`/`flow_key`; model retrained and committed — `820eb7a`
- [x] Task 6 — docs: AGENTS, DATA_MODEL, API_SPEC, ARCHITECTURE, LIMITATIONS, EVALUATION, PRD, README, PHASES gates — `d1ba0b7`
- [x] Task 7 — gate re-run, clean clone without CICIDS, PHASE1_RESULTS rewritten

### Evidence — gate run

```text
$ .venv/bin/pytest -q
29 passed in 10.43s

$ .venv/bin/python backend/detect_offline.py --pcap tests/fixtures/sample.pcap --out data/phase1_detections.csv
71 flows scored, 2 alerts (1 isolation_forest, 1 rule) -> data/phase1_detections.csv
600 packets read

$ cat data/phase1_detections.csv
timestamp,src_ip,dst_ip,attack_type,score,severity,source,flow_key
2023-11-14T22:14:10.190Z,127.0.0.1,127.0.0.1,PortScan,1.0,high,rule,TCP|127.0.0.1|55555|127.0.0.1|20
2023-11-14T22:14:20.299Z,127.0.0.1,127.0.0.1,anomaly,0.991,low,isolation_forest,TCP|127.0.0.1|60000|127.0.0.1|80

$ python -c "...sidecar..."
{'feature_order': ['flow_duration_s', 'fwd_packets', 'bwd_packets', 'total_bytes', 'packets_per_s'], 'n_train_rows': 50000, 'rows_read': 529918, 'rows_dropped_invalid': 15, 'benign_rows': 529903, 'flag_quantile': 0.99, 'threshold': 0.6738411569235067, 'sha256': '72912080f27ae7bb67f2ab726099e60b12d7065c9d000a0abec5c88d5d46ed30', 'sklearn_version': '1.9.1'}

$ ls -l models/
-rw-rw-r-- 1 vighnesh vighnesh  24880 Oct 29 14:02 isolation_forest.features.json
-rw-rw-r-- 1 vighnesh vighnesh 705848 Oct 29 14:02 isolation_forest.joblib

$ grep -rliE "fastapi|react" backend/ tests/ || echo "no FastAPI/React code"
no FastAPI/React code
```

### Evidence — clean clone without the dataset

```text
$ git clone (HEAD, no data/ — no CICIDS) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
$ ls data/
$ .venv/bin/pytest -q
29 passed in 5.66s
$ .venv/bin/python backend/detect_offline.py --pcap tests/fixtures/sample.pcap --out data/phase1_detections.csv
71 flows scored, 2 alerts (1 isolation_forest, 1 rule) -> data/phase1_detections.csv
600 packets read
$ diff <clean>/data/phase1_detections.csv <workdir>/data/phase1_detections.csv && echo identical
identical
```

(`ls data/` prints nothing: only `.gitkeep`, which `ls` hides.)

### Gate verdict

`python backend/detect_offline.py --pcap tests/fixtures/sample.pcap` yields 2 alerts: the port scan (rule) and the SYN flood (Isolation Forest); no benign session flagged; PHASE1_RESULTS.md matches the CSV; no FastAPI or React code; reproducible from a clean clone with no dataset.

### Blockers

None.

### Still open (owned by later phases, see PHASES.md)

- Real false-positive rate: Phase 2 (alerts/hour on loopback) and Phase 5 (per CICIDS2017 day).
- Random-source-port floods are not detected per flow (documented).
- Scan rule thresholds untuned and not benchmarkable on MachineLearningCSV (documented).

---

## Phase 2 — Live capture

Plan: [plans/phase-2-PLAN.md](plans/phase-2-PLAN.md) · Results: [docs/PHASE2_RESULTS.md](docs/PHASE2_RESULTS.md)

### Tasks completed

- [x] `backend/features/flow_table.py` — timestamp-driven flow table (5 s idle, 10 s active, both FINs + 1 s grace, any RST, 100,000-flow cap); `flows_from_pcap` moved here so offline, upload and live share it (D5) — `e897bdc`
- [x] `backend/detection/detectors.py` — Isolation Forest + scan rule shared by offline and live; `detect_offline.py` uses it
- [x] `backend/capture/sniffer.py` — `CaptureThread` (daemon, `store=False`, BPF `not port 8000 and not port 3000`, drop-oldest with warning) — `843462e`
- [x] `backend/pipeline.py` — capture → bounded packet queue → flow table (1 s tick) → bounded flow queue → batched inference → in-memory alerts; `--iface`, `--duration`, `--queue-size` — `843462e`
- [x] Kernel drops counted via `PACKET_STATISTICS` — `b9a3abc` (human chose "count drops only", no bigger buffer)
- [x] Loopback duplicate packets removed (bug found by the live gate) — `eda1ca1`, then in the kernel filter — `4356d62`
- [x] Tests: flow expiry/cap, offline equivalence, queue overflow + warning + thread alive, kernel-drop accumulation, loopback dedup filter, pipeline end to end with a fake capture — 42 passed
- [x] Live gate on `lo` with `sudo` (human-approved each run), docs/PHASE2_RESULTS.md, LIMITATIONS.md, API_SPEC.md (`kernel_dropped_packets`)

### Evidence — gate 1 (curl loop, commit eda1ca1)

```text
2026-10-29 14:57:21,334 INFO capturing on lo with models/isolation_forest.joblib
2026-10-29 14:58:21,383 INFO summary {"elapsed_s": 60.1, "packets": 19043, "flows_scored": 120, "flows_unscored": 0, "dropped_packets": 0, "kernel_dropped_packets": 0, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 2.02, "alerts": {"isolation_forest": 6}, "alerts_per_hour": {"isolation_forest": 359.7}}
```

### Evidence — gate 2 (overfilled queue, commit 4356d62, kernel BPF dedup)

```text
2026-10-29 20:36:38,148 INFO capturing on lo with models/isolation_forest.joblib
2026-10-29 20:36:41,176 WARNING packet queue full: dropped 1 packets so far
2026-10-29 20:37:08,203 INFO summary {"elapsed_s": 30.1, "packets": 5698, "flows_scored": 8, "flows_unscored": 1, "dropped_packets": 308, "kernel_dropped_packets": 39473, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 6.59, "alerts": {"isolation_forest": 3}, "alerts_per_hour": {"isolation_forest": 359.3}}
```

(The gate 2 run on `eda1ca1` reported 0 queue drops, 79,404 kernel drops and no warning: the duplicate copies overflowed the kernel buffer before reaching our queue. That result prompted the BPF fix.)

### Evidence — 30-minute baseline (commit eda1ca1)

```text
2026-10-29 14:58:58,194 INFO capturing on lo with models/isolation_forest.joblib
2026-10-29 20:18:41,186 INFO summary {"elapsed_s": 1800.0, "packets": 479305, "flows_scored": 1053, "flows_unscored": 10, "dropped_packets": 0, "kernel_dropped_packets": 1593, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 17385.24, "alerts": {"isolation_forest": 180, "rule": 1}, "alerts_per_hour": {"isolation_forest": 360.0, "rule": 2.0}}
```

Suspend/resume during the run (from `journalctl`): suspend 15:14:40, resume 20:04:24 local. Alert causes: 180 × `TCP|127.0.0.1|34812|127.0.0.1|43749` (KDE audio-visualizer widget, `ss -tnp` + `/proc/<pid>/cmdline`); 1 × `PortScan` from `UDP|127.0.0.53|53|…` 9 s after resume.

### Evidence — runs with the loopback-duplicate bug (kept as evidence, not results)

```text
phase2_baseline.log: 2026-10-29 14:48:00,916 INFO summary {"elapsed_s": 1800.1, "packets": 170131, "flows_scored": 547, "flows_unscored": 4, "dropped_packets": 0, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 6.0, "alerts": {"isolation_forest": 96}, "alerts_per_hour": {"isolation_forest": 192.0}}
phase2_gate1.log: 2026-10-29 14:17:22,870 INFO summary {"elapsed_s": 60.5, "packets": 2367, "flows_scored": 131, "flows_unscored": 0, "dropped_packets": 0, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 5.88, "alerts": {}, "alerts_per_hour": {}}
phase2_gate2.log: 2026-10-29 14:17:57,017 INFO summary {"elapsed_s": 30.3, "packets": 822, "flows_scored": 7, "flows_unscored": 1, "dropped_packets": 17, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 5.62, "alerts": {}, "alerts_per_hour": {}}
phase2_gate2b.log: 2026-10-29 14:54:15,709 INFO summary {"elapsed_s": 30.1, "packets": 11141, "flows_scored": 10, "flows_unscored": 1, "dropped_packets": 191, "kernel_dropped_packets": 79582, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 5.69, "alerts": {"isolation_forest": 3}, "alerts_per_hour": {"isolation_forest": 359.2}}
```

### Evidence — clean clone (no root)

```text
$ git clone (HEAD 4356d62, no data/) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
$ .venv/bin/pytest -q
42 passed in 7.63s
$ .venv/bin/python backend/detect_offline.py --pcap tests/fixtures/sample.pcap --out data/check.csv
71 flows scored, 2 alerts (1 isolation_forest, 1 rule) -> data/check.csv
600 packets read; {'evicted_flows': 0}
$ diff data/check.csv <workdir>/data/phase1_detections.csv && echo identical
identical
$ .venv/bin/python backend/pipeline.py --iface lo --duration 3   # no root
PermissionError: [Errno 1] Operation not permitted
capture thread stopped (capturing needs root or CAP_NET_RAW)
```

### Gate verdict

On `lo`, a curl loop produced scored flows in near real time (max 2.02 s); an overfilled queue logged a warning and capture stayed alive; 30 minutes of normal use were recorded and alerts/hour per detector are in PHASE2_RESULTS.md (Isolation Forest 360/h, all from one benign app; scan rule 2/h, one post-resume artifact).

### Blockers

None.

### Open (owned by later phases)

- The audio-visualizer false positives: D4 aggregation (Phase 3) collapses them; whether a longer active timeout reduces the train/live mismatch can be measured in Phase 5.
- Gate 1 and the baseline ran on `eda1ca1` (Python-side dedup); gate 2 on `4356d62` (kernel-side dedup). Both remove the same duplicates; only the kernel-drop count differs.

---

## Phase 2 — correction after acceptance (2026-10-29)

During the Phase 3 gate a stored scan flow was a lone RST (wrong direction). Diagnostics showed every loopback packet was read **three** times: `CaptureThread.run()` passed Scapy's `sniff` both our `opened_socket` and `iface`, and Scapy then opened its own unfiltered socket as well (`scapy/sendrecv.py`: `if not sniff_sockets or iface is not None`). Before `b9a3abc` Scapy's socket was the only one, so packets were read twice. **All Phase 2 live numbers above were measured on duplicated packets.** The evidence above is left as recorded; the corrected results replace docs/PHASE2_RESULTS.md.

Fix: `9ca23c5` (no `iface`/`filter` passed to `sniff`; test asserts it).

### Evidence — 30-port loopback scan through the real Pipeline, before and after

```text
before (first 3 lines of 90 flows):
TCP|127.0.0.1|56272|127.0.0.1|1          fwd=2 bwd=1 rst=True first=1793321575.246278
TCP|127.0.0.1|56272|127.0.0.1|1          fwd=1 bwd=1 rst=True first=1793321575.246310
TCP|127.0.0.1|1|127.0.0.1|56272          fwd=1 bwd=0 rst=True first=1793321575.246357
kernel drops: 3 queue drops: 0
after (first 3 lines of 30 flows):
TCP|127.0.0.1|55282|127.0.0.1|1          fwd=1 bwd=1 rst=True first=1793321728.634999
TCP|127.0.0.1|57902|127.0.0.1|2          fwd=1 bwd=1 rst=True first=1793321728.636108
TCP|127.0.0.1|48326|127.0.0.1|3          fwd=1 bwd=1 rst=True first=1793321728.636832
kernel drops: 0 queue drops: 0
```

### Evidence — Phase 2 gate re-run on 9ca23c5 (laptop awake throughout)

```text
2026-10-29 20:55:46,233 INFO capturing on lo with models/isolation_forest.joblib
2026-10-29 20:56:46,286 INFO summary {"elapsed_s": 60.1, "packets": 6889, "flows_scored": 124, "flows_unscored": 0, "dropped_packets": 0, "kernel_dropped_packets": 0, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 5.34, "alerts": {"isolation_forest": 6}, "alerts_per_hour": {"isolation_forest": 359.7}}
2026-10-29 20:56:50,565 INFO capturing on lo with models/isolation_forest.joblib
2026-10-29 20:57:20,616 INFO summary {"elapsed_s": 30.1, "packets": 3399, "flows_scored": 4, "flows_unscored": 1, "dropped_packets": 0, "kernel_dropped_packets": 39213, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 5.24, "alerts": {"isolation_forest": 3}, "alerts_per_hour": {"isolation_forest": 359.4}}
2026-10-29 20:57:25,365 INFO capturing on lo with models/isolation_forest.joblib
2026-10-29 21:27:25,400 INFO summary {"elapsed_s": 1800.0, "packets": 157893, "flows_scored": 428, "flows_unscored": 5, "dropped_packets": 0, "kernel_dropped_packets": 0, "active_flows": 0, "evicted_flows": 0, "max_delay_s": 6.19, "alerts": {"isolation_forest": 179}, "alerts_per_hour": {"isolation_forest": 358.0}}
```

All alerts in the three runs: `TCP|127.0.0.1|34812|127.0.0.1|43749` (KDE audio-visualizer widget). Gate 2 logged no queue-full warning: the queue never filled because the capture thread is the bottleneck and excess is dropped (and counted) in the kernel. The warning path is covered by `tests/test_sniffer.py` and was observed live on `4356d62`.

---

## Phase 3 — API and persistence

Plan: [plans/phase-3-PLAN.md](plans/phase-3-PLAN.md)

### Tasks completed

- [x] Dependencies (approved in Phase 0) pinned in requirements.txt: fastapi 0.162.0, uvicorn[standard] 0.54.0, python-multipart 0.0.32, httpx 0.28.1
- [x] `backend/db/writer.py` — schema per DATA_MODEL.md (WAL), `AlertAggregator` (D4, 30 s window, batch-separated, bounded), `Writer` thread (one connection, upsert batches of 50 or 2 s, bounded queue, retention 100,000 + orphan flows) — `69d247c`
- [x] `backend/api/uploads.py` — spawned child with `RLIMIT_AS` 2 GB, `RLIMIT_CPU` 120 s, 180 s wall clock; dead child detected early; filename sanitising; upload dir wiped at startup
- [x] `backend/api/main.py` — `create_app(capture=True)`: TrustedHost, CORS (two origins), streaming upload size limit (413), `/health` with `model_loaded`, `/alerts` with validated filters, `/upload-pcap` (403/400/413/429), `/ws/alerts` (Origin → 1008), `stats` every 1 s, `batch` status messages, `call_soon_threadsafe` bridge into a bounded `asyncio.Queue`; `SENTINEL_MODEL_PATH` must resolve under `models/` — `e963aae`
- [x] Pipeline keeps at most 10,000 alerts in memory
- [x] Tests: `tests/test_writer.py`, `tests/test_api.py` (incl. bad Host → 400, bad WS Origin → 1008, upload without header → 403, gzip → 400, 1,000 scan probes → 1 aggregated alert, oversize → 413, backlog → 429, model path outside `models/`) — 58 passed
- [x] Capture bug found by this gate and fixed (`9ca23c5`, see Phase 2 correction)

### Trimmed (ponytail ultra)

- No per-alert WebSocket rate cap (detectors already emit at most once per flow / once per 10 s per scanning source).
- No ORM; stdlib `sqlite3`.

### Evidence — gate (commit 9ca23c5)

```text
== start: sudo uvicorn backend.api.main:app --host 127.0.0.1 --port 8000
== GET /health
{"status":"ok","model_loaded":true}
== WebSocket client (Origin http://localhost:3000) waiting for an alert
== loopback traffic: TCP connect scan of 127.0.0.1 ports 1-40 (no root needed)
== alert received over WebSocket
{"id": "44ce56fad6d944c7996ba20945208e28", "timestamp": "2026-10-30T00:55:37.262Z", "src_ip": "127.0.0.1", "dst_ip": "127.0.0.1", "src_port": 50082, "dst_port": 20, "protocol": "TCP", "attack_type": "PortScan", "confidence": 1.0, "severity": "high", "source": "rule", "count": 1, "last_seen": "2026-10-30T00:55:37.262Z", "batch_id": null, "flow_id": "ca7edeea59d940779fa65b795b3c52e5"}
== same alert in SQLite (after the writer's 2 s batch)
[('44ce56fad6d944c7996ba20945208e28', '2026-10-30T00:55:37.262Z', '127.0.0.1', '127.0.0.1', 'PortScan', 'rule', 'high', 1)]
== stop uvicorn
INFO:     connection open
INFO:     Shutting down
INFO:     Waiting for application shutdown.
INFO:     Application shutdown complete.
INFO:     Finished server process [1460392]
```

### Evidence — clean clone

```text
$ git clone (HEAD 9ca23c5, no data/) && python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt
$ .venv/bin/pytest -q
58 passed, 1 warning in 22.67s
```

### Gate verdict

`uvicorn backend.api.main:app` starts, `GET /health` returns `{"status":"ok","model_loaded":true}`, a WebSocket client received alert `44ce56fa…` from a loopback scan, and SQLite holds the same alert (same id and fields). Test additions all pass.

### Blockers

None.

### Notes

- Starlette's test client warns that `httpx` is deprecated in favour of `httpx2`; `httpx` is the approved dependency, so it stays.

---

## Phase 4 — Dashboard

Plan: [plans/phase-4-PLAN.md](plans/phase-4-PLAN.md)

### Tasks completed

- [x] Dependencies: react 18.3.1, react-dom 18.3.1, recharts 3.10.1; dev: vite 8.3.5, tailwindcss 4.3.3, vitest 5.0.5, jsdom 30.1.3, @testing-library/react 16.3.3 (approved), plus @tailwindcss/vite 4.3.3, @vitejs/plugin-react 6.1.2, @testing-library/dom 10.4.2 (approved by the human in Phase 4; no TypeScript)
- [x] Skills used: `frontend-design` (design plan: light-only palette, system fonts, severity bar as the one bold element), `dataviz` (status palette for severity with text labels, single-series line without legend, one-hue magnitude bars with tip labels, tooltips, no animation on live updates)
- [x] `frontend/` Vite + Tailwind on port 3000 (`vite.config.js`), `useWebSocket` (backoff 1 s → 30 s, reset after open), `AlertFeed` (latest 200, severity + type filters, "Capture time" in upload views), `TrafficChart` (60 s), `AttackDistribution`, `PCAPUpload` (custom header, plain-language errors), banners (demo mode on `lo`, no model loaded, connection lost) — `ba3e572`
- [x] Bugs found in the browser and fixed: page 682 px wide in a 377 px viewport (grid column grew to the table; `grid-cols-1`); alert cap shared by all views let live alerts evict upload alerts (attack chart showed 999 of 1,000; cap is now per view, test added); narrow-column title collision
- [x] Tests: 10 Vitest (hook backoff/reset/unmount/parsing, feed cap/filters/labels, per-view cap); 58 pytest

### Evidence — gate (built-in browser, backend `sudo timeout 600 uvicorn` with live capture on `lo`, commit after ba3e572)

Alert latency, loopback connect scan of 40 ports (bash timestamps vs a MutationObserver in the page, same clock):

```text
scan_start_ms 1793324301104
first PortScan row in the DOM 1793324301854   -> 750 ms
row: "High 9:38:21 PM PortScan Port-scan rule 127.0.0.1:56908 → 127.0.0.1:20 100%"
```

Traffic chart redraws (ms between consecutive line updates): `[750, 1000, 1000, 1000]` (first gap partial); 60 points in the 60 s window.

1,000 alerts (upload of a synthetic 1,000-scanner PCAP through `POST /upload-pcap`, 1,000 alerts in SQLite and over the WebSocket):

```text
{"status": "Showing 200 of 1,000", "rows": 200, "timeHeader": "Capture time", "filterToPaintMs": 43, "resetToPaintMs": 60}
after the per-view cap fix: {"barLabels": ["1000"], "caption": "Detections in the latest 1,000 alerts of this view.", "status": "Showing 200 of 1,000"}
```

Layout: 377 px viewport → scrollWidth 362 (no horizontal scroll); 1280 px → two columns 800/400 px, title and value do not overlap.

### Evidence — checks

```text
$ npm --prefix frontend test
 Test Files  3 passed (3)
      Tests  10 passed (10)
$ npm --prefix frontend run build
dist/assets/index-TsBtvkzQ.js   526.24 kB │ gzip: 156.45 kB
✓ built in 485ms
$ grep -rn dangerouslySetInnerHTML frontend/src || echo none
none
$ .venv/bin/pytest -q
58 passed, 1 warning in 15.24s
```

### Gate verdict

With the backend capturing on `lo` and a loopback scan running, a new alert appeared in 750 ms (< 2 s); the traffic chart redraws every 1,000 ms; with 1,000 alerts a filter change paints in 43–60 ms and the feed renders 200 rows. "No model loaded" banner, upload alerts under their own view with "Capture time", and no `dangerouslySetInnerHTML` are in place.

### Notes

- Bundle is 526 kB (156 kB gzip), mostly Recharts; local dashboard, not split.
- Past uploads are not listed after a reload (no list endpoint; documented in LIMITATIONS.md).
- `.claude/launch.json` (local preview config) is git-ignored.

---

## Phase 5 — Supervised model and benchmark

Plan: [plans/phase-5-PLAN.md](plans/phase-5-PLAN.md) · Results: [docs/benchmark/results.md](docs/benchmark/results.md)

### Tasks completed

- [x] All 8 CICIDS2017 CSVs extracted from the zip already on disk (no download)
- [x] `backend/ml/cicids.py` — one loader/cleaner/split for training and benchmark (labels grouped, exact duplicates dropped, classes < 100 rows dropped, stratified 80/20, seed 42)
- [x] `backend/ml/train_supervised.py` — Random Forest (50 trees, depth 16, leaf 5, balanced) 4,686,326 bytes; Isolation Forest retrained on 50,000 benign rows of the training split (so the committed IF never saw test rows)
- [x] `backend/evaluation/benchmark.py` — loads the committed models (sha256-checked), all metrics incl. PR-AUC, recall at 1% FPR, latency, per-class support, IF per-day FPR, held-out PortScan run; no `tabulate` dependency
- [x] `backend/detection/detectors.py` — Random Forest → Isolation Forest per flow, scan rule across flows; live default chosen by the human: RF + rule + IF
- [x] Tests: loader, metric helpers, CLI with both model setups, pipeline and API expectations updated — 63 passed
- [x] README.md and docs/EVALUATION.md hold the table and the live-default statement; LIMITATIONS.md updated

### Investigation (one-off, scratch script — used only to choose the RF size)

Random Forest size vs accuracy on the same split (compressed joblib; binary F1 / macro F1):

```text
trees=100 depth=20 leaf=2: 13.6 MB, binary F1 0.9615, macro F1 0.8029
trees=50 depth=16 leaf=5: 4.7 MB, binary F1 0.9595, macro F1 0.7902   <- chosen
trees=50 depth=12 leaf=5: 2.6 MB, binary F1 0.9538, macro F1 0.7523
trees=30 depth=12 leaf=10: 1.8 MB, binary F1 0.9520, macro F1 0.7624
```

### Evidence — training

```text
dataset: {'rows_read': 2830743, 'rows_dropped_invalid': 115, 'duplicates_removed': 1116974, 'dropped_rare_classes': {'Infiltration': 36, 'Heartbleed': 11}, 'class_rows': {'BENIGN': 1387351, 'DoS': 186640, 'DDoS': 127188, 'BruteForce': 7402, 'WebAttack': 2089, 'PortScan': 1612, 'Bot': 1325}}
split: 1370885 train / 342722 test rows
random forest: 27 s, 4,686,326 bytes -> models/random_forest.joblib
isolation forest: threshold 0.6655, 715,343 bytes -> models/isolation_forest.joblib
```

### Evidence — benchmark (commit 8922a81)

```text
# Benchmark results

Generated by `python backend/evaluation/benchmark.py --csv-dir data/raw/cicids2017/MachineLearningCVE` at commit `8922a81`.

Test split: 277,471 benign + 65,251 attack flows (stratified 20% of 1,713,607 cleaned, de-duplicated CICIDS2017 rows). Hardware: AMD Ryzen 9 5900HS with Radeon Graphics, single process.

| Detector | Precision | Recall | F1 | FPR (benign) | PR-AUC | Recall @1% FPR | Latency p50 (ms) | Latency p95 (ms) |
|---|---|---|---|---|---|---|---|---|
| PPS rule | 0.0575 | 0.0026 | 0.0050 | 0.9990% | 0.1208 | 0.0026 | 0.022 | 0.030 |
| Isolation Forest | 0.0103 | 0.0005 | 0.0009 | 1.0347% | 0.3943 | 0.0004 | 15.088 | 16.126 |
| Random Forest | 0.9245 | 0.9973 | 0.9595 | 1.9166% | 0.9922 | 0.9192 | 4.034 | 4.352 |

PPS rule threshold: 24,691.4 packets/s (p99 of training benign flows). Isolation Forest and PPS rule flag at their p99 benign threshold; Random Forest flags when the predicted class is not BENIGN. PR-AUC and recall at 1% FPR use each detector's continuous score.

## Random Forest per class (test split)

| class | precision | recall | f1-score | support |
|---|---|---|---|---|
| BENIGN | 0.9994 | 0.9808 | 0.9900 | 277471 |
| Bot | 0.4761 | 0.9774 | 0.6403 | 265 |
| BruteForce | 0.9025 | 0.9824 | 0.9408 | 1480 |
| DDoS | 0.9942 | 0.9990 | 0.9966 | 25438 |
| DoS | 0.9573 | 0.9943 | 0.9754 | 37328 |
| PortScan | 0.6514 | 0.9689 | 0.7790 | 322 |
| WebAttack | 0.1174 | 0.9641 | 0.2093 | 418 |

## Isolation Forest false-positive rate on benign test flows, per CICIDS2017 file

| file | benign test flows | flagged |
|---|---|---|
| Friday-WorkingHours-Afternoon-DDos.pcap_ISCX.csv | 16321 | 0.8455% |
| Friday-WorkingHours-Afternoon-PortScan.pcap_ISCX.csv | 17841 | 1.0201% |
| Friday-WorkingHours-Morning.pcap_ISCX.csv | 25305 | 1.0196% |
| Monday-WorkingHours.pcap_ISCX.csv | 66180 | 0.8311% |
| Thursday-WorkingHours-Afternoon-Infilteration.pcap_ISCX.csv | 27273 | 1.1697% |
| Thursday-WorkingHours-Morning-WebAttacks.pcap_ISCX.csv | 20559 | 1.0215% |
| Tuesday-WorkingHours.pcap_ISCX.csv | 52276 | 1.3123% |
| Wednesday-workingHours.pcap_ISCX.csv | 51716 | 1.0210% |

## Held-out family: recall on the 322 PortScan test flows

| detector | recall |
|---|---|
| Random Forest trained with it | 0.9938 |
| Random Forest trained without PortScan | 0.2205 |
| Isolation Forest | 0.0000 |
| PPS rule | 0.1149 |

## Dataset

`{'rows_read': 2830743, 'rows_dropped_invalid': 115, 'duplicates_removed': 1116974, 'dropped_rare_classes': {'Infiltration': 36, 'Heartbleed': 11}, 'class_rows': {'BENIGN': 1387351, 'DoS': 186640, 'DDoS': 127188, 'BruteForce': 7402, 'WebAttack': 2089, 'PortScan': 1612, 'Bot': 1325}}`

## Models

- `models/random_forest.joblib` sha256 `bb2cd31c1e40f45ef07622b5a1771fa1b429920c6f7ebcaa4db3e6d9346c7025`
- `models/isolation_forest.joblib` sha256 `df1aaacc4d8a73b375571d3505e7b6185b1827c947dff26f625a59f7766c9d92`
```

A first run before the commit produced identical numbers except latency (IF p50 18.1 ms, RF 4.6 ms): latency is wall-clock.

### Evidence — clean clone

```text
$ git clone (HEAD e4fd872, no data/) && pip install -r requirements.txt && pytest -q
63 passed, 1 warning in 23.74s
$ detect_offline (committed RF + IF, no dataset)
71 flows scored, 52 alerts (51 random_forest, 0 isolation_forest, 1 rule) -> data/c.csv
```

### Gate verdict

A table with real numbers for all three detectors on the same held-out test split, reproducible by `python backend/evaluation/benchmark.py --csv-dir data/raw/cicids2017/MachineLearningCVE` (needs the CICIDS2017 zip; the committed models make everything else work without it).

### Blockers

None.

### Notes

- The benchmark needs the dataset (registration-form download); CI cannot run it. CI runs everything else on the committed models.
- Live behaviour of the Random Forest on loopback traffic has not been gate-measured (Phase 2's baseline predates it); Phase 6's demo runs exercise it.

---

## Phase 6 — Simulator and demo

Plan: deliverables and decisions below (human decisions 2026-10-29: `docker-compose.demo.yml` moves to Phase 7 with the Dockerfiles; floods default to the hard cap).

### Tasks completed

- [x] Offline check of each mode's shape against the live detectors before building (synthetic, no packets sent): at the spec default (200 @ 10 ms) udp_flood raised nothing and syn_flood was always labelled WebAttack (kernel RSTs split it into tiny flows); faster floods raise an Isolation Forest anomaly
- [x] `simulator/simulate_attack.py` — portscan (TCP connect, no root), udp_flood (fixed 5-tuple, no root), syn_flood (Scapy L3RawSocket, root); hard caps 1,000 packets and 1 ms; target must be an IPv4 literal in 127.0.0.0/8, re-checked before every packet; `--dry-run`
- [x] `tests/fixtures/record_simulator_pcaps.py` + recorded `tests/fixtures/sim_{portscan,udp_flood,syn_flood}.pcap` (each filtered to its own ports; files are root-owned because the recorder ran under sudo)
- [x] `docs/DEMO.md` (5-minute local walkthrough), corrected after the gate to the alerts that really appear
- [x] Tests: target guard (hostnames, IPv6, `::ffff:`, octal, integer forms refused), caps, defaults, dry run, fixed 5-tuple, ≥ 1 alert per recorded mode — 86 passed (also from another working directory)
- [x] Found during the phase: default model paths in `pipeline.py` and `detect_offline.py` were relative to the working directory; now resolved against the repo

### Evidence — gate: recording, then docs/DEMO.md steps 1–3 in a fresh clone

```text
== record simulator fixtures (in the repo)
sending 200 portscan packets to 127.0.0.1, one every 0.01 s (~2.0 s)
done
sending 1000 udp_flood packets to 127.0.0.1, one every 0.001 s (~1.0 s)
done
sending 1000 syn_flood packets to 127.0.0.1, one every 0.001 s (~1.0 s)
done
portscan: 400 packets -> /home/vighnesh/Desktop/projects/sentinelstream/tests/fixtures/sim_portscan.pcap
udp_flood: 3000 packets -> /home/vighnesh/Desktop/projects/sentinelstream/tests/fixtures/sim_udp_flood.pcap
syn_flood: 2000 packets -> /home/vighnesh/Desktop/projects/sentinelstream/tests/fixtures/sim_syn_flood.pcap
== fresh clone: follow docs/DEMO.md
-- 1. install
-- 2. backend
-- 3. dashboard
READY: open http://localhost:3000 (servers stop by themselves after 10 minutes)
```

Fresh clone → backend and dashboard up: **30 s** (pip and npm used this machine's caches; a machine without them downloads more). This machine's `date` (Rust coreutils) ignores the width in `%3N`, so the script's own subtraction was wrong; times above are taken from the first 10 digits (seconds).

### Evidence — DEMO.md step 4 from the fresh clone, observed in the built-in browser

```text
dashboard before the scan: "Connected · capturing on lo", demo-mode banner, 0 rows
scan_start  1793327592.696 s
first PortScan row in the DOM 1793327593.073 s   -> 377 ms
rows: "Medium 10:33:14 PM WebAttack Classifier 127.0.0.1:58276 → 127.0.0.1:1 ×139 80%"
      "Low 10:33:14 PM BruteForce Classifier 127.0.0.1:36350 → 127.0.0.1:4 ×61 55%"
      "High 10:33:12 PM PortScan Port-scan rule 127.0.0.1:35590 → 127.0.0.1:20 100%"
```

From the first install command to the alert on screen: 57 s (30 s setup + 27 s, including the time taken to open the page).

### Evidence — what each recorded mode raises (no root)

```text
portscan  400 packets, 200 flows: rule PortScan high ×1; RF WebAttack low ×104 / medium ×22; RF BruteForce low ×74
udp_flood 3000 packets, 2 flows:  Isolation Forest anomaly low ×1
syn_flood 2000 packets, 1000 flows: RF WebAttack low ×578 / medium ×241; RF BruteForce low ×167 / high ×12
```

### Gate verdict

Following docs/DEMO.md in a fresh clone showed a High PortScan alert in the dashboard 57 s after the first install command, with no code edits.

### Blockers

None.

### Known gaps (in LIMITATIONS.md)

- Only the port scan gets a correct name on loopback; syn_flood is mislabelled WebAttack/BruteForce (some High), udp_flood is an unnamed anomaly.
- The demo is Linux-only and needs sudo for capture.

---

## Phase 7 — Packaging

Decisions (human, 2026-10-29): LICENSE holder "Vighnesh Nair"; push to `main` before acceptance so CI can gate; hashed lock generated with pip-tools in a throwaway `python:3.12-slim` container (pip-tools is not a repo dependency).

### Tasks completed

- [x] `pyproject.toml` (Ruff: line length 120, py311); Ruff findings fixed; 5 deliberate broad `except`s kept with `noqa: BLE001` and a reason
- [x] `requirements.lock`: 42 packages, 888 sha256 hashes (Python 3.12); `ruff==0.17.3` pinned
- [x] `backend/Dockerfile` (python:3.12-slim by digest, tcpdump for BPF compilation, `--require-hashes`, uvicorn on 127.0.0.1), `frontend/Dockerfile` (node:24-alpine build with `npm ci --ignore-scripts`, nginx:1.29-alpine on 3000, both by digest), `.dockerignore` ×2
- [x] `docker-compose.yml` (backend: host network, `cap_drop: ALL` + `NET_RAW`, `no-new-privileges`, read-only root, `/tmp` tmpfs, named data volume, healthcheck; frontend: `127.0.0.1:3000:3000`, CHOWN/SETGID/SETUID only, read-only) and `docker-compose.demo.yml` (simulator on the host network after the backend is healthy, no capabilities)
- [x] `.github/workflows/ci.yml`: Ruff, pytest, Vitest, frontend build, dangerouslySetInnerHTML check, both Docker builds; actions pinned by SHA; `permissions: contents: read`; `persist-credentials: false`; no artifacts uploaded
- [x] LICENSE (MIT), CONTRIBUTING.md, README (architecture diagram, quick start, license), LIMITATIONS.md finished; NET_ADMIN claims corrected (not needed, verified)
- [x] Found by the gate and fixed (`e8c5db4`): the scan rule re-fired on a stale window 10.5 s after a scan (a DNS lookup raised a second high PortScan) → one alert per burst, with tests; the dashboard took 3.9 s to connect because browsers can try `::1` for `localhost` → it now uses 127.0.0.1 (153 ms)

### Evidence — clean clone, `docker compose up --build` (first run, 415f5a6)

```text
$ git clone (HEAD 415f5a6) && docker compose -p sscheck -f docker-compose.yml -f docker-compose.demo.yml build --no-cache
 backend  Built
 frontend  Built
 simulator  Built
build: 122 s
$ docker compose -p sscheck -f docker-compose.yml -f docker-compose.demo.yml up -d
 Container sscheck-backend-1  Started
 Container sscheck-frontend-1  Started
 Container sscheck-backend-1  Healthy
 Container sscheck-simulator-1  Started
simulator: exited 0
simulator-1  | sending 200 portscan packets to 127.0.0.1, one every 0.01 s (~2.0 s)
simulator-1  | done
$ curl /health ; curl /alerts?attack_type=PortScan
{"status":"ok","model_loaded":true}
total 1 | high PortScan rule 127.0.0.1:45632 -> 127.0.0.1:20
up to alert: 136 s
```

```text
$ docker inspect (capabilities, security, read-only, network, ports)
sscheck-backend-1: CapAdd=[CAP_NET_RAW] CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] ReadonlyRootfs=true NetworkMode=host Ports=map[]
sscheck-frontend-1: CapAdd=[CAP_CHOWN CAP_SETGID CAP_SETUID] CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] ReadonlyRootfs=true NetworkMode=sscheck_default Ports=map[3000/tcp:[{127.0.0.1 3000}]]
sscheck-simulator-1: CapAdd=[] CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] ReadonlyRootfs=true NetworkMode=host Ports=map[]
$ grep Cap /proc/<backend pid>/status
CapEff:	0000000000002000
CapBnd:	0000000000002000
0x0000000000002000=cap_net_raw
$ ss -ltnp | grep -E ":8000|:3000"
LISTEN 0      4096       127.0.0.1:3000       0.0.0.0:*   
LISTEN 0      2048       127.0.0.1:8000       0.0.0.0:*
```

The first run also showed, through the API, a second high PortScan alert 10.5 s later on `127.0.0.1:43837 -> 127.0.0.53:53` (DNS): the stale re-fire fixed in `e8c5db4`.

### Evidence — clean clone re-run after the fix (e8c5db4)

```text
$ git clone (HEAD e8c5db4) && docker compose -p sscheck2 -f docker-compose.yml -f docker-compose.demo.yml build --no-cache
 backend  Built
 frontend  Built
 simulator  Built
build: 123 s
$ docker compose -p sscheck2 -f docker-compose.yml -f docker-compose.demo.yml up -d
 Container sscheck2-backend-1  Started
 Container sscheck2-frontend-1  Started
 Container sscheck2-backend-1  Healthy
 Container sscheck2-simulator-1  Started
simulator: exited 0
first alert check at +133 s
$ curl /health ; curl /alerts?attack_type=PortScan (20 s after the scan)
{"status":"ok","model_loaded":true}
PortScan alerts: 1
  2026-10-30T02:56:57.078Z high rule 127.0.0.1:43952 -> 127.0.0.1:20
$ docker inspect / ss
sscheck2-backend-1: CapAdd=[CAP_NET_RAW] CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] ReadonlyRootfs=true NetworkMode=host Ports=map[]
sscheck2-frontend-1: CapAdd=[CAP_CHOWN CAP_SETGID CAP_SETUID] CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] ReadonlyRootfs=true NetworkMode=sscheck2_default Ports=map[3000/tcp:[{127.0.0.1 3000}]]
sscheck2-simulator-1: CapAdd=[] CapDrop=[ALL] SecurityOpt=[no-new-privileges:true] ReadonlyRootfs=true NetworkMode=host Ports=map[]
backend CapEff:	0000000000002000 (0x0000000000002000=cap_net_raw)
LISTEN 0      4096       127.0.0.1:3000       0.0.0.0:*   
LISTEN 0      2048       127.0.0.1:8000       0.0.0.0:*
```

Dashboard served by the nginx container: connected 153 ms after navigation (was 3,920 ms), one row `High 10:56:57 PM PortScan Port-scan rule 127.0.0.1:43952 → 127.0.0.1:20 100%`.

### Evidence — CI on main

```text
run 40994657632 (CI) on e8c5db4: conclusion success
  python: success
  docker: success
  frontend: success
```

### Gate verdict

`docker compose up --build` works from a clean clone with a no-cache build (alert in 133 s including the build); the backend holds only `cap_net_raw` and both ports listen on 127.0.0.1 only; CI passes on main; LIMITATIONS.md lists what the system cannot detect, the trust boundary, the feature approximation and the production changes, each tied to a measured result.

### Notes

- Base images were already in the local Docker cache (digest-pinned, so identical); a machine without them also downloads ~200 MB.
- Leftover Docker volumes from the gate runs, not deleted: `sentinelstream_sentinel-data`, `sscheck_sentinel-data`, `sscheck2_sentinel-data`.
- `ruff format` is not enforced (would reformat 25 files); CI runs `ruff check`.

## Post-v1 sub-project 1 — Security hardening

Branch `security-hardening`. Spec: [docs/superpowers/specs/2026-10-29-security-hardening-design.md](docs/superpowers/specs/2026-10-29-security-hardening-design.md). Plan: [docs/superpowers/plans/2026-10-30-security-hardening.md](docs/superpowers/plans/2026-10-30-security-hardening.md).

### Tasks completed

1. Model sha256 pinned in code (`TRUSTED_MODEL_SHA256`), checked before unpickling (6030e04).
2. Upload parser child drops all capabilities; startup warning when the API runs as root outside Docker (969fd2d, 8494d11).
3. Dashboard token for REST (Bearer) and WebSocket (subprotocol); umask 077; 20-client WebSocket cap (71b4877).
4. Dashboard asks for the token once; bad tokens detected through the 401 on `GET /alerts`; malformed tokens refused (7f72206, 086ed54).
5. nginx sends CSP, `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: no-referrer`; Vite dev/preview send the last three (3d00ad2).
6. Docs: token, `setpriv` least-privilege run, pinned models (2a78c06).
7. Gate. Two fixes found during it: an existing `data/` (mode 775 here) is tightened to 700 at startup (7719757, human-approved); API_SPEC now says a refused WebSocket handshake is HTTP 403 on the wire, 1008/1013 being the codes Starlette's test client reports (1a97f20).

### Evidence — local least-privilege run (DEMO step 2 `setpriv` command, password typed by the human)

```text
== 33264 sudo          Uid: 1000 0 0 0      CapEff: 000001ffffffffff   (sudo itself)
== 33267 uvicorn       Uid: 1000 1000 1000 1000
CapEff:	0000000000002000
CapAmb:	0000000000002000
0x0000000000002000=cap_net_raw
```

### Evidence — capability drop from a real starting point (step 1b)

```text
before [('Eff', '0000000000002000'), ('Amb', '0000000000002000')]
after [('Eff', '0000000000000000'), ('Amb', '0000000000000000')]
```

### Evidence — negative checks against the running backend

```text
--- no token:        401
--- wrong token:     401
--- right token:     200
--- health:          200
--- ws without subprotocols:        InvalidStatus server rejected WebSocket connection: HTTP 403
wrong token:                        InvalidStatus server rejected WebSocket connection: HTTP 403
right token, bad origin:            InvalidStatus server rejected WebSocket connection: HTTP 403
right token:                        accepted, subprotocol = sentinelstream
--- modes:
700 data
600 data/api-token
600 data/sentinelstream.db
```

### Evidence — dashboard in the built-in browser (dev server)

- No stored token: form "Paste the dashboard token", header "Waiting for the dashboard token".
- Wrong token saved: "The backend rejected that token." (socket never opens; detected via the REST 401).
- Real token: header "Connected · capturing on lo"; after `simulator/simulate_attack.py portscan`, row `High 9:20:42 AM PortScan Port-scan rule 127.0.0.1:46188 → 127.0.0.1:19 100%`.

### Evidence — Docker (`docker compose -f docker-compose.yml -f docker-compose.demo.yml up -d`)

- `docker compose logs backend` contains one `Dashboard token:` line; `curl -sI http://localhost:3000/` has the `Content-Security-Policy` header.
- The browser still held the local run's token: on load the dashboard showed "The backend rejected that token." Pasting the container's token connected it.
- After the simulator's port scan: `High 9:24:47 AM PortScan Port-scan rule 127.0.0.1:44706 → 127.0.0.1:20 100%`; the production bundle (`/assets/index-5XFxI0_Z.js`) and both Recharts charts rendered; console filtered for "Refused": no CSP violations.

### Evidence — full checks (after 1a97f20)

```text
=== pytest
97 passed, 1 warning in 20.21s
=== ruff
All checks passed!
=== npm test
 Test Files  3 passed (3)
      Tests  21 passed (21)
=== build
✓ built in 436ms
```

### Gate verdict

Local runs hold only `cap_net_raw` as the invoking user; the upload child ends with no capabilities; REST and WebSocket refuse a missing or wrong token; data files are owner-only; the dashboard recovers from a stale token and shows alerts with the CSP active in Docker.

### Observations for later sub-projects

- Detection quality: the classifier labels some scan flows BruteForce or WebAttack, and in Docker a second PortScan alert pointed at the DNS resolver (`127.0.0.1:33925 → 127.0.0.53:53`) 11 s after a scan.

### Final whole-branch review (fa670d7)

Verdict before fixes: "Ready after fixes". Fixed:

- The startup `chmod 700` now touches only a data directory the process owns that is not sticky. Before this, `SENTINEL_DB_PATH=/tmp/x.db` under root would have chmodded `/tmp`.
- The WebSocket cap now counts every open socket from before accept. Before, a client the sender dropped as slow stayed connected but freed its slot. The sender now also closes such clients with 1013 so the dashboard reconnects.
- New unit tests cover the subprotocol and Bearer parsers and an empty token file.
- The upload child now also sets `PR_SET_NO_NEW_PRIVS`.
- DATA_MODEL now lists `api-token`. API_SPEC gives the token's real location (next to the database). LIMITATIONS notes that the upload body is read before the token check.

Correction to the gate verdict above: step 1b ran `drop_capabilities()` in a standalone process started with `CAP_NET_RAW`, not inside a real upload child. Inside the child it is the first call; `tests/test_uploads.py` checks the child's sets, but it runs unprivileged, where they start empty.

```text
102 passed, 1 warning in 29.61s
All checks passed!
      Tests  21 passed (21)
```

## Post-v1 sub-project 2: repo + CI polish

Spec: [docs/superpowers/specs/2026-10-31-repo-ci-polish-design.md](docs/superpowers/specs/2026-10-31-repo-ci-polish-design.md). Plan: [docs/superpowers/plans/2026-10-31-repo-ci-polish.md](docs/superpowers/plans/2026-10-31-repo-ci-polish.md). Merged as PR #3 (61f3919).

### Tasks completed

1. Python requirements renamed to pip-compile's layout (`requirements.in` → hashed `requirements.txt`) so Dependabot regenerates the lock; Dockerfile, CI and CONTRIBUTING.md follow.
2. Dependabot: weekly pip, npm, GitHub Actions and Docker digest updates, minor/patch grouped.
3. CI `audit` job: pip-audit 2.10.1 and `npm audit --audit-level=high`.
4. CI `trivy` job: both images; fixable HIGH/CRITICAL fail the build.
5. CI `e2e` job: `scripts/e2e-demo.sh` runs the Docker demo and requires a High PortScan alert over the authenticated API plus the dashboard CSP; weekly scheduled run added.
6. SECURITY.md and a README screenshot (`docs/images/dashboard.png`).
7. Branch protection, private vulnerability reporting, repo description and topics (after merge).

### Evidence — local checks before the PR

```text
pip-audit --strict --require-hashes -r requirements.txt → No known vulnerabilities found
npm audit --audit-level=high → found 0 vulnerabilities
scripts/e2e-demo.sh → e2e: PASS (High PortScan alert over the API; dashboard CSP present)
same script with the assertion changed to a non-existent attack → e2e: FAIL: no High PortScan alert within 60 s (exit 1)
```

### Evidence — Trivy findings and fixes

```text
0d98d31  sentinelstream-frontend (alpine 3.23.4)  Total: 48 (HIGH: 47, CRITICAL: 1)   nginx:1.29-alpine, no rebuilt digest
eef427a  sentinelstream-frontend (alpine 3.24.3)  Total: 3 (HIGH: 2, CRITICAL: 1)     moved to nginx:1.30-alpine (stable)
1d3838d  trivy: pass                                                                  curl/libcurl removed (unused), brotli-libs 1.2.1-r0
```

The backend image passed Trivy from the first run. The brotli upgrade in `frontend/Dockerfile` is marked as a shortcut to drop once a Dependabot digest bump ships brotli ≥ 1.2.1.

### Evidence — PR #3 CI on its final commit (1d3838d)

```text
audit: pass
docker: pass
e2e: pass
frontend: pass
python: pass
trivy: pass
```

### Evidence — repository settings (gh api, after merge)

```text
branch protection: {"checks":["python","frontend","docker","audit","trivy","e2e"],"enforce_admins":false,"pr_reviews_required":0,"strict":true}
private vulnerability reporting enabled: true
{"description":"Real-time network intrusion detection on one laptop CPU: Scapy capture, Random Forest + Isolation Forest + port-scan rule, FastAPI/WebSocket API and a React dashboard. Offline, no cloud.","topics":["cicids2017","cybersecurity","fastapi","intrusion-detection","machine-learning","network-security","react","scapy","scikit-learn","websocket"]}
```

### Notes

- The first local run of `scripts/e2e-demo.sh` used the default compose project, so its `down -v` removed the local demo's data volume (test alerts and the dashboard token, which regenerates). The script now uses its own project name, `sentinelstream-e2e`.
- Branch protection is proven by this evidence PR: it could merge only after the six required checks passed.

## Post-v1 sub-project: dashboard insights

Spec: [docs/superpowers/specs/2026-11-03-dashboard-insights-design.md](docs/superpowers/specs/2026-11-03-dashboard-insights-design.md). Plan: [docs/superpowers/plans/2026-11-03-dashboard-insights.md](docs/superpowers/plans/2026-11-03-dashboard-insights.md). Built task by task, each task implemented by one agent and reviewed by another (spec compliance and code quality), then a whole-branch review.

### Tasks completed

- Backend: `stats` messages carry cumulative `packets` (API_SPEC updated with it).
- `frontend/src/insights.ts`: pure functions for the timeline, top talkers, attack map, search, the shared focus filter and drop shares.
- Alert feed: search box, removable focus chip, keyboard shortcuts (`/`, `j`/`k`, Enter, `a`, Esc) and a key list.
- New panels: alert timeline, attack map, top talkers; "Packets per second" became Capture (active flows, queue and kernel drop shares, kernel drops above 5% flagged); Attack types rebuilt as HTML bars that re-rank with GSAP Flip.
- Human decision during execution: attack-map stroke width is linear in detections (the plan's square-root curve contradicted the "linear from zero" rule).
- Whole-branch review fixes: the timeline says "older alerts not loaded" when the backend holds more than the view; `j`/`k` continue from an open alert; Esc closes details from anywhere; an App-level test of the shared focus.
- Visual check (Docker demo, 1440 px and 390 px): fixed an attack map that kept its default width when it first rendered empty (strokes overlapped labels), truncation of long service labels, and Capture figures that blinked once a second.
- DESIGN.md: chart rules, the five panels, the focus filter and keys, the vermilion exception for kernel drops, no perspective or 3D.

### Evidence — checks on the final commit

```
117 passed, 1 warning in 33.17s
All checks passed!
 Test Files  8 passed (8)
      Tests  82 passed (82)
✓ built in 463ms
impeccable detect: []
RESULT: 0 FAIL, 22 WARN
```

The 22 taste-lint warnings are monospace on IP addresses, ports and times (literal machine values, kept mono by design). The build still prints Vite's >500 kB chunk advisory, which predates this sub-project.

### Notes

- Panels compute from the alerts the dashboard holds (latest 200 live, 500 per upload) and say so; they are not database-wide aggregates.
- Minor review findings left open are listed in the review ledger: the timeline and map recompute every second (their `memo` is ineffective because `clock` changes), `a` acknowledges the open alert from any panel, and a few test-coverage gaps.
