# NYC Taxi Trip Duration Prediction

Machine-learning project for predicting 2025 NYC Yellow and Green taxi trip duration from
information available before pickup.

**Final graded deliverable:** [notebooks/nyc_taxi_trip_duration.ipynb](notebooks/nyc_taxi_trip_duration.ipynb)

The implementation is anchored in the original audit, EDA and feature-engineering notebooks:

- [01_data_audit_and_understanding.ipynb](notebooks/01_data_audit_and_understanding.ipynb)
- [02_exploratory_data_analysis.ipynb](notebooks/02_exploratory_data_analysis.ipynb)
- [03_data_preprocessing_and_feature_engineering.ipynb](notebooks/03_data_preprocessing_and_feature_engineering.ipynb)

## Project scope

- Data: full-year 2025 NYC TLC Yellow and Green trip records
- Target: `duration_min = dropoff_datetime - pickup_datetime`
- Split: Jan-Aug train, Sep-Oct validation, Nov-Dec test
- Research question: do calendar, geography, weather, route history and taxi type predict trip duration?
- Evaluation: MAE, RMSE, R² and median absolute error
- Validation: model selection only on Sep-Oct
- Test: Nov-Dec touched once for the final selected model

## Data

The raw data contains 24 monthly TLC Parquet files and the NYC taxi-zone lookup and shapefile.
Raw data, external data and generated Parquet artefacts are not committed to Git.

```bash
uv sync
uv run python scripts/get_data.py
```

The download script is restartable and skips valid files that are already present.

## Reproduce the final notebook

1. Run `uv sync`.
2. Download the raw data with `uv run python scripts/get_data.py`.
3. Open `notebooks/nyc_taxi_trip_duration.ipynb`.
4. Select the `nyc-taxi-ml (3.15.1)` kernel.
5. Run **Restart and Run All**.

The notebook builds cleaned and feature tables directly from `data/raw` and writes figures to
`outputs/figures/`.

## Pipeline

1. Normalize Yellow and Green schemas.
2. Audit missing values, invalid durations, zones, duplicates and target fields.
3. Apply the original cleaning rules.
4. Add zone centroids, straight-line/grid geometry, airport and borough flags.
5. Add temporal, holiday and hourly weather features.
6. Build expanding prior-month route and zone history.
7. Use passenger count with median imputation and preserve its missingness in the audit.
8. Compare medians, route baselines, linear regression, decision trees, random forest,
   HistGradientBoosting, LightGBM, XGBoost and FAISS KNN.
9. Evaluate with-vs-without taxi type and cross-fleet experiments.
10. Report residuals, borough/hour/length errors and permutation importance.

## Leakage controls

- `duration_min`, `fare_amount`, `trip_distance`, tolls, tips, drop-off timestamp and payment fields
  are not used as duration predictors.
- Route history uses only strictly earlier months.
- January is included in training and represents the cold-start history month.
- Month and week-of-year remain available as original calendar features.
- Passenger count is not used to delete rows; missing values are imputed only for model matrices.
- Weather is joined on pickup hour and is city-level, not route-level.
- The test window is not used for model or feature selection.

## Documentation

| Document | Purpose |
|---|---|
| [Project plan](docs/project_plan.md) | Scope, split, feature contract, models and completion criteria |
| [Final workflow](docs/final_notebook_workflow.md) | One-notebook structure and implementation decisions |
| [Decisions](docs/decisions.md) | Technical decision records |
| [Data dictionary](docs/data_dictionary.md) | Raw, external and processed fields |
| [Progress log](docs/progress_log.md) | Executed work and verified outcomes |
| [Project audit](docs/project_audit.md) | Initial repository and methodology audit |

## Tests

```bash
uv run pytest -q
```

Tests are integration checks over the downloaded and processed artefacts.

## Responsible use

This project estimates average trip duration from public, de-identified TLC records. It is not a live
navigation system and does not contain exact street routing or real-time traffic. Results are reported
separately for Yellow and Green taxis because the fleets differ substantially in volume and geography.
