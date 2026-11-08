# Limitations

Written during the build and finished in Phase 7. Numbers here come from scripts in this repo; the phase each comes from is named so it can be re-run.

## Feature approximation

Training data are CICFlowMeter flow CSVs; the live pipeline computes features from raw packets in Python. The shared subset ([DATA_MODEL.md](DATA_MODEL.md#shared-feature-subset)) is designed to match, but only approximates CICFlowMeter:

- Flow boundaries differ. CICFlowMeter uses a 120 s flow timeout and ends a flow at the first FIN; SentinelStream uses 5 s idle / 10 s active timeouts and both FINs or any RST, so long flows become chunks the models never saw in training.
- CICIDS2017 has documented labelling and flow-construction errors (Engelen, Rimmer, Joosen, "Troubleshooting an Intrusion Detection Dataset: the CICIDS2017 Case Study", IEEE S&P Workshops 2021).
- IP fragments: a first fragment counts only its own slice; later fragments are skipped and counted, not reassembled.
- Timestamps are floats (sub-microsecond precision is lost); pcap and CICFlowMeter are microsecond-resolution anyway.
- Only TCP/UDP flows are scored. ICMP and other protocols are parsed but never alert (CICIDS2017 has nothing to learn them from).
- Byte counts are transport payload lengths; header handling may not match CICFlowMeter exactly.
- No TCP flag features. CICIDS2017's `SYN/ACK/FIN/RST Flag Count` columns hold only 0/1 and are unreliable, so they were dropped in Phase 1. The models therefore cannot use "many SYNs, no ACKs" directly; SYN floods are caught only through packet rate and direction counts.
- Zero-duration flows need a defined `packets_per_s`; our rule may differ from how CICFlowMeter produced `Infinity` values.

Consequence: benchmark numbers describe the models on CICIDS2017 CSV features, not on live traffic.

## What it cannot detect

- Anything visible only in payloads (SQL injection content, malware signatures, exploit strings). Only flow statistics are used.
- Encrypted-traffic attacks that look statistically normal.
- Attack types absent from CICIDS2017 can only appear as `anomaly`, and only if Isolation Forest flags them. For example, CICIDS2017 has no UDP flood class, so the simulator's `udp_flood` mode can at best produce `anomaly`.
- Slow, low-volume attacks spread over longer than the active timeout.
- Slow port scans: the scan rule needs ≥ 20 targets from one source within 10 s. Its thresholds are untuned, and it can't be benchmarked on CICIDS2017 MachineLearningCSV (no IPs or timestamps), only tested on fixtures.
- Floods spread over random source ports: each packet is its own 1-packet flow, which Isolation Forest doesn't flag. CICIDS2017 has no SYN-flood or UDP-flood class, so floods can only ever appear as `anomaly`.
- Attacks on other hosts the sensor cannot see (switched networks without a span port).
- UDP floods on one 5-tuple: the Phase 2 gate's 20,000-packet UDP burst raised no alert.

## Dataset limits

- On the 5 shared features, 39% of CICIDS2017 rows are exact duplicates; PortScan collapses from 158,930 to 1,612 distinct rows, and 4,382 rows share their features with a row of another label (no model can separate them).
- The Random Forest's small classes have high recall but low precision on the test split (WebAttack 0.12, Bot 0.48, PortScan 0.65): `class_weight="balanced"` pulls benign flows into them. On the Phase 1 sample the Random Forest labels the 50 scan probes `WebAttack` at low confidence; the scan rule names them correctly.
- With PortScan held out of training, Random Forest recall on PortScan drops from 0.99 to 0.22 and the Isolation Forest finds none: neither model generalises to an attack family it has not seen.
- Infiltration (36 rows) and Heartbleed (11) are dropped (< 100 rows); SentinelStream cannot name them.
- Simulator modes on loopback (Phase 6 recordings in `tests/fixtures/sim_*.pcap`): portscan → `PortScan` from the scan rule (high), plus Random Forest `WebAttack`/`BruteForce` on the individual probes; udp_flood → one Isolation Forest `anomaly` (low); syn_flood → only Random Forest `WebAttack`/`BruteForce`, some at high severity, because the kernel's RST replies split the flood into SYN+RST pairs that look like CICIDS2017's small-flow attack classes. No mode is named `DoS` on loopback.

- CICIDS2017 was recorded in 2017 in a lab network; traffic mix and attack tools are dated.
- Classes are heavily imbalanced (some classes have tens of rows); per-class metrics for rare classes are unreliable.
- A random train/test split leaks session-level similarity, so scores are optimistic.

## Isolation Forest thresholding

- It flags flows above the 99th percentile of benign training scores, so about 1% of benign CICIDS2017 Monday flows are flagged by design. The default `contamination="auto"` flagged a large share of its own benign training rows in a Phase 1 investigation and was rejected (see PROGRESS.md).
- Confidence is the benign-score percentile, so every Isolation Forest alert has confidence ≥ 0.99. Severity for these unnamed alerts is `low`, or `medium` above p99.9 — never `high` (D6). A clear SYN flood can therefore show as `low`; only named detections reach `high`.
- Trained on one day (Monday) of one lab network. "Normal" on another network will differ. Measured in Phase 2: a KDE audio-visualizer widget streaming 60 fps over a loopback WebSocket had every 10 s slice flagged (358 alerts/hour); the other ~250 flows in 30 minutes raised none.
- On loopback every program shares 127.0.0.1, so the scan rule sees all local programs as one source.

## Live false-positive rate

Measured on 2026-11-03: two back-to-back 1-hour runs of `python -m backend.pipeline --duration 3600` on one laptop during normal desktop use, with no simulator. Every alert counts as a false positive, with the caveat that real traffic is not guaranteed benign. Counts are raw pipeline output (mutes do not apply there). Command and summary lines: PROGRESS.md, sub-project 3.

| Interface | Packets read | Flows scored | Random Forest alerts/hour | Isolation Forest alerts/hour | Kernel-dropped packets |
|---|---|---|---|---|---|
| `wlp6s0` (Wi-Fi) | 103,115 | 4,448 | 220 | 97 | 260,185 |
| `lo` | 249,142 | 832 | 18 | 297 | 0 |

- Together the detectors raised about 315 alerts an hour on either interface, one every ~11 s. That is too many for an unattended deployment; mutes (sub-project 3) are the analyst's tool for known-benign patterns.
- On Wi-Fi most false positives came from the Random Forest, not only the Isolation Forest as in Phase 2. On loopback the Isolation Forest dominated.
- The Wi-Fi rates are a floor: the kernel dropped 260,185 packets, about 72% of what arrived, before Python read them (see Capture and Docker), so most Wi-Fi traffic was never scored.
- One laptop, one evening, one network: this is one sample, not a rate for other networks.

## Trust boundary and security

- The REST and WebSocket API need a dashboard token, but it is a single shared secret: no users, no expiry, and anyone who can read `data/api-token` has it. The backend still binds `127.0.0.1:8000`; do not expose it on a network.
- The multipart body of `POST /upload-pcap` is read (up to the 50 MB cap) before the token is checked, so any web page can make the backend spool a file to temp before the 401.
- Local runs drop root via `setpriv` (see [DEMO.md](DEMO.md)), and the upload parser child drops all capabilities. In Docker the upload child is uid 0 with no capabilities on a read-only filesystem, and can still write `/tmp` and the data volume.
- Uploaded PCAPs are parsed by Scapy, which is not hardened against hostile input. Size cap, extension check and generated filenames limit, but do not remove, that risk.
- Models are loaded with `joblib`, which can execute code; a model whose sha256 is not pinned in `backend/features/feature_set.py` is refused before unpickling.

## Capture and Docker

- Live capture needs root or `CAP_NET_RAW`.
- A container's loopback is not the host's loopback. Live capture in Docker needs `network_mode: host` plus `NET_RAW` (Phase 7 runs with every other capability dropped), and the simulator must run in the same network namespace as the backend.
- The backend container runs as root inside the container, limited to `NET_RAW`, `no-new-privileges` and a read-only filesystem; a non-root user would not keep `NET_RAW` without file capabilities on the Python binary. Membership of the host's `docker` group is itself root-equivalent.
- Host networking behaves as documented only on Linux. On Docker Desktop (macOS/Windows), `lo` inside the VM is not the host's loopback, so the demo is supported on Linux only.
- Python + Scapy capture is suited to low traffic rates (a laptop, a lab). In Phase 2 a 20,000-packet loopback burst lost 39,213 packets (UDP plus ICMP replies) in the kernel before Python read them; the capture thread's Scapy dissection is the bottleneck. Losses are counted (`dropped_packets` for our queue, `kernel_dropped_packets` for the socket), not prevented.
- On `lo` the kernel delivers every packet twice to packet sockets; capture keeps only the incoming copy (BPF `inbound`), as libpcap does. Scapy's `sniff` must not be given `iface` together with an opened socket, or it opens a second, unfiltered socket (Phase 2 bug, fixed in `9ca23c5`).

## Scale and storage

- One SQLite file, one writer thread. Retention keeps at most 100,000 alerts (oldest deleted first); repeats are merged (D4).
- All queues are bounded; drops are counted and shown in the `stats` message.
- Alerts are broadcast before the batched insert, so up to 2 s of already-shown alerts can be missing from SQLite after a crash.
- Uploaded PCAP alerts keep the capture's original timestamps.
- One upload is processed at a time, two can wait; more get 429.
- The dashboard keeps at most 1,000 alerts per view in memory and renders the latest 200; older ones are in SQLite (`GET /alerts`). Past uploads are not listed after a page reload: there is no endpoint that lists upload batches, so an earlier upload's alerts are reachable only through `GET /alerts?batch_id=`.
- Privacy: on a real interface, alerts store IP addresses, which are personal data in many jurisdictions. Keep `data/` local; CI never uploads it.

## What production would change

- **Capture:** Zeek, Suricata or a C flow exporter (libpcap/AF_PACKET ring buffers) instead of Python + Scapy, which loses most of a burst in the kernel (Phase 2) and needs 4–15 ms per flow to score (Phase 5).
- **Placement:** a separate sensor on a SPAN port or network tap feeding a central collector, instead of one laptop watching its own loopback.
- **Features:** the full CICFlowMeter feature set computed by the same tool at training and run time (removes the flow-boundary and feature mismatch), plus cross-flow features (hosts contacted, ports per source) inside the model instead of one hand-written scan rule.
- **Data and evaluation:** training data from the deployment network, a time-based split, and periodic retraining with threshold tuning on measured false-positive cost; the random split and 2017 lab traffic make the numbers here optimistic.
- **Storage:** PostgreSQL or a time-series store with retention by age, instead of one SQLite file capped by row count.
- **Access:** per-user authentication, TLS and audit on the API and WebSocket; today they rely on one shared token and binding 127.0.0.1.
- **Alert handling:** acknowledgement, suppression and tuning workflows, and export to a SIEM; this dashboard only displays alerts.
