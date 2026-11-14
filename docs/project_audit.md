# Phase 0 — Existing Project Audit

**Date:** 2026-11-14
**Repository:** `nyc-taxi-ml` (branch `main`, clean working tree at audit start)
**Scope:** read-only inspection of the repository, data, environment and git history before any change.

---

## 1. What exists today

### 1.1 Repository layout

```text
nyc-taxi-ml/
├── README.md                        PROTECTED (must not be modified)
├── NYC_Taxi_ML_Project_Brief.md     course brief for the original scope (Jan-Jun 2026)
├── ML_Mini_Project_Guidelines.pdf   course handout
├── pyproject.toml / uv.lock         uv-managed environment, Python 3.14+, pandas/sklearn/duckdb/polars
├── .gitignore                       data/, *.parquet, outputs/models/, *.joblib, .venv
├── assets/hero.svg, imbalance.svg   PROTECTED SVG assets referenced by README
├── data/raw/yellow/*.parquet        12 files, yellow_tripdata_2026-01 … 2026-06 (6 months, ~372 MB)
├── data/raw/green/*.parquet         6 files, green_tripdata_2026-01 … 2026-06 (~6 MB)
├── data/raw/taxi_zone_lookup.csv    265 rows, matches official TLC lookup
├── data/processed/*.parquet         yellow_cleaned_2026H1, green_cleaned_2026H1, taxi_cleaned_2026H1
├── notebooks/nyc_taxi_trip_duration.ipynb   1 notebook, 29 cells (audit + clean + EDA + RF screening)
├── outputs/figures/                7 EDA PNGs
├── docs/streamlit_extension_plan.md design note, "planned, not started"
└── src/                             EMPTY
```

### 1.2 Git history

11 commits, all linear on `main`, no branches other than `main` and `origin/main`.
Content order: structure → brief → README redesign → raw data tracked → EDA notebook → Streamlit plan → SVG tweaks.
`data/` was committed at one point and later git-ignored; the raw files are still on disk but untracked now.

### 1.3 Notebook contents (`notebooks/nyc_taxi_trip_duration.ipynb`)

| Cells | Content | Status |
|---|---|---|
| 0–2 | Title, conventions (1–180 min duration), DuckDB connection, constants (`SEED=33`) | complete |
| 3–5 | File inventory, schema dump, raw rows per source month | complete |
| 5–6 | Sequential cleaning audit (timestamps → source month → duration → zones) and export of three processed Parquets **hard-coded to `2026-*` globs** | complete but 2026-only |
| 7–10 | Missingness, duplicate-key audit, passenger-count quality | complete |
| 11–15 | Duration quantiles, monthly volume, borough and pickup-zone share | complete |
| 16–23 | Four EDA figures (duration/hour, weekday, monthly/borough, top pickup zones) + interpretation | complete |
| 24–25 | Key findings, prediction-time feature screening intro | complete |
| 26–28 | Random Forest on 300k Yellow + all Green, February? no — Jan–Apr train / May validation, permutation importance table + figure | complete |

**Assessment of the notebook:** methodologically sound where it exists — chronological split, leakage rules documented, reduction metrics in minutes, DuckDB used for scale, per-service audit tables. Limitations:

- Dataset globs are hard-wired to 2026 and the cleaning rules omit fare, distance and passenger sanity filters now required.
- No geospatial feature (zone centroids, Haversine, borough pairs) — the brief notes the shapefile was missing.
- No weather, no holiday calendar, no historical route aggregates.
- Models: only a Random Forest screening model. No baseline chain, no LightGBM/XGBoost, no hyper-parameter tuning, no fare model at all.
- Notebook mixes audit + cleaning + EDA + modelling in one file, which the new task replaces with a 7-notebook structure.
- `passenger_count` mapped to a NaN-heavy numeric column and then imputed; the earlier finding "25% missing in Yellow" is noted in `docs/streamlit_extension_plan.md`.

### 1.4 Processed artifacts

| File | Rows | Pickup range | Mean duration |
|---|---|---|---|
| `taxi_cleaned_2026H1.parquet` | 22,416,956 | 2026-01-01 → 2026-06-30 | 17.8 min (yellow), 17.3 min (green) |
| `yellow_cleaned_2026H1.parquet` | 22,173,427 | same | 17.8 min |
| `green_cleaned_2026H1.parquet` | 243,529 | same | 17.3 min |

The combined file carries only 8 columns (`taxi_type, pickup_datetime, dropoff_datetime, trip_duration_minutes, PULocationID, DOLocationID, passenger_count, month`) — fare, distance, payment and surcharge fields were dropped, so these artifacts **cannot** support the fare stage and must be rebuilt.

### 1.5 Environment

`uv` environment at `.venv`, Python 3.15.1. Present: pandas 3.1.1, numpy 2.5.4, duckdb 2.0.0, polars 2.1.0, pyarrow 26.0.1, scikit-learn 1.9.1, scipy, matplotlib, seaborn, plotly, requests, joblib.
**Missing:** lightgbm, xgboost, shap, streamlit, holidays, geopandas/shapely, fastapi.
Disk: 11 GB free on the volume — enough for 2025 raw (~0.8 GB) plus processed artifacts (~1–2 GB) if we keep intermediate files Parquet-compressed and avoid materialising full copies in Pandas.

### 1.6 Protected assets

`README.md`, `assets/hero.svg`, `assets/imbalance.svg` are untouched by this audit and will not be modified. The README's download commands and structure diagram will become stale (they reference 2026 and a single notebook); per the task rules the README stays exactly as it is, and current documentation lives in `docs/`.

---

## 2. Data-source verification (performed during the audit)

Official TLC CloudFront endpoint `https://d37ci6vzurychx.cloudfront.net/trip-data/`:

| Check | Result |
|---|---|
| `yellow_tripdata_2025-01 … 2025-12.parquet` | **all 12 months HTTP 200** |
| `green_tripdata_2025-01 … 2025-12.parquet` | **all 12 months HTTP 200** |
| `misc/taxi_zone_lookup.csv`, `misc/taxi_zones.zip` | HTTP 200 |
| Yellow 2025 schema | 20 columns, identical in Jan/Jul/Dec |
| Green 2025 schema | 21 columns, identical in Jan/Jul/Dec |
| Congestion field | `cbd_congestion_fee` present in **both** services for all 2025 months (NYC CBD pricing began 2025-01-05) |

Row counts sampled from remote Parquet footers: yellow 2025-01 = 3.48 M, 2025-07 = 3.90 M, 2025-12 = 4.31 M; green 2025-01 = 48.3 k, 2025-07 = 48.2 k, 2025-12 = 48.2 k. A full 2025 yellow year is therefore ≈ 45–47 M rows, green ≈ 0.58 M.

Schema differences that the unified layer must absorb:

- timestamps: `tpep_*` (yellow) vs `lpep_*` (green);
- green-only: `ehail_fee`, `trip_type`; yellow-only: `Airport_fee`;
- column order differs; `passenger_count` is `DOUBLE` in green, `BIGINT` in yellow.

No month in 2025 is missing. This satisfies the "document if unavailable" requirement — nothing to document as missing.

---

## 3. Decisions: reuse / refactor / replace

| Component | Decision | Reason |
|---|---|---|
| `data/raw/2026-*` files | **Reuse as-is (archived)** | Task says preserve for reference; they stay in place and are excluded from the 2025 pipeline by explicit glob. |
| `data/processed/*_2026H1.parquet` | **Preserve, do not delete** | Reference artifacts; superseded by new 2025 processed data. |
| `notebooks/nyc_taxi_trip_duration.ipynb` | **Retire (kept in place, unmodified)** | Its audit/cleaning/EDA logic is reused conceptually and re-implemented in the new 01/02/03 notebooks; it is 2026-bound and mixes all phases. |
| DuckDB-as-engine approach | **Reuse** | Already proven at 22 M rows on this hardware; extend to 47 M with SQL-only aggregation and sampling at export. |
| Cleaning thresholds (1–180 min, zone validity) | **Reuse and extend** | Add distance, fare, passenger and duplicate rules; keep the sequential-audit-table pattern. |
| Chronological split pattern | **Reuse, rescale to 2025** | Jan–Aug train, Sep–Oct validation, Nov–Dec test. |
| Feature-screening RF code | **Refactor** | Re-implemented with the full feature set, in the duration notebook. |
| `src/` modules | **New** | Required by the "implement, don't just describe" instruction for ingestion/serving; notebooks remain self-contained per the notebook rules. |
| `docs/streamlit_extension_plan.md` | **Supersede with a real app** | Streamlit app is now a deliverable; the plan document is kept for history and a new `docs/` set documents the built system. |
| README + SVG assets | **Untouched** | Hard constraint. |

---

## 4. Gaps this project must close

1. No 2025 data at all; 2026 is the only raw vintage present.
2. No automated, restartable ingestion with manifest/validation.
3. No fare modelling, no two-stage pipeline, no model persistence beyond a screening notebook.
4. No geospatial (centroid distance, bearing, borough pairs, airport/CBD flags) features — shapefile missing.
5. No weather, no holiday features, no historical zone-route aggregates.
6. Missing libraries for the required algorithm set (LightGBM, XGBoost), explainability (SHAP) and delivery (Streamlit).
7. No uncertainty intervals, no arrival-time output, no serving path.

---

## 5. Target architecture (retaining the existing spirit)

```text
data/raw/{yellow,green}_2025/   monthly Parquet, manifest-tracked
data/external/                  weather 2025, holidays, zone centroids, shapefile
data/processed/                 cleaned 2025 Parquet, feature table, aggregates
data/models/                    trained models, encoders, metadata (git-ignored)
notebooks/01…07                 audit → EDA → features → duration → fare → eval → e2e
src/{ingestion,features,models,evaluation,serving}   automation + serving (not imported by notebooks)
app/streamlit_app.py            interactive two-stage predictor
reports/                        phase reports, figures, metrics tables
docs/                           audit (this file), decisions, progress log, methodology
tests/                          smoke tests for ingestion manifest, feature builder, serving
```

Notebooks stay self-contained (their own implementation, no imports from `src/`); `src/` carries the automation, the persisted feature contract and the inference path that the Streamlit app calls.

---

## Post-audit update (2026-11-14)

This document deliberately records the repository **as it was found**, so a few statements are historical and no
longer describe the current tree:

- The retired notebook, the obsolete Streamlit plan, the original 2026 brief, the seven stale EDA figures and the
  derived `*_2026H1.parquet` files were removed during a later cleanup at the owner's request. The 2026 **raw**
  files remain, and every deleted file is recoverable from git history.
- The README was rewritten with the owner's explicit permission. `assets/hero.svg` is still embedded and unchanged.
- `assets/imbalance.svg` was updated to the 2025 counts (44,511,782 Yellow vs 559,224 Green) at the owner's
  explicit request, which overrides the original "never modify SVG" rule for that one file.
- `assets/pipeline.svg` is a new asset created for the README pipeline diagram; no existing SVG was regenerated.
