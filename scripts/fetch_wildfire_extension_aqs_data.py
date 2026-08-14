#!/usr/bin/env python3
"""
Fetch EPA AQS annual PM2.5 summaries for the 48 CONUS states, 2023-2025, to
extend the Wildfire Smoke & PM2.5 Trend Reversal story past the original
Burke et al. 2023 replication data's 2022 cutoff.

Uses annualData/byState (all sites in a state for a year, one call), same
shape as dailyData/byState but ~40x faster / ~90x smaller (1.9s/627KB vs
74s/57MB per state-year in testing) — daily granularity isn't needed since
nothing downstream renders daily data; the "mean PM2.5" metric only needs
each station's annual arithmetic_mean. (The "% days > 35" metric isn't
extended by this script — annualData doesn't expose that directly, only
percentile breakpoints, which aren't precise enough to derive it.)

Requires AQS_API_EMAIL and AQS_API_KEY in .env.local (gitignored).
"""

import json
import subprocess
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env.local"
OUT_DIR = ROOT / "data" / "wildfire_extension" / "raw_annual"

BASE_URL = "https://aqs.epa.gov/data/api/annualData/byState"
PM25_PARAM = "88101"

STATES = [
    "01", "04", "05", "06", "08", "09", "10", "12", "13", "16", "17", "18", "19",
    "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32",
    "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46",
    "47", "48", "49", "50", "51", "53", "54", "55", "56",
]

YEARS = [2023, 2024, 2025]


def load_env(path: Path) -> dict:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip()
    return env


def fetch_state_year(email, key, state, year, attempts=3):
    query = urllib.parse.urlencode({
        "email": email, "key": key, "param": PM25_PARAM,
        "bdate": f"{year}0101", "edate": f"{year}1231", "state": state,
    })
    url = f"{BASE_URL}?{query}"
    last_err = None
    for attempt in range(1, attempts + 1):
        t0 = time.time()
        try:
            result = subprocess.run(
                ["curl", "-sS", "-m", "60", url],
                capture_output=True, text=True, timeout=70, check=True,
            )
            payload = json.loads(result.stdout)
            elapsed = time.time() - t0
            status = payload["Header"][0]["status"]
            if status == "No data matched your selection":
                print(f"  {state}/{year}: no data ({elapsed:.1f}s)", flush=True)
                return []
            if status != "Success":
                raise RuntimeError(f"AQS API error: {payload['Header'][0]}")
            print(f"  {state}/{year}: {len(payload['Data'])} records ({elapsed:.1f}s)", flush=True)
            return payload["Data"]
        except Exception as e:
            elapsed = time.time() - t0
            last_err = e
            print(f"  {state}/{year}: attempt {attempt} failed after {elapsed:.1f}s ({e}), retrying...", flush=True)
            time.sleep(2)
    raise RuntimeError(f"Gave up on {state}/{year} after {attempts} attempts: {last_err}")


def main():
    if not ENV_FILE.exists():
        raise SystemExit(f"Missing {ENV_FILE} — expected AQS_API_EMAIL/AQS_API_KEY there.")
    env = load_env(ENV_FILE)
    email, key = env["AQS_API_EMAIL"], env["AQS_API_KEY"]

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for year in YEARS:
        print(f"=== {year} ===", flush=True)
        for state in STATES:
            out_path = OUT_DIR / f"{state}_{year}.json"
            if out_path.exists():
                print(f"  {state}/{year}: already fetched, skipping", flush=True)
                continue
            rows = fetch_state_year(email, key, state, year)
            out_path.write_text(json.dumps(rows))
            time.sleep(0.3)

    print(f"\nDone. Raw data written to {OUT_DIR}/")


if __name__ == "__main__":
    main()
