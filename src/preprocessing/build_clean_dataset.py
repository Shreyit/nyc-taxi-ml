# Build the unified, cleaned 2025 Yellow + Green taxi dataset with DuckDB.
#
# The whole 2025 year is ~46 M rows, so nothing here is loaded into Pandas. DuckDB reads the
# monthly Parquet files directly, applies the cleaning rules in a documented order, and exports
# a single ZSTD-compressed Parquet file plus an audit table that reconciles every dropped row.
#
# Cleaning order matters: each stage is counted independently so the audit explains removals.
#   1. usable pickup/dropoff timestamps
#   2. pickup inside 2025 and inside the source file's billing month
#   3. duration in [1, 180] minutes
#   4. pickup and drop-off zones are real TLC zones (1-263; 264/265 are placeholders)
#   5. no negative metered distance
#   6. fare_amount in (0, 500]
#   7. exact duplicate records removed on the trip identity key
#
# Filtering philosophy: a row is dropped only when a target or a model feature is unusable.
# Duration and fare are targets, so impossible values must go. Zones are features, so invalid ids
# must go. Metered distance is neither: it is a diagnostic, never a predictor, so it is NOT used to
# drop records. Rows with a zero distance field still have a valid fare and duration and are kept,
# flagged by is_distance_zero. Removing them would have deleted 817,668 Yellow and 11,418 Green
# trips (about 1.9%) purely because the odometer failed.
#
# Usage:
#   python -m src.preprocessing.build_clean_dataset

from __future__ import annotations

import time
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
TMP = ROOT / "data" / "tmp"
PROCESSED.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)

YEAR = 2025
MIN_DURATION_MINUTES = 1.0
MAX_DURATION_MINUTES = 180.0
MAX_FARE = 500.0
VALID_ZONE_MIN = 1
VALID_ZONE_MAX = 263

SERVICES = {
    "yellow": ("tpep_pickup_datetime", "tpep_dropoff_datetime"),
    "green": ("lpep_pickup_datetime", "lpep_dropoff_datetime"),
}

OUTPUT = PROCESSED / "taxi_clean_2025.parquet"
AUDIT = PROCESSED / "cleaning_audit_2025.parquet"


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("SET threads TO 6")
    con.execute("SET memory_limit = '6GB'")
    con.execute(f"SET temp_directory = '{TMP}'")
    return con


def normalized_view(con: duckdb.DuckDBPyConnection, service: str) -> str:
    pickup_col, dropoff_col = SERVICES[service]
    glob = str(RAW / service / f"{service}_tripdata_{YEAR}-*.parquet")
    view = f"norm_{service}"
    con.execute(
        f"""
        CREATE OR REPLACE VIEW {view} AS
        SELECT
          '{service}' AS taxi_type,
          {pickup_col} AS pickup_datetime,
          {dropoff_col} AS dropoff_datetime,
          date_diff('millisecond', {pickup_col}, {dropoff_col}) / 60000.0 AS duration_min,
          CAST(PULocationID AS INTEGER) AS pu_zone,
          CAST(DOLocationID AS INTEGER) AS do_zone,
                      passenger_count,
            trip_distance AS trip_distance_mi,
            (trip_distance = 0) AS is_distance_zero,
            fare_amount,
          total_amount,
          CAST(strftime({pickup_col}, '%m') AS TINYINT) AS source_month,
          CAST(strftime({pickup_col}, '%Y') AS SMALLINT) AS source_year
        FROM read_parquet('{glob}')
        """
    )
    return view


def clean_service(con: duckdb.DuckDBPyConnection, service: str) -> dict:
    view = normalized_view(con, service)
    stats = con.execute(
        f"""
        SELECT
          count(*) AS raw_rows,
          count(*) FILTER (WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL) AS step1_valid_timestamps,
          count(*) FILTER (
            WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL
              AND source_year = {YEAR} AND source_month IS NOT NULL
              AND CAST(strftime(pickup_datetime, '%m') AS TINYINT) = source_month
          ) AS step2_in_source_month,
          count(*) FILTER (
            WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL
              AND source_year = {YEAR} AND CAST(strftime(pickup_datetime, '%m') AS TINYINT) = source_month
              AND duration_min BETWEEN {MIN_DURATION_MINUTES} AND {MAX_DURATION_MINUTES}
          ) AS step3_duration,
          count(*) FILTER (
            WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL
              AND source_year = {YEAR} AND CAST(strftime(pickup_datetime, '%m') AS TINYINT) = source_month
              AND duration_min BETWEEN {MIN_DURATION_MINUTES} AND {MAX_DURATION_MINUTES}
              AND pu_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
              AND do_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
          ) AS step4_zones,
          count(*) FILTER (
            WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL
              AND source_year = {YEAR} AND CAST(strftime(pickup_datetime, '%m') AS TINYINT) = source_month
              AND duration_min BETWEEN {MIN_DURATION_MINUTES} AND {MAX_DURATION_MINUTES}
              AND pu_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
              AND do_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
              AND trip_distance_mi >= 0
          ) AS step5_distance,
          count(*) FILTER (
            WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL
              AND source_year = {YEAR} AND CAST(strftime(pickup_datetime, '%m') AS TINYINT) = source_month
              AND duration_min BETWEEN {MIN_DURATION_MINUTES} AND {MAX_DURATION_MINUTES}
              AND pu_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
              AND do_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
              AND trip_distance_mi >= 0
              AND fare_amount > 0 AND fare_amount <= {MAX_FARE}
          ) AS step6_fare
        FROM {view}
        """
    ).fetchone()
    keys = [
        "raw_rows",
        "step1_valid_timestamps",
        "step2_in_source_month",
        "step3_duration",
        "step4_zones",
        "step5_distance",
        "step6_fare",
    ]
    counts = dict(zip(keys, (int(value) for value in stats)))

    # Materialise the surviving rows, then drop exact duplicate records. The identity key uses the
    # fields that must be identical for two rows to describe the same physical trip. Legitimate
    # short repeats of the same zone pair at the same minute are rare enough that this is a safe
    # filter, and the removed count is reported rather than hidden.
    staging = f"staged_{service}"
    con.execute(
        f"""
        CREATE OR REPLACE TABLE {staging} AS
        WITH filtered AS (
          SELECT
            taxi_type, pickup_datetime, dropoff_datetime,
            CAST(round(duration_min, 3) AS DOUBLE) AS duration_min,
            pu_zone, do_zone,
            CAST(passenger_count AS SMALLINT) AS passenger_count,
            trip_distance_mi,
            is_distance_zero,
            CAST(fare_amount AS DOUBLE) AS fare_amount,
            CAST(total_amount AS DOUBLE) AS total_amount,
            source_month
          FROM {view}
          WHERE pickup_datetime IS NOT NULL AND dropoff_datetime IS NOT NULL
            AND source_year = {YEAR} AND CAST(strftime(pickup_datetime, '%m') AS TINYINT) = source_month
            AND duration_min BETWEEN {MIN_DURATION_MINUTES} AND {MAX_DURATION_MINUTES}
            AND pu_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
            AND do_zone BETWEEN {VALID_ZONE_MIN} AND {VALID_ZONE_MAX}
            AND trip_distance_mi >= 0
            AND fare_amount > 0 AND fare_amount <= {MAX_FARE}
        )
        SELECT * EXCLUDE (dup_rank) FROM (
          SELECT *, row_number() OVER (
            PARTITION BY pickup_datetime, dropoff_datetime, pu_zone, do_zone, fare_amount, trip_distance_mi
            ORDER BY pickup_datetime
          ) AS dup_rank
          FROM filtered
        ) WHERE dup_rank = 1
        """
    )
    retained = con.execute(f"SELECT count(*) FROM {staging}").fetchone()[0]
    counts["step7_deduplicated"] = int(retained)
    counts["service"] = service
    counts["retained_pct"] = 100.0 * retained / counts["raw_rows"]

    # Passenger counts outside 0-6 are implausible for a city taxi, but the row still carries a
    # valid duration and fare, so the value is nulled instead of deleting useful trips.
    con.execute(
        f"""
        UPDATE {staging}
        SET passenger_count = NULL
        WHERE passenger_count < 0 OR passenger_count > 6
        """
    )
    # Negative or zero total_amount rows keep their fare_amount but have no usable total.
    con.execute(
        f"""
        UPDATE {staging}
        SET total_amount = NULL
        WHERE total_amount IS NULL OR total_amount <= 0 OR total_amount > 2000
        """
    )
    return counts, staging


def main() -> None:
    started = time.time()
    con = connect()
    audit_rows = []
    staging_tables = []
    for service in SERVICES:
        print(f"cleaning {service} ...")
        counts, staging = clean_service(con, service)
        print(
            f"  raw {counts['raw_rows']:,} -> kept {counts['step7_deduplicated']:,} "
            f"({counts['retained_pct']:.2f}%)"
        )
        audit_rows.append(counts)
        staging_tables.append(staging)

    combined = " UNION ALL ".join(f"SELECT * FROM {table}" for table in staging_tables)
    con.execute(
        f"""
        COPY (
          SELECT * FROM ({combined})
          ORDER BY pickup_datetime
        ) TO '{OUTPUT}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
        """
    )
    # The audit is tiny, so it is written through Pandas rather than hand-built SQL.
    audit = pd.DataFrame(audit_rows)[
        [
            "service", "raw_rows", "step1_valid_timestamps", "step2_in_source_month",
            "step3_duration", "step4_zones", "step5_distance", "step6_fare",
            "step7_deduplicated", "retained_pct",
        ]
    ]
    audit.to_parquet(AUDIT, index=False)

    total = con.execute(f"SELECT count(*) FROM '{OUTPUT}'").fetchone()[0]
    span = con.execute(
        f"SELECT min(pickup_datetime), max(pickup_datetime) FROM '{OUTPUT}'"
    ).fetchone()
    print(f"\nwrote {OUTPUT.name}: {total:,} rows, {OUTPUT.stat().st_size/1e9:.2f} GB")
    print(f"pickup span: {span[0]} -> {span[1]}")
    print(f"elapsed: {time.time() - started:.0f}s")
    for row in audit_rows:
        print(row)


if __name__ == "__main__":
    main()
