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
3.  Evaluate whether a model trained on one taxi service generalizes to
    the other.
4.  Identify the features most useful for predicting trip duration.

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

Use the official TLC page to verify the availability and naming of each
monthly file before downloading.

### Target variable

Create:

`trip_duration_minutes = (dropoff_datetime - pickup_datetime)`

Standardize the Yellow and Green pickup/dropoff timestamp column names
during preprocessing.

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
│   ├── 01_data_preparation_eda.ipynb
│   ├── 02_feature_engineering_modeling.ipynb
│   └── 03_evaluation_comparison.ipynb
│
├── outputs/
│   └── figures/
│
├── src/
│   └── utils.py
│
├── .gitignore
├── pyproject.toml
├── uv.lock
└── README.md
```

Keep raw data out of Git. Do not commit large Parquet files, virtual
environments, or temporary outputs.

------------------------------------------------------------------------

## 4. Notebook plan

### Notebook 01 --- Data Preparation & EDA

**File:** `01_data_preparation_eda.ipynb`

Tasks:

1.  Load Yellow and Green monthly Parquet files.
2.  Inspect file sizes, row counts, column names, data types, and
    missing values.
3.  Compare schemas across months and taxi services.
4.  Standardize common column names.
5.  Create the trip-duration target in minutes.
6.  Identify and handle invalid timestamps, non-positive durations,
    missing values, and implausible records. Document all cleaning
    rules.
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
3.  Decide how to encode categorical features.
4.  Create chronological train, validation, and test splits:
    -   January--April: training.
    -   May: validation and model selection.
    -   June: final test.
5.  Establish a simple baseline, such as predicting the training-set
    median duration.
6.  Train and tune a manageable set of regression models:
    -   Linear Regression.
    -   Decision Tree Regressor.
    -   Random Forest Regressor.
    -   Optionally, HistGradientBoosting Regressor.

Keep preprocessing and model pipelines reproducible. Fit transformations
on training data only.

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
3.  Compare the following experiments:
    -   Yellow-only model.
    -   Green-only model.
    -   Combined Yellow + Green model.
4.  For the combined model, report results separately for Yellow and
    Green test records.
5.  Run cross-service generalization experiments:
    -   Train on Yellow, test on Green.
    -   Train on Green, test on Yellow.
6.  Compare balanced and naturally sized combined training samples if
    the service imbalance is substantial.
7.  Analyze residuals and feature importance.
8.  Summarize findings, limitations, and possible improvements.

**Expected output:** Final comparison tables, evaluation plots, and
conclusions.

------------------------------------------------------------------------

## 5. Experimental design

Keep the main comparisons clearly separated:

  Experiment   Training data    Test data        Purpose
  ------------ ---------------- ---------------- ------------------------------
  A            Yellow           Yellow           Yellow-specific performance
  B            Green            Green            Green-specific performance
  C            Yellow + Green   Yellow + Green   Combined-model performance
  D            Yellow           Green            Cross-service generalization
  E            Green            Yellow           Cross-service generalization

For Experiment C, report metrics separately for each taxi type as well
as overall metrics.

Yellow and Green datasets may differ substantially in size and
geographic coverage. Do not assume that a combined model is
automatically better. Consider a balanced-sample comparison and discuss
the limitations of cross-service evaluation.

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
-   Other fields only known after the trip.

The drop-off timestamp is used only to calculate the target. Document
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

Discuss: - Differences between Yellow and Green services. - Whether
combining services helps. - Whether cross-service transfer is
successful. - Data imbalance and geographic coverage. - Missing or
unreliable fields. - Limitations of the available features and target
definition.

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

-   [ ] Create the project folder and structure.
-   [ ] Initialize the `uv` environment.
-   [ ] Set up VS Code and the Jupyter kernel.
-   [ ] Download the matching Yellow and Green monthly files.
-   [ ] Download the Taxi Zone Lookup CSV.
-   [ ] Start `01_data_preparation_eda.ipynb`.
-   [ ] Audit the files before cleaning or modeling.

**First milestone:** Complete the data audit and confirm that the
selected months have compatible schemas and sufficient valid trip
records. Do not start model training until this is done.
