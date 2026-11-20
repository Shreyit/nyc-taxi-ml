<div align="center">

<img src="assets/hero.svg" alt="Animated yellow and green NYC taxis driving past a night skyline, titled NYC Taxi Trip Duration" width="100%"/>

<br/>

<img alt="Python" src="https://img.shields.io/badge/Python-3.14+-3776AB?style=for-the-badge&logo=python&logoColor=white"/>
<img alt="uv" src="https://img.shields.io/badge/uv-managed-DE5FE9?style=for-the-badge&logo=uv&logoColor=white"/>
<img alt="DuckDB" src="https://img.shields.io/badge/DuckDB-%2B%20Parquet-FFF000?style=for-the-badge&logo=duckdb&logoColor=black"/>
<img alt="LightGBM" src="https://img.shields.io/badge/LightGBM-%2B%20XGBoost-9ACD32?style=for-the-badge&logo=lightgbm&logoColor=white"/>
<img alt="Streamlit" src="https://img.shields.io/badge/Streamlit-app-FF4B4B?style=for-the-badge&logo=streamlit&logoColor=white"/>

**How long will this ride take, and what will it cost?**
A two-stage machine learning pipeline over the full **2025** NYC TLC trip records:
predict trip duration from what is known when the taxi is hailed, then predict the
fare using that predicted duration.

[Status](#status) · [Pipeline](#pipeline) · [Data](#data) · [No peeking](#no-peeking-at-the-future) · [Quickstart](#quickstart)

</div>

---

## What the project predicts

| Stage | Target | Inputs | Output |
|:--:|---|---|---|
| **1** | `duration_min` | pickup time, pickup and drop-off zone, taxi type, geometry, weather, holiday flags, leakage-safe route history | minutes |
| **2** | `fare_amount` | everything in stage 1 **plus the stage-1 duration prediction** and historical fare aggregates | USD |

Both stages use only information available **before** the trip starts. Everything is done in one notebook,
[`notebooks/nyc_taxi_trip_duration.ipynb`](notebooks/nyc_taxi_trip_duration.ipynb).

**Research question:** does knowing the taxi type (Yellow or Green) improve duration predictions, and does a
model trained on one fleet work on the other?

## Status

Status of the final notebook and project components:

| § | Section | State |
|:--:|---|---|
| **1** | **Problem Formulation & Setup** (Environment, dependencies, hardware checks) | **Complete & Executed** |
| **2** | **Raw Data Audit & Integrity** (DuckDB inspection across 49.3M raw TLC records) | **Complete & Executed** |
| **3** | **Cleaning & Quality Waterfall** (Multi-stage filtering yielding 45.1M clean trips) | **Complete & Executed** |
| **4** | **Exploratory Data Analysis** (Spatiotemporal dynamics & 80:1 Yellow vs Green disparities) | **Complete & Executed** |
| **5** | **Feature Engineering & Pre-Trip Guardrails** (Hourly weather, holidays, leakage-free history) | **Complete & Executed** |
| **6** | **Chronological Partitioning & Sampling** (Train Jan–Aug, Val Sep–Oct, Test Nov–Dec) | **Complete & Executed** |
| **7** | **Stage 1: Trip Duration Model** (Baselines, ML suite, SHAP beeswarm, learning curve, fleet transfer) | **Complete & Executed** (Test MAE: **4.63 min**) |
| **8** | **Stage 2: Metered Fare Model** (Forward-pass duration integration, upper bound, SHAP, learning curve) | **Complete & Executed** (Test MAE: **$5.04**) |
| **9** | **System Integration & Pipeline Evaluation** (End-to-end two-stage serving & error propagation) | **Complete & Executed** |
| **10** | **Limitations & Edge Cases** (Residual anomalies, airport flat rates, out-of-distribution extremes) | **Complete & Executed** |
| **11** | **Conclusion & Responsible AI** (Fairness audit across boroughs, deployment recommendations) | **Complete & Executed** |
| **—** | **Streamlit Web Application** (`app/streamlit_app.py` interactive 3D map & serving engine) | **Complete & Verified** |

**Split:** train Jan–Aug · validation Sep–Oct · test Nov–Dec 2025 (strict chronological, no shuffling).  
**Models:** Median and route-history baselines, Linear Regression, Decision Tree, Random Forest, HistGradientBoosting, LightGBM, XGBoost, and FAISS KNN.  
**Official Metrics:** MAE (primary), RMSE, $R^2$, and MedAE, reported overall and per taxi fleet. All 81 cells executed with zero errors.

## Pipeline

<img src="assets/pipeline.svg" alt="Pipeline: raw TLC data for 2025, then data audit and EDA, then preprocessing and feature engineering, then two parallel models for duration and fare, then evaluation and explainability, ending in an integrated prediction pipeline" width="100%"/>

External inputs — the TLC zone lookup and shapefile, hourly weather, and the holiday calendar — enter
during feature engineering, together with the leakage-safe route and fare history built from earlier months only.

## Data

Official [TLC Trip Record Data](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page) for
calendar year **2025**, Yellow and Green taxis:

| | Yellow | Green | Total |
|---|---:|---:|---:|
| Raw rows (Jan–Dec 2025) | 48,722,602 | 591,375 | 49,313,977 |
| Used for modelling | 44,511,782 (91.4%) | 559,224 (94.6%) | 45,071,006 |

Plus the TLC zone lookup and shapefile, hourly weather for Central Park from the Open-Meteo
archive, and the 2025 US federal and New York State holiday calendars. Standard FHV records are
excluded because they lack the pickup/drop-off and fare fields this task needs.

Every monthly file is downloaded by a restartable script that validates the Parquet footer, records a
SHA-256 and row count in `data/raw/manifest_2025.json`, and skips files that are already valid.
Nothing is assumed about availability: all 24 files were verified live before the pipeline was written.

## Two very different fleets

<img src="assets/imbalance.svg" alt="Bar chart: 44,511,782 Yellow trips vs 559,224 Green trips, about 80 to 1" width="100%"/>

Yellow outnumbers Green by roughly **80 to 1** and concentrates in Manhattan and at the airports.
Green cabs (Boro Taxis) cannot take street hails in most of Manhattan and mostly serve the outer
boroughs, which is why every result in this project is reported per taxi type rather than pooled.

## No peeking at the future

| Allowed before the trip | Excluded (only known after it) |
|---|---|
| Pickup hour, day, month, weekend, rush hour, holiday | Drop-off timestamp, actual duration |
| Pickup & drop-off zone, borough, zone centroids | Metered `trip_distance` |
| Haversine and grid distance from zone geometry | `fare_amount`, `tip_amount`, `total_amount` |
| Weather at the pickup hour, taxi type | Tolls, surcharges, `congestion_surcharge`, `cbd_congestion_fee` |
| Route/zone history built from **earlier months only** | `RatecodeID`, `payment_type`, `store_and_fwd_flag` |

Two consequences worth stating plainly: expected duration accuracy is modest, because the model
never sees the route actually driven; and fare predictions must combine a metered fare estimate with
history, because tips and tolls are unknowable in advance.

## Repository layout

```text
nyc-taxi-ml/
├── app/                      interactive Streamlit web app (streamlit_app.py)
├── assets/                   README graphics and hero illustration
├── data/
│   ├── raw/                  (git-ignored) monthly TLC Parquet files (~800 MB)
│   ├── processed/            (git-ignored) full cleaned 2025 parquet (1.6 GB)
│   └── external/             (tracked) hourly 2025 weather, centroids and holiday calendar
├── notebooks/
│   └── nyc_taxi_trip_duration.ipynb   fully executed master notebook (all outputs & plots saved)
├── outputs/
│   ├── figures/              (tracked) 16 official evaluation and diagnostic plots
│   ├── lookup/               (tracked) fast runtime spatial lookup parquets
│   └── models/               (tracked) trained duration & fare LightGBM models + feature schemas
├── scripts/                  get_data.py (download), export_serving_artifacts.py (serving export)
├── src/serving/              predictor.py (two-stage inference engine)
├── tests/                    test_serving.py (serving smoke tests)
└── docs/
    └── PROJECT_DOCUMENTATION.md       exhaustive technical report & architecture documentation
```

## Quickstart

Requires [uv](https://docs.astral.sh/uv/). The raw data (~860 MB) is **not in Git**; download it once:

```bash
git clone https://github.com/Shreyit/nyc-taxi-ml.git
cd nyc-taxi-ml
uv sync                                # creates .venv with all dependencies
uv run python scripts/get_data.py      # downloads the 24 monthly files + zone files into data/raw/
```

After the download, run the full pipeline in **`notebooks/nyc_taxi_trip_duration.ipynb`** using the `nyc-taxi-ml (3.15.1)` kernel.

### Running the Web Application

To launch the real-time Streamlit web app:

```bash
uv run streamlit run app/streamlit_app.py
```

### Running Tests

```bash
uv run pytest tests/test_serving.py
```

## Documentation

The complete, exhaustive technical documentation is consolidated in:

* 📄 **[`docs/PROJECT_DOCUMENTATION.md`](docs/PROJECT_DOCUMENTATION.md)**: Comprehensive technical documentation covering problem formulation, data dictionary, cleaning waterfall, leakage controls, two-stage modeling benchmarks, fleet fairness analysis, permutation feature importance, responsible AI, and architecture decisions.

## Responsible use

TLC records are public and de-identified, and locations are only given at taxi-zone level. The models
predict trip duration and fare; they do not explain *why* a trip is slow, so no causal claims are made.
Errors are reported by taxi type, pickup borough, hour and trip length, because areas with fewer trips may
receive less accurate predictions. These are estimates to support human
judgement, not a substitute for it.

---

<div align="center">
<sub>Data: <a href="https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page">NYC Taxi &amp; Limousine Commission</a> ·
Weather: <a href="https://open-meteo.com/">Open-Meteo</a> ·
Built for <i>Introduction to Machine Learning</i>, School of Analytics, TISS</sub>
</div>
