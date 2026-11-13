# Restartable downloader for the 2025 NYC TLC monthly trip records.
#
# Behaviour required by the project spec:
#   - monthly files are downloaded individually and never re-downloaded if a valid copy exists
#   - every file is validated (Parquet footer readable, expected columns present, row count > 0)
#   - partial downloads go to a .part file and are promoted only after validation
#   - failures are logged and recorded in the manifest, and a re-run resumes from the manifest
#   - a final verify step asserts that all expected months are present
#
# Usage:
#   python -m src.ingestion.download_tlc            # download anything missing, then verify
#   python -m src.ingestion.download_tlc --verify   # only check what is on disk
#   python -m src.ingestion.download_tlc --force    # re-download even if valid

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pyarrow.parquet as pq
import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
MANIFEST = RAW / "manifest_2025.json"
BASE_URL = "https://d37ci6vzurychx.cloudfront.net/trip-data"
YEAR = 2025
MONTHS = tuple(range(1, 13))
SERVICES = ("yellow", "green")

# Columns that must exist in every monthly file for the pipeline to work.
REQUIRED_COLUMNS = {
    "yellow": {
        "VendorID", "tpep_pickup_datetime", "tpep_dropoff_datetime", "passenger_count",
        "trip_distance", "PULocationID", "DOLocationID", "fare_amount", "total_amount",
    },
    "green": {
        "VendorID", "lpep_pickup_datetime", "lpep_dropoff_datetime", "passenger_count",
        "trip_distance", "PULocationID", "DOLocationID", "fare_amount", "total_amount",
    },
}

CHUNK = 1 << 20


def expected_files() -> list[dict]:
    out = []
    for service in SERVICES:
        for month in MONTHS:
            name = f"{service}_tripdata_{YEAR}-{month:02d}.parquet"
            out.append(
                {
                    "service": service,
                    "month": month,
                    "filename": name,
                    "path": RAW / service / name,
                    "url": f"{BASE_URL}/{name}",
                }
            )
    return out


def load_manifest() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text())
    return {"created_at": datetime.now(timezone.utc).isoformat(), "files": {}}


def save_manifest(manifest: dict) -> None:
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    tmp.replace(MANIFEST)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_parquet(path: Path, service: str) -> dict:
    # Return parquet metadata, or raise with a human-readable reason.
    if not path.exists():
        raise FileNotFoundError(f"missing file: {path}")
    if path.stat().st_size == 0:
        raise ValueError(f"zero-byte file: {path}")
    meta = pq.ParquetFile(path).metadata
    if meta.num_rows <= 0:
        raise ValueError(f"parquet reports zero rows: {path}")
    names = set(pq.ParquetFile(path).schema_arrow.names)
    missing = REQUIRED_COLUMNS[service] - names
    if missing:
        raise ValueError(f"{path.name} is missing required columns: {sorted(missing)}")
    return {"rows": meta.num_rows, "columns": len(names), "bytes": path.stat().st_size}


def download_one(item: dict, manifest: dict, force: bool = False) -> bool:
    # Download, validate and record a single monthly file. Returns True on success.
    key = item["filename"]
    record = manifest["files"].get(key, {})
    target = item["path"]

    if not force and record.get("status") == "ok" and target.exists():
        try:
            info = validate_parquet(target, item["service"])
        except Exception as exc:  # noqa: BLE001 - any validation failure means re-download
            print(f"[stale] {key}: {exc}; re-downloading")
        else:
            if info["rows"] == record.get("rows"):
                print(f"[skip]  {key}: already valid ({info['rows']:,} rows)")
                return True

    target.parent.mkdir(parents=True, exist_ok=True)
    part = target.with_suffix(".parquet.part")
    started = time.time()
    try:
        with requests.get(item["url"], stream=True, timeout=180) as response:
            response.raise_for_status()
            declared = int(response.headers.get("content-length", 0))
            written = 0
            with part.open("wb") as handle:
                for chunk in response.iter_content(CHUNK):
                    handle.write(chunk)
                    written += len(chunk)
        if declared and written != declared:
            raise IOError(f"short read: {written} of {declared} bytes")
        info = validate_parquet(part, item["service"])
        part.replace(target)
        info = validate_parquet(target, item["service"])
        elapsed = time.time() - started
        manifest["files"][key] = {
            "service": item["service"],
            "month": item["month"],
            "url": item["url"],
            "status": "ok",
            "rows": info["rows"],
            "columns": info["columns"],
            "bytes": info["bytes"],
            "sha256": sha256_of(target),
            "downloaded_at": datetime.now(timezone.utc).isoformat(),
            "seconds": round(elapsed, 1),
            "mb_per_s": round(info["bytes"] / 1e6 / max(elapsed, 1e-6), 2),
        }
        save_manifest(manifest)
        print(f"[ok]    {key}: {info['rows']:,} rows, {info['bytes']/1e6:.1f} MB in {elapsed:.1f}s")
        return True
    except Exception as exc:  # noqa: BLE001 - record any failure and keep going
        part.unlink(missing_ok=True)
        manifest["files"][key] = {
            "service": item["service"],
            "month": item["month"],
            "url": item["url"],
            "status": "failed",
            "error": f"{type(exc).__name__}: {exc}",
            "attempted_at": datetime.now(timezone.utc).isoformat(),
        }
        save_manifest(manifest)
        print(f"[FAIL]  {key}: {type(exc).__name__}: {exc}")
        return False


def verify(manifest: dict, verbose: bool = True) -> bool:
    problems = []
    for item in expected_files():
        key = item["filename"]
        record = manifest["files"].get(key, {})
        try:
            info = validate_parquet(item["path"], item["service"])
        except Exception as exc:  # noqa: BLE001
            problems.append(f"{key}: {exc}")
            continue
        if record.get("rows") and record["rows"] != info["rows"]:
            problems.append(
                f"{key}: row count changed since download ({record['rows']:,} -> {info['rows']:,})"
            )
        if verbose:
            print(f"  {key}: {info['rows']:,} rows, {info['bytes']/1e6:.1f} MB")
    total = len(expected_files())
    print(f"\nverified {total - len(problems)}/{total} monthly files")
    for problem in problems:
        print(f"  PROBLEM {problem}")
    return not problems


def summarise(manifest: dict) -> None:
    rows = [r for r in manifest["files"].values() if r.get("status") == "ok"]
    total_rows = sum(r["rows"] for r in rows)
    total_bytes = sum(r["bytes"] for r in rows)
    by_service: dict[str, list[int]] = {}
    for record in rows:
        by_service.setdefault(record["service"], []).append(record["rows"])
    print(f"\nmanifest: {len(rows)} files, {total_rows:,} rows, {total_bytes/1e9:.2f} GB")
    for service, counts in sorted(by_service.items()):
        print(f"  {service}: {len(counts)} months, {sum(counts):,} rows")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download 2025 TLC monthly trip records.")
    parser.add_argument("--verify", action="store_true", help="verify only, download nothing")
    parser.add_argument("--force", action="store_true", help="re-download even if a valid copy exists")
    args = parser.parse_args()

    manifest = load_manifest()
    if not args.verify:
        failures = [item["filename"] for item in expected_files()
                    if not download_one(item, manifest, force=args.force)]
        if failures:
            print(f"\n{len(failures)} download failure(s): {failures}")
    ok = verify(manifest)
    summarise(manifest)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
