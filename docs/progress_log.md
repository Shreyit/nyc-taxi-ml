# Project Progress Log

Living log of phases, commands run, and verified results. Anything marked **verified** was actually executed on this machine.

---

## Phase 0 — Existing project audit (2026-11-14)

- Enumerated the repository: one notebook (29 cells), 12 raw 2026 Parquet files, 3 processed 2026 artifacts, 7 EDA figures, `src/` empty, `docs/streamlit_extension_plan.md` (plan only).
- Read the notebook's cleaning, EDA and feature-screening cells; read `README.md`, `NYC_Taxi_ML_Project_Brief.md`, `pyproject.toml`, `.gitignore`.
- **Verified** environment: Python 3.15.1, duckdb 2.0.0, pandas 3.1.1, sklearn 1.9.1, pyarrow 26.0.1, polars 2.1.0. Missing: lightgbm, xgboost, shap, streamlit, holidays, geopandas, fastapi.
- **Verified** protected assets present and untouched: `README.md`, `assets/hero.svg`, `assets/imbalance.svg`.
- **Verified** processed 2026 artifacts: 22,416,956 rows, 2026-01-01 → 2026-06-30, 8 columns only (no fare/distance) → cannot support fare stage.
- **Verified** TLC availability: all 12 × 2025 yellow and 12 × 2025 green files return HTTP 200; lookup CSV and shapefile ZIP return 200.
- **Verified** 2025 schemas via remote Parquet footers: yellow 20 cols (Jan/Jul/Dec identical), green 21 cols (identical), `cbd_congestion_fee` present in all sampled months for both.
- **Verified** sampled 2025 row counts: yellow 3.48 M / 3.90 M / 4.31 M (Jan/Jul/Dec); green 48.3 k / 48.2 k / 48.2 k.
- Wrote `docs/project_audit.md` with the reuse / refactor / replace decisions.

Outcome: existing work is methodologically sound but 2026-bound and stops at duration screening. Reuse the DuckDB engine, cleaning-audit pattern, chronological split and leakage rules; rebuild ingestion, features, both models and serving.

---

## Phase 1 — Research, verification and planning (2026-11-14)

- **Verified (live HTTP)** all 12 × 2025 yellow and 12 × 2025 green TLC Parquet URLs return 200; 2025 schemas identical across Jan/Jul/Dec within each service; `cbd_congestion_fee` + `congestion_surcharge` present in both services for all 2025 months.
- **Verified (live download)** `taxi_zones.zip` → 263 polygons, EPSG:2263, `LocationID` 1–263; JFK centroid (-73.7865, 40.6470) via pyogrio/geopandas.
- **Verified (live API)** Open-Meteo archive returned exactly **8,760 hourly 2025 rows with zero nulls**; saved to `data/external/nyc_central_park_weather_2025_hourly.parquet`. Noted the API snaps the point to 40.8084/-74.0199 (~5 km west of Central Park).
- **Verified (library)** `holidays.US(years=2025)` → 11 federal holidays; `state="NY"` adds Lincoln's Birthday, Susan B. Anthony Day, Election Day.
- **Verified (uv add)** lightgbm 4.7.0, xgboost 3.4.1, shap 0.54.1, streamlit 1.67.0, holidays 0.108, geopandas 1.2.0, pyogrio 0.13.0 installed and importable on Python 3.15.1.
- Wrote `docs/project_plan.md`: split (Jan–Aug / Sep–Oct / Nov–Dec 2025), full two-stage feature contract, leakage-control mechanism, modelling plan, deliverable map, risks.

---

## Phase 2 — Data engineering (2026-11-14)

> The row counts below are from the first cleaning pass; they were superseded by the distance-filter
> correction later in this log. Current figures: 45,071,006 rows (91.36% Yellow, 94.56% Green).

- Built `src/ingestion/download_tlc.py`: restartable monthly downloader with `.part` staging, Parquet footer validation, SHA-256, row counts and a JSON manifest. **Verified**: 24/24 files downloaded, 49,313,977 rows, 0.84 GB; re-run prints `[skip]` for every valid file; `--verify` passes.
- Built `src/ingestion/download_external.py`: zone shapefile + lookup, centroids (EPSG:2263 → WGS84), 2025 hourly weather, 2025 holiday calendar. **Verified**: 263 centroids, 8,760 weather hours, 11 federal + 14 NY-state holiday days.
- Built `src/preprocessing/build_clean_dataset.py`: unified Yellow/Green schema, 7 sequential cleaning stages with an independent row count per stage, exact-duplicate removal. **Verified**: 48,722,602 Yellow → 43,499,110 (89.28%); 591,375 Green → 546,507 (92.41%); total 44,045,617 rows, span 2025-01-01 → 2025-12-31, 74 s, 0.55 GB.
- Built `src/features/build_features.py`: temporal, geospatial (Haversine, Manhattan grid, bearing, airport/CBD/cross-borough flags), holiday and weather joins. **Verified**: 44,045,617 rows, 51 columns, **0 null weather / 0 null geometry / 0 null borough**, mean Haversine 4.06 km vs mean metered 3.45 mi (ratio 0.73 as expected for centroid geometry), 2.25% holiday rows, 30.0% rush-hour rows, 1.15 GB.
- `notebooks/01_data_audit_and_understanding.ipynb`: written as a reproducible builder (`tools/build_nb_01.py`), executed top-to-bottom with the project kernel. **Verified**: 15 code cells, 0 errors, 0 warnings, 3 saved figures.
- Added `tests/test_pipeline.py` + `pytest` dev dependency. **Verified**: 7 passed in 1.8 s (manifest completeness, 2025-only coverage, no null geometry/weather, geometry shorter than metered distance, 263 centroids, 8,760 weather hours, 11 federal holidays).
- Wrote `docs/data_dictionary.md` covering raw, external, cleaned and feature tables plus their limitations.

### Phase 2 correction — distance filter relaxed (2026-11-14)

Inspection of the removed rows showed the 0.1–100 mile rule was unjustified: it deleted 1,264,603 Yellow and
13,014 Green trips whose fare and duration were valid, merely because the odometer reported zero or an
implausible number (median fare of the zero-distance bucket: \$18.34, above the overall median). Metered
distance is a diagnostic, never a predictor, so it must not gate a row's survival.

- Cleaning now rejects only negative distance (there are none) and keeps every non-negative reading.
- Added `is_distance_zero` and `is_distance_implausible` flags so distance-based analyses can exclude them.
- **Re-verified**: 48,722,602 Yellow → 44,511,782 (91.36%); 591,375 Green → 559,224 (94.56%); total
  **45,071,006** rows; feature table rebuilt at 45,071,006 rows with 0 null weather/geometry and 1,025,389
  rows flagged as implausible distance (2.28%).
- Notebook 01 rebuilt and re-executed: 0 errors; the stage-removal table now reports positive counts.
- Tests extended with the zero-distance flag check: **8 passed**.
- Recorded as decision D-07.

---

## Repository cleanup + asset refresh (2026-11-14)

The project owner explicitly lifted the "never modify SVG" rule for `assets/imbalance.svg` so the chart
reflects the 2025 dataset; `assets/hero.svg` was not touched.

Removed (all recoverable from git history):

- `notebooks/nyc_taxi_trip_duration.ipynb` — the superseded 2026 single-notebook analysis, replaced by notebooks 01–07
- `docs/streamlit_extension_plan.md` — a "planned, not started" design note, superseded by the real app
- `NYC_Taxi_ML_Project_Brief.md` — the original 2026 scope brief, contradicted by the current dataset
- 7 stale `outputs/figures/eda_*.png` produced by the retired notebook
- `data/processed/{taxi,yellow,green}_cleaned_2026H1.parquet` — 459 MB of derived 2026 artefacts; the 2026 **raw** files stay
- `.DS_Store`, `.pytest_cache/`, `logs/`, `data/tmp/`, `__pycache__/`

**Verified after cleanup:** `pytest` 8 passed; `assets/hero.svg` and `assets/imbalance.svg` byte-identical
except for the intentional imbalance update; `assets/imbalance.svg` parses as valid XML; README references
no deleted file.

---

## Phase 3 — Exploratory data analysis (2026-11-14)

Built `notebooks/02_exploratory_data_analysis.ipynb` (43 cells) with a reproducible builder and executed it
top to bottom against the full 45,071,006-row feature table.

- **Verified**: 0 errors; 10 figures written to `outputs/figures/02_*.png`.
- Findings that changed the plan: median Yellow duration rises 11.73 → 14.88 min from Jan to Dec (+27%), so the
  Nov–Dec test window is structurally slower than training; pickups are afternoon-slowest (Thursday 2 pm,
  15.7 min) not rush-hour-slowest; binary `is_rush_hour` moves the weekday median by only 0.13 min; rain adds
  ~0.3 min regardless of intensity; pickup borough moves the median by 27 min against 3.3 for hour and 0.2 for
  weather; 31.6% of Yellow airport trips sit at the \$70 JFK flat fare; 81% of all trips are Manhattan→Manhattan.
- Data-quality finding: 8,096 long Green trips (1.4% of Green) have a median metered fare of \$5.80 against a
  total of \$56.73, i.e. a corrupted fare field. Documented, not hand-patched.
- Two interpretation errors were caught and corrected after the first execution (heat-map peak location and the
  Tuesday-morning figure); the notebook text now matches the measured values.

### Chart fix — dual axes for Yellow vs Green (2026-11-14)

Green carries ~1/80 of Yellow's trips, so shared count axes rendered it invisible. Every count-based comparison
now uses twin y-axes (left = Yellow, right = Green, both colour-coded) in notebooks 01 and 02: duration, fare
and distance histograms, monthly volume, and the airport fare distribution. The airport chart became two panels
with independent axes because grouped bars on a twin axis are unreadable.

Two secondary defects were fixed in the same pass: values above the plot limit are now **excluded** rather than
clipped (clipping produced artificial spikes at the axis edge), and both notebooks state explicitly that bar
heights are not comparable between services, only shapes. Verified by rendering the PNGs.
