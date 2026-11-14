# Download the raw data used by notebooks/nyc_taxi_trip_duration.ipynb.
#   uv run python scripts/get_data.py
# Files that already exist are skipped, so it is safe to re-run after a failed download.

from pathlib import Path
from urllib.request import urlretrieve

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
BASE = "https://d37ci6vzurychx.cloudfront.net"
YEAR = 2025

files = {RAW / "taxi_zone_lookup.csv": f"{BASE}/misc/taxi_zone_lookup.csv",
         RAW / "taxi_zones.zip": f"{BASE}/misc/taxi_zones.zip"}
for taxi in ("yellow", "green"):
    for month in range(1, 13):
        name = f"{taxi}_tripdata_{YEAR}-{month:02d}.parquet"
        files[RAW / taxi / name] = f"{BASE}/trip-data/{name}"

for path, url in files.items():
    if path.exists() and path.stat().st_size > 0:
        print("skip    ", path.relative_to(ROOT))
        continue
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    print("download", path.relative_to(ROOT))
    urlretrieve(url, tmp)
    tmp.rename(path)

print(f"done: {len(files)} files in {RAW.relative_to(ROOT)}")
