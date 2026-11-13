# Reference-data ingestion: taxi zone geometry, zone lookup, 2025 hourly weather, holiday calendar.
#
# Every artefact is written under data/external/ and is safe to regenerate. Downloads are
# skipped when a valid copy already exists so the step is cheap to re-run.
#
# Usage:
#   python -m src.ingestion.download_external

from __future__ import annotations

import json
import urllib.request
import zipfile
from pathlib import Path

import geopandas as gpd
import holidays
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
EXTERNAL = ROOT / "data" / "external"
EXTERNAL.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://d37ci6vzurychx.cloudfront.net/misc"
ZONE_ZIP = RAW / "taxi_zones.zip"
ZONE_SHP_DIR = EXTERNAL / "taxi_zones"
CENTROIDS = EXTERNAL / "zone_centroids.parquet"
LOOKUP = RAW / "taxi_zone_lookup.csv"
WEATHER = EXTERNAL / "nyc_central_park_weather_2025_hourly.parquet"
HOLIDAYS = EXTERNAL / "nyc_holidays_2025.parquet"

# Central Park reference point requested by the project spec.
CENTRAL_PARK = (40.7812, -73.9665)
WEATHER_VARS = (
    "temperature_2m,relativehumidity_2m,precipitation,rain,snowfall,"
    "windspeed_10m,weathercode"
)


def fetch(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url, timeout=180) as response, target.open("wb") as handle:
        handle.write(response.read())
    print(f"[ok] {target.name}: {target.stat().st_size/1e6:.2f} MB")


def ensure_zone_zip() -> None:
    if ZONE_ZIP.exists() and ZONE_ZIP.stat().st_size > 500_000:
        print(f"[skip] {ZONE_ZIP.name} already present")
        return
    fetch(f"{BASE_URL}/taxi_zones.zip", ZONE_ZIP)


def ensure_lookup() -> None:
    if LOOKUP.exists() and LOOKUP.stat().st_size > 5_000:
        print(f"[skip] {LOOKUP.name} already present")
        return
    fetch(f"{BASE_URL}/taxi_zone_lookup.csv", LOOKUP)


def build_centroids() -> pd.DataFrame:
    # Zone centroids in WGS84 plus the polygon area, used for all distance features.
    ZONE_SHP_DIR.mkdir(parents=True, exist_ok=True)
    if not (ZONE_SHP_DIR / "taxi_zones" / "taxi_zones.shp").exists():
        with zipfile.ZipFile(ZONE_ZIP) as archive:
            archive.extractall(ZONE_SHP_DIR)
    zones = gpd.read_file(ZONE_SHP_DIR / "taxi_zones" / "taxi_zones.shp")

    # Centroids are computed in the shapefile's own projected CRS (EPSG:2263, US survey feet)
    # because a centroid calculated in degrees is distorted. Area is converted to square miles.
    projected = zones.to_crs(2263)
    centroids = projected.geometry.centroid.to_crs(4326)
    out = pd.DataFrame({
        "LocationID": zones["LocationID"].astype("int64"),
        "zone": zones["zone"].astype("string"),
        "borough": zones["borough"].astype("string"),
        "centroid_lon": centroids.x.to_numpy(),
        "centroid_lat": centroids.y.to_numpy(),
        "area_sq_miles": (projected.geometry.area / 27_878_400.0).to_numpy(),
    }).sort_values("LocationID")
    out.to_parquet(CENTROIDS, index=False)
    print(f"[ok] zone_centroids.parquet: {len(out)} zones (EPSG:2263 centroids -> WGS84)")
    return out


def build_weather() -> pd.DataFrame:
    if WEATHER.exists():
        existing = pd.read_parquet(WEATHER)
        if len(existing) == 8760:
            print(f"[skip] {WEATHER.name} already present ({len(existing)} hours)")
            return existing
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={CENTRAL_PARK[0]}&longitude={CENTRAL_PARK[1]}"
        "&start_date=2025-01-01&end_date=2025-12-31"
        f"&hourly={WEATHER_VARS}&timezone=America%2FNew_York"
    )
    with urllib.request.urlopen(url, timeout=180) as response:
        payload = json.load(response)
    hourly = payload["hourly"]
    frame = pd.DataFrame({
        "weather_hour": pd.to_datetime(hourly["time"]),
        "temperature_c": hourly["temperature_2m"],
        "relative_humidity_pct": hourly["relativehumidity_2m"],
        "precipitation_mm": hourly["precipitation"],
        "rain_mm": hourly["rain"],
        "snowfall_cm": hourly["snowfall"],
        "windspeed_kmh": hourly["windspeed_10m"],
        "weather_code": hourly["weathercode"],
    })
    if len(frame) != 8760:
        raise ValueError(f"expected 8760 hours for 2025, received {len(frame)}")
    frame.to_parquet(WEATHER, index=False)
    print(f"[ok] {WEATHER.name}: {len(frame)} hours, grid cell {payload.get('latitude')}/{payload.get('longitude')}")
    return frame


def build_holidays() -> pd.DataFrame:
    # One row per 2025 date carrying federal and New York State observance flags.
    federal = holidays.US(years=2025)
    state = holidays.US(years=2025, state="NY")
    dates = pd.date_range("2025-01-01", "2025-12-31", freq="D")
    frame = pd.DataFrame({
        "date": dates.date,
        "is_federal_holiday": [d in federal for d in dates.date],
        "federal_holiday_name": [federal.get(d, "") for d in dates.date],
        "is_ny_state_holiday": [d in state for d in dates.date],
        "ny_state_holiday_name": [state.get(d, "") for d in dates.date],
    })
    frame.to_parquet(HOLIDAYS, index=False)
    print(f"[ok] nyc_holidays_2025.parquet: {int(frame.is_federal_holiday.sum())} federal, "
          f"{int(frame.is_ny_state_holiday.sum())} NY state days")
    return frame


def main() -> None:
    ensure_zone_zip()
    ensure_lookup()
    build_centroids()
    build_weather()
    build_holidays()


if __name__ == "__main__":
    main()
