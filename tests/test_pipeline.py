# Integration checks over the local data artefacts.
#
# These tests read Parquet metadata and small aggregates only, so they run in seconds even on the
# full 2025 dataset. They are skipped when an artefact has not been built yet, which keeps the
# suite useful on a fresh clone.

from pathlib import Path

import duckdb
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
EXTERNAL = ROOT / "data" / "external"

CLEAN = PROCESSED / "taxi_clean_2025.parquet"
FEATURES = PROCESSED / "taxi_features_2025.parquet"
MANIFEST = RAW / "manifest_2025.json"


@pytest.fixture(scope="module")
def con():
    connection = duckdb.connect()
    connection.execute("SET threads TO 2")
    return connection


def test_manifest_lists_all_24_months():
    import json

    if not MANIFEST.exists():
        pytest.skip("download manifest not present")
    files = json.loads(MANIFEST.read_text())["files"]
    assert len(files) == 24
    for name, record in files.items():
        assert record["status"] == "ok", name
        path = RAW / record["service"] / name
        assert path.exists(), name
        assert path.stat().st_size == record["bytes"], name
        assert record["rows"] > 0, name


def test_clean_dataset_covers_2025_only(con):
    if not CLEAN.exists():
        pytest.skip("clean dataset not built")
    stats = con.execute(
        f"""
        SELECT count(*) AS rows,
               min(pickup_datetime) AS first_pickup,
               max(pickup_datetime) AS last_pickup,
               count(*) FILTER (WHERE taxi_type NOT IN ('yellow', 'green')) AS bad_type,
               count(*) FILTER (WHERE duration_min < 1 OR duration_min > 180) AS bad_duration,
               count(*) FILTER (WHERE fare_amount <= 0) AS bad_fare,
               count(*) FILTER (WHERE pu_zone IS NULL OR do_zone IS NULL) AS missing_zone
        FROM '{CLEAN}'
        """
    ).fetchone()
    rows, first, last, bad_type, bad_duration, bad_fare, missing_zone = stats
    assert rows > 40_000_000
    assert first.year == 2025 and last.year == 2025
    assert bad_type == 0 and bad_duration == 0 and bad_fare == 0 and missing_zone == 0


def test_feature_table_has_no_null_geometry_or_weather(con):
    if not FEATURES.exists():
        pytest.skip("feature table not built")
    stats = con.execute(
        f"""
        SELECT count(*) AS rows,
               count(*) FILTER (WHERE haversine_km IS NULL) AS null_distance,
               count(*) FILTER (WHERE temperature_c IS NULL) AS null_temperature,
               count(*) FILTER (WHERE haversine_km < 0) AS negative_distance,
               count(*) FILTER (WHERE pu_location_id NOT BETWEEN 1 AND 263) AS bad_pu,
               count(*) FILTER (WHERE do_location_id NOT BETWEEN 1 AND 263) AS bad_do,
               count(*) FILTER (WHERE is_holiday IS NULL) AS null_holiday
        FROM '{FEATURES}'
        """
    ).fetchone()
    rows, null_distance, null_temperature, negative_distance, bad_pu, bad_do, null_holiday = stats
    assert rows > 40_000_000
    assert null_distance == 0
    assert null_temperature == 0
    assert negative_distance == 0
    assert bad_pu == 0 and bad_do == 0
    assert null_holiday == 0


def test_geometric_distance_is_shorter_than_metered_distance(con):
    # Zone centroids understate distance: the true point inside a zone is unknown and a straight
    # line is shorter than the street route. If this relationship inverts, the projection is wrong.
    if not FEATURES.exists():
        pytest.skip("feature table not built")
    ratio = con.execute(
        f"SELECT avg(haversine_km) / avg(trip_distance_mi * 1.60934) FROM '{FEATURES}'"
    ).fetchone()[0]
    assert 0.5 < ratio < 1.0, ratio


def test_zone_centroids_cover_every_valid_zone(con):
    path = EXTERNAL / "zone_centroids.parquet"
    if not path.exists():
        pytest.skip("zone centroids not built")
    zones = con.execute(f"SELECT count(*), min(LocationID), max(LocationID) FROM '{path}'").df()
    assert zones.iloc[0, 0] == 263
    assert zones.iloc[0, 1] == 1 and zones.iloc[0, 2] == 263
    frame = pd.read_parquet(path)
    assert frame.centroid_lat.between(40.4, 41.0).all()
    assert frame.centroid_lon.between(-74.3, -73.6).all()


def test_weather_covers_every_hour_of_2025():
    path = EXTERNAL / "nyc_central_park_weather_2025_hourly.parquet"
    if not path.exists():
        pytest.skip("weather not downloaded")
    frame = pd.read_parquet(path)
    assert len(frame) == 8760
    assert frame.isna().sum().sum() == 0
    assert frame.weather_hour.min().year == 2025


def test_holiday_calendar_has_eleven_federal_days():
    path = EXTERNAL / "nyc_holidays_2025.parquet"
    if not path.exists():
        pytest.skip("holiday calendar not built")
    frame = pd.read_parquet(path)
    assert len(frame) == 365
    assert int(frame.is_federal_holiday.sum()) == 11
