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
| Fare model | Dropped from the graded notebook (future work / Streamlit extension). Keeps the project focused. |

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
| 7 | Baseline and models | 5 | median baselines, Linear Regression, Decision Tree, Random Forest, HistGradientBoosting |
| 8 | Evaluation on validation, then test | 6 | MAE, RMSE, R², Median AE table |
| 9 | Research question: with vs without `taxi_type` | 6, 7 | C1 vs C2, errors per fleet, cross-fleet D/E |
| 10 | Errors and interpretation | 7 | residuals, error by borough / hour, feature importance |
| 11 | Limitations and responsible use | 8 | |
| 12 | Conclusion | 9 | |

## Corrections from the earlier notebooks

| Earlier | Problem | Final notebook |
|---|---|---|
| Fare `<= 0` rows dropped (2.76 M) | Only needed for a fare target. Those trips have normal durations (median 15.3 min). | Keep them; duration is the only target. |
| Route history partitioned by `taxi_type` | The "without taxi_type" model would still learn the fleet through the history feature, so the C1 vs C2 comparison is unfair. | Route history pooled across fleets. |
| `month`, `week_of_year` as features | Test months (Nov–Dec) never appear in training; trees cannot extrapolate. | Dropped. The trend is carried by the route history from earlier months. |
| `passenger_count` as a feature | ~21% missing in Yellow; the audit itself called it unreliable. | Dropped. |
| Weather features | External download, effect ≈ 0.2–0.3 min in the EDA. | Dropped; mentioned as a limitation. |
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
7. Move notebooks 01–03 to `notebooks/archive/`.
