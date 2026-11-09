# NYC Taxi Trip Duration: Yellow vs Green

## 1. Project overview

**Project type:** Supervised machine learning --- regression\
**Working title:** Comparative Machine Learning of NYC Taxi Trip
Duration

### Research question

Can we predict NYC taxi trip duration using temporal and geographical
features, and does incorporating taxi service type improve predictive
performance?

### Objectives

1.  Build trip-duration prediction models using NYC Yellow Taxi and
    Green Taxi trip records.
2.  Compare model performance when trained on Yellow-only, Green-only,
    and combined datasets.
3.  Test directly whether adding `taxi_type` as a feature improves a
    combined model (same data, with vs without the feature).
4.  Evaluate whether a model trained on one taxi service generalizes to
    the other.
5.  Identify the features most useful for predicting trip duration.
6.  Discuss responsible use: privacy, performance differences across
    areas of the city, and the limits of the predictions.

This is an introductory, experiment-focused data science project. Keep
the implementation understandable and avoid unnecessary infrastructure.

------------------------------------------------------------------------

## 2. Dataset

Use matching monthly NYC TLC Yellow Taxi and Green Taxi trip records.

**Proposed study period:** January--June 2026.

Download the following monthly Parquet files for both services:

-   January 2026
-   February 2026
-   March 2026
-   April 2026
-   May 2026
-   June 2026

Also download the TLC Taxi Zone Lookup CSV.

### Official sources

-   TLC Trip Record Data:
    https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page
-   Taxi Zone Lookup CSV:
    https://d37ci6vzurychx.cloudfront.net/misc/taxi_zone_lookup.csv
-   Yellow Taxi data dictionary:
    https://www.nyc.gov/assets/tlc/downloads/pdf/data_dictionary_trip_records_yellow.pdf
-   Green Taxi data dictionary:
    https://www.nyc.gov/assets/tlc/downloads/pdf/data_dictionary_trip_records_green.pdf

-   Taxi Zone Shapefile (for zone-centroid distances):
    https://d37ci6vzurychx.cloudfront.net/misc/taxi_zones.zip

Use the official TLC page to verify the availability and naming of each
monthly file before downloading. The dataset has been approved by the
course instructor.

### Data audit (verified from the downloaded files)

  Service   Rows (Jan--Jun 2026)   Raw size
  --------- ---------------------- ----------
  Yellow    22,836,530             ~404 MB
  Green     255,175                ~6 MB

-   Yellow has roughly **90× more trips** than Green. This imbalance
    shapes the sampling and experiment design below.
-   Both services share `PULocationID`, `DOLocationID`,
    `passenger_count`, `trip_distance`, and fare columns.
-   Timestamp columns differ: Yellow uses `tpep_pickup_datetime` /
    `tpep_dropoff_datetime`; Green uses `lpep_pickup_datetime` /
    `lpep_dropoff_datetime`.
-   Green-only columns: `trip_type` (street hail vs dispatch),
    `ehail_fee`. Yellow-only column: `Airport_fee`.

### Target variable

Create:

`trip_duration_minutes = (dropoff_datetime - pickup_datetime)`

Standardize the Yellow and Green pickup/dropoff timestamp column names
(to `pickup_datetime` / `dropoff_datetime`) during preprocessing.

Trip durations are strongly right-skewed. Compare training on the raw
target with training on `log1p(trip_duration_minutes)` (predictions
converted back to minutes before evaluation).

### Sampling

Training a Random Forest on ~23 million Yellow rows is not feasible on a
laptop. After cleaning:

-   Use a fixed-seed random sample of Yellow trips (start with about 1--2
    million training rows; adjust if training is too slow).
-   Use all Green trips.
-   Sample the June test set the same way for each service, and record
    the sample sizes and seed in the notebook.

------------------------------------------------------------------------

## 3. Project structure

Create the following folder structure:

``` text
nyc-taxi-ml/
│
├── data/
│   ├── raw/
│   │   ├── yellow/
│   │   └── green/
│   └── processed/
│
├── notebooks/
│   ├── 01_eda.ipynb
│   ├── 02_feature_engineering_modeling.ipynb
│   └── 03_evaluation_comparison.ipynb
│
├── outputs/
│   └── figures/
│
├── src/
│   └── utils.py
│
├── NYC_Taxi_ML_Project_Brief.md
├── ML_Mini_Project_Guidelines.pdf
├── .gitignore
├── pyproject.toml
├── uv.lock
└── README.md
```

Keep raw data out of Git. Do not commit large Parquet files, virtual
environments, or temporary outputs. The whole `data/` folder is listed
in `.gitignore`; the README explains how to download the files so the
project can be reproduced.

Notebooks run in order (01 → 02 → 03). Notebook 02 saves trained models
and predictions (e.g., with `joblib`) so notebook 03 can load them.

------------------------------------------------------------------------

## 4. Notebook plan

### Notebook 01 --- Data Preparation & EDA

**File:** `01_eda.ipynb`

Tasks:

1.  Load Yellow and Green monthly Parquet files.
2.  Inspect file sizes, row counts, column names, data types, and
    missing values.
3.  Compare schemas across months and taxi services.
4.  Standardize common column names.
5.  Create the trip-duration target in minutes.
6.  Identify and handle invalid timestamps, non-positive durations,
    missing values, and implausible records. Document all cleaning
    rules and report row counts before and after each one. Planned
    rules (confirm against the data first):
    -   Drop trips whose pickup timestamp falls outside the month of
        the file it came from (TLC files contain stray dates).
    -   Keep durations within a justified range (starting point: 1 to
        180 minutes); show the distribution that supports the cut-offs.
    -   Treat zones 264 and 265 ("Unknown" / "Outside of NYC") as
        missing location and drop those trips.
    -   Check the share of missing or zero `passenger_count` before
        deciding whether to use it.
7.  Add a `taxi_type` column (`yellow` or `green`).
8.  Combine compatible records where appropriate.
9.  Explore trip-duration distributions and temporal/geographical
    patterns.
10. Save cleaned datasets in `data/processed/`.

Suggested EDA:

-   Trip-duration distributions by taxi type.
-   Trips by hour and day of week.
-   Weekday vs weekend patterns.
-   Monthly trip volume.
-   Pickup and drop-off zone patterns.
-   Yellow vs Green differences.
-   Pickup zones by borough for each service (Green taxis cannot take
    street hails in most of Manhattan, so coverage differs).

**Expected output:** Cleaned, standardized datasets and initial EDA
figures.

### Notebook 02 --- Feature Engineering & Modeling

**File:** `02_feature_engineering_modeling.ipynb`

Tasks:

1.  Load the processed datasets.
2.  Create prediction-time features, such as:
    -   Pickup hour.
    -   Day of week.
    -   Month.
    -   Weekend indicator.
    -   Rush-hour indicator.
    -   Pickup location ID.
    -   Drop-off location ID.
    -   Passenger count, if sufficiently reliable.
    -   Taxi type for combined-model experiments.
    -   **Zone-centroid distance:** straight-line distance between the
        pickup and drop-off zone centroids, computed from the TLC taxi
        zone shapefile. This is a legitimate pre-trip distance estimate
        (it uses only the zone IDs), unlike the actual `trip_distance`.
    -   **Route median duration:** median training-set duration for each
        (pickup zone, drop-off zone) pair, with a fallback for rare or
        unseen pairs. Compute it from the training months only to avoid
        leakage.
    -   Optionally, pickup/drop-off borough from the zone lookup.
3.  Decide how to encode categorical features. Zone IDs have ~260
    levels each:
    -   Tree models / HistGradientBoosting can use them as categorical
        or ordinal codes directly.
    -   For Linear Regression, prefer borough-level one-hot plus the
        distance and route-median features over 2 × 260 one-hot columns.
    -   Use `handle_unknown="ignore"` (or equivalent) so zones unseen in
        training do not break cross-service experiments.
4.  Create chronological train, validation, and test splits:
    -   January--April: training.
    -   May: validation and model selection.
    -   June: final test.
    -   After selecting models on May, retrain the chosen settings on
        January--May before the final June evaluation, and state this
        in the report.
5.  Establish a simple baseline, such as predicting the training-set
    median duration (optionally also a per-route-median baseline).
6.  Train and tune a manageable set of regression models:
    -   Linear Regression.
    -   Decision Tree Regressor.
    -   Random Forest Regressor.
    -   HistGradientBoosting Regressor (fast on large samples; likely
        the strongest model).

Keep preprocessing and model pipelines reproducible (scikit-learn
`Pipeline` / `ColumnTransformer`, fixed `random_state`). Fit
transformations on training data only.

Without actual trip distance, expect a modest R². That is an honest
result for a pre-trip prediction task, not a failure.

**Expected output:** Trained models, predictions, and experiment results
saved for evaluation.

### Notebook 03 --- Evaluation & Comparison

**File:** `03_evaluation_comparison.ipynb`

Tasks:

1.  Evaluate models on the untouched June test period.
2.  Report:
    -   Mean Absolute Error (MAE).
    -   Root Mean Squared Error (RMSE).
    -   R².
    -   Median Absolute Error (robust to the long tail of durations).
3.  Compare the following experiments:
    -   Yellow-only model.
    -   Green-only model.
    -   Combined Yellow + Green model, with and without `taxi_type`.
4.  For the combined model, report results separately for Yellow and
    Green test records.
5.  Run cross-service generalization experiments:
    -   Train on Yellow, test on Green.
    -   Train on Green, test on Yellow.
6.  Compare balanced and naturally sized combined training samples
    (required: the imbalance is about 90:1).
7.  Analyze residuals and feature importance (e.g., permutation
    importance on the test set).
8.  Break down errors by pickup borough to check whether the model
    performs worse in some parts of the city.
9.  Summarize findings, limitations, and possible improvements.

**Expected output:** Final comparison tables, evaluation plots, and
conclusions.

------------------------------------------------------------------------

## 5. Experimental design

Keep the main comparisons clearly separated:

  Experiment   Training data    Test data        Purpose
  ------------ ---------------- ---------------- ------------------------------
  A            Yellow           Yellow           Yellow-specific performance
  B            Green            Green            Green-specific performance
  C1           Yellow + Green   Yellow + Green   Combined, **with** `taxi_type`
  C2           Yellow + Green   Yellow + Green   Combined, **without** `taxi_type`
  C3           Balanced Y + G   Yellow + Green   Combined, equal-sized samples
  D            Yellow           Green            Cross-service generalization
  E            Green            Yellow           Cross-service generalization

For Experiments C1--C3, report metrics separately for each taxi type as
well as overall metrics.

**C1 vs C2 directly answers the research question**: they use the same
training rows, same model, and same test set, and differ only in whether
`taxi_type` is a feature.

Yellow and Green datasets differ substantially in size (~90:1) and
geographic coverage. Do not assume that a combined model is
automatically better. In the naturally sized combined sample, Yellow
dominates the training signal; C3 checks how much that matters.

Cross-service experiments (D, E) involve a distribution shift: Green
pickups are concentrated outside Manhattan's core, so some pickup zones
in the test set will be rare or unseen in training. Report this as a
finding about geographic coverage, not just as lower accuracy.

------------------------------------------------------------------------

## 6. Feature and data leakage rules

The model should only use information plausibly available when the trip
begins.

**Do not use as predictors:**

-   Drop-off timestamp.
-   Actual trip duration.
-   Actual trip distance, unless a genuinely available pre-trip estimate
    is obtained.
-   Fare amount.
-   Tip amount.
-   Tolls.
-   Total amount.
-   Payment type.
-   Surcharges and fees (`extra`, `mta_tax`, `congestion_surcharge`,
    `Airport_fee`, `cbd_congestion_fee`, `improvement_surcharge`,
    `ehail_fee`).
-   `RatecodeID` (the final rate code is set by the trip, e.g., JFK
    flat fare, so it can leak destination/fare information).
-   `store_and_fwd_flag` and `VendorID` (not meaningful for predicting
    duration; document if used).
-   Other fields only known after the trip.

The drop-off timestamp is used only to calculate the target. Route
median durations must be computed from training months only. Document
any additional exclusions.

Potential predictors include pickup time features, pickup and drop-off
zone IDs, passenger count when reliable, and taxi type in combined
experiments.

------------------------------------------------------------------------

## 7. Evaluation and reporting

Use the same final test period and consistent cleaning rules when
comparing models.

-   **MAE:** Average absolute prediction error, in minutes.
-   **RMSE:** Penalizes larger errors more strongly, in minutes.
-   **R²:** Measures variance explained relative to a mean-prediction
    baseline.

Do not rely on R² alone. Include error distributions or residual plots
and interpret performance in the context of trip duration.

Discuss:

-   Differences between Yellow and Green services.
-   Whether combining services helps, and whether `taxi_type` adds
    value (C1 vs C2).
-   Whether cross-service transfer is successful.
-   Data imbalance and geographic coverage.
-   Missing or unreliable fields.
-   Limitations of the available features and target definition.

Explain results in plain language (e.g., "on average the model is off
by about X minutes on a typical trip"), not just as metric values.

### Responsible use (required section in the report)

-   **Data privacy:** TLC trip records are public and de-identified;
    locations are given only as taxi zones, not exact addresses.
-   **Bias and fairness:** compare errors across boroughs and between
    services. Areas with fewer trips (mostly outside Manhattan, and
    Green in general) may get less accurate predictions.
-   **Interpretability:** report which features matter most, and state
    what cannot be concluded from them.
-   **Overclaiming:** the models predict duration; they do not explain
    why trips take longer. Avoid causal claims (e.g., "rush hour causes
    X extra minutes").
-   **Practical use:** predictions are estimates with sizeable errors on
    long or unusual trips and should support, not replace, human
    judgement (e.g., for driver pay or dispatch decisions).

### Mapping to the course report structure

  Course report section            Source in this project
  -------------------------------- ------------------------------------
  Data description, preprocessing  Notebook 01 + cleaning-rules table
  Models and methods               Notebook 02
  Evaluation, results              Notebook 03, experiment tables
  Limitations, responsible use     Section 7 above
  Appendix (reproducibility)       README (download + run order)

------------------------------------------------------------------------

## 8. Development environment

Use:

-   **Python**
-   **uv** for environment and dependency management
-   **VS Code** as the editor
-   **Jupyter notebooks** for analysis
-   **DuckDB / Polars** for efficient Parquet inspection and processing
-   **pandas / NumPy** for data manipulation
-   **scikit-learn** for modeling and evaluation
-   **Matplotlib / Seaborn / Plotly** for visualization
-   **Git and GitHub** for version control

Start locally on the MacBook Air. These experiments do not require a GPU
or cloud infrastructure.

Suggested initial setup:

``` bash
mkdir nyc-taxi-ml
cd nyc-taxi-ml

uv init --bare
uv venv

uv add pandas numpy polars pyarrow duckdb
uv add scikit-learn scipy
uv add matplotlib seaborn plotly
uv add jupyterlab ipykernel

mkdir -p data/raw/yellow data/raw/green data/processed
mkdir -p notebooks outputs/figures src
```

Open the folder in VS Code and select the project's `.venv` Python
interpreter and Jupyter kernel.

------------------------------------------------------------------------

## 9. Working guidelines for coding agents

Use coding agents as assistants, but keep the analysis and decisions
understandable.

When asking an agent to work:

1.  Give it the project objective and the relevant notebook/task.
2.  Ask it to inspect the actual dataset schema before writing
    assumptions into code.
3.  Ask for small, reviewable changes rather than generating the entire
    project at once.
4.  Require explanations for cleaning rules, feature choices, and model
    settings.
5.  Ask it to avoid target leakage and data leakage.
6.  Keep train/validation/test periods chronological.
7.  Ask it to check that Yellow and Green data are standardized
    consistently.
8.  Require reproducible code and fixed random seeds where applicable.
9.  Do not let it silently drop large numbers of rows; ask it to report
    row counts before and after each cleaning step.
10. Review and run each notebook section before moving to the next.

**Important:** Do not assume that a file, column, or monthly release
exists. Verify it from the downloaded data and official TLC
documentation.

------------------------------------------------------------------------

## 10. Immediate next steps

-   [x] Create the project folder and structure.
-   [x] Initialize the `uv` environment.
-   [ ] Set up VS Code and the Jupyter kernel.
-   [x] Download the matching Yellow and Green monthly files.
-   [x] Download the Taxi Zone Lookup CSV.
-   [ ] Download the Taxi Zone Shapefile (for centroid distances).
-   [ ] Start `01_eda.ipynb`.
-   [ ] Audit the files before cleaning or modeling.

**First milestone:** Complete the data audit and confirm that the
selected months have compatible schemas and sufficient valid trip
records. Do not start model training until this is done.
