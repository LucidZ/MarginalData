#!/usr/bin/env python3
"""
Generate voter-age.json for the "Electorate Is Older Than the Country" story.

Pulls two Census Bureau CPS November Voting and Registration Supplement
tables across five election cycles (2016/2018/2020/2022/2024):

  Table 1  - national, reported voting/registration by SINGLE YEAR OF AGE
             (18-79, plus 80-84 and 85+ tail buckets). Only 2016, 2020, 2022
             and 2024 are usable - see NOTE below on 2018.
  Table 4c - reported voting/registration by 5 age bins (18-24, 25-34,
             35-44, 45-64, 65+), broken out by state (+ US total, + DC).
             All 5 years are clean.

NOTE on 2018 Table 1: the file Census serves at
p20/583/table01.xlsx is mislabeled at the source - its link text on the
census.gov landing page says "Table 1. Reported Voting and Registration,
by Sex and Single Years of Age", but the workbook's actual title cell reads
"Table 1a. Margins of Error for Estimates of Voting and Registration...".
Verified 2026-09-03: 2016/2020/2022/2024's table01/vote01 files are all
correctly Table 1; only 2018's is swapped, and there's no alternate
filename in that directory. This script skips single-year-of-age for 2018
rather than silently parsing the wrong table. It doesn't block anything:
Table 4c (used for every cross-year comparison in the story) is unaffected,
and single-year granularity is only surfaced for 2024 in the current spec
(see .claude/voter-age-spec.md S5-S6).

Requirements:
- openpyxl (no API key / auth needed - these are public XLSX downloads)

Usage:
    python scripts/generate_voter_age_data.py
    python scripts/generate_voter_age_data.py --skip-download  # reuse cache

Output:
    File: public/data/voter-age.json
"""

import argparse
import json
import math
import re
import urllib.request
import warnings
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "voter_age"
OUT_PATH = ROOT / "public" / "data" / "voter-age.json"

BASE = "https://www2.census.gov/programs-surveys/cps/tables/p20"

# (year, is_presidential, table1_filename_or_None, table4c_filename, p20_dir)
CYCLES = [
    (2016, True, "table01.xlsx", "table04c.xlsx", "580"),
    (2018, False, None, "table04c.xlsx", "583"),  # table01.xlsx mislabeled, see NOTE
    (2020, True, "table01.xlsx", "table04c.xlsx", "585"),
    (2022, False, "vote01_2022.xlsx", "vote04c_2022.xlsx", "586"),
    (2024, True, "vote01_2024.xlsx", "vote04c_2024.xlsx", "587"),
]

# Ages 18-34 define "under-35" for the representation-gap metric used
# throughout the story (beats 2-4).
UNDER35_BINS = ("18-24", "25-34")
ALL_BINS = ("18-24", "25-34", "35-44", "45-64", "65+")

BIN_LABEL_MAP = {
    "18 to 24": "18-24", "18 to 24 years": "18-24",
    "25 to 34": "25-34", "25 to 34 years": "25-34",
    "35 to 44": "35-44", "35 to 44 years": "35-44",
    "45 to 64": "45-64", "45 to 64 years": "45-64",
    "65+": "65+", "65 years and over": "65+",
}

# Mail-voting classification as of 2024 - see .claude/voter-age-spec.md S3/S8
# for the sourcing (Ballotpedia + MIT Election Lab, verified 2026-09-03).
MAIL_STATUS = {
    "COLORADO": "permanent-pre2016",
    "OREGON": "permanent-pre2016",
    "WASHINGTON": "permanent-pre2016",
    "CALIFORNIA": "permanent-post2020",
    "NEVADA": "permanent-post2020",
    "VERMONT": "permanent-post2020",
    "HAWAII": "permanent-post2020",
    "UTAH": "permanent-post2020",
    "DISTRICT OF COLUMBIA": "permanent-post2020",
    "NEW JERSEY": "covid-only",
    "MONTANA": "covid-only",
}

# Recognized state/jurisdiction tokens in column A of Table 4c. Anything
# else in column A is either blank (age-row continuation, forward-fill)
# or a stray header label ("STATE", "Characteristics") to ignore.
STATE_NAMES = {
    "ALABAMA", "ALASKA", "ARIZONA", "ARKANSAS", "CALIFORNIA", "COLORADO",
    "CONNECTICUT", "DELAWARE", "DISTRICT OF COLUMBIA", "FLORIDA", "GEORGIA",
    "HAWAII", "IDAHO", "ILLINOIS", "INDIANA", "IOWA", "KANSAS", "KENTUCKY",
    "LOUISIANA", "MAINE", "MARYLAND", "MASSACHUSETTS", "MICHIGAN",
    "MINNESOTA", "MISSISSIPPI", "MISSOURI", "MONTANA", "NEBRASKA", "NEVADA",
    "NEW HAMPSHIRE", "NEW JERSEY", "NEW MEXICO", "NEW YORK",
    "NORTH CAROLINA", "NORTH DAKOTA", "OHIO", "OKLAHOMA", "OREGON",
    "PENNSYLVANIA", "RHODE ISLAND", "SOUTH CAROLINA", "SOUTH DAKOTA",
    "TENNESSEE", "TEXAS", "UTAH", "VERMONT", "VIRGINIA", "WASHINGTON",
    "WEST VIRGINIA", "WISCONSIN", "WYOMING",
}
US_TOKENS = {"US", "UNITED STATES"}

STATE_ABBR = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT",
    "DELAWARE": "DE", "DISTRICT OF COLUMBIA": "DC", "FLORIDA": "FL",
    "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL",
    "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS", "KENTUCKY": "KY",
    "LOUISIANA": "LA", "MAINE": "ME", "MARYLAND": "MD",
    "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN",
    "MISSISSIPPI": "MS", "MISSOURI": "MO", "MONTANA": "MT",
    "NEBRASKA": "NE", "NEVADA": "NV", "NEW HAMPSHIRE": "NH",
    "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH",
    "OKLAHOMA": "OK", "OREGON": "OR", "PENNSYLVANIA": "PA",
    "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
    "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI", "WYOMING": "WY",
}


def download(year, filename, p20_dir):
    """Cache raw workbooks under data/voter_age/ - safe to re-run."""
    dest = RAW_DIR / f"{year}_{filename}"
    if dest.exists():
        return dest
    url = f"{BASE}/{p20_dir}/{filename}"
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    return dest


def load_sheet(path):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # openpyxl warns on Census's header/footer XML
        wb = openpyxl.load_workbook(path, data_only=True)
    return wb.active


def parse_table4c(path):
    """
    Returns { "US": {bin: {cvap, voted, moeVoted}, ...}, "OKLAHOMA": {...}, ... }
    Scans by content rather than a fixed row offset - the header height
    varies by year (2018 has an extra blank row; 2022 doesn't).
    """
    ws = load_sheet(path)
    out = {}
    current = None
    for row in ws.iter_rows(values_only=True):
        col_a = str(row[0]).strip().upper() if row[0] else ""
        col_b = str(row[1]).strip() if row[1] else ""
        if col_a in US_TOKENS:
            current = "US"
            out[current] = {}
            continue
        if col_a in STATE_NAMES:
            current = col_a
            out[current] = {}
            continue
        if current is None:
            continue
        binname = BIN_LABEL_MAP.get(col_b)
        if binname is None:
            continue
        try:
            cvap = float(row[3])
            voted = float(row[9])
        except (TypeError, ValueError):
            continue
        # The MOE (and other percent) columns get suppressed by Census as
        # "B" when a jurisdiction/bin's sample is too small to estimate
        # reliably (e.g. Wyoming's 18-24 cohort) - but the raw counts are
        # still published, so don't drop the whole bin over that. A missing
        # MOE is itself informative (an even-less-reliable cell) and is
        # surfaced as moeVoted: null rather than papered over.
        try:
            moe_voted = float(row[13])
        except (TypeError, ValueError):
            moe_voted = None
        out[current][binname] = {"cvap": cvap, "voted": voted, "moeVoted": moe_voted}

    # Assert every jurisdiction has all 5 bins - a silent label-map miss
    # should fail the build, not quietly drop a state or a bin.
    incomplete = {k: sorted(v.keys()) for k, v in out.items() if len(v) != 5}
    if incomplete:
        raise ValueError(
            f"{path.name}: expected 5 age bins per jurisdiction, got incomplete "
            f"sets: {incomplete}"
        )
    if "US" not in out:
        raise ValueError(f"{path.name}: no US/UNITED STATES total row found")
    if len(out) < 51:  # 50 states + DC
        raise ValueError(
            f"{path.name}: expected 51 states+DC, found {len(out) - 1}: "
            f"missing {STATE_NAMES - (set(out) - {'US'})}"
        )
    return out


SINGLE_YEAR_RE = re.compile(r"^(\d+) years$")


def parse_table1(path):
    """
    Returns a list of { age, ageLabel, cvap, voted } for single years of
    age 18-79, plus two tail buckets (80-84 at label "80-84", 85+ at
    label "85+"). Scans the BOTH SEXES block only (stops at MALE/FEMALE).
    """
    ws = load_sheet(path)
    rows = []
    in_block = False
    for row in ws.iter_rows(values_only=True):
        col_a = str(row[0]).strip() if row[0] else ""
        col_b = str(row[1]).strip() if row[1] else ""
        if col_a == "BOTH SEXES":
            in_block = True
            continue
        if col_a in ("MALE", "FEMALE") and in_block:
            break
        if not in_block:
            continue

        m = SINGLE_YEAR_RE.match(col_b)
        if m:
            age, label = int(m.group(1)), m.group(1)
        elif col_b == "80-84 years":
            age, label = 82, "80-84"
        elif col_b == "85 years and over":
            age, label = 87, "85+"
        else:
            continue

        try:
            cvap = float(row[3])
            voted = float(row[10])
        except (TypeError, ValueError):
            continue
        rows.append({"age": age, "ageLabel": label, "cvap": cvap, "voted": voted})

    if len(rows) < 60:  # 18-79 (62 rows) + 2 tail buckets, minus slack for parsing misses
        raise ValueError(f"{path.name}: expected ~64 single-year rows, got {len(rows)}")
    return sorted(rows, key=lambda r: r["age"])


def add_shares(rows, cvap_key="cvap", voted_key="voted"):
    """Adds shareElig/shareVote/turnout (percentages) to a list of {cvap, voted} dicts, in place."""
    total_cvap = sum(r[cvap_key] for r in rows)
    total_voted = sum(r[voted_key] for r in rows)
    for r in rows:
        r["shareElig"] = round(100 * r[cvap_key] / total_cvap, 3)
        r["shareVote"] = round(100 * r[voted_key] / total_voted, 3)
        r["turnout"] = round(100 * r[voted_key] / r[cvap_key], 1)
    return total_cvap, total_voted


def under35_gap(bins):
    """shareVote(18-34) - shareElig(18-34), in percentage points."""
    total_cvap = sum(bins[b]["cvap"] for b in ALL_BINS)
    total_voted = sum(bins[b]["voted"] for b in ALL_BINS)
    u_cvap = sum(bins[b]["cvap"] for b in UNDER35_BINS)
    u_voted = sum(bins[b]["voted"] for b in UNDER35_BINS)
    return round(100 * u_voted / total_voted - 100 * u_cvap / total_cvap, 3)


def under35_turnout(bins):
    u_cvap = sum(bins[b]["cvap"] for b in UNDER35_BINS)
    u_voted = sum(bins[b]["voted"] for b in UNDER35_BINS)
    return round(100 * u_voted / u_cvap, 1)


def over65_turnout(bins):
    return round(100 * bins["65+"]["voted"] / bins["65+"]["cvap"], 1)


def welch_t_test(a, b):
    """Welch's t-test for unequal-variance two-sample comparison (no scipy dependency)."""
    n_a, n_b = len(a), len(b)
    mean_a, mean_b = sum(a) / n_a, sum(b) / n_b
    var_a = sum((x - mean_a) ** 2 for x in a) / (n_a - 1)
    var_b = sum((x - mean_b) ** 2 for x in b) / (n_b - 1)
    se = math.sqrt(var_a / n_a + var_b / n_b)
    t = (mean_a - mean_b) / se
    df = (var_a / n_a + var_b / n_b) ** 2 / (
        (var_a / n_a) ** 2 / (n_a - 1) + (var_b / n_b) ** 2 / (n_b - 1)
    )
    return {"t": t, "df": df}


def mean_reversion(levels, changes):
    """OLS slope/intercept/r of change ~ starting level, for the never-mail
    mean-reversion check (spec S8): does a state's 2016 gap level predict
    its 2016->2024 change, absent any policy switch?"""
    n = len(levels)
    mean_x, mean_y = sum(levels) / n, sum(changes) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(levels, changes))
    var_x = sum((x - mean_x) ** 2 for x in levels)
    var_y = sum((y - mean_y) ** 2 for y in changes)
    b = cov / var_x
    a = mean_y - b * mean_x
    r = cov / math.sqrt(var_x * var_y)
    return {"a": a, "b": b, "r": r}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-download", action="store_true",
        help="Reuse cached workbooks in data/voter_age/ without re-fetching",
    )
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("Fetching workbooks...")
    table4c_paths = {}
    table1_paths = {}
    for year, is_pres, t1_file, t4c_file, p20_dir in CYCLES:
        if not args.skip_download:
            table4c_paths[year] = download(year, t4c_file, p20_dir)
            if t1_file:
                table1_paths[year] = download(year, t1_file, p20_dir)
        else:
            table4c_paths[year] = RAW_DIR / f"{year}_{t4c_file}"
            if t1_file:
                table1_paths[year] = RAW_DIR / f"{year}_{t1_file}"

    print("Parsing Table 4c (state x age-bin) for all 5 cycles...")
    table4c = {}  # year -> { jurisdiction -> { bin -> {cvap, voted, moeVoted} } }
    for year, _, _, _, _ in CYCLES:
        table4c[year] = parse_table4c(table4c_paths[year])
        print(f"  {year}: {len(table4c[year])} jurisdictions OK")

    print("Parsing Table 1 (national single-year-of-age)...")
    table1 = {}  # year -> [rows]
    for year in table1_paths:
        table1[year] = parse_table1(table1_paths[year])
        print(f"  {year}: {len(table1[year])} single-year rows OK")

    # --- nationalByYearOfAge: single years of age, every cycle Table 1 is
    #     available for (2016/2020/2022/2024 - not 2018, see NOTE above).
    #     Beat 2 uses 2022 (midterm) alongside 2024 (presidential) to show
    #     the same over/under-representation curve gets more extreme in a
    #     midterm; keyed by year so any future beat can pull another cycle
    #     without another pipeline change. ---
    national_by_year_of_age = {}
    for year in table1:
        rows = [dict(r) for r in table1[year]]
        add_shares(rows)
        national_by_year_of_age[str(year)] = rows

    # --- nationalByBin: 5-bin national series across all 5 cycles ---
    national_by_bin = []
    for year, is_pres, _, _, _ in CYCLES:
        bins = table4c[year]["US"]
        entry = {
            "year": year,
            "isPresidential": is_pres,
            "bins": {b: dict(bins[b]) for b in ALL_BINS},
            "under35Gap": under35_gap(bins),
            "under35Turnout": under35_turnout(bins),
            "over65Turnout": over65_turnout(bins),
        }
        for b in ALL_BINS:
            cvap_total = sum(bins[x]["cvap"] for x in ALL_BINS)
            voted_total = sum(bins[x]["voted"] for x in ALL_BINS)
            entry["bins"][b]["shareElig"] = round(100 * bins[b]["cvap"] / cvap_total, 3)
            entry["bins"][b]["shareVote"] = round(100 * bins[b]["voted"] / voted_total, 3)
            entry["bins"][b]["turnout"] = round(100 * bins[b]["voted"] / bins[b]["cvap"], 1)
        national_by_bin.append(entry)

    # --- states: per-jurisdiction bins + gap for 2016/2020/2024 (presidential cycles,
    #     the years beat 3/4's pooling and beat 4's DiD both use) ---
    pooled_years = [2016, 2020, 2024]
    all_jurisdictions = sorted(set(table4c[2024]) - {"US"})
    states_out = []
    for state in all_jurisdictions:
        years_data = {}
        gaps = []
        for year in pooled_years:
            bins = table4c[year].get(state)
            if bins is None:
                continue
            gap = under35_gap(bins)
            years_data[str(year)] = {
                "bins": bins,
                "under35Gap": gap,
            }
            gaps.append(gap)
        moe_1824 = table4c[2024][state]["18-24"]["moeVoted"]
        states_out.append({
            "state": state,
            "abbr": STATE_ABBR.get(state, "??"),
            "years": years_data,
            "under35GapPooled": round(sum(gaps) / len(gaps), 3) if gaps else None,
            "under35Gap2024": years_data.get("2024", {}).get("under35Gap"),
            "moeVoted1824_2024": moe_1824,
            "mailStatus": MAIL_STATUS.get(state, "never"),
        })

    # --- derived: the harder statistical claims (beat 4), computed once here
    #     as build-time constants rather than hand-typed into prose or
    #     re-derived with an ad hoc JS routine in the frontend. ---
    mail_2024 = [s["under35Gap2024"] for s in states_out if s["mailStatus"] in ("permanent-pre2016", "permanent-post2020")]
    never_2024 = [s["under35Gap2024"] for s in states_out if s["mailStatus"] == "never"]
    welch = welch_t_test(mail_2024, never_2024)

    never_states = [s for s in states_out if s["mailStatus"] == "never"]
    reversion = mean_reversion(
        [s["years"]["2016"]["under35Gap"] for s in never_states],
        [s["years"]["2024"]["under35Gap"] - s["years"]["2016"]["under35Gap"] for s in never_states],
    )
    always_pre2016 = [s for s in states_out if s["mailStatus"] == "permanent-pre2016"]
    placebo_change = sum(
        s["years"]["2024"]["under35Gap"] - s["years"]["2016"]["under35Gap"] for s in always_pre2016
    ) / len(always_pre2016)
    never_change = sum(
        s["years"]["2024"]["under35Gap"] - s["years"]["2016"]["under35Gap"] for s in never_states
    ) / len(never_states)

    nj = next(s for s in states_out if s["state"] == "NEW JERSEY")
    mt = next(s for s in states_out if s["state"] == "MONTANA")
    never_mean_by_year = {
        y: sum(s["years"][y]["under35Gap"] for s in never_states) / len(never_states)
        for y in ("2016", "2020", "2024")
    }
    derived = {
        "mailCrossSection2024": {
            "mailMean": round(sum(mail_2024) / len(mail_2024), 3),
            "neverMean": round(sum(never_2024) / len(never_2024), 3),
            "nMail": len(mail_2024),
            "nNever": len(never_2024),
            "welchT": round(welch["t"], 3),
            "welchDf": round(welch["df"], 1),
            "significant": abs(welch["t"]) > 2,
        },
        "meanReversionNeverMail": {
            "intercept": round(reversion["a"], 3),
            "slope": round(reversion["b"], 4),
            "r": round(reversion["r"], 3),
            "predictedImprovementAtAdopterStartingLevel": round(
                reversion["a"] + reversion["b"] * sum(
                    s["years"]["2016"]["under35Gap"]
                    for s in states_out
                    if s["mailStatus"] in ("covid-only",)
                ) / max(1, len([s for s in states_out if s["mailStatus"] == "covid-only"])),
                3,
            ),
        },
        "placeboAlwaysMailPre2016": {
            "statesChecked": [s["state"] for s in always_pre2016],
            "meanChange2016to2024": round(placebo_change, 3),
            "neverMailMeanChange2016to2024": round(never_change, 3),
        },
        "naturalExperiment": {
            "neverMailMeanByYear": {y: round(v, 3) for y, v in never_mean_by_year.items()},
            "newJersey": {
                "gapByYear": {y: round(nj["years"][y]["under35Gap"], 3) for y in ("2016", "2020", "2024")},
                "didOnSwitch2020": round(
                    (nj["years"]["2020"]["under35Gap"] - nj["years"]["2016"]["under35Gap"])
                    - (never_mean_by_year["2020"] - never_mean_by_year["2016"]), 3,
                ),
                "didOffSwitch2024": round(
                    (nj["years"]["2024"]["under35Gap"] - nj["years"]["2020"]["under35Gap"])
                    - (never_mean_by_year["2024"] - never_mean_by_year["2020"]), 3,
                ),
            },
            "montana": {
                "gapByYear": {y: round(mt["years"][y]["under35Gap"], 3) for y in ("2016", "2020", "2024")},
                "didOnSwitch2020": round(
                    (mt["years"]["2020"]["under35Gap"] - mt["years"]["2016"]["under35Gap"])
                    - (never_mean_by_year["2020"] - never_mean_by_year["2016"]), 3,
                ),
                "didOffSwitch2024": round(
                    (mt["years"]["2024"]["under35Gap"] - mt["years"]["2020"]["under35Gap"])
                    - (never_mean_by_year["2024"] - never_mean_by_year["2020"]), 3,
                ),
            },
        },
    }

    output = {
        "derived": derived,
        "meta": {
            "source": "US Census Bureau, CPS November Voting and Registration Supplement",
            "sourceUrls": [
                f"https://www2.census.gov/programs-surveys/cps/tables/p20/{d}/"
                for _, _, _, _, d in CYCLES
            ],
            "retrieved": "2026-09-03",
            "units": "thousands (cvap, voted); percentage points (gap fields); percent (turnout, share fields)",
            "notes": [
                "2018 Table 1 (single-year-of-age) is mislabeled at the source "
                "(serves Table 1a, margins of error) and is excluded; Table 4c "
                "for 2018 is unaffected and included normally.",
                "Eligible population = citizen voting-age population (CVAP), "
                "not total voting-age population, to avoid confounding the "
                "age gap with non-citizen population share.",
                "under35Gap = shareOfVotesCast(18-34) - shareOfEligible(18-34), "
                "in percentage points. Negative = underrepresented.",
            ],
        },
        "nationalByYearOfAge": national_by_year_of_age,
        "nationalByBin": national_by_bin,
        "states": states_out,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")
    print(f"  nationalByYearOfAge: {list(national_by_year_of_age.keys())}")
    print(f"  nationalByBin: {len(national_by_bin)} cycles")
    print(f"  states: {len(states_out)} jurisdictions")


if __name__ == "__main__":
    main()
