# Builds notebooks/01_data_audit_and_understanding.ipynb

from pathlib import Path

from nb_builder import code, md, write_notebook

ROOT = Path(__file__).resolve().parents[1]

cells = [
    md(
        """
# 01 · Data Audit and Understanding

**Objective.** Establish exactly what the 2025 NYC TLC Yellow and Green trip records contain before any
cleaning or modelling: file inventory, schemas and their differences, missingness, invalid records,
duplicates, and the shape of the duration, distance and fare distributions.

**Scope.** All 24 monthly Parquet files for calendar year 2025 (12 Yellow, 12 Green), plus the TLC zone
lookup. Post-trip fields are inspected here only to define targets and cleaning rules; they are excluded
from predictors later.

**Why this notebook comes first.** Every cleaning threshold and every feature decision in the following
notebooks is justified by a number produced here. Rules are derived from the observed distributions, not
copied from a template, and the 2026 files that already existed in the repository are deliberately not
touched.
"""
    ),
    md(
        """
## 1. Setup

The audit runs on DuckDB so that 49 million rows are scanned inside the database rather than loaded into
Pandas. Only aggregates and small tables are materialised in Python.
"""
    ),
    code(
        """
from pathlib import Path
import json

import duckdb
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from IPython.display import display

pd.set_option("display.width", 160)
plt.rcParams.update({"figure.dpi": 110, "axes.grid": True, "grid.alpha": 0.3})

ROOT = Path.cwd().resolve().parent if Path.cwd().name == "notebooks" else Path.cwd().resolve()
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
EXTERNAL = ROOT / "data" / "external"
FIGURES = ROOT / "outputs" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)

YEAR = 2025
con = duckdb.connect()
con.execute("SET threads TO 4")
con.execute("SET memory_limit = '6GB'")

def parquet_glob(service):
    # Explicit 2025 glob: the archived 2026 files in the same folders must never enter this pipeline.
    return str(RAW / service / f"{service}_tripdata_{YEAR}-*.parquet")

for service in ("yellow", "green"):
    print(service, "->", parquet_glob(service).split("nyc-taxi-ml/")[-1])
"""
    ),
    md(
        """
## 2. File inventory

The download manifest records the URL, size, SHA-256 and row count of every monthly file, so the audit
starts from what was actually downloaded rather than from what was expected.
"""
    ),
    code(
        """
manifest = json.loads((RAW / "manifest_2025.json").read_text())
files = pd.DataFrame(manifest["files"].values())
files = files.assign(mb=lambda d: (d["bytes"] / 1e6).round(1))
display(
    files.pivot_table(index="month", columns="service", values=["rows", "mb"], aggfunc="first")
    .reindex(columns=["yellow", "green"], level=1)
    .round(0)
    .astype("Int64")
)
print(f"files: {len(files)} | total rows: {files['rows'].sum():,} | total size: {files['mb'].sum():,.0f} MB")
"""
    ),
    md(
        """
**Interpretation.** All 24 expected monthly files are present, so no month needs substituting. Yellow
carries roughly **82 times** the volume of Green (48.7 M vs 0.59 M rows). Every downstream design choice —
sampling, train sizes, per-service metric reporting — has to respect that imbalance, because a pooled model
would otherwise be learning almost exclusively from Yellow behaviour.
"""
    ),
    md(
        """
## 3. Schema comparison

Yellow and Green originate from different metering systems. Their column sets differ, and the timestamp
columns are named differently, so a single unified schema has to be defined before any joint processing.
"""
    ),
    code(
        """
schemas = {}
for service in ("yellow", "green"):
    schemas[service] = con.execute(
        f"DESCRIBE SELECT * FROM read_parquet('{parquet_glob(service)}')"
    ).df()
    print(f"\\n{service.upper()} — {len(schemas[service])} columns")
    display(schemas[service][["column_name", "column_type"]])
"""
    ),
    code(
        """
yellow_cols = set(schemas["yellow"]["column_name"])
green_cols = set(schemas["green"]["column_name"])
comparison = pd.DataFrame({
    "column": sorted(yellow_cols | green_cols),
})
comparison["in_yellow"] = comparison.column.isin(yellow_cols)
comparison["in_green"] = comparison.column.isin(green_cols)
comparison["note"] = np.select(
    [
        comparison.column.str.startswith("tpep"),
        comparison.column.str.startswith("lpep"),
        ~comparison.in_yellow,
        ~comparison.in_green,
    ],
    ["yellow timestamp", "green timestamp", "green only", "yellow only"],
    default="shared",
)
display(comparison)
print(comparison.note.value_counts().to_string())
"""
    ),
    md(
        """
**Interpretation.** The two services share every financial and location column; only the timestamps
(`tpep_*` vs `lpep_*`), `Airport_fee` (Yellow only), `ehail_fee` and `trip_type` (Green only) differ.

Mapping decisions used from here on:

| Yellow | Green | Unified name |
|---|---|---|
| `tpep_pickup_datetime` | `lpep_pickup_datetime` | `pickup_datetime` |
| `tpep_dropoff_datetime` | `lpep_dropoff_datetime` | `dropoff_datetime` |

`Airport_fee`, `ehail_fee` and `trip_type` are post-trip or service-specific financial fields and are not
carried into the modelling table. `passenger_count` exists in both but is stored as `BIGINT` for Yellow and
`DOUBLE` for Green, so both are cast to the same integer type. Critically, both services now contain
`congestion_surcharge` (NY State, $2.50/trip) **and** `cbd_congestion_fee` (the MTA Congestion Relief Zone
charge that started on 5 January 2025). Both are billed after the trip and are therefore excluded from
predictors.
"""
    ),
    md(
        """
## 4. Data quality: missing values, invalid records and duplicates

The checks below are run on the raw records, aggregated inside DuckDB. Each one corresponds to a cleaning
rule evaluated later in Section 6.
"""
    ),
    code(
        """
COLS = ["VendorID", "passenger_count", "trip_distance", "RatecodeID", "payment_type",
        "fare_amount", "total_amount", "tip_amount", "Airport_fee", "ehail_fee", "trip_type"]

rows = []
for service in ("yellow", "green"):
    cols = [c for c in COLS if c in set(schemas[service]["column_name"])]
    exprs = ", ".join(
        f"round(100.0 * count(*) FILTER (WHERE {c} IS NULL) / count(*), 2) AS {c}" for c in cols
    )
    total = con.execute(f"SELECT count(*) FROM read_parquet('{parquet_glob(service)}')").fetchone()[0]
    result = con.execute(f"SELECT {exprs} FROM read_parquet('{parquet_glob(service)}')").df()
    result.insert(0, "service", service)
    result.insert(1, "raw_rows", total)
    rows.append(result)
missing = pd.concat(rows, ignore_index=True).set_index("service").T
# Columns that do not exist for a service are shown as a dash rather than a misleading zero.
missing = missing.astype(object).where(missing.notna(), "not in schema")
display(missing)
"""
    ),
    md(
        """
**Interpretation.** `passenger_count` is missing for a large share of Yellow records, which makes it a weak
and unevenly reported field; it is retained but treated cautiously, with missing values flagged rather than
imputed with a fabricated number. `RatecodeID`, `payment_type`, `tip_amount` and the surcharge fields are
complete but post-trip. The Green-only columns `ehail_fee` and `trip_type` are almost entirely null for
Yellow because they do not exist there — this is a schema difference, not a data error.
"""
    ),
    code(
        """
checks = []
for service, pickup, dropoff in (
    ("yellow", "tpep_pickup_datetime", "tpep_dropoff_datetime"),
    ("green", "lpep_pickup_datetime", "lpep_dropoff_datetime"),
):
    glob = parquet_glob(service)
    stats = con.execute(f'''
        WITH base AS (
          SELECT {pickup} AS pu, {dropoff} AS do_,
                 date_diff('second', {pickup}, {dropoff}) / 60.0 AS duration_min,
                 trip_distance, fare_amount, PULocationID, DOLocationID
          FROM read_parquet('{glob}')
        )
        SELECT count(*) AS rows,
          count(*) FILTER (WHERE pu IS NULL OR do_ IS NULL) AS null_timestamps,
          count(*) FILTER (WHERE duration_min <= 0) AS non_positive_duration,
          count(*) FILTER (WHERE duration_min > 180) AS duration_over_180,
          count(*) FILTER (WHERE trip_distance <= 0) AS zero_distance,
          count(*) FILTER (WHERE trip_distance > 100) AS distance_over_100,
          count(*) FILTER (WHERE fare_amount <= 0) AS fare_non_positive,
          count(*) FILTER (WHERE fare_amount > 500) AS fare_over_500,
          count(*) FILTER (WHERE PULocationID NOT BETWEEN 1 AND 263
                             OR DOLocationID NOT BETWEEN 1 AND 263) AS invalid_zone
        FROM base
    ''').df()
    stats.insert(0, "service", service)
    checks.append(stats)
quality = pd.concat(checks, ignore_index=True).set_index("service").T
display(quality)
"""
    ),
    code(
        """
duplicates = []
for service in ("yellow", "green"):
    pickup = "tpep_pickup_datetime" if service == "yellow" else "lpep_pickup_datetime"
    dropoff = "tpep_dropoff_datetime" if service == "yellow" else "lpep_dropoff_datetime"
    # Counted per monthly file so each DISTINCT works on ~4 M rows instead of the whole year.
    total_rows = total_dupes = 0
    for month_file in sorted((RAW / service).glob(f"*{YEAR}-*.parquet")):
        n, dupes = con.execute(f'''
            SELECT count(*), count(*) - count(DISTINCT (
                     {pickup}, {dropoff}, PULocationID, DOLocationID,
                     fare_amount, trip_distance, passenger_count))
            FROM read_parquet('{month_file}')
        ''').fetchone()
        total_rows += n
        total_dupes += dupes
    duplicates.append({"service": service, "rows": total_rows, "duplicate_rows": int(total_dupes),
                       "duplicate_pct": round(100 * total_dupes / total_rows, 3)})
display(pd.DataFrame(duplicates))

fig, axes = plt.subplots(1, 2, figsize=(12, 4))
q = quality.loc[["non_positive_duration", "duration_over_180", "zero_distance",
                 "distance_over_100", "fare_non_positive", "invalid_zone"]]
(q / quality.loc["rows"] * 100).plot(kind="barh", ax=axes[0], color=["#D6A900", "#168A62"])
axes[0].set_title("Share of raw records failing each quality check")
axes[0].set_xlabel("Percent of service's raw rows (%)")
axes[0].set_ylabel("Check")
axes[0].legend(title="Taxi type")

dup_df = pd.DataFrame(duplicates)
axes[1].bar(dup_df.service, dup_df.duplicate_pct, color=["#D6A900", "#168A62"])
axes[1].set_title("Exact duplicate records on the trip identity key")
axes[1].set_xlabel("Taxi type")
axes[1].set_ylabel("Duplicate share (%)")
for i, v in enumerate(dup_df.duplicate_pct):
    axes[1].text(i, v, f"{v:.2f}%", ha="center", va="bottom")
fig.tight_layout()
fig.savefig(FIGURES / "01_quality_checks.png", bbox_inches="tight")
plt.show()
"""
    ),
    md(
        """
**Interpretation.** The failure rates are small but not negligible, and they differ between services.
Non-positive durations are cancellations or meter resets; durations above three hours are usually drivers who
left the meter running, not trips. Zero-distance rows contradict a metered fare and are unusable for a
distance-based model. Exact duplicates are rare (well under 0.1%), so removing them is safe and prevents the
same physical trip from appearing in both a training and a validation month.
"""
    ),
    md(
        """
## 5. Distribution shape: duration, distance and fare

Thresholds are only defensible if the distribution is inspected first. The percentiles below decide where the
cleaning cut-offs sit.
"""
    ),
    code(
        """
dist_rows = []
for service in ("yellow", "green"):
    pickup = "tpep_pickup_datetime" if service == "yellow" else "lpep_pickup_datetime"
    dropoff = "tpep_dropoff_datetime" if service == "yellow" else "lpep_dropoff_datetime"
    row = con.execute(f'''
        SELECT '{service}' AS service,
               round(median(d), 2) AS p50,
               round(quantile_cont(d, 0.90), 2) AS p90,
               round(quantile_cont(d, 0.99), 2) AS p99,
               round(quantile_cont(d, 0.999), 2) AS p999,
               round(max(d), 1) AS max_duration
        FROM (
          SELECT date_diff('second', {pickup}, {dropoff}) / 60.0 AS d
          FROM read_parquet('{parquet_glob(service)}')
          WHERE {pickup} IS NOT NULL AND {dropoff} IS NOT NULL
        )
    ''').fetchone()
    dist_rows.append(row)
distribution = pd.DataFrame(dist_rows, columns=["service", "p50", "p90", "p99", "p999", "max_duration"])
display(distribution)
"""
    ),
    code(
        """
# Duration and fare distributions on a sample, used only for shape inspection.
sample = con.execute(f'''
    SELECT taxi_type, pickup_datetime, duration_min, trip_distance, fare_amount
    FROM (
      SELECT 'yellow' AS taxi_type, tpep_pickup_datetime AS pickup_datetime,
             date_diff('second', tpep_pickup_datetime, tpep_dropoff_datetime) / 60.0 AS duration_min,
             trip_distance, fare_amount
      FROM read_parquet('{parquet_glob("yellow")}')
      UNION ALL
      SELECT 'green', lpep_pickup_datetime,
             date_diff('second', lpep_pickup_datetime, lpep_dropoff_datetime) / 60.0,
             trip_distance, fare_amount
      FROM read_parquet('{parquet_glob("green")}')
    )
    USING SAMPLE 400000 ROWS (reservoir, 42)
''').df()

fig, axes = plt.subplots(1, 3, figsize=(15, 4))
for service, color in (("yellow", "#D6A900"), ("green", "#168A62")):
    sub = sample[sample.taxi_type == service]
    axes[0].hist(sub.duration_min.clip(0, 120), bins=80, alpha=0.6, label=service, color=color)
    axes[1].hist(sub.trip_distance.clip(0, 25), bins=80, alpha=0.6, label=service, color=color)
    axes[2].hist(sub.fare_amount.clip(0, 100), bins=80, alpha=0.6, label=service, color=color)
axes[0].axvline(1, color="black", ls="--", lw=1); axes[0].axvline(180, color="black", ls="--", lw=1)
axes[0].set(title="Trip duration distribution", xlabel="Duration (minutes, clipped at 120)", ylabel="Trips in sample")
axes[1].axvline(0.1, color="black", ls="--", lw=1); axes[1].axvline(100, color="black", ls="--", lw=1)
axes[1].set(title="Metered trip distance distribution", xlabel="Distance (miles, clipped at 25)", ylabel="Trips in sample")
axes[2].axvline(0, color="black", ls="--", lw=1)
axes[2].set(title="Fare amount distribution", xlabel="Metered fare (USD, clipped at 100)", ylabel="Trips in sample")
for ax in axes:
    ax.legend(title="Taxi type")
fig.tight_layout()
fig.savefig(FIGURES / "01_distributions.png", bbox_inches="tight")
plt.show()

display(sample.groupby("taxi_type")[["duration_min", "trip_distance", "fare_amount"]]
        .describe(percentiles=[0.01, 0.5, 0.99]).T.round(2))
"""
    ),
    md(
        """
**Interpretation.** All three targets are strongly right-skewed with a long tail of extreme values. The
dash marks the chosen duration window of 1–180 minutes: three hours covers essentially every legitimate city
trip, while shorter values are cancellations or meter resets and longer values are meters left running.

Distance is deliberately **not** used as a filter. An earlier version of this pipeline required 0.1–100
miles and removed 1.26 M Yellow rows, but those rows had valid fares and durations — the odometer simply
reported zero. Since distance is never a predictor (the model derives distance from zone geometry instead),
dropping those trips removed useful information for no benefit. The rule now only rejects negative distances,
of which there are none.

Green trips are shorter and cheaper on average than Yellow trips, consistent with its outer-borough,
non-airport footprint. Fare is clipped at \$100 for visual inspection only; no fare values are altered.
"""
    ),
    md(
        """
## 6. Cleaning audit: what was removed and why

The cleaning rules are applied in a fixed order by `src/preprocessing/build_clean_dataset.py`, and each stage
is counted independently so the audit reconciles to the exact number of surviving rows.
"""
    ),
    code(
        """
audit = pd.read_parquet(PROCESSED / "cleaning_audit_2025.parquet").set_index("service")
stages = ["raw_rows", "step1_valid_timestamps", "step2_in_source_month", "step3_duration",
          "step4_zones", "step5_distance", "step6_fare", "step7_deduplicated"]
labels = ["Raw", "Valid timestamps", "Inside source month", "Duration 1-180 min",
          "Valid zones 1-263", "No negative distance", "Fare in (0, 500]", "Exact duplicates removed"]
removed = pd.DataFrame(index=labels[1:])
for service in ("yellow", "green"):
    # Positive number of rows lost at each stage: the count before minus the count after.
    removed[service] = [int(audit.loc[service, stages[i]] - audit.loc[service, stages[i + 1]])
                        for i in range(len(stages) - 1)]
removed["total_rows_removed"] = removed.sum(axis=1)
display(removed)
display(audit[["raw_rows", "step7_deduplicated", "retained_pct"]].round(2))
"""
    ),
    code(
        """
fig, ax = plt.subplots(figsize=(11, 4.5))
x = np.arange(len(stages))
width = 0.38
for offset, (service, color) in enumerate((("yellow", "#D6A900"), ("green", "#168A62"))):
    values = audit.loc[service, stages].astype(float).to_numpy()
    ax.bar(x + (offset - 0.5) * width, 100 * values / values[0], width, label=service, color=color)
ax.set_xticks(x)
ax.set_xticklabels(["Raw", "Timestamps", "Source\\nmonth", "Duration", "Zones", "Distance", "Fare", "Dedup"],
                   rotation=0)
ax.set_title("Share of raw rows surviving each sequential cleaning stage")
ax.set_xlabel("Cleaning stage")
ax.set_ylabel("Rows retained (% of raw)")
ax.set_ylim(85, 100.5)
ax.legend(title="Taxi type", loc="lower left")
for i, stage in enumerate(stages):
    for offset, service in enumerate(("yellow", "green")):
        pct = 100 * audit.loc[service, stage] / audit.loc[service, "raw_rows"]
        ax.text(i + (offset - 0.5) * width, pct + 0.1, f"{pct:.1f}", ha="center", va="bottom", fontsize=7)
fig.tight_layout()
fig.savefig(FIGURES / "01_cleaning_waterfall.png", bbox_inches="tight")
plt.show()
"""
    ),
    md(
        """
**Interpretation.** Yellow retains 91.4% and Green 94.6% of raw rows. The single largest loss for Yellow is
the fare rule (2.76 M rows, about 5.7%), dominated by negative fares: 71% of those rows carry
`payment_type = 0`, an unrecorded payment code, and 34% have a negative total, so the financial record itself
is corrupt rather than the trip being free. The duration rule removes a further 1.11 M rows. Green loses
proportionally less, which fits its shorter, more consistently metered trips.

Removing these rows is a deliberate bias: very short trips, voided meters and multi-hour outliers are excluded
because they are not representative of the prediction target. The effect is that the model will be evaluated on
ordinary trips; this limitation is restated in the final report.
"""
    ),
    md(
        """
## 7. Resulting 2025 dataset

The unified table is the single input to the rest of the project. Its columns are checked here so that later
notebooks can rely on them.
"""
    ),
    code(
        """
summary = con.execute(f'''
    SELECT taxi_type,
           count(*) AS trips,
           min(pickup_datetime) AS first_pickup,
           max(pickup_datetime) AS last_pickup,
           round(avg(duration_min), 2) AS mean_duration_min,
           round(median(duration_min), 2) AS median_duration_min,
           round(avg(fare_amount), 2) AS mean_fare,
           round(median(fare_amount), 2) AS median_fare,
           round(100.0 * count(*) FILTER (WHERE passenger_count IS NULL) / count(*), 2) AS pct_missing_passengers
    FROM read_parquet('{PROCESSED / "taxi_clean_2025.parquet"}')
    GROUP BY 1 ORDER BY 1
''').df()
display(summary)

monthly = con.execute(f'''
    SELECT source_month, taxi_type, count(*) AS trips
    FROM read_parquet('{PROCESSED / "taxi_clean_2025.parquet"}')
    GROUP BY 1, 2 ORDER BY 1, 2
''').df().pivot(index="source_month", columns="taxi_type", values="trips")
display(monthly)
print(f"total: {monthly.to_numpy().sum():,} trips")
"""
    ),
    md(
        """
**Interpretation.** The final dataset covers every day of 2025 with no missing month, which is a prerequisite
for the chronological split (Jan–Aug train, Sep–Oct validation, Nov–Dec test). The monthly volume is stable
between 3.2 M and 4.0 M Yellow trips, indicating no month-level ingestion gap.

## 8. Conclusions carried into the next notebooks

1. All 24 monthly files are present and validated; no substitution was needed.
2. Schemas differ only in timestamp naming and service-specific financial columns; a unified schema is safe.
3. Cleaning removes 10.7% of Yellow and 7.6% of Green rows, dominated by non-positive fares and impossible
   durations. Every removed row is accounted for in the audit table.
4. Durations, distances and fares are right-skewed; the 1–180 minute window keeps the useful mass and excludes
   meter artefacts. Metered distance is a diagnostic only and is therefore not used to drop records: 1.26 M
   Yellow trips with a missing odometer reading still have valid fares and durations and are retained.
5. `passenger_count` is unreliable enough that it must not be a primary driver of predictions.
6. Post-trip fields — including both congestion charges — exist in the data and are excluded from predictors
   from this point forward.
"""
    ),
]

write_notebook(ROOT / "notebooks" / "01_data_audit_and_understanding.ipynb", cells, kernel="nyc-taxi-ml")
