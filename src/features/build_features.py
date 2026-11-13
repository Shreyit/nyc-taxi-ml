# Enrich the cleaned 2025 trip table with temporal, geospatial, holiday and weather information.
#
# Everything produced here is available before the trip starts: the pickup timestamp, the two
# zone identifiers and the taxi category. Post-trip fields (duration, fare, actual distance) are
# carried through unchanged as targets or diagnostics, never as model inputs.
#
# Geometry uses zone centroids from the TLC shapefile. Centroids are an approximation: a zone is
# a polygon and the true pickup point inside it is unknown, so distances are systematically
# shorter than metered street distances. This is documented wherever the features are used.
#
# Usage:
#   python -m src.features.build_features

from __future__ import annotations

import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
PROCESSED = ROOT / "data" / "processed"
EXTERNAL = ROOT / "data" / "external"
TMP = ROOT / "data" / "tmp"
TMP.mkdir(parents=True, exist_ok=True)

CLEAN = PROCESSED / "taxi_clean_2025.parquet"
CENTROIDS = EXTERNAL / "zone_centroids.parquet"
WEATHER = EXTERNAL / "nyc_central_park_weather_2025_hourly.parquet"
HOLIDAYS = EXTERNAL / "nyc_holidays_2025.parquet"
OUTPUT = PROCESSED / "taxi_features_2025.parquet"

# Airport zones: 1 = Newark, 132 = JFK, 138 = LaGuardia.
AIRPORT_ZONES = (1, 132, 138)
# The Congestion Relief Zone covers Manhattan at and below 60th Street. Rather than hard-coding a
# list of zone ids, the boundary is taken from the centroid latitude of 60th Street (40.7685).
CBD_LATITUDE_LIMIT = 40.7685
EARTH_RADIUS_KM = 6371.0
KM_PER_DEGREE = 111.32


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET threads TO 6")
    con.execute("SET memory_limit = '6GB'")
    con.execute(f"SET temp_directory = '{TMP}'")
    return con


def main() -> None:
    started = time.time()
    con = connect()

    con.execute(
        f"CREATE OR REPLACE VIEW centroids AS SELECT * FROM read_parquet('{CENTROIDS}')"
    )
    con.execute(f"CREATE OR REPLACE VIEW weather AS SELECT * FROM read_parquet('{WEATHER}')")
    con.execute(f"CREATE OR REPLACE VIEW holidays AS SELECT * FROM read_parquet('{HOLIDAYS}')")

    # Federal holidays drive the main flag; the eleven 2025 dates are also used to compute how far
    # the pickup date sits from the nearest federal holiday (a demand proxy around long weekends).
    con.execute(
        """
        CREATE OR REPLACE VIEW holiday_dates AS
        SELECT date AS holiday_date FROM holidays WHERE is_federal_holiday
        """
    )

    # Pre-rendered SQL fragments: the zone list must be text before interpolation into the query.
    airport_sql = ", ".join(str(zone) for zone in AIRPORT_ZONES)

    con.execute(
        f"""
        CREATE OR REPLACE VIEW trips AS
        WITH base AS (
          SELECT
            t.taxi_type,
            t.pickup_datetime,
            t.duration_min,
            t.fare_amount,
            t.total_amount,
            t.trip_distance_mi,
            t.is_distance_zero,
            (t.trip_distance_mi < 0.1 OR t.trip_distance_mi > 100) AS is_distance_implausible,
            t.passenger_count,
            t.source_month,
            t.pu_zone AS pu_location_id,
            t.do_zone AS do_location_id,
            puz.centroid_lat AS pu_lat,
            puz.centroid_lon AS pu_lon,
            doz.centroid_lat AS do_lat,
            doz.centroid_lon AS do_lon,
            puz.borough AS pu_borough,
            doz.borough AS do_borough,
            puz.zone AS pu_zone_name,
            doz.zone AS do_zone_name
          FROM read_parquet('{CLEAN}') t
          LEFT JOIN centroids puz ON puz.LocationID = t.pu_zone
          LEFT JOIN centroids doz ON doz.LocationID = t.do_zone
        ),
        geo AS (
          SELECT *,
            2 * {EARTH_RADIUS_KM} * asin(sqrt(
                pow(sin(radians(do_lat - pu_lat) / 2), 2) +
                cos(radians(pu_lat)) * cos(radians(do_lat)) *
                pow(sin(radians(do_lon - pu_lon) / 2), 2)
            )) AS haversine_km,
            abs(do_lat - pu_lat) * {KM_PER_DEGREE} +
            abs(do_lon - pu_lon) * {KM_PER_DEGREE} *
              cos(radians((pu_lat + do_lat) / 2)) AS manhattan_km,
            degrees(atan2(
              sin(radians(do_lon - pu_lon)) * cos(radians(do_lat)),
              cos(radians(pu_lat)) * sin(radians(do_lat)) -
              sin(radians(pu_lat)) * cos(radians(do_lat)) * cos(radians(do_lon - pu_lon))
            )) AS bearing_deg
          FROM base
        )
        SELECT
          taxi_type,
          pickup_datetime,
          CAST(date_trunc('hour', pickup_datetime) AS TIMESTAMP) AS pickup_hour,
          CAST(strftime(pickup_datetime, '%Y-%m-%d') AS DATE) AS pickup_date,
          CAST(date_part('hour', pickup_datetime) AS TINYINT) AS pickup_hour_of_day,
          CAST(date_part('minute', pickup_datetime) AS TINYINT) AS pickup_minute,
          CAST(date_part('dow', pickup_datetime) AS TINYINT) AS day_of_week,
          CAST(date_part('day', pickup_datetime) AS TINYINT) AS day_of_month,
          CAST(date_part('month', pickup_datetime) AS TINYINT) AS month,
          CAST(date_part('week', pickup_datetime) AS TINYINT) AS week_of_year,
          (date_part('dow', pickup_datetime) IN (0, 6)) AS is_weekend,
          ((date_part('hour', pickup_datetime) >= 7 AND date_part('hour', pickup_datetime) < 10)
            OR (date_part('hour', pickup_datetime) >= 16 AND date_part('hour', pickup_datetime) < 19)) AS is_rush_hour,
          (date_part('hour', pickup_datetime) >= 22 OR date_part('hour', pickup_datetime) < 6) AS is_night,
          CASE
            WHEN date_part('hour', pickup_datetime) < 6 THEN 'late_night'
            WHEN date_part('hour', pickup_datetime) < 10 THEN 'morning_rush'
            WHEN date_part('hour', pickup_datetime) < 16 THEN 'midday'
            WHEN date_part('hour', pickup_datetime) < 19 THEN 'evening_rush'
            WHEN date_part('hour', pickup_datetime) < 22 THEN 'evening'
            ELSE 'night'
          END AS time_of_day_bucket,
          pu_location_id, do_location_id,
          pu_borough, do_borough, pu_zone_name, do_zone_name,
          CAST(pu_lat AS DOUBLE) AS pu_lat, CAST(pu_lon AS DOUBLE) AS pu_lon,
          CAST(do_lat AS DOUBLE) AS do_lat, CAST(do_lon AS DOUBLE) AS do_lon,
          CAST(haversine_km AS DOUBLE) AS haversine_km,
          CAST(manhattan_km AS DOUBLE) AS manhattan_km,
          CAST(bearing_deg AS DOUBLE) AS bearing_deg,
          sin(radians(bearing_deg)) AS bearing_sin,
          cos(radians(bearing_deg)) AS bearing_cos,
          (pu_location_id IN ({airport_sql})) AS is_airport_pu,
          (do_location_id IN ({airport_sql})) AS is_airport_do,
          (pu_borough = 'Manhattan' AND pu_lat <= {CBD_LATITUDE_LIMIT}) AS is_cbd_pu,
          (do_borough = 'Manhattan' AND do_lat <= {CBD_LATITUDE_LIMIT}) AS is_cbd_do,
          (pu_borough IS DISTINCT FROM do_borough) AS cross_borough,
          passenger_count,
          source_month,
          duration_min,
          fare_amount,
          total_amount,
          trip_distance_mi,
          is_distance_zero,
          is_distance_implausible
        FROM geo
        """
    )

    # Weather is joined on the pickup hour. The archive reports local New York time, matching the
    # naive local timestamps in the TLC records.
    con.execute(
        f"""
        COPY (
          WITH enriched AS (
            SELECT
              t.*,
              w.temperature_c,
              w.relative_humidity_pct,
              w.precipitation_mm,
              w.rain_mm,
              w.snowfall_cm,
              w.windspeed_kmh,
              w.weather_code,
              (w.precipitation_mm > 0) AS is_precipitating,
              h.is_federal_holiday AS is_holiday,
              h.is_ny_state_holiday AS is_ny_state_holiday,
              (
                SELECT CAST(min(abs(date_diff('day', t.pickup_date, hd.holiday_date))) AS SMALLINT)
                FROM holiday_dates hd
              ) AS days_to_nearest_holiday
            FROM trips t
            LEFT JOIN weather w ON w.weather_hour = t.pickup_hour
            LEFT JOIN holidays h ON h.date = t.pickup_date
          )
          SELECT * FROM enriched ORDER BY pickup_datetime
        ) TO '{OUTPUT}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )

    total = con.execute(f"SELECT count(*) FROM '{OUTPUT}'").fetchone()[0]
    quality = con.execute(
        f"""
        SELECT
          count(*) AS rows,
          count(*) FILTER (WHERE temperature_c IS NULL) AS missing_weather,
          count(*) FILTER (WHERE pu_borough IS NULL) AS missing_pu_borough,
          count(*) FILTER (WHERE haversine_km IS NULL) AS missing_geometry,
          round(avg(haversine_km), 2) AS mean_haversine_km,
          round(avg(manhattan_km), 2) AS mean_manhattan_km,
          count(*) FILTER (WHERE is_distance_implausible) AS implausible_distance,
          round(avg(trip_distance_mi) FILTER (WHERE NOT is_distance_implausible), 2) AS mean_meter_distance_mi_plausible,
          round(100.0 * count(*) FILTER (WHERE is_holiday) / count(*), 2) AS pct_holiday,
          round(100.0 * count(*) FILTER (WHERE is_rush_hour) / count(*), 2) AS pct_rush
        FROM '{OUTPUT}'
        """
    ).df()
    print(quality.to_string(index=False))
    print(f"\nwrote {OUTPUT.name}: {total:,} rows, {OUTPUT.stat().st_size/1e9:.2f} GB")
    print(f"elapsed: {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
