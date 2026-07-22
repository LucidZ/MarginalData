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
OUT_PATH = "public/data/statsbomb/wc2022-final-passing.json"


def load_events():
    with open(RAW_PATH) as f:
        return json.load(f)


def pass_outcome(pass_field):
    outcome = pass_field.get("outcome")
    return outcome["name"] if outcome else "Complete"


def build_pass_records(events):
    records = []
    for e in events:
        if e["type"]["name"] != "Pass":
            continue
        p = e["pass"]
        start = e["location"]
        end = p["end_location"]
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
            "v1": {"dx": a["dx"], "dy": a["dy"]},
            "v2": {"dx": b["dx"], "dy": b["dy"]},
            "outcome": b["outcome"],
        })
    return triangles


def main():
    events = load_events()
    pass_records = build_pass_records(events)
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
