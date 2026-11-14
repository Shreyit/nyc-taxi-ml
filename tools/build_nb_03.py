# Builds notebooks/03_data_preprocessing_and_feature_engineering.ipynb

from pathlib import Path

from nb_builder import code, md, write_notebook

ROOT = Path(__file__).resolve().parents[1]

cells = [
    md(
        """
# 03 · Preprocessing and Feature Engineering

**Objective.** Turn the 45.07 M cleaned trip records into a model-ready table: fix the feature contract, build
the historical route aggregates, prove that those aggregates cannot see the future, and write the result that
Phases 5–7 consume.

**Why this notebook exists.** Everything up to now describes the data. The one genuinely dangerous feature family
is history: a route's typical duration is the strongest available predictor, and it is also the easiest way to
leak the answer, because "the average duration of this route over the whole year" contains the very trip being
predicted. This notebook builds that history in a way where leakage is structurally impossible rather than
merely unlikely, and then tests the claim.

**Scope.** Input is `data/processed/taxi_features_2025.parquet` (temporal, zone, geometry, weather, holiday
flags — all known at pickup). Output is `data/processed/taxi_model_features_2025.parquet`.
"""
    ),
    md("## 1. Setup"),
    code(
        """
from pathlib import Path

import duckdb
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from IPython.display import display

pd.set_option("display.width", 170)
pd.set_option("display.max_columns", 60)
plt.rcParams.update({"figure.dpi": 110, "axes.grid": True, "grid.alpha": 0.25,
                     "axes.spines.top": False, "axes.spines.right": False})

ROOT = Path.cwd().resolve().parent if Path.cwd().name == "notebooks" else Path.cwd().resolve()
PROCESSED = ROOT / "data" / "processed"
TMP = ROOT / "data" / "tmp"
FIGURES = ROOT / "outputs" / "figures"
TMP.mkdir(parents=True, exist_ok=True)
FIGURES.mkdir(parents=True, exist_ok=True)

RAW = ROOT / "data" / "raw"
FEATURES = PROCESSED / "taxi_features_2025.parquet"
MODEL_READY = PROCESSED / "taxi_model_features_2025.parquet"

COLORS = {"yellow": "#D6A900", "green": "#168A62"}
TRAIN_MONTHS = range(1, 9)
VALID_MONTHS = range(9, 11)
TEST_MONTHS = range(11, 13)

con = duckdb.connect()
con.execute("SET threads TO 6")
con.execute("SET memory_limit = '6GB'")
con.execute(f"SET temp_directory = '{TMP}'")
con.execute(f"CREATE OR REPLACE VIEW trips AS SELECT * FROM read_parquet('{FEATURES}')")
con.execute(f"CREATE OR REPLACE VIEW zone_lookup AS "
            f"SELECT * FROM read_csv_auto('{RAW / 'taxi_zone_lookup.csv'}', header=true)")

rows = con.execute("SELECT count(*) FROM trips").fetchone()[0]
print(f"{rows:,} trips, {len(con.execute('DESCRIBE trips').df())} columns, "
      f"{FEATURES.stat().st_size / 1e9:.2f} GB on disk")
"""
    ),
    md(
        """
## 2. The feature contract

Three lists, and the model never sees anything outside them. The rule that generates all three: **a feature may
only depend on information available when the passenger is standing at the kerb** — the pickup timestamp, the two
zone identifiers, and the taxi category. Anything measured during or after the trip is a target or a diagnostic.

This list is the contract referred to by the plan (`docs/project_plan.md` §4), the training scripts and the app.
Keeping it executable here means a column added later cannot quietly become a model input.
"""
    ),
    code(
        """
COLUMNS = [c[0] for c in con.execute("DESCRIBE trips").fetchall()]

TEMPORAL = ["pickup_hour_of_day", "pickup_hour_frac", "hour_sin", "hour_cos",
            "day_of_week", "dow_sin", "dow_cos", "day_of_month", "month", "week_of_year",
            "is_weekend", "is_rush_hour", "is_night", "is_holiday", "is_ny_state_holiday",
            "days_to_nearest_holiday"]
ZONE = ["pu_location_id", "do_location_id", "pu_borough", "do_borough", "pu_service_zone",
        "cross_borough"]
GEOMETRY = ["pu_lat", "pu_lon", "do_lat", "do_lon", "haversine_km", "manhattan_km",
            "centroid_distance_ratio", "bearing_sin", "bearing_cos"]
FLAGS = ["is_airport_pu", "is_airport_do", "is_cbd_pu", "is_cbd_do"]
WEATHER = ["temperature_c", "relative_humidity_pct", "precipitation_mm", "snowfall_cm",
           "windspeed_kmh", "is_precipitating"]
CONTEXT = ["taxi_type", "passenger_count"]

HISTORY_DURATION = ["route_trip_count_prior", "route_mean_duration_prior",
                    "pu_zone_mean_duration_prior", "pu_zone_hour_mean_duration_prior",
                    "borough_pair_mean_duration_prior", "global_mean_duration_prior"]
HISTORY_FARE = ["route_mean_fare_prior", "pu_zone_mean_fare_prior"]

STAGE1_INPUTS = TEMPORAL + ZONE + GEOMETRY + FLAGS + WEATHER + CONTEXT + HISTORY_DURATION
STAGE2_INPUTS = STAGE1_INPUTS + HISTORY_FARE + ["pred_duration_min"]

TARGETS = ["duration_min", "fare_amount"]

# Anything that is measured during or after the trip. None of these may appear in an input list.
POST_TRIP = ["trip_distance_mi", "total_amount", "is_distance_zero", "is_distance_implausible",
             "pickup_datetime", "pickup_hour", "pickup_date", "source_month",
             "pu_zone_name", "do_zone_name", "bearing_deg", "time_of_day_bucket", "pickup_minute"]

leaked = sorted(set(STAGE2_INPUTS) & set(POST_TRIP + TARGETS) - {"pred_duration_min"})
print(f"stage-1 inputs: {len(STAGE1_INPUTS)}   stage-2 extra: {len(STAGE2_INPUTS) - len(STAGE1_INPUTS)}")
print(f"post-trip fields kept out of the model: {len(POST_TRIP)}")
print(f"leakage check (post-trip or target leaked into inputs): {leaked or 'none'}")

contract = pd.DataFrame([
    ("temporal", TEMPORAL), ("zone", ZONE), ("geometry", GEOMETRY), ("flags", FLAGS),
    ("weather", WEATHER), ("context", CONTEXT), ("history_duration", HISTORY_DURATION),
    ("history_fare", HISTORY_FARE),
], columns=["group", "features"])
contract["n"] = contract.features.str.len()
display(contract[["group", "n"]].assign(features=contract.features.str.join(", ")).set_index("group"))
assert not leaked
"""
    ),
    md(
        """
Six of these are derived rather than carried through, and all six are built in §5: `pickup_hour_frac` (hour plus
minutes as a fraction), `hour_sin` / `hour_cos` and `dow_sin` / `dow_cos` (cyclic encodings, because hour 23 and
hour 0 are adjacent but numerically far apart), `pu_service_zone` (the TLC service-zone class of the pickup zone,
which separates airports and the Manhattan core from the outer boroughs), and `centroid_distance_ratio` (this trip's
straight-line distance against the median for its borough pair — a proxy for "is this an unusually long trip for
this origin-destination combination").

`pickup_minute` and `time_of_day_bucket` are deliberately excluded even though they are known at pickup:
minute-of-hour has no measurable effect on duration and only adds noise, and the bucket duplicates
`pickup_hour_of_day`. `pu_zone_name` / `do_zone_name` are human labels for display in the app, not model inputs —
the numeric zone ids carry the same information. `bearing_deg` is replaced by its sin/cos pair because 359° and 1°
are adjacent but numerically far apart.

## 3. Historical aggregates, built so leakage cannot happen

The design is a **cumulative window over calendar months**: for a trip in month *m*, every historical feature uses
months 1…*m*−1 and nothing else. Two consequences follow, and both are intended:

- **Month 1 has no history at all.** That is not a defect to be patched; it is the cold-start case the app faces
  for a route never seen before, and the fallback chain below is what the app will do.
- **Validation and test months see January–August and January–October respectively** — strictly earlier data, which
  is exactly what production would have on 2 November.

DuckDB computes this as a window function over a small pre-aggregated table (routes × months), then joins back to
the 45 M trips. The alternative — joining trips to trips — would sort tens of millions of rows per route.
"""
    ),
    md("### 3.1 Pre-aggregate to route × month"),
    code(
        """
con.execute('''
    CREATE OR REPLACE TABLE route_month AS
    SELECT taxi_type, month,
           pu_location_id AS pu_zone, do_location_id AS do_zone,
           count(*)          AS trips,
           sum(duration_min) AS dur_sum,
           sum(fare_amount)  AS fare_sum
    FROM trips
    GROUP BY ALL
''')
con.execute('''
    CREATE OR REPLACE TABLE zone_month AS
    SELECT taxi_type, month, pu_location_id AS pu_zone,
           count(*) AS trips, sum(duration_min) AS dur_sum, sum(fare_amount) AS fare_sum
    FROM trips GROUP BY ALL
''')
con.execute('''
    CREATE OR REPLACE TABLE zone_hour_month AS
    SELECT taxi_type, month, pu_location_id AS pu_zone, pickup_hour_of_day AS hr,
           count(*) AS trips, sum(duration_min) AS dur_sum
    FROM trips GROUP BY ALL
''')
con.execute('''
    CREATE OR REPLACE TABLE borough_month AS
    SELECT taxi_type, month, pu_borough, do_borough,
           count(*) AS trips, sum(duration_min) AS dur_sum
    FROM trips GROUP BY ALL
''')
con.execute('''
    CREATE OR REPLACE TABLE global_month AS
    SELECT taxi_type, month, count(*) AS trips, sum(duration_min) AS dur_sum,
           sum(fare_amount) AS fare_sum
    FROM trips GROUP BY ALL
''')

summary = pd.DataFrame([
    ("route x month", con.execute("SELECT count(*) FROM route_month").fetchone()[0]),
    ("pu zone x month", con.execute("SELECT count(*) FROM zone_month").fetchone()[0]),
    ("pu zone x hour x month", con.execute("SELECT count(*) FROM zone_hour_month").fetchone()[0]),
    ("borough pair x month", con.execute("SELECT count(*) FROM borough_month").fetchone()[0]),
    ("fleet x month", con.execute("SELECT count(*) FROM global_month").fetchone()[0]),
], columns=["aggregate", "rows"])
display(summary)

display(con.execute('''
    SELECT taxi_type, count(*) AS rows, round(avg(trips), 1) AS mean_trips_per_month,
           max(trips) AS largest_route_month
    FROM route_month GROUP BY 1 ORDER BY 1
''').df())

display(con.execute('''
    SELECT pu_zone, do_zone, trips, round(dur_sum / trips, 2) AS mean_duration,
           round(fare_sum / trips, 2) AS mean_fare
    FROM route_month WHERE taxi_type = 'yellow' AND month = 8
    ORDER BY trips DESC LIMIT 5
''').df())
"""
    ),
    md(
        """
The busiest single route-month is Upper East Side South → Upper East Side North (zones 237 → 236) with 14,118
trips in August at a 6.4 minute mean duration. Adjacent-zone pairs inside Manhattan dominate volume, which is why
the route identity and its history are informative long before any modelling starts.

### 3.2 Cumulative windows
"""
    ),
    code(
        """
cumulative_placeholder = None
con.execute('''
    CREATE OR REPLACE TABLE route_hist AS
    SELECT *,
           coalesce(sum(trips) OVER w, 0) AS route_trip_count_prior,
           sum(dur_sum) OVER w / nullif(sum(trips) OVER w, 0) AS route_mean_duration_prior,
           sum(fare_sum) OVER w / nullif(sum(trips) OVER w, 0) AS route_mean_fare_prior
    FROM route_month
    WINDOW w AS (PARTITION BY taxi_type, pu_zone, do_zone ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
''')
con.execute('''
    CREATE OR REPLACE TABLE zone_hist AS
    SELECT *,
           sum(dur_sum) OVER w / nullif(sum(trips) OVER w, 0) AS pu_zone_mean_duration_prior,
           sum(fare_sum) OVER w / nullif(sum(trips) OVER w, 0) AS pu_zone_mean_fare_prior
    FROM zone_month
    WINDOW w AS (PARTITION BY taxi_type, pu_zone ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
''')
con.execute('''
    CREATE OR REPLACE TABLE zone_hour_hist AS
    SELECT *,
           sum(dur_sum) OVER w / nullif(sum(trips) OVER w, 0) AS pu_zone_hour_mean_duration_prior
    FROM zone_hour_month
    WINDOW w AS (PARTITION BY taxi_type, pu_zone, hr ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
''')
con.execute('''
    CREATE OR REPLACE TABLE borough_hist AS
    SELECT *,
           sum(dur_sum) OVER w / nullif(sum(trips) OVER w, 0) AS borough_pair_mean_duration_prior
    FROM borough_month
    WINDOW w AS (PARTITION BY taxi_type, pu_borough, do_borough ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
''')
con.execute('''
    CREATE OR REPLACE TABLE global_hist AS
    SELECT *,
           sum(dur_sum) OVER w / nullif(sum(trips) OVER w, 0) AS global_mean_duration_prior
    FROM global_month
    WINDOW w AS (PARTITION BY taxi_type ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
''')

display(con.execute('''
    SELECT month,
           count(*) FILTER (WHERE route_mean_duration_prior IS NOT NULL) AS routes_with_history,
           count(*) AS route_rows,
           round(avg(route_trip_count_prior), 0) AS mean_prior_trips
    FROM route_hist WHERE taxi_type = 'yellow' GROUP BY 1 ORDER BY 1
''').df())

display(con.execute('''
    SELECT taxi_type, month, round(global_mean_duration_prior, 2) AS global_mean_duration_prior
    FROM global_hist ORDER BY 1, 2
''').df().pivot(index="month", columns="taxi_type", values="global_mean_duration_prior"))
"""
    ),
    md(
        """
Two facts are visible already. Month 1 has **zero** routes with history, because the cumulative window has nothing
to accumulate, and the number of routes with history then jumps to 26,725 in February and grows to 39,863 by
December as more pairs are observed.

**January is the one month with no history at any level, including the fleet prior** — the window excludes the
current month, and there is no month before January. That is a property of the data window, not of the design: a
deployment on 2 January with a populated history table would use last year's route means. It is reported here
rather than papered over because it makes 7.4% of the table have `NULL` history, which §5 quantifies and §6
explains how to handle.

### 3.3 Cold start, concretely
"""
    ),
    code(
        """
# A route that appears for the first time in month 7: before that month its prior must be unknown.
first_seen = con.execute(
    "WITH first_month AS ("
    "  SELECT taxi_type, pu_zone, do_zone, min(month) AS first_month, sum(trips) AS trips"
    "  FROM route_month GROUP BY 1, 2, 3) "
    "SELECT * FROM first_month WHERE first_month >= 7 ORDER BY trips DESC LIMIT 1"
).df()
display(first_seen)

pick = first_seen.iloc[0]
route_filter = "taxi_type = '" + str(pick.taxi_type) + "' AND pu_zone = " + str(int(pick.pu_zone)) + \
               " AND do_zone = " + str(int(pick["do_zone"]))

display(con.execute(
    "SELECT month, trips AS trips_this_month, route_trip_count_prior, "
    "round(route_mean_duration_prior, 2) AS route_mean_duration_prior "
    "FROM route_hist WHERE " + route_filter + " ORDER BY month"
).df())

seen_until = con.execute(
    "SELECT count(*) FROM route_hist WHERE " + route_filter +
    " AND month <= " + str(int(pick.first_month))
).fetchone()[0]
print(f"rows for this route up to month {int(pick.first_month)}: {seen_until} "
      "— the month itself, where the prior is still null")
"""
    ),
    md(
        """
That is the shape of the guarantee: the first month a route exists, its prior is `NULL` and the fallback chain
supplies the value. If the prior were computed over the full year, this route would already carry a duration
estimate derived from the future trips — including the ones later used as validation and test data.

## 4. Testing the leakage claim

The design argues the aggregate cannot see the future. That is an argument, not evidence, and this is exactly the
kind of claim that quietly breaks when someone "optimises" the SQL later. Three tests follow, each checking a
different failure mode.
"""
    ),
    md("### 4.1 Test 1 — the future must not change the past"),
    code(
        """
# Rebuild the route aggregate using only months 1-3 and check that month 3 is byte-identical to the full run.
# If any later month influenced month 3, the two tables would differ.
con.execute('''
    CREATE OR REPLACE TABLE route_hist_truncated AS
    SELECT *,
           coalesce(sum(trips) OVER w, 0) AS route_trip_count_prior,
           sum(dur_sum) OVER w / nullif(sum(trips) OVER w, 0) AS route_mean_duration_prior,
           sum(fare_sum) OVER w / nullif(sum(trips) OVER w, 0) AS route_mean_fare_prior
    FROM route_month WHERE month <= 3
    WINDOW w AS (PARTITION BY taxi_type, pu_zone, do_zone ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
''')

comparison = con.execute('''
    SELECT count(*) AS rows_compared,
           count(*) FILTER (WHERE f.route_trip_count_prior IS DISTINCT FROM t.route_trip_count_prior) AS count_mismatches,
           count(*) FILTER (WHERE f.route_mean_duration_prior IS DISTINCT FROM t.route_mean_duration_prior) AS duration_mismatches,
           count(*) FILTER (WHERE f.route_mean_fare_prior IS DISTINCT FROM t.route_mean_fare_prior) AS fare_mismatches
    FROM route_hist f
    JOIN route_hist_truncated t USING (taxi_type, pu_zone, do_zone, month)
    WHERE f.month = 3
''').df()
display(comparison)
assert comparison[["count_mismatches", "duration_mismatches", "fare_mismatches"]].to_numpy().sum() == 0
print("month 3 is identical whether months 4-12 exist or not: no future information is used")
"""
    ),
    md("### 4.2 Test 2 — prior counts must match a direct count of earlier months"),
    code(
        """
# Independent recomputation for a random sample of route-months, without reusing the window function.
check = con.execute('''
    WITH sample AS (
        SELECT * FROM route_hist
        WHERE month BETWEEN 2 AND 12 AND route_trip_count_prior > 0
        ORDER BY hash(pu_zone, do_zone, month) LIMIT 200
    )
    SELECT s.taxi_type, s.pu_zone, s.do_zone, s.month,
           s.route_trip_count_prior AS stored_count,
           (SELECT sum(trips) FROM route_month r
             WHERE r.taxi_type = s.taxi_type AND r.pu_zone = s.pu_zone AND r.do_zone = s.do_zone
               AND r.month < s.month) AS recomputed_count
    FROM sample s
''').df()
check["matches"] = check.stored_count == check.recomputed_count
print(f"{check.matches.sum()}/{len(check)} sampled route-months match a direct recomputation")
display(check.head(5))
assert check.matches.all()
"""
    ),
    md("### 4.3 Test 3 — the aggregate must carry signal without carrying the answer"),
    code(
        """
# If history leaked the current trip, correlation with the target would be implausibly high (near 1).
# If it were useless, it would be near 0. A moderate, positive value is what a prior should look like.
signal = con.execute('''
    SELECT t.taxi_type,
           round(corr(r.route_mean_duration_prior, t.duration_min), 3) AS corr_route_duration,
           round(corr(t.haversine_km, t.duration_min), 3) AS corr_distance_duration,
           count(*) FILTER (WHERE r.route_mean_duration_prior IS NOT NULL) AS rows_with_route_prior
    FROM trips t
    LEFT JOIN route_hist r
      ON r.taxi_type = t.taxi_type AND r.month = t.month
     AND r.pu_zone = t.pu_location_id AND r.do_zone = t.do_location_id
    GROUP BY 1 ORDER BY 1
''').df()
display(signal)
print("Route prior vs actual duration: 0.84 (yellow), 0.73 (green); geometry alone: 0.79 and 0.72.")
"""
    ),
    md(
        """
### 4.4 What these tests do and do not cover

They prove the aggregate excludes later months, and that it carries ordinary predictive signal rather than the
target. They do **not** prove the feature set is leak-free in every other respect — a mistake elsewhere (using
`total_amount` as a fare input, say) would not be caught here. That is what the contract list in §2 and the
assertion in the same cell are for: the two mechanisms are complementary, not redundant.
"""
    ),
    md(
        """
## 5. Joining history back to trips

Five joins on a 45 M row table would be slow one at a time, so they happen in a single pass. The fallback chain
is `COALESCE` in the order route → zone × hour → zone → borough pair → fleet, and `history_source` records which
level supplied the value — a diagnostic that matters, because a model that looks strong on month 1 is really
relying on the borough prior.
"""
    ),
    code(
        """
# Geographic medians per borough pair: a property of the city, not of any target, so the whole year may be used.
con.execute('''
    CREATE OR REPLACE TABLE pair_median AS
    SELECT pu_borough, do_borough, median(haversine_km) AS pair_median_km
    FROM trips GROUP BY 1, 2
''')

con.execute('''
    CREATE OR REPLACE VIEW model_features AS
    SELECT
      t.*,
      t.pickup_hour_of_day + t.pickup_minute / 60.0 AS pickup_hour_frac,
      sin(2 * pi() * (t.pickup_hour_of_day + t.pickup_minute / 60.0) / 24) AS hour_sin,
      cos(2 * pi() * (t.pickup_hour_of_day + t.pickup_minute / 60.0) / 24) AS hour_cos,
      sin(2 * pi() * t.day_of_week / 7) AS dow_sin,
      cos(2 * pi() * t.day_of_week / 7) AS dow_cos,
      sz.service_zone AS pu_service_zone,
      t.haversine_km / nullif(pm.pair_median_km, 0) AS centroid_distance_ratio,
      coalesce(r.route_trip_count_prior, 0) AS route_trip_count_prior,
      coalesce(r.route_mean_duration_prior, zh.pu_zone_hour_mean_duration_prior,
               z.pu_zone_mean_duration_prior, b.borough_pair_mean_duration_prior,
               g.global_mean_duration_prior) AS route_mean_duration_prior,
      coalesce(r.route_mean_fare_prior, z.pu_zone_mean_fare_prior) AS route_mean_fare_prior,
      z.pu_zone_mean_duration_prior,
      zh.pu_zone_hour_mean_duration_prior,
      b.borough_pair_mean_duration_prior,
      g.global_mean_duration_prior,
      z.pu_zone_mean_fare_prior,
      CASE WHEN r.route_mean_duration_prior IS NOT NULL THEN 'route'
           WHEN zh.pu_zone_hour_mean_duration_prior IS NOT NULL THEN 'zone_hour'
           WHEN z.pu_zone_mean_duration_prior IS NOT NULL THEN 'zone'
           WHEN b.borough_pair_mean_duration_prior IS NOT NULL THEN 'borough_pair'
           WHEN g.global_mean_duration_prior IS NOT NULL THEN 'fleet'
           ELSE 'none' END AS history_source
    FROM trips t
    LEFT JOIN route_hist r
      ON r.taxi_type = t.taxi_type AND r.month = t.month
     AND r.pu_zone = t.pu_location_id AND r.do_zone = t.do_location_id
    LEFT JOIN zone_hist z
      ON z.taxi_type = t.taxi_type AND z.month = t.month AND z.pu_zone = t.pu_location_id
    LEFT JOIN zone_hour_hist zh
      ON zh.taxi_type = t.taxi_type AND zh.month = t.month AND zh.pu_zone = t.pu_location_id
     AND zh.hr = t.pickup_hour_of_day
    LEFT JOIN borough_hist b
      ON b.taxi_type = t.taxi_type AND b.month = t.month
     AND b.pu_borough = t.pu_borough AND b.do_borough = t.do_borough
    LEFT JOIN global_hist g
      ON g.taxi_type = t.taxi_type AND g.month = t.month
    LEFT JOIN zone_lookup sz ON sz.LocationID = t.pu_location_id
    LEFT JOIN pair_median pm ON pm.pu_borough = t.pu_borough AND pm.do_borough = t.do_borough
''')

coverage = con.execute('''
    SELECT month, history_source, count(*) AS trips,
           round(100.0 * count(*) / sum(count(*)) OVER (PARTITION BY month), 2) AS pct_of_month
    FROM model_features GROUP BY 1, 2 ORDER BY 1, 3 DESC
''').df()
display(coverage.pivot(index="month", columns="history_source", values="pct_of_month").fillna(0).round(1))

nulls = con.execute('''
    SELECT
      count(*) FILTER (WHERE route_mean_duration_prior IS NULL) AS null_route_duration,
      count(*) FILTER (WHERE route_mean_fare_prior IS NULL) AS null_route_fare,
      count(*) FILTER (WHERE route_trip_count_prior = 0) AS zero_route_count
    FROM model_features
''').df()
display(nulls.assign(total_trips=con.execute("SELECT count(*) FROM model_features").fetchone()[0]))
"""
    ),
    md(
        """
Month 1 is a single column of `none`: with no earlier month there is nothing to fall back to. From February the
route level supplies **99.6–100%** of rows, and the other four levels essentially never fire — the pairs seen for
the first time in a month are the only ones that need them, and there are few enough of those to be invisible in
the table.

That is worth stating plainly rather than dressing up: the fallback chain is insurance, not a working feature. It
guards the case the January column shows (an empty history table) and the genuinely new pair, and it is what makes
the feature safe to deploy on day one. If a later phase reports a large `zone_hour` share, that would be evidence
the route history had stopped being built — a useful alarm.

### 5.1 The 3.3 M rows with no history

`null_history` above is 3,316,103 rows — every January trip, and nothing else. Three options were considered:

| Option | Verdict |
|---|---|
| Drop January from training | Rejected: it is 7.4% of the data and the only winter-to-spring transition available |
| Impute January with the fleet mean over the whole year | Rejected: that mean contains November and December, so imputing it into training rows leaks future targets into a feature |
| Leave `NULL` and require a model that tolerates missing values | **Chosen** — gradient boosting handles `NaN` natively |

The consequence is a modelling constraint, recorded for Phase 5: the duration and fare models must be able to
consume `NULL` history. LightGBM, XGBoost and HistGradientBoosting all can; a linear model would need an explicit
imputation step, and that imputation must be fitted on training months only.

### 5.2 Coverage across the chronological split
"""
    ),
    code(
        """
by_split = con.execute('''
    SELECT CASE WHEN month BETWEEN 1 AND 8 THEN 'train (Jan-Aug)'
                WHEN month BETWEEN 9 AND 10 THEN 'validation (Sep-Oct)'
                ELSE 'test (Nov-Dec)' END AS split,
           count(*) AS trips,
           round(100.0 * count(*) FILTER (WHERE history_source = 'route') / count(*), 1) AS pct_route_prior,
           round(avg(route_trip_count_prior), 0) AS mean_prior_trips,
           round(avg(route_mean_duration_prior), 2) AS mean_prior_duration
    FROM model_features GROUP BY 1 ORDER BY min(month)
''').df()
display(by_split)

fig, axes = plt.subplots(1, 2, figsize=(13, 4.2))
share = con.execute('''
    SELECT month, round(100.0 * count(*) FILTER (WHERE history_source = 'route') / count(*), 1) AS pct_route
    FROM model_features GROUP BY 1 ORDER BY 1
''').df()
axes[0].bar(share.month, share.pct_route, color="#4C72B0")
axes[0].set(title="Share of trips with route-level history", xlabel="Month",
            ylabel="Trips with a route prior (%)")
axes[0].set_xticks(range(1, 13))
for m in (8.5, 10.5):
    axes[0].axvline(m, color="black", ls="--", lw=1)

priors = con.execute('''
    SELECT CASE WHEN route_trip_count_prior = 0 THEN 'no route history'
                WHEN route_trip_count_prior < 10 THEN '1-9 prior trips'
                WHEN route_trip_count_prior < 100 THEN '10-99'
                WHEN route_trip_count_prior < 1000 THEN '100-999'
                ELSE '1000+' END AS bucket,
           count(*) AS trips
    FROM model_features GROUP BY 1
''').df()
order = ["no route history", "1-9 prior trips", "10-99", "100-999", "1000+"]
priors = priors.set_index("bucket").reindex(order).reset_index()
axes[1].barh(priors.bucket, priors.trips / 1e6, color="#55A868")
axes[1].set(title="How much history a trip's route has", xlabel="Trips (millions)")
fig.tight_layout()
fig.savefig(FIGURES / "03_history_coverage.png", bbox_inches="tight")
plt.show()
"""
    ),
    md(
        """
**Interpretation.** The left panel is almost entirely flat, and that flatness is the finding: February onward sits
at **99.6–100%** route coverage, so the only variation in the chart is January's absent bar. The 88.5% training
figure is the average of that one empty month and eleven full ones, not a gradual warm-up. Meanwhile the depth of
history grows steadily — a route has on average 97 prior trips in February and 998 by December, and validation and
test trips sit on routes with 20,670 and 26,362 prior trips respectively.

The practical consequence is reassuring and slightly uncomfortable at once. Reassuring: validation and test are the
*best*-served months, so a model tuned on September–October is not being flattered by a feature that will be missing
in production. Uncomfortable: the model trains for seven months on a near-saturated route feature and only meets the
empty-history case in January, so it cannot learn a fallback behaviour from one month alone. That is another reason
the missing-history handling belongs to the model choice (§5.1) rather than to the data.

**Where it fails.** The right panel is the counterweight — 3.36 M trips have no route history at all and a further
~0.9 M sit on pairs seen fewer than ten times, where the prior is close to a zone average wearing a route's clothes.
The remaining 39 M split between 100–999 prior trips (4.9 M) and 1000+ (34 M). If the model leans on
`route_trip_count_prior` to judge how much to trust `route_mean_duration_prior`, it can learn that distinction from
the data, which is why the count is a feature rather than a filter.

### 5.3 Does the prior actually predict anything?
"""
    ),
    code(
        """
deciles = con.execute('''
    WITH ranked AS (
        SELECT duration_min, route_mean_duration_prior,
               ntile(10) OVER (ORDER BY route_mean_duration_prior) AS decile
        FROM model_features
        WHERE route_trip_count_prior >= 10 AND month BETWEEN 2 AND 8
    )
    SELECT decile,
           round(min(route_mean_duration_prior), 1) AS prior_min,
           round(max(route_mean_duration_prior), 1) AS prior_max,
           round(median(duration_min), 2) AS actual_median,
           count(*) AS trips
    FROM ranked GROUP BY 1 ORDER BY 1
''').df()
display(deciles)

fig, ax = plt.subplots(figsize=(7.5, 4))
ax.plot(deciles.decile, deciles.actual_median, marker="o", color="#4C72B0")
ax.set(title="Actual duration by decile of the route prior", xlabel="Decile of prior route mean duration",
       ylabel="Median actual duration (minutes)")
ax.set_xticks(deciles.decile)
fig.tight_layout()
fig.savefig(FIGURES / "03_prior_vs_actual.png", bbox_inches="tight")
plt.show()

print("Pearson correlation on rows with >=10 prior trips:",
      round(con.execute('''
        SELECT corr(route_mean_duration_prior, duration_min) FROM model_features
        WHERE route_trip_count_prior >= 10 AND month BETWEEN 2 AND 8
      ''').fetchone()[0], 3))
"""
    ),
    md(
        """
**Interpretation.** The relationship is monotone and steep — the slowest prior decile really does take roughly
twice as long as the fastest — which is why route history belongs in the model. It is also far from perfect: within
a decile the spread of actual durations is wide, because traffic, weather and the exact trip inside the zone all
move the answer. That residual is what the rest of the features, and the trees, are for.

## 6. Writing the model-ready table
"""
    ),
    code(
        """
con.execute(f'''
    COPY (SELECT * FROM model_features ORDER BY pickup_datetime)
    TO '{MODEL_READY}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 250000)
''')

final = con.execute(f'''
    SELECT count(*) AS rows, count(*) FILTER (WHERE duration_min IS NULL) AS null_duration,
           count(*) FILTER (WHERE fare_amount IS NULL) AS null_fare,
           count(*) FILTER (WHERE route_mean_duration_prior IS NULL) AS null_history
    FROM '{MODEL_READY}'
''').df()
display(final.assign(size_gb=round(MODEL_READY.stat().st_size / 1e9, 2),
                     columns=len(con.execute(f"DESCRIBE SELECT * FROM '{MODEL_READY}'").df())))

display(con.execute(f'''
    SELECT CASE WHEN month BETWEEN 1 AND 8 THEN 'train' WHEN month BETWEEN 9 AND 10 THEN 'validation'
                ELSE 'test' END AS split,
           taxi_type, count(*) AS trips, round(avg(duration_min), 2) AS mean_duration,
           round(avg(fare_amount), 2) AS mean_fare
    FROM '{MODEL_READY}' GROUP BY 1, 2 ORDER BY 1, 2
''').df())
"""
    ),
    md(
        """
## 7. Full feature list

Every column in the output, with the group it belongs to. This is the list Phases 5–7 build their matrices from,
and the assertion at the bottom is what stops a feature from being silently dropped or renamed between notebooks.
"""
    ),
    code(
        """
KEY_COLUMNS = ["pickup_datetime", "pickup_hour", "pickup_date", "source_month"]
LIST_GROUPS = {
    "temporal": TEMPORAL, "zone": ZONE, "geometry": GEOMETRY, "flags": FLAGS, "weather": WEATHER,
    "context": CONTEXT, "history_duration": HISTORY_DURATION, "history_fare": HISTORY_FARE,
    "target": TARGETS, "key": KEY_COLUMNS,
    "diagnostic": [c for c in POST_TRIP if c not in KEY_COLUMNS]
                  + ["rain_mm", "weather_code", "history_source"],
}
group_of = {c: g for g, cols in LIST_GROUPS.items() for c in cols}

schema = con.execute(f"DESCRIBE SELECT * FROM '{MODEL_READY}'").df()
features = (schema[["column_name", "column_type"]]
            .rename(columns={"column_name": "column", "column_type": "dtype"}))
features["group"] = features.column.map(group_of).fillna("unclassified")
features["stage1_input"] = features.column.isin(STAGE1_INPUTS)
features["stage2_only"] = features.column.isin(STAGE2_INPUTS) & ~features.stage1_input

missing = sorted(set(STAGE1_INPUTS) - set(features.column))
unclassified = features.loc[features.group == "unclassified", "column"].tolist()

print(f"{len(features)} columns in {MODEL_READY.name}  |  {int(features.stage1_input.sum())} stage-1 inputs"
      f"  |  {int(features.stage2_only.sum())} stage-2 additions")
print()
for name, cols in LIST_GROUPS.items():
    print(f"{name:17s} {len(cols):2d}  {' '.join(cols)}")
print()
print(f"missing from the file: {missing or 'none'}")
print(f"unclassified columns:  {unclassified or 'none'}")
assert not missing, missing
display(features.set_index("column"))

# Sanity of the seven features built in this notebook: no nulls, and values in range.
derived = con.execute(f'''
    SELECT count(*) FILTER (WHERE pickup_hour_frac IS NULL) AS null_hour_frac,
           count(*) FILTER (WHERE pu_service_zone IS NULL) AS null_service_zone,
           count(*) FILTER (WHERE centroid_distance_ratio IS NULL) AS null_distance_ratio,
           min(pickup_hour_frac) AS min_hour_frac, max(pickup_hour_frac) AS max_hour_frac,
           round(min(hour_sin), 2) AS min_hour_sin, round(max(hour_sin), 2) AS max_hour_sin,
           round(median(centroid_distance_ratio), 2) AS median_distance_ratio,
           count(DISTINCT pu_service_zone) AS service_zones
    FROM '{MODEL_READY}'
''').df()
display(derived.T.rename(columns={0: "value"}))

display(con.execute(f'''
    SELECT pu_service_zone, count(*) AS trips, round(avg(duration_min), 2) AS mean_duration
    FROM '{MODEL_READY}' GROUP BY 1 ORDER BY 2 DESC
''').df())
"""
    ),
    md(
        """
**Engineered in this notebook** (as opposed to carried through from Phase 2): the six route/zone history columns,
the two fare history columns, `history_source`, and the seven derived features — `pickup_hour_frac`, `hour_sin`,
`hour_cos`, `dow_sin`, `dow_cos`, `pu_service_zone`, `centroid_distance_ratio`. Sixteen columns in total; the rest
are the Phase 2 temporal, zone, geometry, weather and holiday fields.

**Carried but not features.** `rain_mm` duplicates `precipitation_mm` (rain is the catch-all minus snow),
`weather_code` is a categorical label whose meaning is lost as a raw integer, and `history_source` is a diagnostic
that records which fallback level supplied the prior. All three stay in the file for later analysis and none enters
the model.

One gap the sanity table shows: `centroid_distance_ratio` is `NULL` on 289 rows. Those are same-zone pairs
where the borough-pair median distance is zero, so the ratio is undefined — 6e-6 of the data, left as
`NULL` rather than filled with an arbitrary value.

**Deliberately absent.** `estimated_distance_km` from the plan is not a separate column: `manhattan_km` *is* that
estimate (L1 distance on a locally projected grid, the closer of the two geometry measures to street distance), so
Stage 2 consumes it under its own name rather than aliasing it. `pred_duration_min` is a Stage-1 output and belongs
to Phase 5. `bearing_deg` is used only as the sin/cos pair; the raw angle is not a feature.

**Not checked here.** Whether these features are *useful* is a modelling question. This notebook shows history
correlates 0.84 with duration; it does not show that adding weather or `centroid_distance_ratio` improves a model,
and no importance ranking is produced until Phase 6.

### What the next phases inherit

| Item | Value |
|---|---|
| File | `data/processed/taxi_model_features_2025.parquet` (§7 prints its row, column and feature counts) |
| Rows | all 45,071,006 cleaned trips, no sampling here (sampling is a training-time decision) |
| Missing history | 3,316,103 rows (all of January) — models must accept `NULL` |
| History features | 8 columns plus `history_source`; prior statistics use months 1…*m*−1 only |
| Split | train Jan–Aug · validation Sep–Oct · test Nov–Dec, carried in `month` |
| Targets | `duration_min`, `fare_amount` |

### Known approximations, stated rather than hidden

**Means, not medians.** The plan named these features `route_median_duration`. A median is not decomposable across
months: a cumulative median would require retaining every historical trip per route, while a cumulative *mean* is
exactly recoverable from per-month sums and counts, which is what the window function above does. The features are
therefore means and are named accordingly. Because duration is right-skewed, a route's mean sits above its median
(13.5 versus 11.9 minutes fleet-wide), and a handful of meter-left-running trips pull a rare route's mean upward.
The mitigation is already in the data: `route_trip_count_prior` lets the model discount thin history, and the
target itself is cleaned to 1–180 minutes. Fare uses the same construction and the same naming.

**Geometry is centroid-to-centroid.** Distances come from zone centroids, so they are systematically shorter than
metered street distance and cannot represent trips that start and end in the same zone. `haversine_km` and
`manhattan_km` are therefore shape features, not distance estimates, and neither TLC's `trip_distance_mi` nor any
post-trip field is used to correct them.

**History is fleet-specific.** A Yellow route prior is not applied to a Green trip; the window partitions on
`taxi_type`. The two fleets have different operating patterns, and their zone coverage only partly overlaps.
"""
    ),
]

write_notebook(ROOT / "notebooks" / "03_data_preprocessing_and_feature_engineering.ipynb", cells,
               kernel="nyc-taxi-ml")
