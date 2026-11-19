# Final Notebook Workflow

One notebook, `notebooks/nyc_taxi_trip_duration.ipynb`, that replaces notebooks 01–03 as the graded
code file. It follows the report structure in `ML_Mini_Project_Guidelines.pdf`, so each notebook section
maps to a report section.

## Scope (decided)

| Item | Decision |
|---|---|
| Data | NYC TLC Yellow + Green, full year 2025 (24 files) |
| Task | Regression: `duration_min` = drop-off − pickup |
| Research question | Can trip duration be predicted from pre-trip time and location features, and does knowing the taxi type (Yellow/Green) improve the prediction? |
| Split | Chronological: Jan–Aug train, Sep–Oct validation, Nov–Dec test |
| Fare model | Implemented as the second stage of the consolidated notebook, fed by predicted duration and leakage-safe fare history. |

## Notebook outline

| # | Section | Report section | Main output |
|---|---|---|---|
| 0 | Title, question, summary | 1, 2 | |
| 1 | Setup | Appendix | imports, paths, seed, DuckDB connection |
| 2 | Data: first look | 3 | file sizes, row counts, schemas, Yellow vs Green columns |
| 3 | Data quality and cleaning | 3, 4 | missing values, invalid rows, cleaning table, clean view |
| 4 | EDA | 3 | duration distribution, hour/weekday, boroughs, distance, Yellow vs Green |
| 5 | Features | 4 | time features, zone/borough, airport flags, centroid distance, route history from earlier months |
| 6 | Train / validation / test + sampling | 4 | split table, sample sizes |
| 7 | Baseline and models | 5 | median baselines, Linear Regression, KNN (FAISS), Decision Tree, Random Forest, HistGradientBoosting, XGBoost, LightGBM |
| 8 | Duration evaluation on validation, then test | 6 | MAE, RMSE, R², Median AE table |
| 9 | Fare prediction: Stage 2 | 5, 6 | OOF duration, fare history, fare baselines/models and end-to-end test |
| 10 | Research question: with vs without `taxi_type` | 6, 7 | C1 vs C2, errors per fleet, cross-fleet D/E |
| 11 | Errors and interpretation | 7 | duration/fare residuals, error by borough/hour/length, feature importance |
| 12 | Limitations and responsible use | 8 | |
| 13 | Conclusion | 9 | |

## Corrections from the earlier notebooks

| Earlier | Problem | Final notebook |
|---|---|---|
| Fare `<= 0` rows removed by the original cleaning contract | The original two-target pipeline requires a usable duration and fare target. | Preserve the original cleaning rule for the final table; documentation must not silently keep fare-invalid rows. |
| Route history partitioned by `taxi_type` | The "without taxi_type" model would still learn the fleet through the history feature, so the C1 vs C2 comparison is unfair. | Route history pooled across fleets. |
| `month`, `week_of_year` as features | Present in the original feature contract and implemented in the consolidated pipeline. | Retained; route history also carries temporal trend. |
| `passenger_count` as a feature | Present in the original pipeline with substantial missingness. | Retained with train-median imputation for model matrices and reported as an uncertainty. |
| Weather features | Present in the original external-data and feature pipeline. | Retained through pickup-hour joins; discussed as city-level rather than route-level. |
| "R² above 0.30 means leakage" (docs/decisions.md D-04) | The route prior alone correlates 0.84 with duration (R² ≈ 0.7). | Leakage checked with explicit tests, not an R² threshold. |
| Wrong numbers in text (removed 10.7%/7.6%, etc.) | Text written separately from outputs. | Every observation is written after running the cell, from the printed numbers. |
| Notebooks depend on `src/` outputs and a weather file | Not reproducible from a fresh clone. | Notebook builds everything from `data/raw` itself. |

## Writing style for the notebook

- Short markdown headings; one line saying what the next cells check.
- Small code cells: one query or one plot each, ending in a visible output.
- After each important output, a few **Observations** bullets with the actual numbers.
- Comments only where the reason is not obvious.
- No long essays in markdown; the report carries the long explanations.

## Build order

1. Sections 0–3 (setup, first look, cleaning) — run and check numbers.
2. Section 4 (EDA).
3. Sections 5–6 (features, split, leakage tests).
4. Sections 7–9 (models, evaluation, research question).
5. Sections 10–12 (errors, responsible use, conclusion).
6. Restart and Run All; check the whole notebook runs end to end.
