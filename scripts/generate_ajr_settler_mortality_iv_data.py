"""
Reproduce the core result of Acemoglu, Johnson & Robinson, "The Colonial
Origins of Comparative Development" (AER, 2001): institutions instrumented
by colonial settler mortality, on the 64-country base sample from their
Table 4 replication file.

See sketches/ajr-settler-mortality-iv.html for the resulting three-panel
chart (first stage / reduced form / OLS vs. 2SLS).

Requires pandas (and its Stata-reader deps). If not installed:
    python -m venv .venv && .venv/bin/pip install pandas

Data source: AJR's own Table 4 replication file (maketable4.dta), mirrored
at a public GitHub raw URL (originally distributed via Acemoglu's data
archive / the AEA data archive).

Variables used:
    shortnam  - ISO-alpha-3-ish country code (some historical, e.g. ZAR)
    logem4    - log settler mortality
    avexpr    - average protection against expropriation risk, 1985-95 (0-10)
    logpgp95  - log GDP per capita, PPP, 1995
    baseco    - 1 if the country is in AJR's 64-country base sample

Usage:
    python scripts/generate_ajr_settler_mortality_iv_data.py

Output:
    data/raw/ajr_iv_2sls.json
    (gitignored local cache -- rerun this script to regenerate; the merged
    values used in the published chart are embedded directly in the HTML)
"""

import json
import urllib.request
from pathlib import Path

import pandas as pd

DTA_URL = (
    "https://raw.githubusercontent.com/cmg777/starter-academic-v501/"
    "master/content/post/stata_iv/maketable4.dta"
)
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
DTA_PATH = OUT_DIR / "maketable4.dta"
OUT_PATH = OUT_DIR / "ajr_iv_2sls.json"

# A handful of AJR's country codes are historical/deprecated relative to the
# current World Bank list (e.g. ZAR = Zaire, now Congo, Dem. Rep.).
NAME_OVERRIDES = {
    "ZAR": "Congo, Dem. Rep. (Zaire)",
    "VNM": "Vietnam",
}


def ols(x, y):
    n = len(x)
    mx, my = x.mean(), y.mean()
    b = ((x - mx) * (y - my)).sum() / ((x - mx) ** 2).sum()
    a = my - b * mx
    resid = y - (a + b * x)
    r2 = 1 - (resid**2).sum() / ((y - my) ** 2).sum()
    return a, b, r2


def fetch_country_names():
    url = "https://api.worldbank.org/v2/country?format=json&per_page=400"
    with urllib.request.urlopen(url) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    names = {c["id"]: c["name"] for c in data[1]}
    names.update(NAME_OVERRIDES)
    return names


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not DTA_PATH.exists():
        urllib.request.urlretrieve(DTA_URL, DTA_PATH)

    df = pd.read_stata(DTA_PATH)
    base = df[df["baseco"] == 1].copy().reset_index(drop=True)
    n = len(base)

    x = base["logem4"].values  # instrument: log settler mortality
    e = base["avexpr"].values  # endogenous: institutions (expropriation protection)
    y = base["logpgp95"].values  # outcome: log GDP per capita, PPP, 1995

    a1, b1, r2_1 = ols(x, e)  # first stage
    a2, b2, r2_2 = ols(x, y)  # reduced form
    e_hat = a1 + b1 * x
    a3, b3, r2_3 = ols(e_hat, y)  # 2SLS structural (OLS on fitted values)
    a4, b4, r2_4 = ols(e, y)  # naive OLS, uninstrumented

    base["avexpr_hat"] = e_hat

    names = fetch_country_names()
    rows = []
    for _, r in base.iterrows():
        code = r["shortnam"]
        rows.append(
            {
                "code": code,
                "name": names.get(code, code),
                "logem4": round(float(r["logem4"]), 4),
                "avexpr": round(float(r["avexpr"]), 4),
                "avexpr_hat": round(float(r["avexpr_hat"]), 4),
                "logpgp95": round(float(r["logpgp95"]), 4),
            }
        )

    OUT_PATH.write_text(json.dumps(rows, indent=2))

    print(f"Base sample: {n} countries")
    print(f"First stage:      avexpr    = {a1:.3f} + {b1:.3f} * logem4      (R2={r2_1:.3f})")
    print(f"Reduced form:     logpgp95  = {a2:.3f} + {b2:.3f} * logem4      (R2={r2_2:.3f})")
    print(f"2SLS structural:  logpgp95  = {a3:.3f} + {b3:.3f} * avexpr_hat  (R2={r2_3:.3f})")
    print(f"Naive OLS:        logpgp95  = {a4:.3f} + {b4:.3f} * avexpr      (R2={r2_4:.3f})")
    print(f"Wald check (b2/b1 == 2SLS b3): {b2/b1:.3f} vs {b3:.3f}")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
