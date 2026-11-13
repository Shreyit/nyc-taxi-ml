# Technical Decision Log

Short ADR-style records. Each entry: context, decision, consequence, alternatives considered.

---

## D-01 Primary dataset vintage: 2025 (not 2026)

**Context.** The existing repository holds Jan–Jun 2026 TLC files. The project specification requires the complete 2025 calendar year as the primary modelling dataset.
**Decision.** All modelling, features and reported metrics use 2025 only. The 2026 raw and processed files stay on disk untouched but are never globbed by the 2025 pipeline (`*_2025-*.parquet` globs only), so the two vintages cannot be silently mixed.
**Consequence.** The 2026 artifacts become reference-only. Any notebook assertion about the training window can be checked by looking at minimum/maximum pickup timestamps.
**Alternatives.** Mixing both years (rejected: violates the explicit instruction and would blend two congestion-pricing regimes and post-2026 fare schedules).

## D-02 DuckDB as the analytical engine, Pandas only on samples

**Context.** A full 2025 year is ≈ 45–47 M yellow rows; loading it into Pandas is not viable on a laptop with 11 GB free disk and limited RAM.
**Decision.** Cleaning, aggregation, joins and feature construction run as DuckDB SQL directly over Parquet. Pandas receives only (a) aggregate result sets, (b) fixed-seed samples used for training and evaluation.
**Consequence.** All heavy steps are restartable and constant-memory. Sampling must be seeded and documented, and sample sizes recorded alongside every metric.

## D-03 Chronological split: Jan–Aug train, Sep–Oct validation, Nov–Dec test

**Context.** Requirement: chronological splits with sufficient training volume and meaningful temporal separation; the test window must not influence model or feature selection.
**Decision.** Train = 2025-01 … 2025-08, validation = 2025-09 … 2025-10, test = 2025-11 … 2025-12. Two-month blocks give seasonal coverage on both sides of the split while keeping a full 8 months of training signal.
**Consequence.** Every learned transformer (imputers, encoders, historical route aggregates) is fitted on training months only. Route aggregates use expanding/out-of-fold history so that validation and test rows never see their own month's target.

## D-04 Leakage boundary: no post-trip information in either stage

**Context.** Duration and fare are both derived from post-trip data. TLC `trip_distance`, `fare_amount`, tips, tolls and surcharges are only known once the trip ends.
**Decision.** Production feature sets contain only: pickup timestamp (`hour`, `weekday`, `month`, holiday/rush flags), pickup and drop-off zone IDs, derived zone geometry (centroids, Haversine, Manhattan-grid distance, bearing, borough of each end, cross-borough flag, airport/CBD flags), taxi type, passenger count, and leakage-safe historical route aggregates built from earlier periods. Actual distance, duration, fare, tips, tolls, `RatecodeID`, `payment_type`, `store_and_fwd_flag` and all surcharge fields are excluded from predictors.
**Consequence.** Expected duration R² is modest (~0.3–0.5) — this is an honest pre-trip estimate, not a navigation ETA. Actual `trip_distance` is retained for diagnostics/benchmarking only, in clearly separated variables prefixed `diag_`.

## D-05 Two-stage fare model fed by the predicted duration

**Context.** The specification requires Stage 2 to consume the Stage 1 prediction, and requires evaluating the pipeline end-to-end rather than the fare model alone.
**Decision.** Stage 2 is trained with the Stage-1 prediction produced by an out-of-fold (cross-fitted) duration model, so fare-model training inputs mimic the error distribution of inference. Reported fare metrics come from the fully chained pipeline on the held-out test window.
**Consequence.** Fare metrics include propagated duration error; we also report a "Stage-2 with actual duration" upper bound purely as diagnostic context, clearly labelled as not deployable.

## D-06 Notebooks self-contained; `src/` carries automation and serving

**Context.** Task requires essential code inside notebooks with no hidden dependencies, while also requiring automated ingestion, tests and a Streamlit app.
**Decision.** Each notebook defines its own helpers locally and is executable top-to-bottom. `src/` duplicates the ingestion pipeline, the feature contract and the inference path for automation and serving; `tests/` exercises `src/` only.
**Consequence.** Some duplication between notebooks and `src/`, accepted deliberately for reproducibility of the narrative.

## D-07 Filtering rule: only unusable targets and features justify dropping a row

**Context.** The first cleaning pass also required metered distance to fall inside 0.1–100 miles. Inspection
of the removed rows showed the rule was doing more harm than good: the 0.1-mile lower bound deleted 445 k
Yellow trips with distances between zero and a tenth of a mile, and the zero-distance bucket held another
817,668 Yellow and 11,418 Green trips whose **fare and duration were perfectly valid** (median fare \$18.34,
median duration 16.7 min, both above the overall medians). A zero distance field means the odometer did not
report, not that the trip did not happen.

**Decision.** A row is dropped only when a target or a model feature is unusable:
duration (target), fare (target), timestamps (target and split key), zone ids (features). Metered distance is
neither — it is a diagnostic that never enters a predictor — so the distance rule now only rejects physically
impossible negative values. Zero-distance rows are kept and flagged with `is_distance_zero` so any analysis
that uses distance can exclude them explicitly.

**Consequence.** 1,264,603 additional Yellow rows and 13,014 Green rows are retained. The trade-off is that
EDAs involving distance must filter on `is_distance_zero`; the modelling feature set is unaffected because it
already derives distance from zone geometry only.

**Alternatives considered.** Keeping the 0.1–100 mile window (rejected: drops valid trips for a field the model
does not use); keeping negative fares and imputing them (rejected: fabricates a target); keeping rows with
negative distances (rejected: the meter reading is corrupt in a way that suggests the record itself is broken).
