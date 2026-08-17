#!/usr/bin/env python3
"""
Build public/data/wildfire/state-trends.json — the "mean PM2.5" metric only.

Rebuilds the observed/counterfactual mean-PM2.5 lines for 2006-2025 from a
single consistent pipeline, replacing the earlier approach (Burke et al.
2023 replication data for 2000-2022, spliced with a one-off join against
the Stanford lab's newer smokePM-version1.1 release for 2023 only). That
splice mixed two different upstream smoke-attribution methodologies at the
2022/2023 seam; this script avoids the seam entirely by using the same two
ingredients — our own AQS pull + V1.1's smoke-PM — for every year:

  1. Observed total PM2.5: EPA AQS `annualData/byState`, pulled ourselves
     via fetch_wildfire_aqs_annual_data.py, 2006-2025 (station-year
     arithmetic means, one file per state-year in
     data/wildfire_extension/raw_annual/).
  2. Smoke PM2.5: Stanford lab's smokePM-version1.1 county-day release,
     2006-2023 only (data/wildfire_extension/raw_smoke/, a copy of the
     Dropbox CSV). Absent county-days mean zero smoke by that dataset's
     own convention, so the county-year mean divides by days-in-year, not
     by the count of rows present (an under-count would inflate the mean).
  3. Join: each station's county FIPS is embedded in its AQS site ID
     (first 5 digits = state+county), so each station-year's nonsmokePM
     = that station's totalPM - its county's smoke-PM mean for that year.
     No separate station->county lookup table needed.
  4. State-year = unweighted mean across stations in the state, matching
     this project's established convention (the paper itself averages
     station-years unweighted, not population- or area-weighted — see
     project notes). 2024-2025 nonsmokePM is left null (V1.1 doesn't
     reach that far yet), 2023 total AQS data lets the observed line keep
     going regardless.

Story now starts 2006 (not 2000) because V1.1 doesn't cover 2000-2005 and
splicing in the original paper's data just for those years would
reintroduce the same seam problem one span earlier — see round-6 project
notes for the tradeoff.

Everything else in the output JSON (grid layout, region, classification
labels, the "% days > 35" extreme metric) is carried over unchanged from
the existing file — classification bands are known-stale relative to this
new totalPM/nonsmokePM series and are flagged for a future recompute, not
addressed here (out of scope per user decision).
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_ANNUAL_DIR = ROOT / "data" / "wildfire_extension" / "raw_annual"
SMOKE_CSV = ROOT / "data" / "wildfire_extension" / "raw_smoke" / "smokePM_county_daily.csv"
OUT_JSON = ROOT / "public" / "data" / "wildfire" / "state-trends.json"

START_YEAR = 2006
END_YEAR = 2025
SMOKE_LAST_YEAR = 2023  # V1.1 coverage ceiling

STATE_FIPS_TO_ABBR = {
    "01": "AL", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
    "10": "DE", "12": "FL", "13": "GA", "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD",
    "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY",
    "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA",
    "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
}


def is_leap(y):
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def days_in_year(y):
    return 366 if is_leap(y) else 365


def build_smoke_county_year():
    """(GEOID, year) -> mean smoke PM2.5, zero-filled over the full year."""
    totals = defaultdict(float)
    with open(SMOKE_CSV, newline="") as f:
        reader = csv.reader(f)
        next(reader)  # header
        for geoid, date, val in reader:
            year = int(date[:4])
            if year < START_YEAR or year > SMOKE_LAST_YEAR:
                continue
            totals[(geoid, year)] += float(val)
    return {key: total / days_in_year(key[1]) for key, total in totals.items()}


def build_station_year_total_pm():
    """(state_abbr, station_id, county_geoid, year) -> total PM2.5 arithmetic mean."""
    best = {}  # (station_id, year) -> (observation_percent, record)
    for path in sorted(RAW_ANNUAL_DIR.glob("*.json")):
        state_fips, year_str = path.stem.split("_")
        year = int(year_str)
        if year < START_YEAR or year > END_YEAR:
            continue
        records = json.loads(path.read_text())
        for r in records:
            std = r.get("pollutant_standard") or ""
            if "Annual" not in std:
                continue
            if r.get("validity_indicator") != "Y":
                continue
            if r.get("arithmetic_mean") is None:
                continue
            station_id = f"{r['state_code']}{r['county_code']}{r['site_number']}"
            key = (station_id, year)
            obs_pct = r.get("observation_percent") or 0
            cur = best.get(key)
            if cur is None or obs_pct > cur[0]:
                best[key] = (obs_pct, r)

    out = []
    for (station_id, year), (_, r) in best.items():
        abbr = STATE_FIPS_TO_ABBR.get(r["state_code"])
        if abbr is None:
            continue
        geoid = r["state_code"] + r["county_code"]
        out.append((abbr, station_id, geoid, year, r["arithmetic_mean"]))
    return out


def main():
    print("Aggregating smoke-PM to county-year means (2006-2023)...")
    smoke_county_year = build_smoke_county_year()
    print(f"  {len(smoke_county_year)} county-years with smoke data")

    print("Loading + deduping AQS station-year total PM (2006-2025)...")
    station_rows = build_station_year_total_pm()
    print(f"  {len(station_rows)} station-years")

    # state-year -> list of (totalPM, nonsmokePM-or-None) across stations
    state_year_totals = defaultdict(list)
    state_year_nonsmoke = defaultdict(list)
    for abbr, station_id, geoid, year, total_pm in station_rows:
        state_year_totals[(abbr, year)].append(total_pm)
        if year <= SMOKE_LAST_YEAR:
            smoke = smoke_county_year.get((geoid, year))
            if smoke is not None:
                state_year_nonsmoke[(abbr, year)].append(total_pm - smoke)

    def mean(vals):
        return sum(vals) / len(vals) if vals else None

    print(f"Loading existing {OUT_JSON} for grid/region/classification/extreme-metric reuse...")
    current = json.loads(OUT_JSON.read_text())

    years = list(range(START_YEAR, END_YEAR + 1))
    new_states = []
    for state in current["states"]:
        abbr = state["abbr"]
        if abbr == "US":
            # National tile: average across all CONUS station-years per year.
            total_pm = [mean([v for (a, y2), vals in state_year_totals.items() if y2 == y for v in vals]) for y in years]
            nonsmoke_pm = [
                mean([v for (a, y2), vals in state_year_nonsmoke.items() if y2 == y for v in vals]) if y <= SMOKE_LAST_YEAR else None
                for y in years
            ]
        else:
            total_pm = [mean(state_year_totals.get((abbr, y), [])) for y in years]
            nonsmoke_pm = [
                mean(state_year_nonsmoke.get((abbr, y), [])) if y <= SMOKE_LAST_YEAR else None
                for y in years
            ]

        # Extreme-days metric: carried over unchanged, re-sliced to the new
        # year range (original data covers 2000-2022; years past that are
        # null, matching the pre-existing cap).
        old_years = state["years"]
        old_index = {y: i for i, y in enumerate(old_years)}
        total_extreme = [
            state["totalExtremePct"][old_index[y]] if y in old_index else None
            for y in years
        ]
        nonsmoke_extreme = [
            state["nonsmokeExtremePct"][old_index[y]] if y in old_index else None
            for y in years
        ]

        new_states.append({
            "abbr": abbr,
            "name": state["name"],
            "row": state["row"],
            "col": state["col"],
            "region": state["region"],
            "years": years,
            "totalPM": total_pm,
            "nonsmokePM": nonsmoke_pm,
            "totalExtremePct": total_extreme,
            "nonsmokeExtremePct": nonsmoke_extreme,
            "meanClass": state["meanClass"],
            "extremeClass": state["extremeClass"],
        })

    out = {
        "generatedFrom": "EPA AQS annualData (own pull, 2006-2025) + Stanford smokePM-version1.1 county-day release (2006-2023); extreme-days metric and classification bands carried over from Burke et al. 2023 replication data (2000-2022), not yet recomputed on this pipeline",
        "meanBreakYear": current["meanBreakYear"],
        "extremeBreakYear": current["extremeBreakYear"],
        "startYear": START_YEAR,
        "extendedThroughYear": END_YEAR,
        "smokeDataThroughYear": SMOKE_LAST_YEAR,
        "states": new_states,
    }

    OUT_JSON.write_text(json.dumps(out))
    print(f"Wrote {OUT_JSON} ({OUT_JSON.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
