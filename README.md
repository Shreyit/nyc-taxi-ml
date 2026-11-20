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

Status of the final notebook:

| § | Section | State |
|:--:|---|---|
| 1–4 | Setup, first look, cleaning, EDA | written and run |
| 5–6 | Features (incl. weather, fare history), chronological split, sampling | written; re-run needed after the feature update |
| 7–8 | Duration models on validation, final test on Nov–Dec | written; re-run needed after the feature update |
| 9 | Fare prediction (Stage 2) | code written, not run yet |
| 10 | Research question: with vs without taxi type, fleet-specific and cross-fleet models | code written, not run yet |
| 11 | Errors and interpretation (residuals, error by borough/hour/length, permutation importance) | code written, not run yet |
| 12–13 | Limitations, conclusion | draft; final numbers after the full run |
| — | Streamlit app | not started (optional) |

**Split:** train Jan–Aug · validation Sep–Oct · test Nov–Dec 2025 (chronological, no shuffling).
**Models:** median and route-history baselines, Linear Regression, Decision Tree, Random Forest,
HistGradientBoosting, LightGBM, XGBoost, KNN (FAISS). **Metrics:** MAE (main), RMSE, R², median absolute
error, always reported per taxi type.

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
├── assets/                   README graphics
├── data/                     (git-ignored)
│   ├── raw/                  monthly TLC Parquet + zone lookup and shapefile
│   ├── external/             hourly 2025 weather
│   └── processed/            cleaned trips and feature table, built by the notebook
├── notebooks/
│   ├── nyc_taxi_trip_duration.ipynb   the final notebook (the whole project)
│   └── 01–03                          earlier audit, EDA and feature notebooks
├── scripts/                  get_data.py (download), fix_openmp_mac.sh (macOS fix)
├── src/                      ingestion and preprocessing scripts used by notebooks 01–03 and the weather download
├── outputs/figures/          figures saved by the notebook (git-ignored)
├── tests/                    integration checks for the older pipeline
├── tools/                    builders for notebooks 01–03
└── docs/                     audit, plan, decisions, progress log, data dictionary, notebook workflow
```

## Quickstart

Requires [uv](https://docs.astral.sh/uv/). The raw data (~860 MB) is **not in Git**; each of us
downloads it once from the TLC website.

```bash
git clone https://github.com/Shreyit/nyc-taxi-ml.git
cd nyc-taxi-ml
uv sync                                # creates .venv with all dependencies
uv run python scripts/get_data.py      # downloads the 24 monthly files + zone files into data/raw/
uv run python -m src.ingestion.download_external   # hourly 2025 weather -> data/external/
```

On macOS also run `sh scripts/fix_openmp_mac.sh` once (needs `brew install libomp`). faiss and scikit-learn
ship their own copy of OpenMP, LightGBM/XGBoost use Homebrew's, and several copies in one notebook make the
models freeze. The script points them all at the same library. Run it again after `uv sync`.

After the download, `data/raw/` should look like this:

```text
data/raw/
├── yellow/yellow_tripdata_2025-01.parquet … 2025-12.parquet   (12 files, ~840 MB)
├── green/green_tripdata_2025-01.parquet  … 2025-12.parquet    (12 files, ~19 MB)
├── taxi_zone_lookup.csv
└── taxi_zones.zip
```

Then open **`notebooks/nyc_taxi_trip_duration.ipynb`** in VS Code or Jupyter, select the `nyc-taxi-ml (3.15.1)`
kernel and run all cells. The notebook builds `data/processed/` itself.
Re-running `get_data.py` skips files that are already there.

> `data/` is in `.gitignore`, so the data is never committed.

<details>
<summary><b>Older pipeline (scripts used by notebooks 01–03)</b></summary>

```bash
# 1. download and validate the 24 monthly files, zone data, weather and holidays
uv run python -m src.ingestion.download_tlc
uv run python -m src.ingestion.download_external

# 2. build the cleaned dataset and the feature table (DuckDB, ~7 minutes)
uv run python -m src.preprocessing.build_clean_dataset
uv run python -m src.features.build_features

# 3. checks
uv run pytest -q
```

</details>

## Documentation

| File | Contents |
|---|---|
| [`docs/project_audit.md`](docs/project_audit.md) | What existed before this cycle, and what was reused, refactored or replaced |
| [`docs/project_plan.md`](docs/project_plan.md) | Source verification, split, feature contract, modelling plan, risks |
| [`docs/decisions.md`](docs/decisions.md) | Technical decision records, including rejected alternatives |
| [`docs/data_dictionary.md`](docs/data_dictionary.md) | Every column of every table, raw and processed |
| [`docs/progress_log.md`](docs/progress_log.md) | What was run, and what was actually verified |
| [`docs/final_notebook_workflow.md`](docs/final_notebook_workflow.md) | Outline of the final notebook and how it maps to the report |

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
