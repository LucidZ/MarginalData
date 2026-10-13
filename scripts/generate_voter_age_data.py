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
  CPS microdata - the same November supplement's public-use person file
                 (2024 only, so far), for the explorer's education / family
                 income / race views. Microdata rather than Tables 2/5/7:
                 Table 7 covers family members only and leaves income
                 unreported for 1 in 6 of them (~60% coverage), while the
                 person file carries family income for every household,
                 Census-imputed where not reported. Weighted, it reproduces
                 Table 1's citizen and voter totals and Table 5 row for row
                 - checked below.

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

# Public-use November supplement person files, per year.
MICRODATA_BASE = "https://www2.census.gov/programs-surveys/cps/datasets"
MICRODATA = {2024: "nov24pub.csv"}

# Each dimension's groups, in axis order: (full label, short axis label,
# predicate on the parsed person record).
EDUCATION_GROUPS = [
    ("Less than 9th grade", "< 9th grade", lambda p: p["edu"] <= 34),
    ("9th to 12th grade, no diploma", "9th-12th, no diploma", lambda p: 35 <= p["edu"] <= 38),
    ("High school graduate", "HS grad", lambda p: p["edu"] == 39),
    ("Some college or associate's degree", "Some college", lambda p: 40 <= p["edu"] <= 42),
    ("Bachelor's degree", "Bachelor's", lambda p: p["edu"] == 43),
    ("Advanced degree", "Advanced degree", lambda p: p["edu"] >= 44),
]

# HEFAMINC's 16 codes merged to Table 7's ten brackets. Nominal dollars of
# each survey year - not inflation-adjusted.
INCOME_GROUPS = [
    ("Under $10,000", "<$10K", lambda p: p["inc"] <= 3),
    ("$10,000 to $14,999", "$10-15K", lambda p: p["inc"] in (4, 5)),
    ("$15,000 to $19,999", "$15-20K", lambda p: p["inc"] == 6),
    ("$20,000 to $29,999", "$20-30K", lambda p: p["inc"] in (7, 8)),
    ("$30,000 to $39,999", "$30-40K", lambda p: p["inc"] in (9, 10)),
    ("$40,000 to $49,999", "$40-50K", lambda p: p["inc"] == 11),
    ("$50,000 to $74,999", "$50-75K", lambda p: p["inc"] in (12, 13)),
    ("$75,000 to $99,999", "$75-100K", lambda p: p["inc"] == 14),
    ("$100,000 to $149,999", "$100-150K", lambda p: p["inc"] == 15),
    ("$150,000 and over", "$150K+", lambda p: p["inc"] == 16),
]

# Mutually exclusive, unlike Table 2's overlapping race files (where
# "Black alone" includes Hispanic Black people), so the bars sum to the
# whole electorate.
RACE_GROUPS = [
    ("White, not Hispanic", "White", lambda p: not p["hisp"] and p["race"] == 1),
    ("Black, not Hispanic", "Black", lambda p: not p["hisp"] and p["race"] == 2),
    ("Asian, not Hispanic", "Asian", lambda p: not p["hisp"] and p["race"] == 4),
    ("Hispanic (any race)", "Hispanic", lambda p: p["hisp"]),
    ("Other or multiple races, not Hispanic", "Other", lambda p: not p["hisp"] and p["race"] not in (1, 2, 4)),
]

DIMENSIONS = {
    "education": ("Education", EDUCATION_GROUPS),
    "income": ("Family income", INCOME_GROUPS),
    "race": ("Race / ethnicity", RACE_GROUPS),
}


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


    # The 65+ show-up rate: votes per registrant in the benchmark group.
    over65_show_up = over65_turnout / over65_reg_rate

    # The gold wedge (expected - votes) splits exactly into two parts, both
    # in votes relative to the 65+ standard:
    #   regShort  = (cvap*R - registered) * S  - votes lost to people missing
    #               from the rolls (each would vote at the 65+ show-up rate)
    #   turnShort = registered*S - votes       - votes lost because registrants
    #               here show up less often than 65+ registrants do
    # They sum to cvap*R*S - votes = cvap*T - votes = the gap. Where one goes
    # negative (registration or show-up above the 65+ rate), clamp it to 0
    # and give the whole gap to the other, so the two always fill the wedge.
    # Ages with no gap get 0 for both - same no-surplus rule as the wedge.
    #
    # registrationGap / registeredNotVoted are head-counts kept for reference
    # (footnotes, tooltip); they're not drawn and don't sum to anything.
    reg_gap = 0.0
    reg_not_voted = 0.0
    reg_short_total = 0.0
    turn_short_total = 0.0
    gap_total = 0.0
    for r in rows:
        exp_reg = r["cvap"] * over65_reg_rate
        reg_gap += max(0.0, exp_reg - r["registered"])
        reg_not_voted += max(0.0, r["registered"] - r["votes"])
        gap = r["cvap"] * over65_turnout - r["votes"]
        if gap > 0:
            reg_short = (exp_reg - r["registered"]) * over65_show_up
            turn_short = r["registered"] * over65_show_up - r["votes"]
            if reg_short < 0:
                reg_short, turn_short = 0.0, gap
            elif turn_short < 0:
                reg_short, turn_short = gap, 0.0
            gap_total += gap
        else:
            reg_short = turn_short = 0.0
        reg_short_total += reg_short
        turn_short_total += turn_short
        r["expected"] = round(r["cvap"] * over65_turnout, 1)
        r["missing"] = round(r["votes"] - r["expected"], 1)
        r["regShort"] = round(reg_short, 1)
        r["turnShort"] = round(turn_short, 1)
        r["cvap"] = round(r["cvap"], 1)
        r["votes"] = round(r["votes"], 1)
        r["registered"] = round(r["registered"], 1)

    if abs(reg_short_total + turn_short_total - gap_total) >= 0.5:
        raise ValueError(
            f"shortfall split {reg_short_total:.1f} + {turn_short_total:.1f} doesn't sum to "
            f"the gold wedge {gap_total:.1f} (tolerance 0.5k)"
        )

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
        "over65ShowUp": round(100 * over65_show_up, 2),
        # Thousands of votes. The two parts of the voter shortfall; they
        # sum to it (see the split above).
        "registrationShortfall": round(reg_short_total, 1),
        "turnoutShortfall": round(turn_short_total, 1),
        # Thousands of people. Reference only, not drawn: people short of
        # the 65+ registration rate, and registered people who didn't vote
        # (all ages). Not two halves of any one total - never add them.
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


# ---------------------------------------------------------------------------
# byDimension: education / income / race from CPS microdata
# ---------------------------------------------------------------------------

def load_microdata(path):
    """Eligible voters from one November person file: age 18+, civilian
    adults (PRPERTYP 2 - the universe of every P20 table), US citizens.
    Voted = PES1 1; everything else (no, don't know, refused, no response)
    counts as not voting, Census's own convention. Weights carry four
    implied decimals; returned in thousands."""
    import csv

    people = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            if int(row["PRTAGE"]) < 18 or row["PRPERTYP"] != "2" or int(row["PRCITSHP"]) > 4:
                continue
            inc = int(row["HEFAMINC"])
            if not 1 <= inc <= 16:
                raise ValueError(f"{path.name}: HEFAMINC {inc} outside 1-16 - expected every household imputed")
            people.append({
                "w": float(row["PWSSWGT"]) / 1e7,
                "voted": row["PES1"] == "1",
                "edu": int(row["PEEDUCA"]),
                "inc": inc,
                "incImputed": row["HXFAMINC"] != "0",
                "race": int(row["PTDTRACE"]),
                "hisp": row["PEHSPNON"] == "1",
            })
    return people


def build_dimension_year(people, groups):
    """One year of one dimension. The benchmark is the group with the
    highest turnout: expected = cvap x that rate, so every other group's
    missing is its shortfall from the best-voting group and the top
    group's is 0."""
    rows = []
    for full, short, pred in groups:
        members = [p for p in people if pred(p)]
        cvap = sum(p["w"] for p in members)
        votes = sum(p["w"] for p in members if p["voted"])
        rows.append({"group": full, "short": short, "cvap": cvap, "votes": votes, "turnout": 100 * votes / cvap})

    covered = sum(r["cvap"] for r in rows)
    total = sum(p["w"] for p in people)
    if abs(covered - total) > 0.5:
        raise ValueError(f"groups cover {covered:,.0f}k of {total:,.0f}k eligible - they must partition everyone")

    top = max(rows, key=lambda r: r["turnout"])
    bench = top["turnout"] / 100
    shortfall = 0.0
    for r in rows:
        expected = r["cvap"] * bench
        shortfall += expected - r["votes"]
        r["expected"] = round(expected, 1)
        r["missing"] = round(r["votes"] - expected, 1) + 0.0  # no -0.0 for the benchmark group
        r["cvap"] = round(r["cvap"], 1)
        r["votes"] = round(r["votes"], 1)
        r["turnout"] = round(r["turnout"], 1)

    total_votes = sum(p["w"] for p in people if p["voted"])
    return {
        "benchmarkGroup": top["group"],
        "benchmarkTurnout": round(top["turnout"], 2),
        "totalCvap": round(total, 1),
        "totalVotes": round(total_votes, 1),
        "avgTurnout": round(100 * total_votes / total, 2),
        "shortfall": round(shortfall, 1),  # thousands of votes, sum of every group's gap to the benchmark
        "rows": rows,
    }


def validate_microdata(people, year, table1, table5_path):
    """The weighted person file must reproduce Census's published tables:
    Table 1's citizen and voter totals, and (2024) Table 5's education rows,
    within rounding. Anything more is a parsing or universe error."""
    single_years, tail_80_84, tail_85_plus = table1
    cps_cvap = sum(v[1] for v in single_years.values()) + tail_80_84[1] + tail_85_plus[1]
    cps_votes = sum(v[2] for v in single_years.values()) + tail_80_84[2] + tail_85_plus[2]
    cvap = sum(p["w"] for p in people)
    votes = sum(p["w"] for p in people if p["voted"])
    for name, mine, theirs in (("citizens", cvap, cps_cvap), ("voters", votes, cps_votes)):
        if abs(mine - theirs) > 2:
            raise ValueError(f"{year} microdata {name} {mine:,.0f}k vs Table 1 {theirs:,.0f}k (tolerance 2k)")

    if table5_path is None:
        return
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        ws = openpyxl.load_workbook(table5_path, data_only=True).active
    published = {}
    for r in ws.iter_rows(values_only=True):
        if r[0] in ("MALE", "Margins of Error3"):
            break  # BOTH SEXES block only
        label = str(r[1] or "").strip()
        if any(label == g[0] for g in EDUCATION_GROUPS):
            published[label] = (float(r[3]), float(r[10]))
    for full, _, pred in EDUCATION_GROUPS:
        members = [p for p in people if pred(p)]
        mine = (sum(p["w"] for p in members), sum(p["w"] for p in members if p["voted"]))
        theirs = published[full]
        if abs(mine[0] - theirs[0]) > 2 or abs(mine[1] - theirs[1]) > 2:
            raise ValueError(f"{year} {full}: microdata {mine} vs Table 5 {theirs} (tolerance 2k)")


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
            f"show-up {cycle['over65ShowUp']}%  shortfall split {cycle['registrationShortfall']:,.0f}k "
            f"not registered + {cycle['turnoutShortfall']:,.0f}k registered, voted less"
        )

    print("Building byDimension (CPS microdata)...")
    by_dimension = {key: {"label": label, "years": {}} for key, (label, _) in DIMENSIONS.items()}
    for year, filename in MICRODATA.items():
        dest_name = filename
        path = RAW_DIR / dest_name if args.skip_download else download(dest_name, f"{MICRODATA_BASE}/{year}/supp/{filename}")
        people = load_microdata(path)
        table5 = RAW_DIR / "2024_vote05_2024_1.xlsx" if year == 2024 else None
        if table5 is not None and not args.skip_download:
            table5 = download(table5.name, f"{CPS_BASE}/587/vote05_2024_1.xlsx")
        validate_microdata(people, year, table1[year], table5)
        total = sum(p["w"] for p in people)
        imputed = 100 * sum(p["w"] for p in people if p["incImputed"]) / total
        for key, (_, groups) in DIMENSIONS.items():
            entry = build_dimension_year(people, groups)
            if key == "income":
                entry["imputedPct"] = round(imputed, 1)
            by_dimension[key]["years"][str(year)] = entry
            print(
                f"  {year} {key}: benchmark {entry['benchmarkGroup']} {entry['benchmarkTurnout']}%  "
                f"shortfall {entry['shortfall']:,.0f}k ({100 * entry['shortfall'] / entry['totalVotes']:.1f}% of votes)"
            )
        print(f"  {year}: {len(people):,} eligible respondents, {total:,.0f}k weighted; family income imputed for {imputed:.1f}%")

    output = {
        "meta": {
            "sources": [
                "US Census Bureau, CPS November Voting and Registration Supplement, Table 1 "
                "(2012, 2014, 2016, 2018, 2020, 2022, 2024), and its public-use person file (2024)",
                "US Census Bureau, Population Estimates Program (PEP), national single-year-of-age "
                "estimates: Vintage 2024 (2020-2024) and 2010-2020 intercensal (2012-2018)",
            ],
            "sourceUrls": [
                f"{CPS_BASE}/{p20_dir}/" for _, p20_dir, _ in CYCLES
            ] + [PEP_URL, PEP_INTERCENSAL_URL] + [
                f"{MICRODATA_BASE}/{y}/supp/{f}" for y, f in MICRODATA.items()
            ],
            "retrieved": "2026-09-25",
            "units": "thousands of people (cvap, votes, registered, expected, missing); thousands of votes short of the 65+ standard (regShort, turnShort, registrationShortfall, turnoutShortfall); thousands of people, reference only, not drawn (registrationGap, registeredNotVoted); percent (turnout, registeredRate, avgTurnout, over65Turnout, over65Registration, over65ShowUp)",
            "construction": (
                "byAge: citizen_pop(age,year) = PEP single-year population(age,year) x "
                "CPS citizen-share(age,year); votes(age,year) = citizen_pop x CPS turnout(age,year). "
                "See spec v2 S5 for why levels come from PEP and rates from CPS. "
                "byDimension: CPS weighted counts straight from the person file, no PEP - PEP has "
                "no education or income breakdown, and CPS weights are already controlled to "
                "Census population estimates for the civilian non-institutional population. "
                "Totals run ~2.5% below byAge's, which also counts people in institutions "
                "(nursing homes, prisons) and the military."
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
                "byDimension's benchmark is each dimension's highest-turnout group, not the 65+ rate; "
                "its shortfall sums every other group's gap to that rate.",
                "Family income (byDimension.income) is the household's combined family income - a "
                "person living alone or with non-relatives gets their own household's - in nominal "
                "dollars of each survey year. Census imputes it where not reported (imputedPct).",
            ],
        },
        "byAge": by_age,
        "byDimension": by_dimension,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2, allow_nan=False)

    print(f"\nWrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
