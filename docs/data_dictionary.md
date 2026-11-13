# Data Dictionary

Covers the raw 2025 TLC records, the external reference data, and every column of the two processed
artefacts the notebooks consume.

---

## 1. Raw trip records

Source: TLC Trip Record Data, `https://d37ci6vzurychx.cloudfront.net/trip-data/{service}_tripdata_2025-MM.parquet`.
24 files (12 Yellow, 12 Green), 49,313,977 rows, 0.84 GB, SHA-256 recorded in `data/raw/manifest_2025.json`.

| Column (Yellow / Green) | Unified name | Type | Notes |
|---|---|---|---|
| `tpep_pickup_datetime` / `lpep_pickup_datetime` | `pickup_datetime` | timestamp | Local New York time, no timezone |
| `tpep_dropoff_datetime` / `lpep_dropoff_datetime` | `dropoff_datetime` | timestamp | Local New York time |
| `passenger_count` | `passenger_count` | `passenger_count` | int | `BIGINT` (Yellow), `DOUBLE` (Green); ~25% missing in Yellow |
| `trip_distance` | `trip_distance_mi` | double | Metered miles. **Post-trip: diagnostic only** |
| `PULocationID`, `DOLocationID` | `pu_zone`, `do_zone` | int | TLC zone 1–263; 264/265 are "Unknown" placeholders |
| `fare_amount` | `fare_amount` | double | Metered fare before tips and tolls. **Stage-2 target** |
| `total_amount` | `total_amount` | double | Fare + tips + tolls + surcharges. Explored separately |
| `tip_amount` | — | double | Excluded (post-trip, discretionary) |
| `tolls_amount` | — | double | Excluded (post-trip) |
| `extra`, `mta_tax`, `improvement_surcharge` | — | double | Excluded (post-trip) |
| `congestion_surcharge` | — | double | NY State $2.50/trip since 2019. Excluded (post-trip) |
| `cbd_congestion_fee` | — | double | MTA Congestion Relief Zone $0.75/trip from 2025-01-05. Excluded (post-trip) |
| `Airport_fee` (Yellow only) | — | double | Excluded (post-trip) |
| `ehail_fee`, `trip_type` (Green only) | — | — | Excluded: service-specific, dispatch-assigned |
| `RatecodeID` | — | int | Excluded: encodes the fare regime (e.g. JFK flat fare), so it leaks the fare |
| `payment_type` | — | int | Excluded (post-trip) |
| `store_and_fwd_flag`, `VendorID` | — | — | Excluded (no predictive value for this target) |

---

## 2. External reference data

| File | Contents |
|---|---|
| `data/raw/taxi_zone_lookup.csv` | 265 rows: `LocationID`, `Borough`, `Zone`, `service_zone` |
| `data/raw/taxi_zones.zip` | TLC zone shapefile, 263 polygons, EPSG:2263 |
| `data/external/zone_centroids.parquet` | `LocationID`, `zone`, `borough`, `centroid_lon`, `centroid_lat`, `area_sq_miles` — centroids computed in EPSG:2263 then reprojected to WGS84 |
| `data/external/nyc_central_park_weather_2025_hourly.parquet` | 8,760 rows, one per hour of 2025: `weather_hour`, `temperature_c`, `relative_humidity_pct`, `precipitation_mm`, `rain_mm`, `snowfall_cm`, `windspeed_kmh`, `weather_code` |
| `data/external/nyc_holidays_2025.parquet` | 365 rows: `date`, `is_federal_holiday`, `federal_holiday_name`, `is_ny_state_holiday`, `ny_state_holiday_name` |

Weather source: Open-Meteo Historical Weather Archive requested at 40.7812 / −73.9665 (Central Park).
The API snaps to its grid cell and reports 40.8084 / −74.0199, roughly 5 km west of the park, so the
data is a **city-level** approximation, not park- or route-specific.

---

## 3. `data/processed/taxi_clean_2025.parquet`

45,071,006 rows (44,511,782 Yellow, 559,224 Green), 0.59 GB, ZSTD, ordered by `pickup_datetime`.

| Column | Type | Description |
|---|---|---|
| `taxi_type` | varchar | `yellow` or `green` |
| `pickup_datetime` | timestamp | Trip start, local time. Split key |
| `dropoff_datetime` | timestamp | Trip end. Used only to build the target |
| `duration_min` | double | Target: minutes between pickup and dropoff, 1–180 |
| `pu_zone`, `do_zone` | int | Validated TLC zone ids 1–263 |
| `passenger_count` | smallint | Null when outside 0–6 |
| `trip_distance_mi` | double | Metered miles, non-negative. **Diagnostic only, never a predictor, and never a filter** |
| `is_distance_zero` | boolean | The odometer field was zero or missing. Fare and duration are still valid |
| `is_distance_implausible` | boolean | Distance outside 0.1–100 miles. The field is corrupt; the row is kept because distance is not a predictor |
| `fare_amount` | double | Stage-2 target, in (0, 500] |
| `total_amount` | double | Diagnostic target; null when outside (0, 2000] |
| `source_month` | tinyint | Month of the originating file, equals the pickup month |

---

## 4. `data/processed/taxi_features_2025.parquet`

Same 45,071,006 rows with temporal, geospatial, holiday and weather fields added. ~1.2 GB.

### Temporal

| Column | Description |
|---|---|
| `pickup_hour` | Timestamp truncated to the hour, join key for weather |
| `pickup_date` | Date, join key for holidays |
| `pickup_hour_of_day` | 0–23 |
| `pickup_minute` | 0–59 |
| `day_of_week` | 0 = Sunday … 6 = Saturday (DuckDB `date_part('dow')`) |
| `day_of_month` | 1–31 |
| `month` | 1–12 |
| `week_of_year` | 1–53 |
| `is_weekend` | Saturday or Sunday |
| `is_rush_hour` | 07:00–09:59 or 16:00–18:59 |
| `is_night` | 22:00–05:59 |
| `time_of_day_bucket` | `late_night`, `morning_rush`, `midday`, `evening_rush`, `evening`, `night` |
| `is_holiday` | US federal holiday |
| `is_ny_state_holiday` | New York State observance (superset of federal for 2025) |
| `days_to_nearest_holiday` | Absolute day distance to the closest 2025 federal holiday |

### Geospatial

| Column | Description |
|---|---|
| `pu_location_id`, `do_location_id` | TLC zone ids |
| `pu_borough`, `do_borough` | From the zone lookup (EWR, Manhattan, Bronx, Brooklyn, Queens, Staten Island) |
| `pu_zone_name`, `do_zone_name` | Human-readable zone names, used by the app dropdowns |
| `pu_lat`, `pu_lon`, `do_lat`, `do_lon` | Zone centroids in WGS84 |
| `haversine_km` | Great-circle distance between centroids |
| `manhattan_km` | L1 grid distance: `|Δlat| · 111.32 + |Δlon| · 111.32 · cos(mean lat)` |
| `bearing_deg` | Initial bearing in degrees, −180…180 |
| `bearing_sin`, `bearing_cos` | Cyclic encoding of the bearing |
| `is_airport_pu`, `is_airport_do` | Zone in {1 Newark, 132 JFK, 138 LaGuardia} |
| `is_cbd_pu`, `is_cbd_do` | Manhattan zone with centroid latitude ≤ 40.7685 (60th Street), the Congestion Relief Zone boundary |
| `cross_borough` | Pickup borough differs from drop-off borough |

### Weather (pickup hour, city-level)

`temperature_c`, `relative_humidity_pct`, `precipitation_mm`, `rain_mm`, `snowfall_cm`, `windspeed_kmh`,
`weather_code`, `is_precipitating` (`precipitation_mm > 0`).

### Carried targets and diagnostics

`duration_min`, `fare_amount`, `total_amount`, `trip_distance_mi`, `is_distance_zero`, `is_distance_implausible`.

---

## 5. Known limitations of these fields

- **Centroid geometry understates distance.** Using centroids for pickup and drop-off ignores travel
  within a zone and street routing. Measured on 2025 data, mean Haversine distance is ~0.73× the mean
  metered distance, so estimated distance is systematically short. This is a feature, not a bug: the
  true pickup point is unknown before the trip.
- **One weather station for the whole city.** Precipitation and temperature are city-level.
- **Holiday distance is federal only**, so `days_to_nearest_holiday` ignores NY-state-only observances.
- **`passenger_count` is unreliable** (~25% missing for Yellow) and must not be a primary driver.
- **Zones 264/265 removed**, so trips with unknown locations are invisible to the models.
- **1.9% of retained rows have a zero metered distance and 1,956 have an absurd one** (up to 397,994 miles).
  Both keep valid fare and duration targets, so they stay in the dataset behind `is_distance_zero` and
  `is_distance_implausible`. Any analysis of distance must filter on those flags; the models never see the
  field at all.
- **Negative fares are excluded.** 71% of the excluded fare rows carry `payment_type = 0` and 34% have a
  negative total, indicating corrupted financial records rather than free rides.
