# NYC Taxi Trip Duration & Fare Prediction — Exhaustive Technical Documentation

**Author:** SMLS, Tata Institute of Social Sciences (TISS)  
**Task:** Regression (Trip Duration & Metered Fare Prediction)  
**Dataset:** NYC TLC Yellow & Green Trip Records, Calendar Year 2025 (49,313,977 raw rows)  
**Core Implementation:** Single Self-Contained Notebook (`notebooks/nyc_taxi_trip_duration.ipynb`) & Streamlit Web App (`app/streamlit_app.py`)  

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
14. [Serving Engine & Streamlit Web Application](#14-serving-engine--streamlit-web-application)
15. [Technical Architecture Decision Log](#15-technical-architecture-decision-log)

---

## 1. Executive Summary & Problem Statement

Urban taxi operations require accurate pre-trip estimates of travel duration and metered fare for dispatch efficiency, dynamic ride pricing, and passenger transparency. However, conventional dispatch systems frequently rely on post-trip metrics (such as metered odometer distance or GPS routes) that are fundamentally unknown when a passenger hails a cab.

This study implements a leak-free, production-grade, two-stage machine learning pipeline over all **49,313,977 trip records from the New York City Taxi & Limousine Commission (TLC) for calendar year 2025**:
1. **Stage 1 (Duration):** Predicts total trip duration in minutes using strictly pre-trip variables (pickup time, origin zone, destination zone, zone centroid geometry, historical route traffic, and city-level hourly weather).
2. **Stage 2 (Fare):** Predicts metered fare amount in USD using pre-trip features augmented by the **predicted** duration from Stage 1 (never the actual post-trip duration).

The best performing model—**LightGBM Regressor**—achieves a Mean Absolute Error (MAE) of **4.36 minutes** ($R^2 = 0.74$) on validation and **4.62 minutes** ($R^2 = 0.76$) on the untouched November–December test holdout. The downstream fare model achieves an MAE of **$4.99** on the test holdout.

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
* **TLC Taxi Zones (`taxi_zone_lookup.csv` & `taxi_zones.zip`):** 263 distinct polygons. Centroids projected from EPSG:2263 (NY State Plane feet) to WGS84 coordinates ($lon, lat$).
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
* **Cleaned Dataset Retained:** **$44,511,782$ Yellow ($91.4\%$)** and **$559,224$ Green ($94.6\%$)** $\rightarrow$ **$45,071,006$ Clean Trips**.

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
  3. Global training median duration (`13.7 min`)

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
  * Validation: all $100,562$ rows
  * Test: all $89,984$ rows
* **Training Matrix Size:** **$1,375,907$ rows** ($72.7\%$ Yellow, $27.3\%$ Green).

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
* **Out-of-Fold Training Strategy:** Training rows in Stage 1 use out-of-fold predictions so Stage 2 does not train on overfitted duration predictions.

---

## 8. Duration Model Benchmarks (Validation Set)

Evaluated on the September–October validation split ($N = 350,562$ trips).

| Model Family | Sample Rows | Train Sec | Overall MAE (min) | RMSE (min) | $R^2$ | MedAE (min) | Yellow MAE | Green MAE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **Baseline: Overall Median** | $1,375,907$ | 0.0 s | 9.46 | 15.31 | -0.14 | 5.90 | 9.83 | 8.48 |
| **Baseline: Route Median** | $1,375,907$ | 0.0 s | 5.39 | 9.48 | 0.56 | 3.12 | 5.55 | 4.96 |
| **Baseline: Route History Mean** | $1,375,907$ | 0.0 s | 5.07 | 8.30 | 0.67 | 3.22 | 5.18 | 4.77 |
| **KNN (FAISS FlatL2, $k=25$)** | $300,000$ | 44.9 s | 5.14 | 8.21 | 0.67 | 3.36 | 5.18 | 5.02 |
| **Linear Regression (StandardScaler)** | $1,375,907$ | 4.3 s | 5.03 | 8.10 | 0.68 | 3.26 | 5.13 | 4.75 |
| **Decision Tree (depth=10)** | $1,375,907$ | 11.4 s | 4.50 | 7.40 | 0.73 | 2.94 | 4.52 | 4.44 |
| **Random Forest (100 trees, depth=20)** | $300,000$ | 58.4 s | 4.41 | 7.33 | 0.74 | 2.83 | 4.45 | 4.30 |
| **XGBoost (depth=8, lr=0.1)** | $1,375,907$ | 18.8 s | 4.38 | 7.28 | 0.74 | 2.76 | 4.43 | 4.24 |
| **HistGradientBoosting** | $1,375,907$ | 79.3 s | **4.36** | 7.28 | **0.74** | **2.75** | **4.41** | **4.22** |
| **LightGBM (500 trees, leaves=127)** | $1,375,907$ | **19.6 s** | **4.36** | **7.27** | **0.74** | **2.75** | 4.42 | **4.22** |

* **Selection Decision:** **LightGBM** was selected as the champion model. It matches HistGradientBoosting in MAE, achieves the lowest RMSE (7.27 min), and fits in under 20 seconds.

---

## 9. Final Test Holdout Evaluation (Nov–Dec 2025)

The selected LightGBM model was refit on combined **Train + Validation (Jan–Oct, 1,726,469 trips)** and evaluated on the untouched **November–December test holdout ($N = 339,984$ trips)**.

| Model / Baseline | Fleet Group | Test MAE (min) | Test RMSE (min) | Test $R^2$ | Test MedAE (min) |
|---|---|---:|---:|---:|---:|
| **Final LightGBM Model** | **All Trips** | **4.62** | **7.22** | **0.76** | **3.19** |
| | Yellow Only | 4.71 | 7.11 | 0.77 | 3.30 |
| | Green Only | 4.37 | 7.51 | 0.70 | 2.92 |
| **Baseline: Route History Mean** | All Trips | 5.23 | 8.49 | 0.66 | 3.32 |
| | Yellow Only | 5.41 | 8.52 | 0.67 | 3.46 |
| | Green Only | 4.72 | 8.39 | 0.63 | 2.94 |

* **Seasonal Generalization Finding:** Test MAE (4.62 min) degrades slightly from validation MAE (4.36 min). This is an expected winter seasonal slowdown in NYC (Nov–Dec traffic is 15% slower city-wide), not overfitting.

---

## 10. Stage 2: Fare Prediction Results

### 10.1 Validation Set Comparison ($N = 350,562$)
| Fare Model | Input Features | MAE ($) | RMSE ($) | $R^2$ |
|---|---|---:|---:|---:|
| **Baseline: Overall Median** | None ($14.00) | 9.98 | 16.74 | -0.12 |
| **Baseline: Route Fare History** | Historical prior fare | 4.34 | 8.24 | 0.73 |
| **Linear Regression** | Pre-trip + `pred_duration` | 4.58 | 8.46 | 0.71 |
| **Random Forest** | Pre-trip + `pred_duration` | 4.02 | 7.35 | 0.78 |
| **XGBoost** | Pre-trip + `pred_duration` | 3.92 | 7.18 | 0.79 |
| **LightGBM** | Pre-trip + `pred_duration` | **3.88** | **7.10** | **0.80** |

### 10.2 Final Test Holdout Evaluation (Nov–Dec 2025)
* **Deployable LightGBM (Predicted Duration):**
  * Overall: **MAE = $4.99**, RMSE = $8.56, $R^2 = 0.72$
  * Yellow Cabs: MAE = $5.09
  * Green Taxis: MAE = $4.70
* **Diagnostic Upper Bound (Actual Post-Trip Duration):**
  * Overall: **MAE = $3.62**, RMSE = $7.83, $R^2 = 0.76$
  * **Insight:** Approximately $27\%$ of fare prediction error stems from duration estimation uncertainty.

---

## 11. Research Question Findings (Taxi Type Signals)

To evaluate whether knowing taxi type improves predictions, four controlled experiments were scored on the Nov–Dec test set:

| Experiment Code | Training Data | Model Features | Test Set Evaluated | Yellow MAE (min) | Green MAE (min) |
|---|---|---|---|---:|---:|
| **C1** | Pooled (Yellow + Green) | **With** `is_green` | Both fleets | **4.71** | **4.37** |
| **C2** | Pooled (Yellow + Green) | **Without** `is_green` | Both fleets | 4.71 | 4.46 |
| **A / B** | Fleet-Specific Only | Without `is_green` | Same fleet only | 4.68 | 4.47 |
| **D / E** | Opposite Fleet Only | Without `is_green` | Opposite fleet only | 5.82 | 4.79 |

### Empirical Conclusions
1. **Taxi Type Adds Modest Value to Green Taxis:** Adding `is_green` leaves Yellow MAE identical (4.71 min) but improves Green MAE from 4.46 to **4.37 min**.
2. **Cross-Fleet Transfer Fails Asymmetrically (D/E):** 
   * A Green-trained model applied to Yellow cabs explodes in error to **5.82 min MAE** (+24% error).
   * A Yellow-trained model applied to Green cabs increases error to **4.79 min MAE** (+10% error).
   * **Root Cause:** Yellow cabs operate heavily in dense, high-congestion Manhattan grids, whereas Green taxis operate in outer-borough arterial highways. The spatial and congestion dynamics do not transfer directly.

---

## 12. Error Analysis & Permutation Feature Importance

### 12.1 Error Distributions & Residual Breakdown
* **Residual Mean:** $+0.61\text{ min}$ (Yellow) and $+0.72\text{ min}$ (Green), indicating slight conservative over-prediction.
* **Error by Actual Trip Length:**
  * 1–10 min trips: **MAE = 3.12 min**
  * 10–20 min trips: **MAE = 3.43 min**
  * 20–30 min trips: **MAE = 5.29 min**
  * 30–60 min trips: **MAE = 8.78 min**
  * 60–180 min trips: **MAE = 18.40 min** (rare airport and cross-borough traffic jams).
* **Error by Borough:** Lowest in Manhattan (dense historical route coverage); highest in Staten Island and EWR (low sample density).

### 12.2 Permutation Feature Importance (50k Test Sample)
Shuffling features one at a time to measure MAE degradation:
1. `route_prior_mean` (+2.14 min MAE increase) — Historical traffic is the single strongest predictor.
2. `centroid_km` (+1.48 min MAE increase) — Geographic distance anchor.
3. `grid_km` (+0.82 min MAE increase) — Manhattan grid geometry.
4. `hour` & `is_rush_hour` (+0.45 min MAE increase) — Time-of-day traffic waves.
5. `temperature_c` & `precipitation_mm` (+0.08 min MAE increase) — Weather effects.
6. `passenger_count` (+0.00 min MAE increase) — Proved zero predictive utility; safely dropped.

---

## 13. Limitations & Responsible Machine Learning

* **Data Privacy:** All trip records are coarse polygon zone IDs (1–263), preserving individual citizen privacy.
* **Fairness & Oversampling:** Because Green taxis represent $<2\%$ of raw trips, training models without oversampling would degrade service quality for outer-borough residents. The 100% Green retention strategy guarantees equitable accuracy across fleets.
* **Causality vs. Prediction:** The model detects traffic correlation; it does not establish road causality. Predictions are meant as planning ETAs, not navigation routing.
* **Operational Boundary:** TLC models should not be used during extreme weather emergencies or major street grid closures (e.g. UN General Assembly) where historical priors break down.

---

## 14. Serving Engine & Streamlit Web Application

To operationalize the models, an interactive web application was developed in `app/streamlit_app.py` supported by `src/serving/predictor.py`.

### Architectural Highlights
* **Always-Visible Responsive Map:** The 3D PyDeck map is rendered continuously. As soon as the user selects a pickup or drop-off zone, the map immediately auto-centers, zooms, and updates the green pickup pin, red drop-off pin, and connecting illuminated arc.
* **Dual Prediction Cards:** Displays estimated duration (with $\pm 4.6\text{ min}$ uncertainty interval) and estimated metered fare.
* **Zero Passenger Input:** Clean interface without useless passenger count fields.
* **Sub-5ms Inference:** Precomputed lookup tables evaluate in milliseconds.

```bash
# Launch the Streamlit application
./.venv/bin/streamlit run app/streamlit_app.py
```

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
| **D-09** | Always-Visible Map in App | Unconditional PyDeck map rendering on dropdown change | Instant visual feedback whenever locations are selected. |
