# nyc-taxi-ml

Predicting NYC taxi trip duration from pre-trip features, and comparing
Yellow vs Green taxi services. See `NYC_Taxi_ML_Project_Brief.md` for the
full plan and `ML_Mini_Project_Guidelines.pdf` for the course requirements.

## Setup

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
```

Then select the project's `.venv` interpreter / Jupyter kernel in VS Code.

## Data

Raw data is not committed to Git. Download it from the
[TLC Trip Record Data page](https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page)
into `data/raw/`:

```bash
mkdir -p data/raw/yellow data/raw/green data/processed
BASE=https://d37ci6vzurychx.cloudfront.net

for m in 01 02 03 04 05 06; do
  curl -fL -o data/raw/yellow/yellow_tripdata_2026-$m.parquet $BASE/trip-data/yellow_tripdata_2026-$m.parquet
  curl -fL -o data/raw/green/green_tripdata_2026-$m.parquet   $BASE/trip-data/green_tripdata_2026-$m.parquet
done

curl -fL -o data/raw/taxi_zone_lookup.csv $BASE/misc/taxi_zone_lookup.csv
curl -fL -o data/raw/taxi_zones.zip       $BASE/misc/taxi_zones.zip
```

Expected layout:

```text
data/raw/
├── yellow/yellow_tripdata_2026-01.parquet ... -06.parquet
├── green/green_tripdata_2026-01.parquet  ... -06.parquet
├── taxi_zone_lookup.csv
└── taxi_zones.zip
```

## Running

Run the notebooks in order:

1. `notebooks/01_data_preparation_eda.ipynb`: audit, clean, save to `data/processed/`
2. `notebooks/02_feature_engineering_modeling.ipynb`: features, training, saved models
3. `notebooks/03_evaluation_comparison.ipynb`: June test evaluation and comparisons
