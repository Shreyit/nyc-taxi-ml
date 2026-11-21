"""
Rebuild the lookup tables the Streamlit app reads, the same way the notebook builds its features.

- zones.parquet: zone names, map coordinates (lon/lat) and the notebook's centroid x/y in km (EPSG:2263)
- route_history.parquet / pu_history.parquet: duration and fare history from ALL cleaned 2025 trips
  (both fleets, every month), trip-weighted like Section 5.3 of the notebook
- weather_monthly.parquet: average Central Park weather per month, used as the app's default weather
- medians.json: overall medians used when a zone has no history (feature column lists are kept)

Run after the notebook has written data/processed/trips_clean_2025.parquet:
    uv run python scripts/build_serving_lookups.py
"""

import json
from pathlib import Path

import duckdb
import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW, PROCESSED, EXTERNAL = ROOT / "data" / "raw", ROOT / "data" / "processed", ROOT / "data" / "external"
LOOKUP, MODELS = ROOT / "outputs" / "lookup", ROOT / "outputs" / "models"
LOOKUP.mkdir(parents=True, exist_ok=True)

con = duckdb.connect()
con.execute("SET memory_limit = '4GB'")
con.execute("SET preserve_insertion_order = false")
con.execute(f"CREATE VIEW trips AS SELECT * FROM '{PROCESSED / 'trips_clean_2025.parquet'}'")

# zones: same centroids as notebook cell 5.1 (EPSG:2263 is in feet; 1 ft = 0.0003048 km)
shapes = gpd.read_file(f"zip://{RAW / 'taxi_zones.zip'}!taxi_zones/taxi_zones.shp").dissolve(by="LocationID").reset_index()
centre = shapes.geometry.centroid
wgs84 = gpd.GeoSeries(centre, crs=shapes.crs).to_crs(4326)
lookup = pd.read_csv(RAW / "taxi_zone_lookup.csv")
zones = pd.DataFrame({"LocationID": shapes.LocationID.astype(int), "x_km": centre.x * 0.0003048,
                      "y_km": centre.y * 0.0003048, "lon": wgs84.x, "lat": wgs84.y})
zones = zones.merge(lookup.rename(columns={"Borough": "borough", "Zone": "zone"})[["LocationID", "borough", "zone"]],
                    on="LocationID")
zones.to_parquet(LOOKUP / "zones.parquet", index=False)

# history from every cleaned 2025 trip, both fleets
route = con.sql("""
    SELECT pu_zone, do_zone,
           count(*)::INT          AS route_prior_trips,
           avg(duration_min)      AS route_prior_mean,
           avg(fare_amount)       AS fare_route_prior_mean
    FROM trips GROUP BY ALL
""").df()
route.to_parquet(LOOKUP / "route_history.parquet", index=False)

pickup = con.sql("""
    SELECT pu_zone, avg(duration_min) AS pu_prior_mean, avg(fare_amount) AS fare_pu_prior_mean
    FROM trips GROUP BY ALL
""").df()
pickup.to_parquet(LOOKUP / "pu_history.parquet", index=False)

weather = con.sql(f"""
    SELECT month(weather_hour) AS month, avg(temperature_c) AS temperature_c,
           avg(relative_humidity_pct) AS relative_humidity_pct, avg(windspeed_kmh) AS windspeed_kmh
    FROM '{EXTERNAL / 'nyc_central_park_weather_2025_hourly.parquet'}' GROUP BY ALL ORDER BY month
""").df()
weather.to_parquet(LOOKUP / "weather_monthly.parquet", index=False)

# medians of the months the final models were trained on (Jan-Oct); keep the feature column lists
medians = json.loads((MODELS / "medians.json").read_text())
m = con.sql("SELECT median(duration_min) AS d, median(fare_amount) AS f FROM trips WHERE source_month <= 10").df()
medians.update(duration_median=float(m.d[0]), fare_median=float(m.f[0]))
(MODELS / "medians.json").write_text(json.dumps(medians))

print(f"zones {len(zones)}, routes {len(route):,}, pickup zones {len(pickup)}, weather months {len(weather)}")
print(f"medians: duration {medians['duration_median']:.2f} min, fare ${medians['fare_median']:.2f}")
