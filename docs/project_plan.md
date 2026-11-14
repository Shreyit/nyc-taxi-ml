# Phase 1 — Research, Verification and Project Plan

**Date:** 2026-11-14
**Status:** data sources verified with live requests; plan fixed.

---

## 1. Source verification results

### 1.1 TLC trip records (primary data)

Endpoint: `https://d37ci6vzurychx.cloudfront.net/trip-data/{yellow|green}_tripdata_2025-MM.parquet`

| Item | Verified result |
|---|---|
| Yellow 2025 months | 01–12 all HTTP 200 |
| Green 2025 months | 01–12 all HTTP 200 |
| Yellow schema (Jan / Jul / Dec) | 20 columns, **identical across all three** |
| Green schema (Jan / Jul / Dec) | 21 columns, **identical across all three** |
| Yellow extras vs Green | `tpep_*` timestamps, `Airport_fee` |
| Green extras vs Yellow | `lpep_*` timestamps, `ehail_fee`, `trip_type` |
| Congestion fields | `congestion_surcharge` (NY State, $2.50/trip) and `cbd_congestion_fee` (MTA CBD charge, $0.75/trip for yellow/green) present in **both** services for all 2025 months |
| Sampled row counts | yellow 3.48 M (Jan), 3.90 M (Jul), 4.31 M (Dec); green ≈48.2 k/month |
| Estimated 2025 volume | ≈46 M yellow, ≈0.58 M green |

`cbd_congestion_fee` is the MTA Congestion Relief Zone per-trip charge that began 2025-01-05 — it is levied **after** the trip, so it belongs to the post-trip financial block and is excluded from predictors (same treatment as `congestion_surcharge`, which dates from 2019).

Nothing is missing from 2025, so the "document unavailable months" branch does not trigger.

### 1.2 Taxi zones (geometry + lookup)

| Item | Verified result |
|---|---|
| `misc/taxi_zones.zip` | HTTP 200, 1,022,574 bytes, 6 files |
| Shapefile CRS | EPSG:2263 (NY State Plane, feet) |
| Features | **263 polygons**, `LocationID` 1–263 |
| Attributes | `OBJECTID, Shape_Leng, Shape_Area, zone, LocationID, borough` |
| Readability | `pyogrio`/`geopandas` read successfully; JFK (132) centroid = (-73.7865, 40.6470) |
| Lookup CSV | 265 rows (263 zones + 264/265 = "Unknown" placeholders) |

Zones 264 and 265 exist only in the lookup, not the shapefile → they are invalid for modelling and get filtered.

### 1.3 Weather (Open-Meteo Historical Archive)

| Item | Verified result |
|---|---|
| Endpoint | `archive-api.open-meteo.com/v1/archive` |
| Request | lat 40.7812, lon -73.9665, `2025-01-01 → 2025-12-31`, `timezone=America/New_York` |
| Returned | **8,760 hourly rows** = exactly the 2025 hour count, **zero missing values** in every variable |
| Variables | `temperature_2m`, `relativehumidity_2m`, `precipitation`, `rain`, `snowfall`, `windspeed_10m`, `weathercode` |
| Sanity | temp −16.3…39.3 °C, precipitation max 15.4 mm/h, snowfall max 2.52 cm/h, wind max 31.2 km/h |
| Saved | `data/external/nyc_central_park_weather_2025_hourly.parquet` |

**Important caveat recorded:** the API snaps the coordinate to its grid cell and reports **40.8084, -74.0199**, which is ~5 km west of Central Park. The data is a city-level approximation and is documented as such wherever it is used.

### 1.4 Holidays

| Item | Verified result |
|---|---|
| Library | `holidays` 0.108 |
| `holidays.US(years=2025)` | 11 federal holidays (New Year, MLK, Washington's Birthday, Memorial, Juneteenth, Independence, Labor, Columbus, Veterans, Thanksgiving, Christmas) |
| `holidays.US(state="NY")` adds | Lincoln's Birthday (Feb 12), Susan B. Anthony Day (Feb 15), Election Day (Nov 4) |

Decision: federal holidays drive the `is_holiday` flag; NY state days are also carried (`is_ny_state_holiday`) because they are local observances, but the two are kept as separate columns so their effect can be measured rather than assumed.

---

## 2. Environment

`uv add` executed successfully. Now available: `lightgbm 4.7.0`, `xgboost 3.4.1`, `shap 0.54.1`, `streamlit 1.67.0`, `holidays 0.108`, `geopandas 1.2.0`, `pyogrio 0.13.0`, `shapely 2.2.0` — all importable under Python 3.15.1.

---

## 3. Dataset and split

**Primary dataset:** Yellow + Green 2025, months 01–12. No 2026 rows.

| Split | Months | Purpose |
|---|---|---|
| Train | 2025-01 … 2025-08 | Fit models and every learned transformer |
| Validation | 2025-09 … 2025-10 | Model/hyper-parameter selection only |
| Test | 2025-11 … 2025-12 | Touched once, at the end, per model family |

Rationale: 8 months of training covers winter, spring, summer and early autumn demand and two daylight-saving transitions; validation is long enough for a stable ranking (≈8 M yellow rows) without consuming the holiday-heavy end of year; November–December is a genuinely unseen regime (Thanksgiving, holiday shopping, cold weather) — a harder but realistic test. Recorded risk: if test metrics are materially worse than validation, that is a finding about seasonal generalisation, not a bug, and will be reported as such.

---

## 4. Feature contract (identical in notebooks, `src/`, and the app)

### 4.1 Stage 1 — duration, pre-trip only

| Group | Features |
|---|---|
| Temporal | `pickup_hour`, `pickup_hour_frac`, sin/cos hour, sin/cos weekday, `day_of_month`, `month`, `week_of_year`, `day_of_week`, `is_weekend`, `is_rush_hour` (07–10, 16–19), `is_night` (22–06), `time_of_day_bucket`, `is_holiday`, `is_ny_state_holiday`, `days_to_nearest_holiday` |
| Zone | `PULocationID`, `DOLocationID` (categorical), PU/DO borough, same-borough flag, `pu_service_zone` |
| Geometry | `haversine_km`, `manhattan_grid_km` (L1 on lat/lon projected to local metric), `bearing_deg` (+ sin/cos), `centroid_distance` ratio vs. borough pair median |
| Flags | `is_airport_pu`, `is_airport_do`, `is_cbd_pu`, `is_cbd_do`, `cross_borough` |
| Weather (pickup hour) | `temperature_c`, `precipitation_mm`, `snowfall_cm`, `windspeed_kmh`, `is_precipitating` |
| Historical (leakage-safe) | `route_median_duration` (PU→DO, expanding window), `route_trip_count`, `pu_zone_median_duration`, `pu_zone_hour_median_duration`, `global_median_duration_upto` |
| Other | `taxi_type`, `passenger_count` |

### 4.2 Stage 2 — fare, pre-trip + Stage-1 output

Everything above (except the target-derived history, which is recomputed for fare) **plus**:

- `pred_duration_min` — Stage-1 out-of-fold prediction (production input);
- `route_median_fare`, `pu_zone_median_fare` — expanding-window historical fare aggregates;
- `estimated_distance_km` from geometry (never TLC `trip_distance`).

### 4.3 Excluded everywhere (post-trip or leaky)

`trip_distance`, `fare_amount`, `total_amount`, `tip_amount`, `tolls_amount`, `extra`, `mta_tax`, `improvement_surcharge`, `congestion_surcharge`, `Airport_fee`, `cbd_congestion_fee`, `ehail_fee`, `payment_type`, `RatecodeID`, `store_and_fwd_flag`, `VendorID`, `dropoff_datetime`, `trip_duration_minutes`.

`trip_type` (green) is also excluded: it is assigned by dispatch at hail time in a way that correlates with the fare structure and is absent for yellow, making it an incomparable field.

### 4.4 Target definitions

- `duration_min` = dropoff − pickup, minutes. Cleaning window 1–180.
- `fare_amount` = metered fare before tips and tolls. Cleaning window (0, 500] USD for both services: a
  non-positive fare means a voided or corrupted ticket and cannot serve as a regression target, while a fare
  above \$500 is not a city trip. JFK's flat \$70 and similar airport fares are kept, not clipped, and the
  airport flags let the model learn them.

---

## 5. Leakage-control mechanism for historical aggregates

Route and zone aggregates are computed with a **cumulative, month-ordered** procedure: for every row in month *m*, the aggregate uses months 1…*m*−1 only. The first month therefore has no route history and falls back to zone → borough → global medians, which is exactly the cold-start behaviour the app will show for an unseen route. Implementation is a DuckDB self-join on `month` with `SUM(...) OVER (ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)` over a pre-aggregated zone/month table — cheap at 46 M rows because the aggregate table is small.

For Stage 1 → Stage 2, predictions come from a 5-fold **time-series cross-fit** on training months; the final Stage-1 model is then refit on all training months.

---

## 6. Modelling plan (≥7 algorithm families)

**Duration:** median baseline → Linear Regression → Ridge → Decision Tree → Random Forest → LightGBM → XGBoost → HistGradientBoosting. Tune LightGBM/XGBoost on validation (random/coarse grid, early stopping), then refit on train+val for the final test evaluation of the selected model only.

**Fare:** linear baseline → Random Forest → LightGBM → XGBoost, all fed the Stage-1 predicted duration; plus a diagnostic-only variant using actual duration to bound achievable performance.

**Sampling:** Yellow training rows sampled by hash to 3 M for tuning and 6 M for the final fit if runtime demands; Green fully retained (≈0.58 M). Every table records sample sizes and seed. Test evaluation uses the full two-month holdout for the final numbers where feasible, else a 1 M hash sample.

---

## 7. Deliverable map

```text
notebooks/01_data_audit_and_understanding.ipynb
notebooks/02_exploratory_data_analysis.ipynb
notebooks/03_data_preprocessing_and_feature_engineering.ipynb
notebooks/04_duration_prediction.ipynb
notebooks/05_fare_prediction.ipynb
notebooks/06_model_evaluation_and_explainability.ipynb
notebooks/07_end_to_end_pipeline.ipynb
src/ingestion/   download_tlc.py (manifest, resume, validate), download_external.py (weather, zones, holidays)
src/features/    contract.py, build_features.py (DuckDB), aggregates.py
src/models/      train_duration.py, train_fare.py, registry.py
src/evaluation/  metrics.py, reports.py
src/serving/     predictor.py (shared by app)
app/streamlit_app.py
reports/         phase reports + figures + metrics csv
docs/            audit, plan (this), decisions, progress log, methodology, data_dictionary
tests/           ingestion, feature contract, serving smoke tests
```

`README.md`: may be updated now that permission is granted, but `assets/hero.svg` stays embedded and both SVG files stay untouched.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 11 GB free disk | Download raw monthly Parquet (~0.8 GB), process month-by-month into compressed intermediates, delete nothing but keep no duplicate full copies |
| 46 M rows in a laptop notebook | DuckDB SQL for all heavy steps; only aggregates and seeded samples enter Pandas |
| Test window is a seasonal regime change | Report validation and test side by side; discuss degradation rather than hide it |
| Fare target ambiguity (metered vs total) | Primary target `fare_amount`; `total_amount` explored separately and explicitly flagged as tip-driven |
| Airport flat fares distorting regression | Airport flags as features; report error by airport/non-airport; consider a documented cap, not silent removal |
| Weather grid offset from Central Park | Documented; treated as city-level signal |
