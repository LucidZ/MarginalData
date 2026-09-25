#!/usr/bin/env python3
"""
Generate voter-age.json for "The Shape of the Electorate" story.

See .claude/voter-age-spec-v2.md for the full derivation, story beats and
integrity guardrails this pipeline exists to serve. Supersedes the v1
pipeline (age-only, share-vs-share scatter, state cartogram, NJ/Montana
natural experiment) - all of that is gone; see spec v2 S9 for why.

Two kinds of source, used for what each measures well (spec v2 S5.1):

  Census Population Estimates Program (PEP) - real single-year-of-age
  POPULATION LEVELS, to age 100. Administrative estimate, low noise.

  Census CPS November Voting and Registration Supplement - self-reported
  survey RATES (citizen share, turnout). High noise on levels, low noise
  on ratios - see the wobble comparison in spec v2 S5.1.

Construction (spec v2 S5):
    citizen_pop(age, year) = PEP_pop(age, year) x CPS_citizen_share(age, year)
    votes(age, year)       = citizen_pop(age, year) x CPS_turnout(age, year)

This also dissolves the tail-bucket bug fixed 2026-09-08 (CPS pools ages
80-84 and 85+; plotting either as a single "age" on a counts-on-y chart
spikes badly). PEP has genuine single-year population to 100, so nothing
above 79 needs to be invented - only the *rates* stay pooled within each
CPS tail bucket, because that's all CPS reports.

Sources used:
  CPS Table 1  - national, single year of age (18-79 + 80-84/85+ pooled),
                 every November election 2012-2024 (beats 1-2 use
                 2022/2024; the explorer uses all seven).
  PEP          - national, single year of age x sex: 2010-2020 intercensal
                 series for 2012-2018, Vintage 2024 for 2020-2024.

Requirements:
    openpyxl, xlrd >= 2 (for the 2012/2014 .xls tables)
    (no API key / auth needed - all public downloads)

Usage:
    python scripts/generate_voter_age_data.py
    python scripts/generate_voter_age_data.py --skip-download  # reuse cache

Output:
    File: public/data/voter-age.json
"""

import argparse
import json
import re
import urllib.request
import warnings
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "voter_age"
OUT_PATH = ROOT / "public" / "data" / "voter-age.json"

CPS_BASE = "https://www2.census.gov/programs-surveys/cps/tables/p20"
PEP_URL = (
    "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/"
    "national/asrh/nc-est2024-agesex-res.csv"
)
# 2010-2020 intercensal series, revised to agree with the 2020 Census - the
# same anchor as the V2024 file above. Used for 2012-2018 only: it has just
# the April 2020 census count for 2020, and every other year is a July 1
# estimate, so 2020 comes from the V2024 file's POPESTIMATE2020.
PEP_INTERCENSAL_URL = (
    "https://www2.census.gov/programs-surveys/popest/datasets/2010-2020/"
    "intercensal/national/asrh/nc-est2020int-agesex-res.csv"
)
PEP_INTERCENSAL_YEARS = (2012, 2014, 2016, 2018)

# (year, p20_dir, table1_filename). Every November election 2012-2024.
# 2012/2014 are legacy .xls (read with xlrd) and lay the table out
# differently from 2016+ - parse_table1 handles both without fixed indices.
CYCLES = [
    (2012, "568", "table01.xls"),
    (2014, "577", "table01.xls"),
    (2016, "580", "table01.xlsx"),
    (2018, "583", "table01.xlsx"),
    (2020, "585", "table01.xlsx"),
    (2022, "586", "vote01_2022.xlsx"),
    (2024, "587", "vote01_2024.xlsx"),
]

def download(dest_name, url):
    dest = RAW_DIR / dest_name
    if dest.exists():
        return dest
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    return dest


TABLE1_SHEET = "Table 1"


def load_table1_rows(path):
    """All rows of CPS Table 1 as tuples, from .xls (2012/2014) or .xlsx.

    Selects the sheet named "Table 1" when there is one, not the active
    sheet: 2018's workbook has "Table 1" and "Table 1a" (margins of error)
    and 1a is the active sheet, so wb.active silently parses MOEs. Then
    asserts the title really is Table 1, for every year."""
    if path.suffix == ".xls":
        import xlrd
        wb = xlrd.open_workbook(path)
        names = wb.sheet_names()
        sh = wb.sheet_by_name(TABLE1_SHEET) if TABLE1_SHEET in names else wb.sheet_by_index(0)
        rows = [tuple(sh.row_values(i)) for i in range(sh.nrows)]
    else:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            wb = openpyxl.load_workbook(path, data_only=True)
        ws = wb[TABLE1_SHEET] if TABLE1_SHEET in wb.sheetnames else wb.active
        rows = list(ws.iter_rows(values_only=True))

    title = next(
        (str(c).strip() for r in rows[:8] for c in r[:2] if c and str(c).strip().startswith("Table 1")),
        None,
    )
    if title is None or not title.startswith("Table 1."):
        raise ValueError(f"{path.name}: expected a 'Table 1.' title, found {title!r}")
    return rows


def _is_number(c):
    return isinstance(c, (int, float)) and not isinstance(c, bool)


def normalize_row(r):
    """(label, numbers) for one Table 1 row, independent of layout. 2016+
    puts the age label in col 1 (marker in col 0); 2012/2014 put a
    dot-indented label in col 0 and shift every number left by one. The
    label is the last non-numeric text among the first two cells, dots
    stripped; numbers are the numeric cells in order."""
    label = ""
    for c in r[:2]:
        if c is not None and not _is_number(c) and str(c).strip():
            label = str(c).strip().lstrip(".").strip()
    return label, [float(c) for c in r if _is_number(c)]


BLOCK_MARKERS = ("both sexes", "male", "female")


def _marker(r):
    """The BOTH SEXES/MALE/FEMALE marker in either of the first two cells
    (2016+ shares the BOTH SEXES row with "Total 18 years and over";
    2012/2014 put title-case markers on rows of their own)."""
    for c in r[:2]:
        if c is not None and not _is_number(c) and str(c).strip().lstrip(".").strip().lower() in BLOCK_MARKERS:
            return True
    return False


# ---------------------------------------------------------------------------
# CPS Table 1 - national, single year of age
# ---------------------------------------------------------------------------

SINGLE_YEAR_RE = re.compile(r"^(\d+) years$")
# The tail bucket label is hyphenated ("80-84 years"), unlike every other
# bin in this table ("18 to 24 years") - spec v2 S5.4 gotcha #2.
TAIL_80_84_RE = re.compile(r"^80-84 years$")
TAIL_85_PLUS = "85 years and over"


def parse_table1(path):
    """
    Returns (single_years, tail_80_84, tail_85_plus) where single_years is
    {age: (total_pop, citizen_pop, voted, registered)} for ages 18-79, and
    the tail tuples are each a single (total_pop, citizen_pop, voted,
    registered). Registered is last so every existing [1]/[2] index into
    these tuples still means citizens/voted.

    Table 1 repeats all 62 single-year rows three times - once per
    BOTH SEXES / MALE / FEMALE block (spec v2 S5.4 gotcha #1). An
    unbounded scan overwrites the young ages with male-only counts and
    fakes a structural break at age 52. Bound the scan to the BOTH SEXES
    block by locating the next marker row, not a fixed row offset (the
    header height is not stable across years).
    """
    rows = load_table1_rows(path)
    markers = [i for i, r in enumerate(rows) if _marker(r)]
    if not markers:
        raise ValueError(f"{path.name}: no BOTH SEXES/MALE/FEMALE marker rows found")
    lo = markers[0]
    hi = markers[1] if len(markers) > 1 else len(rows)

    single_years = {}
    tail_80_84 = None
    tail_85_plus = None
    for r in rows[lo:hi]:
        label, n = normalize_row(r)
        m = SINGLE_YEAR_RE.match(label)
        if len(n) < 9:
            continue
        # n[2] = citizens reporting registered. Census counts "no response
        # to registration" as not registered, same convention as n[8]'s
        # voted. (Cols 4 and 10 in the 2016+ layout, 3 and 9 in 2012/2014.)
        total_pop, cit_pop, voted, registered = n[0], n[1], n[8], n[2]
        rec = (total_pop, cit_pop, voted, registered)
        if m:
            single_years[int(m.group(1))] = rec
        elif TAIL_80_84_RE.match(label):
            tail_80_84 = rec
        elif label == TAIL_85_PLUS:
            tail_85_plus = rec

    if len(single_years) != 62:  # ages 18-79
        raise ValueError(f"{path.name}: expected 62 single-year rows (18-79), got {len(single_years)}")
    if tail_80_84 is None or tail_85_plus is None:
        raise ValueError(f"{path.name}: missing one or both tail bucket rows (80-84 / 85+)")

    return single_years, tail_80_84, tail_85_plus


# ---------------------------------------------------------------------------
# PEP - national, single year of age, both sexes
# ---------------------------------------------------------------------------

def parse_pep(sources):
    """sources = {path: [years]}. Returns {age: {year: population_thousands}}
    for ages 0-100 ("100" means "100 and over"), both sexes (SEX == '0'),
    merged across files. Checks ages 18-100 are complete for every year."""
    import csv

    out = {}
    for path, years in sources.items():
        with open(path, newline="") as f:
            for row in csv.DictReader(f):
                if row["SEX"] != "0":
                    continue
                age = int(row["AGE"])
                if age == 999:  # the all-ages total row
                    continue
                out.setdefault(age, {}).update({y: float(row[f"POPESTIMATE{y}"]) / 1000 for y in years})

        missing = [a for a in range(18, 101) if any(y not in out.get(a, {}) for y in years)]
        if missing:
            raise ValueError(f"{path.name}: missing PEP population for ages {missing}")
    return out


# ---------------------------------------------------------------------------
# byAge construction: PEP levels x CPS rates (spec v2 S5)
# ---------------------------------------------------------------------------

def build_age_rows(single_years, tail_80_84, tail_85_plus, pep_by_age, year):
    """One row per single year of age, 18-100. Ages 80+ use PEP's genuine
    single-year population but a CPS turnout/citizen-share rate pooled
    across the whole tail bucket, since that's all CPS reports there
    (spec v2 S5.2) - flagged with ratesPooled: true."""
    rows = []
    for age in range(18, 101):
        if age in single_years:
            total_pop, cit_pop, voted, registered = single_years[age]
            rates_pooled = False
        elif age < 85:
            total_pop, cit_pop, voted, registered = tail_80_84
            rates_pooled = True
        else:
            total_pop, cit_pop, voted, registered = tail_85_plus
            rates_pooled = True

        cit_share = cit_pop / total_pop
        turnout = voted / cit_pop
        reg_rate = registered / cit_pop
        pep_pop = pep_by_age[age][year]
        cvap = pep_pop * cit_share
        votes = cvap * turnout
        rows.append({
            "age": age,
            "cvap": cvap,
            "votes": votes,
            "registered": cvap * reg_rate,
            "turnout": round(100 * turnout, 1),
            "registeredRate": round(100 * reg_rate, 1),
            "ratesPooled": rates_pooled,
        })
    return rows


OVER65_AGE = 65  # benchmark cohort for the chart's "expected" line


def finalize_age_cycle(rows):
    total_cvap = sum(r["cvap"] for r in rows)
    total_votes = sum(r["votes"] for r in rows)
    avg_turnout = total_votes / total_cvap  # kept for CPS reconciliation, spec v2 S5.3 - not the chart's benchmark

    over65_cvap = sum(r["cvap"] for r in rows if r["age"] >= OVER65_AGE)
    over65_votes = sum(r["votes"] for r in rows if r["age"] >= OVER65_AGE)
    over65_turnout = over65_votes / over65_cvap
    over65_registered = sum(r["registered"] for r in rows if r["age"] >= OVER65_AGE)
    over65_reg_rate = over65_registered / over65_cvap


    # The registration standard: cvap x the 65+ registration rate. Its gap
    # down to `registered` is people missing from the rolls (only shortfalls
    # totalled - an age above the line contributes 0, same no-surplus rule
    # as the gold wedge). The other hurdle needs no standard of its own:
    # registered minus votes, the space between the two green bars, is
    # already the count of registered people who didn't vote.
    reg_gap = 0.0
    reg_not_voted = 0.0
    for r in rows:
        exp_reg = r["cvap"] * over65_reg_rate
        reg_gap += max(0.0, exp_reg - r["registered"])
        reg_not_voted += max(0.0, r["registered"] - r["votes"])
        r["expected"] = round(r["cvap"] * over65_turnout, 1)
        r["missing"] = round(r["votes"] - r["expected"], 1)
        r["expectedRegistered"] = round(exp_reg, 1)
        r["cvap"] = round(r["cvap"], 1)
        r["votes"] = round(r["votes"], 1)
        r["registered"] = round(r["registered"], 1)

    # Crossover: first age (ascending) whose own turnout reaches the 65+
    # benchmark. Decline: last age (descending) that still does - the 65+
    # line isn't a ceiling every older age clears; turnout among the
    # oldest ages falls back under even this high a bar. Both deliberately
    # unsmoothed and both dip in and out near their edges (a few ages in
    # the late 50s/early 60s already clear the line before it holds for
    # good; a few in the 60s/70s dip back under before the real late-life
    # decline sets in) - say "around age NN" in prose, never "exactly".
    crossover = next((r["age"] for r in rows if r["votes"] >= r["expected"]), None)
    decline = next((r["age"] for r in reversed(rows) if r["votes"] >= r["expected"]), None)

    return {
        "avgTurnout": round(100 * avg_turnout, 2),
        "over65Turnout": round(100 * over65_turnout, 2),
        "over65Registration": round(100 * over65_reg_rate, 2),
        # Thousands. People short of the 65+ registration rate, and
        # registered people who didn't vote (all ages). Not two halves of
        # any one total - never add them.
        "registrationGap": round(reg_gap, 1),
        "registeredNotVoted": round(reg_not_voted, 1),
        "totalCvap": round(total_cvap, 1),
        "totalVotes": round(total_votes, 1),
        "crossoverAge": crossover,
        "declineAge": decline,
        "rows": rows,
    }


def validate_age_reconstruction(cycle, cps_published_cvap, cps_published_votes, single_years, tail_80_84, tail_85_plus, pep_by_age, year):
    """Spec v2 S5.3: total turnout within 0.5pp of CPS's published rate,
    and each block within 12%. A larger divergence means a parsing error,
    not a data finding - fail loudly."""
    cps_turnout = 100 * cps_published_votes / cps_published_cvap
    diff = abs(cycle["avgTurnout"] - cps_turnout)
    if diff > 0.5:
        raise ValueError(
            f"{year}: reconstructed turnout {cycle['avgTurnout']}% is {diff:.2f}pp from "
            f"CPS published {cps_turnout:.2f}% (tolerance 0.5pp) - likely a parsing bug"
        )

    def block_check(label, age_range, cps_cvap):
        recon = sum(r["cvap"] for r in cycle["rows"] if r["age"] in age_range)
        pct = 100 * (recon / cps_cvap - 1)
        if abs(pct) > 12:
            raise ValueError(f"{year} block {label}: reconstruction {pct:+.1f}% off CPS (tolerance 12%)")
        return pct

    # Same check for registration, against CPS's own published rate.
    cps_cit = sum(v[1] for v in single_years.values()) + tail_80_84[1] + tail_85_plus[1]
    cps_reg = sum(v[3] for v in single_years.values()) + tail_80_84[3] + tail_85_plus[3]
    recon_reg = 100 * sum(r["registered"] for r in cycle["rows"]) / cycle["totalCvap"]
    reg_diff = abs(recon_reg - 100 * cps_reg / cps_cit)
    if reg_diff > 0.5:
        raise ValueError(f"{year}: reconstructed registration {recon_reg:.2f}% is {reg_diff:.2f}pp from CPS (tolerance 0.5pp)")

    block_check("18-79", range(18, 80), sum(v[1] for v in single_years.values()))
    block_check("80-84", range(80, 85), tail_80_84[1])
    block_check("85+", range(85, 101), tail_85_plus[1])

    # Single-row join check (spec v2 S11): age 18 reconstruction should be
    # in the neighborhood of the value verified by hand during planning.
    row18 = next(r for r in cycle["rows"] if r["age"] == 18)
    if year == 2024 and not (4200 <= row18["cvap"] <= 4350):
        raise ValueError(f"age-18 2024 CVAP {row18['cvap']} outside expected range [4200, 4350]")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-download", action="store_true", help="Reuse cached files in data/voter_age/ without re-fetching")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print("Fetching source files...")
    table1_paths = {}
    for year, p20_dir, filename in CYCLES:
        dest_name = f"{year}_{filename}"
        if not args.skip_download:
            table1_paths[year] = download(dest_name, f"{CPS_BASE}/{p20_dir}/{filename}")
        else:
            table1_paths[year] = RAW_DIR / dest_name

    if not args.skip_download:
        pep_path = download("nc-est2024-agesex-res.csv", PEP_URL)
        pep_intercensal_path = download("nc-est2020int-agesex-res.csv", PEP_INTERCENSAL_URL)
    else:
        pep_path = RAW_DIR / "nc-est2024-agesex-res.csv"
        pep_intercensal_path = RAW_DIR / "nc-est2020int-agesex-res.csv"

    print(f"Parsing CPS Table 1 (national, single year of age) x {len(CYCLES)} cycles...")
    table1 = {}
    for year, _, _ in CYCLES:
        table1[year] = parse_table1(table1_paths[year])
        print(f"  {year}: {len(table1[year][0])} single-year rows + 2 tail buckets OK")

    print("Parsing PEP (national population, single year of age)...")
    pep_by_age = parse_pep({
        pep_intercensal_path: [y for y, _, _ in CYCLES if y in PEP_INTERCENSAL_YEARS],
        pep_path: [y for y, _, _ in CYCLES if y not in PEP_INTERCENSAL_YEARS],
    })
    print(f"  {len(pep_by_age)} ages (18-100) x {len(CYCLES)} years OK")

    print("Building byAge (PEP levels x CPS rates)...")
    by_age = {}
    for year, _, _ in CYCLES:
        single_years, tail_80_84, tail_85_plus = table1[year]
        rows = build_age_rows(single_years, tail_80_84, tail_85_plus, pep_by_age, year)
        cycle = finalize_age_cycle(rows)
        cps_cvap = sum(v[1] for v in single_years.values()) + tail_80_84[1] + tail_85_plus[1]
        cps_votes = sum(v[2] for v in single_years.values()) + tail_80_84[2] + tail_85_plus[2]
        validate_age_reconstruction(cycle, cps_cvap, cps_votes, single_years, tail_80_84, tail_85_plus, pep_by_age, year)
        # Presidential vs midterm, for the explorer's year control.
        by_age[str(year)] = {"kind": "presidential" if year % 4 == 0 else "midterm", **cycle}
        print(
            f"  {year}: CVAP {cycle['totalCvap']:,.0f}k  votes {cycle['totalVotes']:,.0f}k  "
            f"avg turnout {cycle['avgTurnout']}%  crossover age {cycle['crossoverAge']}"
        )
        print(
            f"         65+ registered {cycle['over65Registration']}%  "
            f"{cycle['registrationGap']:,.0f}k short of it, {cycle['registeredNotVoted']:,.0f}k registered non-voters"
        )

    output = {
        "meta": {
            "sources": [
                "US Census Bureau, CPS November Voting and Registration Supplement, Table 1 "
                "(2012, 2014, 2016, 2018, 2020, 2022, 2024)",
                "US Census Bureau, Population Estimates Program (PEP), national single-year-of-age "
                "estimates: Vintage 2024 (2020-2024) and 2010-2020 intercensal (2012-2018)",
            ],
            "sourceUrls": [
                f"{CPS_BASE}/{p20_dir}/" for _, p20_dir, _ in CYCLES
            ] + [PEP_URL, PEP_INTERCENSAL_URL],
            "retrieved": "2026-09-25",
            "units": "thousands of people (cvap, votes, registered, expected, missing, expectedRegistered, registrationGap, registeredNotVoted); percent (turnout, registeredRate, avgTurnout, over65Turnout, over65Registration)",
            "construction": (
                "byAge: citizen_pop(age,year) = PEP single-year population(age,year) x "
                "CPS citizen-share(age,year); votes(age,year) = citizen_pop x CPS turnout(age,year). "
                "See spec v2 S5 for why levels come from PEP and rates from CPS."
            ),
            "notes": [
                "Eligible population = citizen voting-age population (CVAP), not total voting-age "
                "population, to avoid confounding any gap with non-citizen population share.",
                "CPS turnout is self-reported and runs higher than certified results; the "
                "overstatement is not perfectly uniform across groups, so treat exact percentage "
                "points as approximate rather than exact.",
                "byAge covers every November election 2012-2024. Population for 2012-2018 comes "
                "from Census's 2010-2020 intercensal estimates, which were revised after the 2020 "
                "Census; 2020-2024 from Vintage 2024. Both are anchored to the 2020 Census.",
                "Ages 80+ (byAge) use real single-year PEP population but a CPS turnout/citizen-"
                "share rate pooled across the whole 80-84 or 85+ bucket, since CPS does not report "
                "single years of age above 79 - flagged per-row as ratesPooled.",
                "Registration (byAge registered/registeredRate) is self-reported in the same November "
                "interview as voting, and Census counts non-response as not registered. Non-response "
                "is highest among the young (~20% of 18-24s in 2024 vs ~12-13% of 65+), so youth "
                "registration is likely understated somewhat - same convention as turnout.",
            ],
        },
        "byAge": by_age,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2, allow_nan=False)

    print(f"\nWrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
