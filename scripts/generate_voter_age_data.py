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
                 2022 and 2024 only (both cycles used in beats 1-2).
  CPS Table 2  - national, race/Hispanic origin (2024 only, beat 3).
  CPS Table 5  - national, educational attainment (2024 only, beat 3).
  CPS Table 7  - national, family income (2024 only, beat 3).
  PEP          - national, single year of age x sex, 2022 and 2024.

Requirements:
    openpyxl (no API key / auth needed - all public downloads)

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

# (year, p20_dir, table1_filename)
CYCLES = [
    (2022, "586", "vote01_2022.xlsx"),
    (2024, "587", "vote01_2024.xlsx"),
]

# Race/ethnicity variant files under the 2024 (587) directory - vote02_2024_N.xlsx.
# N -> (json key, group label). Only the four spec v2 S4.1 groups plus "All Races"
# (used to compute a residual "other/multiple races" row, S7.3) are fetched.
RACE_VARIANTS = {
    1: ("all", "All Races"),
    3: ("whiteNonHispanic", "White alone, not Hispanic"),
    4: ("black", "Black alone"),
    5: ("asian", "Asian alone"),
    6: ("hispanic", "Hispanic (any race)"),
}

EDUCATION_GROUPS = [
    "Less than 9th grade",
    "9th to 12th grade, no diploma",
    "High school graduate",
    "Some college or associate's degree",
    "Bachelor's degree",
    "Advanced degree",
]

INCOME_GROUPS = [
    "Under $10,000",
    "$10,000 to $14,999",
    "$15,000 to $19,999",
    "$20,000 to $29,999",
    "$30,000 to $39,999",
    "$40,000 to $49,999",
    "$50,000 to $74,999",
    "$75,000 to $99,999",
    "$100,000 to $149,999",
    "$150,000 and over",
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


def load_sheet(path):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # openpyxl warns on Census's header/footer XML
        wb = openpyxl.load_workbook(path, data_only=True)
    return wb.active


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
    ws = load_sheet(path)
    rows = list(ws.iter_rows(values_only=True))
    markers = [i for i, r in enumerate(rows) if r[0] and str(r[0]).strip() in ("BOTH SEXES", "MALE", "FEMALE")]
    if not markers:
        raise ValueError(f"{path.name}: no BOTH SEXES/MALE/FEMALE marker rows found")
    lo = markers[0]
    hi = markers[1] if len(markers) > 1 else len(rows)

    single_years = {}
    tail_80_84 = None
    tail_85_plus = None
    for r in rows[lo:hi]:
        label = str(r[1] or "").strip()
        m = SINGLE_YEAR_RE.match(label)
        try:
            # Col 4 = citizens reporting registered. Census counts "no
            # response to registration" as not registered, same convention
            # as col 10's voted.
            total_pop, cit_pop, voted, registered = float(r[2]), float(r[3]), float(r[10]), float(r[4])
        except (TypeError, ValueError):
            continue
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

def parse_pep(path, years):
    """Returns {age: {year: population_thousands}} for ages 0-100 ("100"
    means "100 and over"), both sexes (SEX == '0')."""
    import csv

    out = {}
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            if row["SEX"] != "0":
                continue
            age = int(row["AGE"])
            if age == 999:  # the all-ages total row
                continue
            out[age] = {y: float(row[f"POPESTIMATE{y}"]) / 1000 for y in years}

    missing = [a for a in range(18, 101) if a not in out]
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

    over65_show_up = over65_votes / over65_registered

    # Two more 65+ standards, one per hurdle, each measured against the bar
    # it sits on so both gaps are literal counts, not a counterfactual split:
    #   expectedRegistered     = cvap x 65+ registration rate. Gap down to
    #                            `registered` = people missing from the rolls.
    #   expectedFromRegistered = registered x 65+ show-up rate (votes per
    #                            registered 65+). Gap down to `votes` =
    #                            registered people who didn't vote.
    # The two gaps are in different units (people vs votes) and do NOT sum to
    # the single shortfall against `expected` - never add them together.
    # Only shortfalls are totalled; an age above a standard contributes 0,
    # same no-surplus rule as the gold wedge.
    reg_gap = 0.0
    show_up_gap = 0.0
    for r in rows:
        exp_reg = r["cvap"] * over65_reg_rate
        exp_from_reg = r["registered"] * over65_show_up
        reg_gap += max(0.0, exp_reg - r["registered"])
        show_up_gap += max(0.0, exp_from_reg - r["votes"])
        r["expected"] = round(r["cvap"] * over65_turnout, 1)
        r["missing"] = round(r["votes"] - r["expected"], 1)
        r["expectedRegistered"] = round(exp_reg, 1)
        r["expectedFromRegistered"] = round(exp_from_reg, 1)
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
        "over65ShowUp": round(100 * over65_show_up, 2),
        # Thousands. People short of the 65+ registration rate, and votes
        # short of the 65+ show-up rate among the registered. Different
        # units - not two halves of anything.
        "registrationGap": round(reg_gap, 1),
        "showUpGap": round(show_up_gap, 1),
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
# byDimension: education / income / race, CPS levels only (2024)
# ---------------------------------------------------------------------------

def parse_grouped_table(path, group_labels, block_marker="BOTH SEXES", total_label="Total"):
    """Generic parser for CPS Table 5 (education) and similar tables with a
    BOTH SEXES block, a "Total" row, then one row per group label. Column
    indices per spec v2 S5.4 #4: 2 = total pop, 3 = citizen pop, 10 = voted."""
    ws = load_sheet(path)
    rows = list(ws.iter_rows(values_only=True))
    markers = [i for i, r in enumerate(rows) if r[0] and str(r[0]).strip() == block_marker]
    if not markers:
        raise ValueError(f"{path.name}: no {block_marker} marker row found")
    lo = markers[0]
    hi = lo + 1
    while hi < len(rows) and not (rows[hi][0] and str(rows[hi][0]).strip() and str(rows[hi][0]).strip() != block_marker):
        hi += 1

    total = None
    out = {}
    for r in rows[lo:hi]:
        label_a = str(r[0] or "").strip()
        label_b = str(r[1] or "").strip()
        try:
            total_pop, cit_pop, voted = float(r[2]), float(r[3]), float(r[10])
        except (TypeError, ValueError):
            continue
        if label_a == block_marker and label_b == total_label:
            total = (total_pop, cit_pop, voted)
        elif label_b in group_labels:
            out[label_b] = (total_pop, cit_pop, voted)

    missing = [g for g in group_labels if g not in out]
    if missing:
        raise ValueError(f"{path.name}: missing groups {missing}")
    return total, out


def parse_income_table(path, group_labels):
    """CPS Table 7 has no BOTH SEXES marker - its top-level block is
    "TOTAL 18 YEARS AND OVER" directly (family income is reported once,
    not split by sex). Universe is family members only (spec v2 S8.4)."""
    return parse_grouped_table(path, group_labels, block_marker="TOTAL 18 YEARS AND OVER")


def dimension_from_groups(total, group_rows, group_labels, avg_turnout=None):
    """Builds a byDimension entry. If avg_turnout is None, uses this
    dimension's own total votes/cvap (education, race - full-population
    tables). Pass an explicit rate for restricted-universe tables (income)."""
    rows = []
    for label in group_labels:
        total_pop, cit_pop, voted = group_rows[label]
        rows.append({"group": label, "cvap": round(cit_pop, 1), "votes": round(voted, 1), "turnout": round(100 * voted / cit_pop, 1)})

    if avg_turnout is None:
        total_cvap, total_votes = total[1], total[2]
        avg_turnout = 100 * total_votes / total_cvap
    else:
        total_cvap = sum(r["cvap"] for r in rows)

    for r in rows:
        r["expected"] = round(r["cvap"] * avg_turnout / 100, 1)
        r["missing"] = round(r["votes"] - r["expected"], 1)

    return {"avgTurnout": round(avg_turnout, 2), "rows": rows}


# ---------------------------------------------------------------------------
# Colorado (Bonica, Grumbach, Hill & Jefferson 2021) - hardcoded citations
# ---------------------------------------------------------------------------
# Point estimates extracted by hand from the paper's appendix tables
# (A4 income, A7 education, A8 race) and Table 1 (overall), 2026-09-16.
# NOT reproduced from their figures - see spec v2 S4.3 on licensing.
# The age breakdown (Figure 1) has no tabulated point estimates by
# bracket, only the youngest-cohort headline figure quoted in the text -
# see spec v2 S7.4. Do not invent bracket numbers to fill that gap.

COLORADO = {
    "citation": (
        "Bonica, A., Grumbach, J.M., Hill, C., & Jefferson, H. (2021). "
        "All-mail voting in Colorado increases turnout and reduces turnout "
        "inequality. Electoral Studies, 72, 102363."
    ),
    "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9756790/",
    "license": (
        "© 2021 Elsevier Ltd. Figures are not reproduced here; point "
        "estimates were read from the paper's appendix tables (A4, A7, A8) "
        "and Table 1, then redrawn in this story's own chart system."
    ),
    "overall": {"effectPp": 8.06, "sePp": 0.57},
    "byDimension": {
        "education": [
            {"group": "Less than HS diploma", "effectPp": 8.53, "sePp": 0.75},
            {"group": "HS diploma", "effectPp": 8.01, "sePp": 0.53},
            {"group": "Some college", "effectPp": 8.03, "sePp": 0.62},
            {"group": "Bachelor's degree", "effectPp": 7.36, "sePp": 0.56},
            {"group": "Graduate degree", "effectPp": 5.88, "sePp": 0.50},
        ],
        "income": [
            {"group": "$0–30K", "effectPp": 8.39, "sePp": 0.55},
            {"group": "$30–60K", "effectPp": 8.30, "sePp": 0.60},
            {"group": "$60–100K", "effectPp": 8.16, "sePp": 0.60},
            {"group": "$100–150K", "effectPp": 7.84, "sePp": 0.64},
            {"group": "$150K+", "effectPp": 7.21, "sePp": 0.65},
        ],
        "race": [
            {"group": "White", "effectPp": 7.64, "sePp": 0.47},
            {"group": "Latino", "effectPp": 8.83, "sePp": 1.68},
            {"group": "Black", "effectPp": 9.27, "sePp": 0.82},
            {"group": "Asian", "effectPp": 10.04, "sePp": 0.91},
            {"group": "Other", "effectPp": 8.57, "sePp": 0.95},
        ],
    },
    "age": {
        "youngestCohortEffectPp": 10.1,
        "youngestCohortLabel": "born after 1980",
        "relativeIncreasePct": 26,
        "shapeNote": (
            "The effect trends smoothly down from the youngest cohorts "
            "(born after 1980) toward those born around 1945, then "
            "rebounds slightly among the oldest cohorts. The source "
            "reports this shape via a continuous by-birth-year figure, "
            "not a table of bracket point estimates - only the "
            "youngest-cohort headline figure is a precise quote."
        ),
    },
    "confounds": [
        "Colorado adopted same-day registration at the same time as all-mail voting in 2013. "
        "The authors exclude voters registered after 2010 to remove the direct SDR channel, "
        "but concede a residual indirect effect (e.g. social pressure around Election Day).",
        "n = 1 state, with unusually high baseline civic engagement - external validity to other states is untested.",
        "A uniform turnout boost mechanically compresses relative inequality between groups, since low-turnout "
        "groups start lower. The relevant claim is the differential across groups, not the uniform headline.",
    ],
}


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

    race_paths = {}
    for n, (key, _label) in RACE_VARIANTS.items():
        filename = f"vote02_2024_{n}.xlsx"
        dest_name = f"2024_{filename}"
        if not args.skip_download:
            race_paths[key] = download(dest_name, f"{CPS_BASE}/587/{filename}")
        else:
            race_paths[key] = RAW_DIR / dest_name

    if not args.skip_download:
        edu_path = download("2024_vote05_2024_1.xlsx", f"{CPS_BASE}/587/vote05_2024_1.xlsx")
        income_path = download("2024_vote07_2024.xlsx", f"{CPS_BASE}/587/vote07_2024.xlsx")
        pep_path = download("nc-est2024-agesex-res.csv", PEP_URL)
    else:
        edu_path = RAW_DIR / "2024_vote05_2024_1.xlsx"
        income_path = RAW_DIR / "2024_vote07_2024.xlsx"
        pep_path = RAW_DIR / "nc-est2024-agesex-res.csv"

    print("Parsing CPS Table 1 (national, single year of age) x 2 cycles...")
    table1 = {}
    for year, _, _ in CYCLES:
        table1[year] = parse_table1(table1_paths[year])
        print(f"  {year}: {len(table1[year][0])} single-year rows + 2 tail buckets OK")

    print("Parsing PEP (national population, single year of age)...")
    pep_by_age = parse_pep(pep_path, [y for y, _, _ in CYCLES])
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
        by_age[str(year)] = cycle
        print(
            f"  {year}: CVAP {cycle['totalCvap']:,.0f}k  votes {cycle['totalVotes']:,.0f}k  "
            f"avg turnout {cycle['avgTurnout']}%  crossover age {cycle['crossoverAge']}"
        )
        print(
            f"         65+ registered {cycle['over65Registration']}%  show-up {cycle['over65ShowUp']}%  "
            f"gaps: {cycle['registrationGap']:,.0f}k unregistered, {cycle['showUpGap']:,.0f}k registered non-voters"
        )

    print("Parsing CPS Table 5 (education, 2024)...")
    edu_total, edu_groups = parse_grouped_table(edu_path, EDUCATION_GROUPS)
    education = dimension_from_groups(edu_total, edu_groups, EDUCATION_GROUPS)
    print(f"  avg turnout {education['avgTurnout']}%  ({len(education['rows'])} groups)")

    print("Parsing CPS Table 7 (family income, 2024)...")
    income_total, income_groups = parse_income_table(income_path, INCOME_GROUPS)
    income_avg = 100 * sum(income_groups[g][2] for g in INCOME_GROUPS) / sum(income_groups[g][1] for g in INCOME_GROUPS)
    income = dimension_from_groups(income_total, income_groups, INCOME_GROUPS, avg_turnout=income_avg)
    income_coverage_pct = 100 * sum(income_groups[g][1] for g in INCOME_GROUPS) / edu_total[1]
    print(f"  restricted-universe avg turnout {income['avgTurnout']}%  coverage {income_coverage_pct:.1f}% of national CVAP")
    if not (55 <= income_coverage_pct <= 65):
        raise ValueError(f"income coverage {income_coverage_pct:.1f}% outside expected [55, 65]% - spec v2 S8.4 expects ~59.6%")

    print("Parsing CPS Table 2 (race/ethnicity variants, 2024)...")
    race_data = {}
    race_all_total = None
    for n, (key, label) in RACE_VARIANTS.items():
        ws = load_sheet(race_paths[key])
        rows = list(ws.iter_rows(values_only=True))
        total_row = next(r for r in rows if r[0] == "BOTH SEXES" and str(r[1]).strip() == "Total 18 years and over")
        total_pop, cit_pop, voted = float(total_row[2]), float(total_row[3]), float(total_row[10])
        if key == "all":
            race_all_total = (total_pop, cit_pop, voted)
        else:
            race_data[label] = (total_pop, cit_pop, voted)

    race_group_labels = [RACE_VARIANTS[n][1] for n in (3, 4, 5, 6)]
    race_cvap = sum(race_data[g][1] for g in race_group_labels)
    race_votes = sum(race_data[g][2] for g in race_group_labels)
    residual_cvap = race_all_total[1] - race_cvap
    residual_votes = race_all_total[2] - race_votes
    race_data["Other / multiple races"] = (float("nan"), residual_cvap, residual_votes)
    race_group_labels_with_residual = race_group_labels + ["Other / multiple races"]
    race = dimension_from_groups((None, race_all_total[1], race_all_total[2]), race_data, race_group_labels_with_residual)
    coverage_pct = 100 * race_cvap / race_all_total[1]
    print(f"  named groups cover {coverage_pct:.1f}% of CVAP, residual {residual_cvap:,.0f}k")
    if not (96 <= coverage_pct <= 99):
        raise ValueError(f"race named-group coverage {coverage_pct:.1f}% outside expected [96, 99]% - spec v2 S8's ~98% assumption")

    output = {
        "meta": {
            "sources": [
                "US Census Bureau, CPS November Voting and Registration Supplement, Tables 1/2/5/7 (2022, 2024)",
                "US Census Bureau, Population Estimates Program (PEP), national single-year-of-age estimates",
                COLORADO["citation"],
            ],
            "sourceUrls": [
                f"{CPS_BASE}/{p20_dir}/" for _, p20_dir, _ in CYCLES
            ] + [PEP_URL, COLORADO["url"]],
            "retrieved": "2026-09-16",
            "units": "thousands of people (cvap, votes, registered, expected, missing, expectedRegistered, expectedFromRegistered, registrationGap, showUpGap); percent (turnout, registeredRate, avgTurnout, over65Turnout, over65Registration, over65ShowUp); percentage points (effectPp, sePp)",
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
                "Ages 80+ (byAge) use real single-year PEP population but a CPS turnout/citizen-"
                "share rate pooled across the whole 80-84 or 85+ bucket, since CPS does not report "
                "single years of age above 79 - flagged per-row as ratesPooled.",
                "Registration (byAge registered/registeredRate) is self-reported in the same November "
                "interview as voting, and Census counts non-response as not registered. Non-response "
                "is highest among the young (~20% of 18-24s in 2024 vs ~12-13% of 65+), so youth "
                "registration is likely understated somewhat - same convention as turnout.",
                "income's avgTurnout/expected/missing use its own restricted-universe average "
                "(family members with reported income only, ~60% of national CVAP), not the "
                "national rate - see spec v2 S8.4.",
            ],
        },
        "byAge": by_age,
        "byDimension": {
            "education": {"label": "Educational attainment", **education},
            "income": {
                "label": "Family income",
                "note": (
                    "Covers family members with reported income only - about 60% of the citizen "
                    "voting-age population. Excluded people (living alone, unrelated individuals, "
                    "income not reported) skew younger, poorer and lower-turnout, so the true "
                    "gradient by income is probably steeper than shown here."
                ),
                **income,
            },
            "race": {"label": "Race / Hispanic origin", **race},
        },
        "colorado": COLORADO,
    }

    with open(OUT_PATH, "w") as f:
        json.dump(output, f, indent=2, allow_nan=False)

    print(f"\nWrote {OUT_PATH} ({OUT_PATH.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
