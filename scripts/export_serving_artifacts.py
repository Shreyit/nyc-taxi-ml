"""
Script to train serving models and export lookup tables for the Streamlit app.
"""

from pathlib import Path
import time
import json
import duckdb
import pandas as pd
import numpy as np
import joblib
from lightgbm import LGBMRegressor

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ROOT / "outputs"
MODELS_DIR = OUTPUTS / "models"
LOOKUP_DIR = OUTPUTS / "lookup"
DATA_RAW = ROOT / "data" / "raw"
DATA_EXT = ROOT / "data" / "external"

MODELS_DIR.mkdir(parents=True, exist_ok=True)
LOOKUP_DIR.mkdir(parents=True, exist_ok=True)

con = duckdb.connect()
con.execute('SET memory_limit = "4GB"')

print("Step 1: Building zone metadata & lookup table...")
zones_df = con.sql(f"""
    SELECT z.LocationID, z.Borough AS borough, z.Zone AS zone,
           COALESCE(c.centroid_lon, -73.98) AS lon,
           COALESCE(c.centroid_lat, 40.75) AS lat
    FROM '{DATA_RAW / "taxi_zone_lookup.csv"}' z
    LEFT JOIN '{DATA_EXT / "zone_centroids.parquet"}' c ON z.LocationID = c.LocationID
    WHERE z.LocationID BETWEEN 1 AND 263
    ORDER BY z.LocationID
""").df()

zones_df['x_km'] = (zones_df['lon'] - (-74.0060)) * 82.5
zones_df['y_km'] = (zones_df['lat'] - 40.7128) * 111.0
zones_df.to_parquet(LOOKUP_DIR / 'zones.parquet', index=False)
print(f"Saved {len(zones_df)} zones to {LOOKUP_DIR / 'zones.parquet'}")

print("Step 2: Computing route and pickup zone historical aggregates...")
route_hist = con.sql(f"""
    WITH trips_sample AS (
        SELECT PULocationID AS pu_zone, DOLocationID AS do_zone,
               date_diff('second', tpep_pickup_datetime, tpep_dropoff_datetime) / 60.0 AS duration_min,
               fare_amount
        FROM read_parquet('{DATA_RAW / "yellow" / "yellow_tripdata_2025-0[1-8].parquet"}')
        WHERE PULocationID BETWEEN 1 AND 263 AND DOLocationID BETWEEN 1 AND 263
          AND fare_amount > 0 AND fare_amount <= 500
        USING SAMPLE 300000 ROWS (reservoir, 33)
    )
    SELECT pu_zone, do_zone,
           count(*)::INT AS route_prior_trips,
           avg(duration_min) AS route_prior_mean,
           avg(fare_amount) AS fare_route_prior_mean
    FROM trips_sample
    WHERE duration_min BETWEEN 1 AND 180
    GROUP BY pu_zone, do_zone
""").df()
route_hist.to_parquet(LOOKUP_DIR / 'route_history.parquet', index=False)

pu_hist = con.sql("""
    SELECT pu_zone,
           avg(route_prior_mean) AS pu_prior_mean,
           avg(fare_route_prior_mean) AS fare_pu_prior_mean
    FROM route_hist
    GROUP BY pu_zone
""").df()
pu_hist.to_parquet(LOOKUP_DIR / 'pu_history.parquet', index=False)

print("Step 3: Extracting training sample for LightGBM duration & fare models...")
t_train = time.time()
train_data = con.sql(f"""
    WITH raw_yellow AS (
        SELECT 'yellow' AS taxi_type, 0 AS is_green,
               tpep_pickup_datetime AS pickup_datetime,
               PULocationID AS pu_zone, DOLocationID AS do_zone,
               fare_amount,
               date_diff('second', tpep_pickup_datetime, tpep_dropoff_datetime) / 60.0 AS duration_min
        FROM read_parquet('{DATA_RAW / "yellow" / "yellow_tripdata_2025-0[1-8].parquet"}')
        WHERE PULocationID BETWEEN 1 AND 263 AND DOLocationID BETWEEN 1 AND 263
          AND fare_amount > 0 AND fare_amount <= 500
        USING SAMPLE 200000 ROWS (reservoir, 33)
    ),
    raw_green AS (
        SELECT 'green' AS taxi_type, 1 AS is_green,
               lpep_pickup_datetime AS pickup_datetime,
               PULocationID AS pu_zone, DOLocationID AS do_zone,
               fare_amount,
               date_diff('second', lpep_pickup_datetime, lpep_dropoff_datetime) / 60.0 AS duration_min
        FROM read_parquet('{DATA_RAW / "green" / "green_tripdata_2025-0[1-8].parquet"}')
        WHERE PULocationID BETWEEN 1 AND 263 AND DOLocationID BETWEEN 1 AND 263
          AND fare_amount > 0 AND fare_amount <= 500
        USING SAMPLE 50000 ROWS (reservoir, 33)
    ),
    combined AS (
        SELECT * FROM raw_yellow UNION ALL SELECT * FROM raw_green
    )
    SELECT c.*,
           hour(c.pickup_datetime) AS hour,
           isodow(c.pickup_datetime) AS weekday,
           month(c.pickup_datetime) AS month,
           week(c.pickup_datetime) AS week_of_year,
           (isodow(c.pickup_datetime) >= 6)::INT AS is_weekend,
           (isodow(c.pickup_datetime) <= 5 AND (hour(c.pickup_datetime) BETWEEN 7 AND 9 OR hour(c.pickup_datetime) BETWEEN 16 AND 19))::INT AS is_rush_hour,
           (h.date IS NOT NULL)::INT AS is_holiday,
           sin(2 * pi() * hour(c.pickup_datetime) / 24) AS hour_sin,
           cos(2 * pi() * hour(c.pickup_datetime) / 24) AS hour_cos,
           (c.pu_zone IN (1, 132, 138))::INT AS pu_airport,
           (c.do_zone IN (1, 132, 138))::INT AS do_airport,
           (c.pu_zone = c.do_zone)::INT AS same_zone,
           (pz.borough = dz.borough)::INT AS same_borough,
           pz.borough AS pu_borough, dz.borough AS do_borough,
           sqrt((pz.x_km - dz.x_km)^2 + (pz.y_km - dz.y_km)^2) AS centroid_km,
           abs(pz.x_km - dz.x_km) + abs(pz.y_km - dz.y_km) AS grid_km,
           COALESCE(w.temperature_c, 15.0) AS temperature_c,
           COALESCE(w.relative_humidity_pct, 60.0) AS relative_humidity_pct,
           COALESCE(w.precipitation_mm, 0.0) AS precipitation_mm,
           COALESCE(w.snowfall_cm, 0.0) AS snowfall_cm,
           COALESCE(w.windspeed_kmh, 12.0) AS windspeed_kmh,
           (COALESCE(w.precipitation_mm, 0) > 0)::INT AS is_precipitating,
           r.route_prior_mean,
           COALESCE(r.route_prior_trips, 0) AS route_prior_trips,
           p.pu_prior_mean,
           r.fare_route_prior_mean,
           COALESCE(r.route_prior_trips, 0) AS fare_route_prior_trips,
           p.fare_pu_prior_mean
    FROM combined c
    JOIN zones_df pz ON c.pu_zone = pz.LocationID
    JOIN zones_df dz ON c.do_zone = dz.LocationID
    LEFT JOIN '{DATA_EXT / "nyc_holidays_2025.parquet"}' h ON c.pickup_datetime::DATE = h.date
    LEFT JOIN '{DATA_EXT / "nyc_central_park_weather_2025_hourly.parquet"}' w
           ON w.weather_hour = date_trunc('hour', c.pickup_datetime)
    LEFT JOIN route_hist r ON c.pu_zone = r.pu_zone AND c.do_zone = r.do_zone
    LEFT JOIN pu_hist p ON c.pu_zone = p.pu_zone
    WHERE c.duration_min BETWEEN 1 AND 180
""").df()

duration_median = float(train_data['duration_min'].median())
fare_median = float(train_data['fare_amount'].median())

train_data['route_prior_mean'] = train_data['route_prior_mean'].fillna(train_data['pu_prior_mean']).fillna(duration_median)
train_data['pu_prior_mean'] = train_data['pu_prior_mean'].fillna(duration_median)
train_data['fare_route_prior_mean'] = train_data['fare_route_prior_mean'].fillna(train_data['fare_pu_prior_mean']).fillna(fare_median)
train_data['fare_pu_prior_mean'] = train_data['fare_pu_prior_mean'].fillna(fare_median)

FEATURES = [
    'is_green', 'hour', 'weekday', 'month', 'week_of_year', 'is_weekend', 'is_rush_hour', 'is_holiday',
    'hour_sin', 'hour_cos', 'temperature_c', 'relative_humidity_pct', 'precipitation_mm', 'snowfall_cm',
    'windspeed_kmh', 'is_precipitating', 'pu_zone', 'do_zone', 'pu_airport', 'do_airport', 'same_zone',
    'same_borough', 'centroid_km', 'grid_km', 'route_prior_mean', 'route_prior_trips', 'pu_prior_mean',
    'fare_route_prior_mean', 'fare_route_prior_trips', 'fare_pu_prior_mean', 'pu_borough', 'do_borough'
]

X_train = pd.get_dummies(train_data[FEATURES], columns=['pu_borough', 'do_borough'], dtype=int)
y_duration = train_data['duration_min']
y_fare = train_data['fare_amount']

print("Step 4: Training Duration LightGBM model...")
duration_model = LGBMRegressor(n_estimators=300, learning_rate=0.1, num_leaves=127, random_state=33, verbose=-1, n_jobs=-1)
duration_model.fit(X_train, y_duration)
joblib.dump(duration_model, MODELS_DIR / 'duration_lgbm.joblib')

print("Step 5: Training Fare LightGBM model (Stage 2 with predicted duration)...")
pred_dur_train = duration_model.predict(X_train)
X_fare_train = X_train.assign(pred_duration=pred_dur_train)
fare_model = LGBMRegressor(n_estimators=300, learning_rate=0.1, num_leaves=127, random_state=33, verbose=-1, n_jobs=-1)
fare_model.fit(X_fare_train, y_fare)
joblib.dump(fare_model, MODELS_DIR / 'fare_lgbm.joblib')

with open(MODELS_DIR / 'feature_columns.json', 'w') as f:
    json.dump(list(X_train.columns), f)

with open(MODELS_DIR / 'medians.json', 'w') as f:
    json.dump({
        'duration_median': duration_median,
        'fare_median': fare_median,
        'feature_columns': list(X_train.columns),
        'fare_feature_columns': list(X_fare_train.columns)
    }, f)

print("Export complete!")
