# Project Progress Log

Living log of phases, commands run, and verified results. Anything marked **verified** was actually executed on this machine.

---

## Phase 0 — Existing project audit (2026-11-14)

- Enumerated the repository: one notebook (29 cells), 12 raw 2026 Parquet files, 3 processed 2026 artifacts, 7 EDA figures, `src/` empty, `docs/streamlit_extension_plan.md` (plan only).
- Read the notebook's cleaning, EDA and feature-screening cells; read `README.md`, `NYC_Taxi_ML_Project_Brief.md`, `pyproject.toml`, `.gitignore`.
- **Verified** environment: Python 3.15.1, duckdb 2.0.0, pandas 3.1.1, sklearn 1.9.1, pyarrow 26.0.1, polars 2.1.0. Missing: lightgbm, xgboost, shap, streamlit, holidays, geopandas, fastapi.
- **Verified** protected assets present and untouched: `README.md`, `assets/hero.svg`, `assets/imbalance.svg`.
- **Verified** processed 2026 artifacts: 22,416,956 rows, 2026-01-01 → 2026-06-30, 8 columns only (no fare/distance) → cannot support fare stage.
- **Verified** TLC availability: all 12 × 2025 yellow and 12 × 2025 green files return HTTP 200; lookup CSV and shapefile ZIP return 200.
- **Verified** 2025 schemas via remote Parquet footers: yellow 20 cols (Jan/Jul/Dec identical), green 21 cols (identical), `cbd_congestion_fee` present in all sampled months for both.
- **Verified** sampled 2025 row counts: yellow 3.48 M / 3.90 M / 4.31 M (Jan/Jul/Dec); green 48.3 k / 48.2 k / 48.2 k.
- Wrote `docs/project_audit.md` with the reuse / refactor / replace decisions.

Outcome: existing work is methodologically sound but 2026-bound and stops at duration screening. Reuse the DuckDB engine, cleaning-audit pattern, chronological split and leakage rules; rebuild ingestion, features, both models and serving.
