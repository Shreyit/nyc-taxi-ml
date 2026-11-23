# NYC Taxi Trip Duration & Fare Prediction — Exhaustive Technical Documentation

**Task:** Regression (Trip Duration & Metered Fare Prediction)  
**Dataset:** NYC TLC Yellow & Green Trip Records, Calendar Year 2025 (49,313,977 raw rows)  
**Core Implementation:** Modeling notebook (`notebooks/nyc_taxi_trip_duration.ipynb`), LightGBM serving engine (`src/serving/predictor.py`), FastAPI service (`api/main.py`), and React frontend (`frontend/`)

---

## Table of Contents
1. [Executive Summary & Problem Statement](#1-executive-summary--problem-statement)
2. [Research Questions & Hypotheses](#2-research-questions--hypotheses)
3. [Raw Data & Data Dictionary](#3-raw-data--data-dictionary)
4. [Data Quality, Audit & Cleaning Waterfall](#4-data-quality-audit--cleaning-waterfall)
5. [Feature Engineering & Temporal Leakage Controls](#5-feature-engineering--temporal-leakage-controls)
6. [Chronological Split & Sampling Strategy](#6-chronological-split--sampling-strategy)
7. [Two-Stage Modeling Architecture](#7-two-stage-modeling-architecture)
8. [Duration Model Benchmarks (Validation Set)](#8-duration-model-benchmarks-validation-set)
9. [Final Test Holdout Evaluation (Nov–Dec 2025)](#9-final-test-holdout-evaluation-novdec-2025)
10. [Stage 2: Fare Prediction Results](#10-stage-2-fare-prediction-results)
11. [Research Question Findings (Taxi Type Signals)](#11-research-question-findings-taxi-type-signals)
12. [Error Analysis & Permutation Feature Importance](#12-error-analysis--permutation-feature-importance)
13. [Limitations & Responsible Machine Learning](#13-limitations--responsible-machine-learning)
14. [Serving Engine, API and React Application](#14-serving-engine-api-and-react-application)
15. [Technical Architecture Decision Log](#15-technical-architecture-decision-log)

---

## 1. Executive Summary & Problem Statement

Urban taxi operations require accurate pre-trip estimates of travel duration and metered fare for dispatch efficiency, dynamic ride pricing, and passenger transparency. However, conventional dispatch systems frequently rely on post-trip metrics (such as metered odometer distance or GPS routes) that are fundamentally unknown when a passenger hails a cab.

This study implements a leak-free, production-grade, two-stage machine learning pipeline over all **49,313,977 trip records from the New York City Taxi & Limousine Commission (TLC) for calendar year 2025**:
1. **Stage 1 (Duration):** Predicts total trip duration in minutes using strictly pre-trip variables (pickup time, origin zone, destination zone, zone centroid geometry, historical route traffic, and city-level hourly weather).
2. **Stage 2 (Fare):** Predicts metered fare amount in USD using pre-trip features augmented by the **predicted** duration from Stage 1 (never the actual post-trip duration).

The best performing model—**LightGBM Regressor**—achieves a Mean Absolute Error (MAE) of **4.37 minutes** ($R^2 = 0.74$) on validation and **4.63 minutes** ($R^2 = 0.76$) on the untouched November–December test holdout. The downstream fare model achieves an MAE of **$5.04** on the test holdout.

---

## 2. Research Questions & Hypotheses

### Primary Research Question
> *Does knowing the taxi fleet type (Yellow medallion vs. Green boro taxi) provide predictive information for trip duration after controlling for pickup time, geography, and weather?*

* **Context:** Yellow cabs have exclusive rights to street hails in Manhattan's central business district (south of East 96th / West 110th St) and airports. Green cabs serve upper Manhattan and outer boroughs (Brooklyn, Queens, Bronx, Staten Island).
* **Experimental Design:**
  * **Experiment C1:** Pooled model (Yellow + Green) **with** the `is_green` indicator feature.
  * **Experiment C2:** Pooled model (Yellow + Green) **without** the `is_green` feature.
  * **Experiment A / B:** Dedicated fleet-specific models trained and tested solely on their own fleet (A: Yellow-only, B: Green-only).
  * **Experiment D / E:** Cross-fleet transfer models trained on one fleet and tested on the other (D: Yellow model tested on Green; E: Green model tested on Yellow).

---

## 3. Raw Data & Data Dictionary

### 3.1 Primary Trip Datasets (24 Monthly Parquet Files)
Downloaded from NYC TLC CloudFront repositories covering all 12 months of 2025.

| Field (Yellow / Green) | Unified Name | Data Type | Role in Pipeline | Notes & Treatment |
|---|---|---|---|---|
| `tpep_pickup_datetime` / `lpep_pickup_datetime` | `pickup_datetime` | `TIMESTAMP` | **Feature / Split Key** | Local NY time. Used for chronological splits and temporal feature extraction. |
| `tpep_dropoff_datetime` / `lpep_dropoff_datetime` | `dropoff_datetime` | `TIMESTAMP` | **Target Derivation** | Used solely to compute `duration_min = (dropoff - pickup) / 60`. **Excluded from predictors.** |
| `PULocationID` | `pu_zone` | `INT` | **Feature** | TLC Taxi Zone ID (1–263). Identifies pickup location. |
| `DOLocationID` | `do_zone` | `INT` | **Feature** | TLC Taxi Zone ID (1–263). Identifies drop-off location. |
| `fare_amount` | `fare_amount` | `DOUBLE` | **Stage 2 Target** | Metered fare in USD. Cleaning filter: (0, 500]. Excluded from Stage 1. |
| `trip_distance` | `trip_distance` | `DOUBLE` | **Diagnostic Only** | Odometer reading. **Strictly excluded from all predictors** as it is only known post-trip. |
| `passenger_count` | `passenger_count` | `INT` | **Dropped** | Missing for 23.8% of Yellow trips; manually entered by drivers; zero predictive correlation. Dropped from feature matrix. |
| `total_amount` | `total_amount` | `DOUBLE` | **Diagnostic Only** | Sum of fare, tips, surcharges, tolls. Excluded (discretionary tipping is unknowable pre-trip). |
| `tip_amount`, `tolls_amount`, `extra`, `mta_tax` | — | `DOUBLE` | **Excluded** | Post-trip financial additions. Excluded everywhere. |
| `congestion_surcharge` | — | `DOUBLE` | **Excluded** | NY State $2.50 surcharge. Levied post-trip; excluded. |
| `cbd_congestion_fee` | — | `DOUBLE` | **Excluded** | MTA Congestion Relief Zone fee (active Jan 5, 2025). Levied post-trip; excluded. |
| `Airport_fee`, `ehail_fee`, `trip_type` | — | `DOUBLE` | **Excluded** | Fleet-specific administrative flags; excluded to maintain cross-fleet parity. |
| `RatecodeID`, `payment_type`, `VendorID` | — | `INT` | **Excluded** | Leaky or administrative metadata; excluded. |

### 3.2 External Geospatial & Environmental Data
* **TLC Taxi Zones (`taxi_zone_lookup.csv` & `taxi_zones.zip`):** 263 distinct polygons. Centroids are computed in EPSG:2263 (NY State Plane, feet) and converted to km for the distance features; WGS84 ($lon, lat$) copies are used only to draw the app map.
* **Hourly Weather (`nyc_central_park_weather_2025_hourly.parquet`):** Central Park station hourly archive from Open-Meteo (8,760 hours, zero nulls). Joined on pickup hour.
* **Holiday Calendar (`nyc_holidays_2025.parquet`):** 11 Federal holidays via Python `holidays` library.

---

## 4. Data Quality, Audit & Cleaning Waterfall

The 2025 raw trip audit revealed substantial data anomalies:
* **Clock Anomalies:** Extreme negative trip durations (down to $-51,472\text{ min}$) and trips extending up to 10 days ($14,881\text{ min}$) due to taxi meter errors.
* **Corrupt Fares:** Negative fares down to $-\$450$ from voided tickets and cancelled hails.
* **Odometer Failures:** 817,668 Yellow and 11,418 Green trips recorded exactly `0.0` miles despite normal fares and 15–20 minute durations. Because metered distance is never a predictor, these rows are retained.

### Cleaning Waterfall (Full Year 2025)
1. **Raw Records:** $48,722,602$ Yellow, $591,375$ Green $\rightarrow$ **$49,313,977$ Total**
2. **File Month Integrity:** Pickup year = 2025 and pickup month = file source month.
3. **Target Bound Filter:** $1.0 \le \text{duration\_min} \le 180.0\text{ minutes}$ (removes zero/sub-minute bounces and overnight meter abandonments).
4. **Valid Zone Boundary:** $1 \le \text{pu\_zone} \le 263$ and $1 \le \text{do\_zone} \le 263$ (drops non-geographic placeholder zones 264 & 265).
5. **Physical Distance Guard:** `trip_distance >= 0.0`.
6. **Valid Fare Range:** $0 < \text{fare\_amount} \le 500.0\text{ USD}$.
7. **Exact Deduplication:** Drops duplicate records matching timestamps, zones, distance, and fare.
* **Cleaned Dataset Retained:** **$44,511,603$ Yellow ($91.4\%$)** and **$559,036$ Green ($94.5\%$)** $\rightarrow$ **$45,070,639$ Clean Trips**.

---

## 5. Feature Engineering & Temporal Leakage Controls

All engineered features are strictly computable before the trip commences:

### 5.1 Geospatial & Geometric Features
* **Centroid Euclidean Distance (`centroid_km`):** Straight-line distance between zone centroids.
* **Manhattan Grid Distance (`grid_km`):** $L_1$ metric distance: $|x_{\text{pu}} - x_{\text{do}}| + |y_{\text{pu}} - y_{\text{do}}|$.
* **Borough Spatial Indicators:** One-hot encoded `pu_borough` and `do_borough` dummies; `same_borough` indicator; `same_zone` indicator.
* **Airport Flags:** `pu_airport` and `do_airport` indicators for JFK (132), LaGuardia (138), and Newark (1).

### 5.2 Temporal & Calendar Features
* **Cyclical Hour Encoding:** $\sin(2\pi \cdot \text{hour} / 24)$ and $\cos(2\pi \cdot \text{hour} / 24)$.
* **Calendar Markers:** `hour`, `weekday` (1–7), `month` (1–12), `week_of_year` (1–52), `is_weekend`, `is_holiday`.
* **Traffic Windows:** `is_rush_hour` (Weekdays 7–9 AM and 4–7 PM).

### 5.3 Weather Features (City-Level Hourly Approximation)
* `temperature_c`, `relative_humidity_pct`, `precipitation_mm`, `snowfall_cm`, `windspeed_kmh`, `is_precipitating`.

### 5.4 Leakage-Safe Cumulative Historical Priors
Route-level and zone-level traffic speeds change over the year. Using overall dataset averages would leak future November/December traffic into January.
* **Cumulative Window Formulation:** For any trip in month $m$, historical aggregates are computed using data from months $1 \le t < m$ only:
  $$\text{route\_prior\_mean}_{pu, do, m} = \frac{\sum_{t=1}^{m-1} \text{total\_duration}_{pu, do, t}}{\sum_{t=1}^{m-1} \text{trip\_count}_{pu, do, t}}$$
* **Cold-Start Fallback Cascade:**
  1. Specific route history (`route_prior_mean`)
  2. Pickup zone history (`pu_prior_mean`)
  3. Overall median duration of the training sample

---

## 6. Chronological Split & Sampling Strategy

### 6.1 Strict Chronological Split
Random train/test splits cause severe temporal leakage in transportation datasets. A chronological split reflects production deployment:
* **Training Set:** January 1 – August 31, 2025 (Months 1–8)
* **Validation Set:** September 1 – October 31, 2025 (Months 9–10) $\rightarrow$ Used exclusively for model and hyperparameter selection.
* **Test Holdout:** November 1 – December 31, 2025 (Months 11–12) $\rightarrow$ Touched **once** for the final score.

### 6.2 Asymmetric Fleet Sampling
NYC taxi trips exhibit an 80:1 fleet imbalance. Uniform sampling would starve models of Green taxi patterns:
* **Yellow Cabs:** Sampled via DuckDB fixed-seed reservoir sampling (`seed=33`):
  * Train: $1,000,000$ rows
  * Validation: $250,000$ rows
  * Test: $250,000$ rows
* **Green Taxis:** **100% retained** across all splits:
  * Train: all $375,907$ rows
  * Validation: all $93,145$ rows
  * Test: all $89,984$ rows
* **Training Matrix Size:** **$1,375,907$ rows** ($72.7\%$ Yellow, $27.3\%$ Green).

### 6.3 Empirical Learning Curves (Both Models & Fleets)
Empirical learning curves evaluate validation MAE across increasing training sample sizes ($N \in [10\text{k}, 50\text{k}, 100\text{k}, 250\text{k}, 500\text{k}, 1.38\text{M}]$) for both production models in Section 11:
* **Stage 1 (Duration Model):**
  - Errors drop sharply from $10\text{k} \to 100\text{k}$ trips as zone geometry is learned.
  - Validation MAE falls from $4.85$ (10k rows) to $4.47$ (500k) and $4.37$ min at the full $1.38\text{M}$ sample; gains get small after a few hundred thousand rows.
  - Remaining error is irreducible aleatoric noise (unobservable traffic lights, double parking, driver speed variation).
* **Stage 2 (Fare Model):**
  - Yellow fare MAE is nearly flat from 50k rows ($\$3.82 \to \$3.64$), because metered fares follow fixed pricing rules once distance and duration are known.
  - Green fare MAE only drops at the full sample ($\approx \$6.5 \to \$4.83$), when all Green trips are included; Green fares need more examples.
* **Takeaway:** For duration, more Yellow rows give small returns; keeping every Green trip matters most. Training on all 45M trips would cost far more compute for a small expected gain (this was not run, so it is an estimate from the curve).

---

## 7. Two-Stage Modeling Architecture

The system predicts duration first, then feeds that prediction forward to fare:

```
[ Pre-Trip Features ] ──► [ Stage 1: Duration Model ] ──► pred_duration_min
         │                                                        │
         └───────────────────────┬────────────────────────────────┘
                                 ▼
                     [ Stage 2: Fare Model ] ──► pred_fare_amount ($)
```

* **No Leaky Inputs:** Stage 2 is fed `pred_duration_min`, **never** actual duration.
* **Out-of-Fold Training Strategy:** Stage 2 is trained on 5-fold out-of-fold duration predictions, so it never sees overfitted in-sample duration predictions.

---

## 8. Duration Model Benchmarks (Validation Set)

Evaluated on the September–October validation split ($N = 343,145$ trips).

| Model Family | Sample Rows | Train Sec | Overall MAE (min) | RMSE (min) | $R^2$ | MedAE (min) | Yellow MAE | Green MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Baseline: Overall Median** | $1,375,907$ | 0.0 s | 9.48 | 15.29 | -0.14 | 5.90 | 9.85 | 8.48 |
| **Baseline: Route Median** | $1,375,907$ | 0.0 s | 5.39 | 9.45 | 0.57 | 3.12 | 5.56 | 4.95 |
| **Baseline: Route History Mean** | — | 0.0 s | 5.08 | 8.30 | 0.66 | 3.22 | 5.19 | 4.77 |
| **Linear Regression (StandardScaler)** | $1,375,907$ | 1.5 s | 5.04 | 8.10 | 0.68 | 3.27 | 5.15 | 4.75 |
| **KNN (FAISS FlatL2, $k=25$)** | $300,000$ | 60.5 s | 5.08 | 8.16 | 0.68 | 3.30 | 5.12 | 4.98 |
| **Decision Tree (depth=10)** | $1,375,907$ | 8.1 s | 4.50 | 7.37 | 0.74 | 2.93 | 4.52 | 4.43 |
| **Random Forest (100 trees, depth=20)** | $300,000$ | 37.1 s | 4.42 | 7.33 | 0.74 | 2.82 | 4.46 | 4.31 |
| **XGBoost (depth=8, lr=0.1)** | $1,375,907$ | 23.6 s | 4.38 | 7.25 | 0.74 | 2.76 | 4.43 | 4.23 |
| **LightGBM (500 trees, leaves=127)** | $1,375,907$ | **21.4 s** | **4.37** | 7.28 | **0.74** | **2.74** | 4.43 | **4.21** |
| **HistGradientBoosting (lr=0.05, leaves=255)** | $1,375,907$ | 78.4 s | **4.36** | 7.27 | **0.74** | **2.74** | **4.42** | 4.23 |

* **Selection Decision:** **LightGBM** was selected as the champion model. It matches HistGradientBoosting in accuracy (4.37 vs 4.36 min MAE) while training about $3.7\times$ faster (21.4 s vs 78.4 s), and it is easy to save and serve in the app.

---

## 9. Final Test Holdout Evaluation (Nov–Dec 2025)

The selected LightGBM model was refit on combined **Train + Validation (Jan–Oct, 1,719,052 trips)** and evaluated on the untouched **November–December test holdout ($N = 339,984$ trips)**.

| Model / Baseline | Fleet Group | Test MAE (min) | Test RMSE (min) | Test $R^2$ | Test MedAE (min) |
|---|---|---:|---:|---:|---:|
| **Final LightGBM Model** | **All Trips** | **4.63** | **7.19** | **0.76** | **3.26** |
| | Yellow Only | 4.72 | 7.08 | 0.77 | 3.38 |
| | Green Only | 4.39 | 7.50 | 0.70 | 2.96 |
| **Baseline: Route History Mean** | All Trips | 5.22 | 8.49 | 0.66 | 3.31 |
| | Yellow Only | 5.40 | 8.53 | 0.67 | 3.45 |
| | Green Only | 4.72 | 8.39 | 0.62 | 2.97 |

* **Seasonal Generalization Finding:** Test MAE (4.63 min) degrades slightly from validation MAE (4.37 min). Section 4.3 of the notebook shows trips get slower over the year and Nov–Dec are the slowest months, so part of the gap is seasonal rather than overfitting. LightGBM still beats the route-history baseline by 0.59 min.

---

## 10. Stage 2: Fare Prediction Results

### 10.1 Validation Set Comparison ($N = 343,145$)
| Fare Model | Input Features | MAE ($) | RMSE ($) | $R^2$ |
|---|---|---:|---:|---:|
| **Baseline: Overall Median** | None ($14.00) | 10.00 | 16.79 | -0.12 |
| **Baseline: Route Fare History** | Historical prior fare | 4.35 | 8.33 | 0.73 |
| **Linear Regression** | Pre-trip + `pred_duration` | 4.59 | 8.58 | 0.71 |
| **Random Forest** | Pre-trip + `pred_duration` | 4.03 | 7.50 | 0.78 |
| **XGBoost** | Pre-trip + `pred_duration` | 3.98 | 7.36 | 0.79 |
| **LightGBM** | Pre-trip + `pred_duration` | **3.93** | **7.31** | **0.79** |

### 10.2 Final Test Holdout Evaluation (Nov–Dec 2025)
* **Deployable LightGBM (Predicted Duration):**
  * Overall: **MAE = $5.04**, RMSE = $8.65, $R^2 = 0.71$
  * Yellow Cabs: MAE = $5.17, RMSE = $8.56, $R^2 = 0.74$
  * Green Taxis: MAE = $4.67, RMSE = $8.91, $R^2 = 0.58$
* **Baseline: Route Fare History:** Overall MAE = $5.11, RMSE = $9.47, $R^2 = 0.65$ (Green: MAE $5.81, $R^2 = 0.28$)
* **Diagnostic Upper Bound (Actual Post-Trip Duration):**
  * Overall: **MAE = $3.66**, RMSE = $8.01, $R^2 = 0.75$
  * Yellow Cabs: MAE = $3.81, RMSE = $8.05, $R^2 = 0.77$
  * Green Taxis: MAE = $3.24, RMSE = $7.90, $R^2 = 0.67$
  * **Insight:** Approximately $27\%$ of fare prediction error stems from duration estimation uncertainty ($3.66$ vs $5.04$ USD).

---

## 11. Research Question Findings (Taxi Type Signals)

To evaluate whether knowing taxi type improves predictions, four controlled experiments were scored on the Nov–Dec test set:

| Experiment Code | Training Data | Model Features | Test Set Evaluated | Yellow MAE (min) | Green MAE (min) |
|---|---|---|---|---:|---:|
| **C1** | Pooled (Yellow + Green) | **With** `is_green` | Both fleets | **4.72** | **4.39** |
| **C2** | Pooled (Yellow + Green) | **Without** `is_green` | Both fleets | 4.74 | 4.47 |
| **A / B** | Fleet-Specific Only | Without `is_green` | Same fleet only | 4.77 | 4.44 |
| **D / E** | Opposite Fleet Only | Without `is_green` | Opposite fleet only | 5.64 | 4.94 |

### Empirical Conclusions
1. **Taxi Type Adds Modest Value to Green Taxis:** Adding `is_green` improves Yellow MAE (4.74 $\to$ **4.72 min**) and noticeably improves Green MAE from 4.47 to **4.39 min**.
2. **Pooling Beats Fleet-Specific Models (C1 vs. A/B):** Training a single unified model on pooled data outperforms training separate models (4.72 vs 4.77 for Yellow; 4.39 vs 4.44 for Green), proving Green cabs benefit from the shared street network volume.
3. **Cross-Fleet Transfer Fails Asymmetrically (D/E):** 
   * A Green-trained model applied to Yellow cabs explodes in error to **5.64 min MAE**.
   * A Yellow-trained model applied to Green cabs increases error to **4.94 min MAE**.
   * **Root Cause:** Yellow cabs operate heavily in dense, high-congestion Manhattan grids, whereas Green taxis operate in outer-borough arterial highways. The spatial and congestion dynamics do not transfer directly.

---

## 12. Error Analysis & Permutation Feature Importance

### 12.1 Error Distributions & Residual Breakdown
* **Residual Mean (predicted − actual):** $+0.74\text{ min}$ (Yellow) and $+0.76\text{ min}$ (Green): a slight over-prediction on average. Short trips are over-predicted and long trips under-predicted (the model pulls extremes toward typical values).
* **Error by Actual Trip Length:**
  * 1–10 min trips: **MAE = 3.32 min**
  * 10–20 min trips: **MAE = 3.38 min**
  * 20–30 min trips: **MAE = 5.15 min**
  * 30–60 min trips: **MAE = 8.73 min**
  * 60–180 min trips: **MAE = 18.25 min** (rare, mostly airport and cross-borough trips stuck in traffic).
* **Error by Borough:** Lowest in Manhattan (dense historical route coverage); highest in Staten Island and EWR (low sample density).

### 12.2 Permutation Feature Importance (50k Test Sample)
Shuffling one feature at a time and measuring how much the test MAE gets worse (values read from `outputs/figures/permutation_importance.png`, approximate):
1. `route_prior_mean` (≈ +4.7 min) — historical duration of the route is by far the strongest signal.
2. `centroid_km` (≈ +1.7 min) — straight-line distance between zone centres.
3. `hour_cos`, `weekday`, `hour` (≈ +0.2 to +0.7 min) — time-of-day and day-of-week traffic patterns.
4. `pu_prior_mean`, `fare_pu_prior_mean`, `grid_km`, `is_green` (≈ +0.1 to +0.3 min) — smaller supporting signals.
5. Weather features do not reach the top 15: city-level hourly weather adds little on top of time and route history.

### 12.3 Dual SHAP Feature Attribution (TreeExplainer for Both Models)
While permutation importance scores global loss of accuracy upon column shuffling, SHAP (SHapley Additive exPlanations) beeswarm plots quantify both magnitude and **directionality** across both stages:
* **Stage 1 (Duration Drivers):**
  - `route_prior_mean`, `centroid_km`, and `grid_km` exhibit the largest spread. High historical minutes and longer distances push predicted duration upward (red dots with positive SHAP).
  - Temporal rush-hour indicators and zone density provide additive calibrations during peak traffic.
* **Stage 2 (Fare Drivers):**
  - Predicted duration (`pred_duration`), centroid distance, and route fare history account for $>85\%$ of attribution.
  - Aligns with TLC rate cards: elapsed travel time and mileage directly generate the metered dollar total.

---

## 13. Limitations & Responsible Machine Learning

* **Data Privacy:** All trip records are coarse polygon zone IDs (1–263), preserving individual citizen privacy.
* **Fairness & Oversampling:** Because Green taxis represent about $1.2\%$ of raw trips, training models without oversampling would degrade service quality for outer-borough residents. The 100% Green retention strategy guarantees equitable accuracy across fleets.
* **Causality vs. Prediction:** The model detects traffic correlation; it does not establish road causality. Predictions are meant as planning ETAs, not navigation routing.
* **Operational Boundary:** TLC models should not be used during extreme weather emergencies or major street grid closures (e.g. UN General Assembly) where historical priors break down.

---

## 14. Serving Engine, API and React Application

The deployed application uses the existing two-stage LightGBM pipeline through
`src/serving/predictor.py`, exposes predictions from `api/main.py` (FastAPI),
and presents the workflow in `frontend/` (React, TypeScript, Vite, and
React-Leaflet). `app/streamlit_app.py` remains in the repository as a legacy
prototype; it is not the current web application.

### Request lifecycle

1. When FastAPI starts, its lifespan handler initializes `TaxiPredictor` and
   loads the tracked models, feature metadata, taxi-zone lookup, and historical
   route/pickup priors.
2. The frontend retrieves the taxi zones from `GET /api/zones`. The zone list
   supplies the IDs, borough/zone names, and centroid coordinates used by the
   selectors and map.
3. The user completes four steps: pickup/drop-off, local departure date/time,
   fleet choice, then result. No prediction request is sent until the user
   submits the final step.
4. `POST /api/predict` runs the predictor once for the selected fleet and once
   for the other fleet, returning both estimates for comparison.
5. The frontend displays the selected route and estimates. “Start a new
   estimate” clears the wizard state so the user can begin again.

### API contract

| Method and path | Request | Response |
|---|---|---|
| `GET /api/health` | None | `{"status":"ok"}` when the predictor is loaded; HTTP 503 otherwise. |
| `GET /api/zones` | None | Array of zones with `location_id`, `borough`, `zone`, `display_name`, `lat`, and `lon`. |
| `POST /api/predict` | `pickup_zone`, `dropoff_zone`, `pickup_at`, and `taxi_type` (`Yellow` or `Green`). | `selected` and `comparison` estimate objects. Invalid zone IDs return HTTP 422. |

Each estimate includes predicted duration and fare, their ranges, pickup and
drop-off names/coordinates, taxi type, and airport/rush-hour/cross-borough
flags. Naive `pickup_at` values are interpreted as `America/New_York`; timezone
aware values are converted to New York time. The interactive OpenAPI schema is
available at `/docs`.

### Frontend behavior and scope

* **Four-step wizard:** Route, departure, fleet, and results. Location fields
  begin empty, progression is disabled until required values are supplied, and
  the reset action clears the full flow.
* **Fixed, responsive map:** Leaflet displays OpenStreetMap tiles, taxi-zone
  centroids, and a straight line between the selected endpoints. This line is
  a visual zone-to-zone preview, not a road-following route or navigation
  instruction. OSM tiles require a network connection and retain the required
  attribution.
* **Model-backed comparison:** Selected and comparison taxi fleets are
  generated by the serving predictor. The UI presents the selected trip,
  duration/fare metrics, and model-returned context; it does not calculate
  predictions in the browser.
* **Responsive estimator layout:** Desktop keeps the map in a fixed framed card
  beside the step carousel; smaller screens stack the map above the controls.
* **Overview hero:** The street photograph is positioned to keep the roadway
  visible through the windshield. Its dashboard is an illustrative SVG (gauges,
  fare meter, radio, vents, climate controls, and steering wheel), not a live
  vehicle interface.
* **Limits shown to users:** Weather is based on the predictor’s seasonal
  baseline, not a live weather feed. Fare estimates are metered fare only and
  do not include tips, tolls, airport fees, or other surcharges.

### Run locally

Requirements: Python 3.14+ and `uv` for the API, plus Node.js 22.12+ and npm
for the frontend. Default Python dependencies are the lean serving set. To run
the analysis notebook, install its optional dependencies with
`uv sync --extra analysis`. The model artifacts and lookup tables are required,
but raw trip downloads and notebook execution are not needed to serve
predictions.

Start the API from the repository root:

```bash
uv sync
uv run uvicorn api.main:app --reload
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Vite proxies `/api` to
`http://127.0.0.1:8000` in development. FastAPI's interactive docs are at
`http://localhost:8000/docs`.

### Deployment to Vercel

The repository is configured as one Vercel project using Vercel Services
(currently Beta). The root [`vercel.json`](../vercel.json) defines two service
roots: `frontend/` for the Vite app and the repository root for FastAPI, with
`api.main:app` as its entrypoint. Rewrites send `/api/*` requests to FastAPI
and all other paths to the frontend. The frontend uses relative `/api/...`
requests, so `VITE_API_BASE_URL` should remain blank for this same-origin
deployment.

The project root in Vercel must remain the repository root. Link and deploy
from the repository root with the Vercel CLI:

```bash
npx vercel@latest login
npx vercel@latest link
npx vercel@latest
npx vercel@latest --prod
```

The base Python dependencies in `pyproject.toml` are limited to serving
requirements. Notebook and model-training packages are in the `analysis`
optional extra and are not installed into the Vercel backend. The backend
service configuration explicitly bundles `outputs/models/` and
`outputs/lookup/`, which the predictor loads at startup; raw TLC files and the
notebook are not needed.

Vercel supports Python 3.14, matching the project's `requires-python`.
Standard Python function bundles are limited to 500 MB, so check the first
deployment's build logs for the final bundle size and runtime initialization
errors. Same-origin requests do not need CORS. If deploying the frontend and
API on different domains instead, set `VITE_API_BASE_URL` to the API origin and
configure the API's comma-separated `CORS_ORIGINS` allowlist. Never put secrets
in `VITE_*` variables; they are public build-time values.

---

## 15. Technical Architecture Decision Log

| ID | Context | Decision | Consequence |
|---|---|---|---|
| **D-01** | 49M raw rows exceed laptop RAM | Use DuckDB SQL for full-dataset aggregates; feed stratified samples to Scikit-learn/LightGBM | Fast, crash-free execution with zero loss of route history. |
| **D-02** | Chronological vs Random Split | Jan–Aug Train, Sep–Oct Val, Nov–Dec Test | Strict prevention of future-to-past temporal data leakage. |
| **D-03** | Severe 80:1 Fleet Imbalance | 100% Green trip retention; sample 1M Yellow | Green cab MAE improved without hurting Yellow accuracy. |
| **D-04** | Cumulative Prior Computation | Month $m$ uses history from months $1 \dots m-1$ only | Preserves strict time-series cross-fit requirements. |
| **D-05** | Zero Odometer Readings (0.0 miles) | Retain rows with valid fares/duration; exclude distance from predictors | Saved 829,086 valid trips from being wrongfully deleted. |
| **D-06** | Passenger Count Utility | Completely drop `passenger_count` from modeling and UI | Eliminates 24% missingness and simplifies user input. |
| **D-07** | Blending vs. Single Model | Retain single LightGBM model for final predictions | Avoids pipeline opacity and preserves clean feature importance. |
| **D-08** | Two-Stage Architecture | Stage 1 predicted duration fed into Stage 2 fare model | Eliminates target leakage while unlocking duration–fare correlation. |
| **D-09** | Web application framework | React + TypeScript frontend, FastAPI inference service | Keeps the interactive client deployable to Vercel while Python serves the existing models. |
| **D-10** | Map rendering | React-Leaflet with OpenStreetMap tiles and attribution | Realistic basemap; the displayed endpoint line is explicitly a centroid preview, not road routing. |
| **D-11** | Estimator interaction | Four-step wizard with final-step-only prediction | Required trip inputs are collected in sequence; predictions are requested only after confirmation. |
| **D-12** | Frontend/API deployment | Use Vercel Services to route Vite and FastAPI from one project and origin | API stays on Vercel; same-origin requests avoid a separate API host and CORS setup. |
| **D-13** | Vercel Python bundle size | Keep serving dependencies in the base project dependencies and analysis tools in an optional extra | Avoid shipping notebook/training packages with the FastAPI function. |
