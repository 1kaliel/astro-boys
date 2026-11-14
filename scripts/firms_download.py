#!/usr/bin/env python3
r"""Download NASA FIRMS active-fire history (MODIS + VIIRS) into data/raw/firms/.

Three modes (stdlib only, no installs needed):

  country       Yearly per-country CSVs, or global zips with --country all. No key, no login.
                Sensors: modis (2000-), viirs-snpp (2012-), viirs-jpss1 (NOAA-20, 2018-). No NOAA-21.
  api           FIRMS area API, for what the country files lack (NOAA-21, the current year).
                Needs FIRMS_MAP_KEY in the environment or .env. Pulls in 5-day chunks; resumable.
  availability  Print the date range each FIRMS source currently covers (needs the key).

Examples:
  python3 scripts/firms_download.py country --country Brazil --years 2012-2025 --dry-run
  python3 scripts/firms_download.py country --country Brazil --years 2000-2025
  python3 scripts/firms_download.py country --country all --years 2012-2025 --sensors viirs-snpp
  python3 scripts/firms_download.py api --source VIIRS_NOAA21_SP --bbox -74,-34,-34,6 \
      --start 2024-01-17 --end 2025-12-31
  python3 scripts/firms_download.py availability

Every completed download is logged as a row in data/raw/SOURCES.md. Raw files are never modified.
See docs/data-access.md for the strategy.
"""
import argparse
import datetime as dt
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://firms.modaps.eosdis.nasa.gov"
COUNTRY_SENSORS = {"modis": 2000, "viirs-snpp": 2012, "viirs-jpss1": 2018}
API_SOURCES = [
    "MODIS_SP", "VIIRS_SNPP_SP", "VIIRS_NOAA20_SP", "VIIRS_NOAA21_SP",
    "MODIS_NRT", "VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT",
]
API_MAX_DAYS = 5
REPO = Path(__file__).resolve().parent.parent
RAW = REPO / "data" / "raw"
OUT = RAW / "firms"
SOURCES_LOG = RAW / "SOURCES.md"


def now_utc():
    return dt.datetime.now(dt.UTC).strftime("%Y-%m-%d %H:%M")


def who():
    if os.environ.get("LOG_AUTHOR"):
        return os.environ["LOG_AUTHOR"]
    try:
        return subprocess.run(["git", "-C", str(REPO), "config", "user.name"],
                              capture_output=True, text=True).stdout.strip() or "unknown"
    except OSError:
        return "unknown"


def log_source(product, sensor, region, period, filename, how):
    row = f"| {now_utc()} | {who()} | {product} | {sensor} | {region} | {period} | {filename} | {how} |\n"
    with open(SOURCES_LOG, "a") as f:
        f.write(row)


def read_map_key():
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    env = REPO / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            if line.strip().startswith("FIRMS_MAP_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        sys.exit("FIRMS_MAP_KEY not set. Get one free at https://firms.modaps.eosdis.nasa.gov/api/map_key/ "
                 "and put it in .env (see .env.example).")
    return key


def http_get(url, retries=3, timeout=120):
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            err = e
        except (urllib.error.URLError, TimeoutError) as e:
            err = e
        wait = 2 ** attempt
        print(f"  retry {attempt}/{retries} in {wait}s ({err})", file=sys.stderr)
        time.sleep(wait)
    raise RuntimeError(f"failed after {retries} attempts: {url}")


def remote_size(url):
    req = urllib.request.Request(url, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return int(r.headers.get("Content-Length", 0))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def parse_years(spec):
    if "-" in spec:
        a, b = spec.split("-", 1)
        return list(range(int(a), int(b) + 1))
    return [int(y) for y in spec.split(",")]


def cmd_country(args):
    years = parse_years(args.years)
    total = 0
    for sensor in args.sensors:
        first = COUNTRY_SENSORS[sensor]
        for year in years:
            if year < first:
                continue
            if args.country == "all":
                name = f"{sensor}_{year}_all_countries.zip"
                url = f"{BASE}/data/country/zips/{name}"
                dest = OUT / "global" / sensor / name
            else:
                name = f"{sensor}_{year}_{args.country}.csv"
                url = f"{BASE}/data/country/{sensor}/{year}/{name}"
                dest = OUT / "country" / sensor / name
            size = remote_size(url)
            if size is None:
                print(f"missing  {name} (404)")
                continue
            total += size
            if dest.exists() and dest.stat().st_size == size:
                print(f"have     {name} ({size / 1e6:.0f} MB)")
                continue
            if args.dry_run:
                print(f"would    {name} ({size / 1e6:.0f} MB)")
                continue
            print(f"download {name} ({size / 1e6:.0f} MB) ...", flush=True)
            dest.parent.mkdir(parents=True, exist_ok=True)
            part = dest.with_name(dest.name + ".part")
            part.write_bytes(http_get(url))
            part.rename(dest)
            log_source(f"FIRMS country yearly ({sensor})", sensor, args.country, str(year),
                       str(dest.relative_to(RAW)), f"HTTPS {url}")
    print(f"total listed: {total / 1e9:.2f} GB")


def date_chunks(start, end, days):
    d = start
    while d <= end:
        n = min(days, (end - d).days + 1)
        yield d, n
        d += dt.timedelta(days=n)


def cmd_api(args):
    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)
    bbox = args.bbox.replace(" ", "")
    tag = bbox.replace(",", "_")
    folder = OUT / "api" / args.source / tag
    chunks = list(date_chunks(start, end, API_MAX_DAYS))
    print(f"{args.source} {bbox} {start}..{end}: {len(chunks)} requests")
    if args.dry_run:
        return
    key = read_map_key()
    folder.mkdir(parents=True, exist_ok=True)
    fetched = 0
    for d, n in chunks:
        dest = folder / f"{d.isoformat()}_{n}d.csv"
        if dest.exists():
            continue
        url = f"{BASE}/api/area/csv/{key}/{args.source}/{bbox}/{n}/{d.isoformat()}"
        body = http_get(url)
        text = body[:200].decode("utf-8", "replace")
        if not text.startswith("latitude") and ("Invalid" in text or "Exceed" in text or "rror" in text):
            sys.exit(f"API error on {d}: {text.strip()}")
        dest.write_bytes(body)
        fetched += 1
        if fetched % 50 == 0:
            print(f"  {fetched} chunks fetched (at {d})", flush=True)
        time.sleep(args.sleep)
    if fetched:
        log_source(f"FIRMS area API ({args.source})", args.source, f"bbox {bbox}", f"{start}..{end}",
                   f"firms/api/{args.source}/{tag}/ ({len(chunks)} chunk files)", "FIRMS area API")
    print(f"done: {fetched} new chunk files in {folder.relative_to(REPO)}")


def cmd_availability(_args):
    key = read_map_key()
    print(http_get(f"{BASE}/api/data_availability/csv/{key}/ALL").decode())


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("country", help="yearly per-country CSVs (no key)")
    c.add_argument("--country", required=True,
                   help="as in FIRMS file names, e.g. Brazil; 'all' for global zips")
    c.add_argument("--years", required=True, help="e.g. 2000-2025 or 2012,2020")
    c.add_argument("--sensors", nargs="+", choices=list(COUNTRY_SENSORS), default=list(COUNTRY_SENSORS))
    c.add_argument("--dry-run", action="store_true", help="list files and sizes only")
    c.set_defaults(func=cmd_country)

    a = sub.add_parser("api", help="FIRMS area API in 5-day chunks (needs FIRMS_MAP_KEY)")
    a.add_argument("--source", required=True, choices=API_SOURCES)
    a.add_argument("--bbox", required=True, help="west,south,east,north in degrees")
    a.add_argument("--start", required=True, help="YYYY-MM-DD")
    a.add_argument("--end", required=True, help="YYYY-MM-DD")
    a.add_argument("--sleep", type=float, default=0.3, help="seconds between requests")
    a.add_argument("--dry-run", action="store_true", help="show the number of requests only")
    a.set_defaults(func=cmd_api)

    v = sub.add_parser("availability", help="date range per FIRMS source (needs FIRMS_MAP_KEY)")
    v.set_defaults(func=cmd_availability)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
