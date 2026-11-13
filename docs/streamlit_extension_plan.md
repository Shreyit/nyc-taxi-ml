# Extension Plan: Prediction API and Streamlit Demo

> Status: **planned, not started.** This comes after the graded mini project
> (notebooks 01 to 03) is finished. It is not part of the assignment deliverables.

## Goal

Turn the final trained model into a small interactive demo:

- a **FastAPI** backend that takes pre-trip inputs and returns a predicted trip duration;
- a **Streamlit** page where a user picks a pickup time and zones, gets an estimate, and can
  browse the saved benchmark results for Experiments A, B, C1 to C3, D and E;
- both services run with **Docker Compose**.

The same leakage rules as the project apply: the API accepts only information known
when the trip begins.

## How the stack maps to the repo

| Layer | Target path | Responsibility |
|---|---|---|
| Geospatial and artifacts | `src/utils.py` + `outputs/models/` | Compute zone centroids from the TLC shapefile (`taxi_zones.zip`). Export `zone_centroids.parquet`, `route_medians.parquet` (built from **training months only**) and `best_model.joblib`, so inference has no data leakage. |
| FastAPI backend | `api/main.py`, `api/schemas.py` | Accept only pre-trip inputs, build the same features as training in memory (time features, boroughs, centroid distance, route median) and return the predicted duration in minutes. |
| Streamlit frontend | `app/streamlit_app.py` | Call the FastAPI `/predict` endpoint for interactive estimates. Show the saved benchmark tables and figures (PNG or Plotly) for all experiments. |
| Containerization | `Dockerfile`, `docker-compose.yml` | Run `api` (port 8000) and `dashboard` (port 8501) from one slim Python image, with `outputs/models/` mounted read-only. |

## API contract

`POST /predict`

Request (pre-trip only):

| Field | Type | Notes |
|---|---|---|
| `pickup_datetime` | ISO datetime | Used for hour, day of week, month, weekend and rush-hour flags |
| `PULocationID` | int, 1 to 263 | Zones 264/265 (unknown) are rejected, as in training |
| `DOLocationID` | int, 1 to 263 | Same as above |
| `taxi_type` | `"yellow"` or `"green"` | Used only if the deployed model was trained with it (C1); otherwise ignored |

Response:

```json
{ "predicted_duration_min": 14.2, "model": "hist_gradient_boosting", "experiment": "C1" }
```

`GET /health` returns `{"status": "ok"}` and confirms the artifacts loaded.

## Artifacts to export at the end of notebook 03

| File | Built from | Used for |
|---|---|---|
| `best_model.joblib` | Final model retrained on Jan to May | Prediction |
| `route_medians.parquet` | Median duration per (PU, DO) pair, Jan to May only | `route_median_duration` feature, with a fallback for unseen pairs |
| `zone_centroids.parquet` | TLC zone shapefile | `centroid_distance_km` feature |
| `taxi_zone_lookup.csv` | TLC lookup | Borough features and zone names in the Streamlit dropdowns |
| `results/*.csv`, `figures/*.png` | Notebook 03 | Benchmark page |

The feature-building code must live in `src/utils.py` and be imported by **both** the
notebooks and the API, so training and inference compute features the same way.

## Notes and decisions

- **No `passenger_count`.** It was dropped as a feature (about 25% missing in Yellow,
  14% in Green), so the API does not take it.
- **Unseen routes.** If a (PU, DO) pair has no training median, fall back to the same
  default used in training (for example, the PU-zone median or the global median).
- **Model size.** A Random Forest can be hundreds of MB; HistGradientBoosting is much smaller.
  Keep `*.joblib` out of Git (already in `.gitignore`) and share it separately.
- **Honest framing on the page.** State that the estimate uses only time and zones, not live
  traffic, so it is a historical-pattern estimate, not a navigation ETA.
- **New dependencies** (add with `uv add` when starting): `fastapi`, `uvicorn`, `pydantic`,
  `streamlit`, `requests`, `plotly`, `geopandas` (or `pyogrio`) for the shapefile.

## Build order

1. Finish notebooks 01 to 03 and pick the final model.
2. Move feature code into `src/utils.py`; export the artifacts above.
3. Write `api/schemas.py` and `api/main.py`; test with `uvicorn api.main:app --reload` and `/docs`.
4. Write `app/streamlit_app.py` against the running API.
5. Add `Dockerfile` and `docker-compose.yml`; check `docker compose up` serves both ports.
