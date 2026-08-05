"""
Fetch World Bank data on institutional quality (Rule of Law, from the
Worldwide Governance Indicators) and GDP per capita (PPP), merge them into a
single country-year panel, and print summary stats.

Context: exploring Daron Acemoglu's "institutions as a fundamental cause of
development" thesis (see sketches/property-rights-gdp.html for the chart).

Data sources (World Bank API v2, JSON):
- GDP per capita, PPP (current international $): NY.GDP.PCAP.PP.CD
- Rule of Law - Governance estimate (WGI, source=3): GOV_WGI_RL.EST
- Country/region metadata, to drop aggregates (regions, income groups)

Usage:
    python scripts/generate_property_rights_gdp_data.py

Output:
    data/raw/property_rights_gdp_2023.json
    (gitignored local cache -- rerun this script to regenerate; the merged
    values used in the published chart are embedded directly in the HTML)
"""

import json
import math
import urllib.request
from pathlib import Path

YEAR = 2023
OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "raw" / "property_rights_gdp_2023.json"

WB_BASE = "https://api.worldbank.org/v2"


def fetch_json(url, encoding="utf-8"):
    with urllib.request.urlopen(url) as resp:
        raw = resp.read()
    return json.loads(raw.decode(encoding))


def fetch_countries():
    url = f"{WB_BASE}/country?format=json&per_page=400"
    data = fetch_json(url)[1]
    return {c["id"]: c for c in data if c["region"]["value"] != "Aggregates"}


def fetch_indicator(code, year, source=None, encoding="utf-8"):
    src = f"&source={source}" if source else ""
    url = f"{WB_BASE}/country/all/indicator/{code}?format=json&per_page=20000&date={year}{src}"
    data = fetch_json(url, encoding=encoding)[1]
    return {
        r["countryiso3code"]: r["value"]
        for r in data
        if r.get("countryiso3code") and r["value"] is not None
    }


def main():
    countries = fetch_countries()
    gdp = fetch_indicator("NY.GDP.PCAP.PP.CD", YEAR)
    # The WGI dataset endpoint returns a UTF-8-BOM payload; source=3 selects it.
    rule_of_law = fetch_indicator("GOV_WGI_RL.EST", YEAR, source=3, encoding="utf-8-sig")

    merged = []
    for code, c in countries.items():
        if code in gdp and code in rule_of_law:
            merged.append(
                {
                    "code": code,
                    "name": c["name"],
                    "region": c["region"]["value"].strip(),
                    "income": c["incomeLevel"]["value"],
                    "gdp_pc_ppp": gdp[code],
                    "log_gdp": math.log(gdp[code]),
                    "rule_of_law": rule_of_law[code],
                }
            )

    merged.sort(key=lambda d: -d["gdp_pc_ppp"])

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(merged, indent=2))

    n = len(merged)
    xs = [d["rule_of_law"] for d in merged]
    ys = [d["log_gdp"] for d in merged]
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / n
    sx = (sum((x - mx) ** 2 for x in xs) / n) ** 0.5
    sy = (sum((y - my) ** 2 for y in ys) / n) ** 0.5
    r = cov / (sx * sy)

    print(f"Matched {n} countries for {YEAR}")
    print(f"Correlation (rule of law vs. log GDP per capita): r={r:.3f}, r^2={r**2:.3f}")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
