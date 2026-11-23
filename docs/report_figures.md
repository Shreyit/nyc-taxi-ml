# Report figures: map for the LaTeX version

Each figure placeholder in `docs/report.md` and the image file it uses (all in `outputs/figures/`).
In LaTeX, add `\tableofcontents`, `\listoffigures` and `\listoftables` after the title page; tables are numbered automatically.

| Figure | Caption | Report section | Notebook section | Image file |
|---|---|---|---|---|
| 1 | Distribution of trip duration for Yellow and Green | 2.3 | §4.1 | `duration_distribution.png` |
| 2 | Median trip duration by hour and weekday | 2.3 | §4.2 | `duration_by_hour.png` (or `duration_weekday_hour.png`) |
| 3 | Median trip duration by month | 2.3 | §4.3 | `trend_by_month.png` |
| 4 | Trips and median duration by borough | 2.3 | §4.4 | `borough_matrix.png` |
| 5 | Trips removed by each cleaning rule | 3.2 | §3.4 | `cleaning_steps.png` |
| 6 | Validation MAE of all duration models | 5.2 | §7.7 | `model_comparison.png` |
| 7 | Predicted vs actual duration on the test months | 5.4 | §7.10 | `duration_test_errors.png` |
| 8 | Research question experiments | 6.2 | §7.9 | `taxi_type_research.png` |
| 9 | Error by trip length, borough and hour | 6.3 | §7.11 | `duration_error_breakdown.png` |
| 10 | Permutation importance and SHAP summary (duration) | 6.4 | §7.12 | `duration_feature_importance.png` |
| 11 | Learning curve of the duration model | 6.5 | §7.13 | `duration_learning_curve.png` |

Tables shown only as placeholders (to build from notebook output):
- Trips per month by taxi type (report 2.1, notebook §2)
- Route history of JFK Airport → Times Square by month (report 3.4, notebook §5.3)
- Full list of the 42 model inputs (Appendix C, `outputs/models/feature_columns.json`)

Old files from an earlier run, not used: `error_breakdown.png`, `permutation_importance.png`, `test_errors.png`.
