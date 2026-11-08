# Evaluation

Every number in this file and in README.md comes from `backend/evaluation/benchmark.py`, except the live false-positive rates, which come from `backend.pipeline` run summaries; full output, including the per-class table, per-day Isolation Forest false-positive rates and the held-out-family run, is in [benchmark/results.md](benchmark/results.md).

## Datasets

| Dataset | Role | Source | Status |
|---|---|---|---|
| CICIDS2017 MachineLearningCSV (CICFlowMeter flow CSVs, 8 files) | Primary: training and benchmark | Canadian Institute for Cybersecurity, University of New Brunswick (official download page) | Downloaded by the human (registration form): 235,102,953 bytes, sha256 `c3f26274…4727928`. |
| Citation | — | Sharafaldin, Lashkari, Ghorbani, "Toward Generating a New Intrusion Detection Dataset and Intrusion Traffic Characterization", ICISSP 2018 | Required by the dataset's terms |
| NSL-KDD | Optional secondary check | UNB CIC | Not planned unless time allows. |
| Synthetic PCAP fixtures | Unit tests and Phase 1 gate | `tests/fixtures/make_sample_pcap.py` | Done (Phase 1) |

## Preparation

1. Strip whitespace from column names.
2. Drop duplicate columns (CICIDS2017 has `Fwd Header Length` twice).
3. Replace `±inf` with NaN, then drop rows with NaN in the shared feature columns. Report how many rows were dropped.
4. Map columns to the [shared feature subset](DATA_MODEL.md#shared-feature-subset); map labels to [attack types](DATA_MODEL.md#attack-types).
5. Drop exact duplicate rows within the shared subset + label. Report the count.

## Split

- Stratified 80/20 train/test split on the grouped label, `random_state=42`.
- All three detectors are scored on the same test rows.
- Isolation Forest and the PPS rule threshold are fit on **benign rows of the training split only**.
- Random Forest is fit on all training rows.

## Detectors

| Detector | Type | Flags a flow when |
|---|---|---|
| PPS rule | Threshold | `packets_per_s` > 99th percentile of benign training flows |
| Isolation Forest | Unsupervised | anomaly score > 99th percentile of benign training scores |
| Random Forest | Supervised, `class_weight="balanced"` | predicted class ≠ `BENIGN` |

## Metrics

Binary task (attack vs benign) so all three detectors are comparable. Positive class = attack.

| Metric | Definition |
|---|---|
| Precision | TP / (TP + FP) |
| Recall | TP / (TP + FN) |
| F1 | 2 · P · R / (P + R) |
| False-positive rate on benign flows | FP / (FP + TN) |
| Per-flow inference latency | Median and p95 wall-clock time of 1,000 single-flow `predict` calls on random test rows, in ms. CPU model recorded with the results. |

Also reported for every detector: PR-AUC, and recall at 1% false-positive rate (so detectors fixed at ~1% FPR compare fairly with the Random Forest). One extra run holds out one attack family from training. The benchmark loads the committed model files and prints their sha256.

Random Forest also gets a per-class precision/recall/F1 table with support (test rows per class); classes with < 100 rows are merged or dropped. It (multi-class), since it is the only detector that names attacks.

## Results

Command: `python backend/evaluation/benchmark.py --csv-dir data/raw/cicids2017/MachineLearningCVE` (commit `8922a81`, AMD Ryzen 9 5900HS). Test split: 277,471 benign + 65,251 attack flows.

| Detector | Precision | Recall | F1 | FPR (benign) | PR-AUC | Recall @1% FPR | Latency p50 (ms) | Latency p95 (ms) |
|---|---|---|---|---|---|---|---|---|
| PPS rule | 0.0575 | 0.0026 | 0.0050 | 0.9990% | 0.1208 | 0.0026 | 0.022 | 0.030 |
| Isolation Forest | 0.0103 | 0.0005 | 0.0009 | 1.0347% | 0.3943 | 0.0004 | 15.088 | 16.126 |
| Random Forest | 0.9245 | 0.9973 | 0.9595 | 1.9166% | 0.9922 | 0.9192 | 4.034 | 4.352 |

Random Forest per class (precision / recall / support): BENIGN 0.9994 / 0.9808 / 277,471; DoS 0.9573 / 0.9943 / 37,328; DDoS 0.9942 / 0.9990 / 25,438; BruteForce 0.9025 / 0.9824 / 1,480; PortScan 0.6514 / 0.9689 / 322; Bot 0.4761 / 0.9774 / 265; WebAttack 0.1174 / 0.9641 / 418. High recall with low precision on the small classes comes from `class_weight="balanced"`: benign flows are pulled into them.

Held-out family (PortScan removed from training): Random Forest recall on PortScan falls from 0.9938 to 0.2205; Isolation Forest 0.0000; PPS rule 0.1149.

Isolation Forest benign false-positive rate per CICIDS2017 file: 0.83%–1.31% (threshold is p99 of training benign scores).

## Not benchmarked

The port-scan rule needs source IPs and timestamps, which MachineLearningCSV doesn't have. It is tested on PCAP fixtures only (`tests/test_scan_rule.py`).

## Live default

**Live default: Random Forest + port-scan rule + Isolation Forest** (human decision, Phase 5). Per flow, the Random Forest names the attack; only when it says benign can the Isolation Forest raise a `low`/`medium` `anomaly`; the scan rule works across flows. Why: the Random Forest carries detection on known attacks (F1 0.9595, PR-AUC 0.9922, ~4 ms per flow). The Isolation Forest adds almost nothing on CICIDS2017 attacks (recall 0.0005; 0.0000 on held-out PortScan) and caused every live false positive measured in Phase 2, but it is kept as the only net for patterns no training label covers, with its alerts capped at `medium` and merged by D4. The scan rule is the only detector that names a port scan reliably on live traffic.

## Live false-positive rate

Two 1-hour runs of `python -m backend.pipeline --duration 3600` during normal desktop use, no attacks (2026-11-03). Every alert is counted as a false positive.

| Interface | Packets read | Flows scored | Random Forest alerts/hour | Isolation Forest alerts/hour | Kernel-dropped packets |
|---|---|---|---|---|---|
| `wlp6s0` (Wi-Fi) | 103,115 | 4,448 | 220 | 97 | 260,185 |
| `lo` | 249,142 | 832 | 18 | 297 | 0 |

The Wi-Fi rates are a floor (about 72% of packets were dropped in the kernel). Interpretation and caveats: [LIMITATIONS.md](LIMITATIONS.md#live-false-positive-rate).

## Caveats to report with results

- Scores are on CICFlowMeter features, not on features computed live from packets; live behaviour can differ (see [LIMITATIONS.md](LIMITATIONS.md)).
- A random split of CICIDS2017 flows puts flows from the same attack session in both train and test, which inflates scores compared with a time-based split.
