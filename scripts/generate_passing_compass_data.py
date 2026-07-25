#!/usr/bin/env python3
"""
Generate Passing Compass Data for D3/React Visualization

Transforms raw StatsBomb event data for a single match into pass vectors
("compass") and 2-pass pivot chains ("triangles"), normalized to a shared
origin so every pass can be compared by direction and length instead of
by pitch position.

Note: StatsBomb already records each team's own location data with that
team's attacking direction as +x (confirmed empirically: both teams' shots
cluster near high x in every period of this match), so no half-time flip
or goalkeeper-based direction inference is needed.

Each pass is also tagged with an Expected Threat (xT) delta: StatsBomb's
open data has no possession-value field (xG lives on Shot events only), so
xT is sourced from Karun Singh's public 12x8 grid
(https://karun.in/blog/expected-threat.html, values fetched from
karun.in/blog/data/open_xt_12x8_v1.json and cached at
data/reference/xt_grid_12x8.json). The grid was fit on 2017-18 Premier
League data, not this tournament, so treat xT as a rough positional-value
proxy, not a WC2022-calibrated number.

Usage:
    python scripts/generate_passing_compass_data.py
"""

import json
import os
from pathlib import Path

project_root = Path(__file__).parent.parent
os.chdir(project_root)

MATCH_ID = 3869685
RAW_PATH = f"data/raw/statsbomb/events_{MATCH_ID}.json"
XT_GRID_PATH = "data/reference/xt_grid_12x8.json"
OUT_PATH = "public/data/statsbomb/wc2022-final-passing.json"

PITCH_LENGTH = 120.0
PITCH_WIDTH = 80.0


def load_events():
    with open(RAW_PATH) as f:
        return json.load(f)


def load_xt_grid():
    with open(XT_GRID_PATH) as f:
        return json.load(f)


def make_xt_lookup(grid):
    """Grid is rows (width, 0=y-low..7=y-high) x cols (length, 0=x-low..11=x-high),
    each cell covering PITCH_LENGTH/12 by PITCH_WIDTH/8 of the pitch."""
    n_rows = len(grid)
    n_cols = len(grid[0])

    def xt_value(x, y):
        col = min(int(x / PITCH_LENGTH * n_cols), n_cols - 1)
        row = min(int(y / PITCH_WIDTH * n_rows), n_rows - 1)
        col = max(col, 0)
        row = max(row, 0)
        return grid[row][col]

    return xt_value


def pass_outcome(pass_field):
    outcome = pass_field.get("outcome")
    return outcome["name"] if outcome else "Complete"


def build_pass_records(events, xt_value):
    records = []
    for e in events:
        if e["type"]["name"] != "Pass":
            continue
        p = e["pass"]
        start = e["location"]
        end = p["end_location"]
        xt_start = xt_value(start[0], start[1])
        xt_end = xt_value(end[0], end[1])
        records.append({
            "index": e["index"],
            "period": e["period"],
            "minute": e["minute"],
            "team": e["team"]["name"],
            "player": e["player"]["name"],
            "playerId": e["player"]["id"],
            "recipient": p["recipient"]["name"] if "recipient" in p else None,
            "recipientId": p["recipient"]["id"] if "recipient" in p else None,
            "possession": e["possession"],
            "x": round(start[0], 2),
            "y": round(start[1], 2),
            "dx": round(end[0] - start[0], 2),
            "dy": round(end[1] - start[1], 2),
            "outcome": pass_outcome(p),
            "xtDelta": round(xt_end - xt_start, 5),
        })
    return records


def build_triangles(pass_records):
    """2-pass pivot chains: pass1 completed, pass1's recipient == pass2's passer,
    within the same possession (so the pivot didn't happen across a turnover)."""
    triangles = []
    for a, b in zip(pass_records, pass_records[1:]):
        if a["outcome"] != "Complete":
            continue
        if a["team"] != b["team"]:
            continue
        if a["possession"] != b["possession"]:
            continue
        if a["recipientId"] != b["playerId"]:
            continue
        triangles.append({
            "period": a["period"],
            "minute": a["minute"],
            "team": a["team"],
            "passer": a["player"],
            "pivot": b["player"],
            "pivotId": b["playerId"],
            "recipient": b["recipient"],
            "pivotX": b["x"],
            "pivotY": b["y"],
            # Where pass 1 was actually received — b["x"]/b["y"] (pivotX/Y)
            # is where pass 2 was *played from*, which often isn't the same
            # spot if the pivot player dribbled between receiving and
            # releasing. Front end draws that gap as a carry.
            "receiveX": round(a["x"] + a["dx"], 2),
            "receiveY": round(a["y"] + a["dy"], 2),
            "v1": {"dx": a["dx"], "dy": a["dy"]},
            "v2": {"dx": b["dx"], "dy": b["dy"]},
            "outcome": b["outcome"],
            "xtDelta": round(a["xtDelta"] + b["xtDelta"], 5),
        })
    return triangles


def main():
    events = load_events()
    xt_value = make_xt_lookup(load_xt_grid())
    pass_records = build_pass_records(events, xt_value)
    triangles = build_triangles(pass_records)

    teams = sorted(set(r["team"] for r in pass_records))

    out = {
        "matchId": MATCH_ID,
        "teams": teams,
        "passes": pass_records,
        "triangles": triangles,
    }

    Path(OUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"✓ Wrote {len(pass_records)} passes and {len(triangles)} triangles to {OUT_PATH}")


if __name__ == "__main__":
    main()
