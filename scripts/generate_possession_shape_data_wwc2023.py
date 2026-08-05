#!/usr/bin/env python3
"""
Generate Possession Shape Data for D3/React Visualization — 2023 Women's
World Cup Final (Spain vs. England).

Same methodology as scripts/generate_possession_shape_data.py (2022 Men's WC
Final): for each starting-XI player, averages the location of every on-ball
action they're involved in, split by whether their own team had possession
at that moment ("offense") or not ("defense"). See that script's docstring
for why StatsBomb's public 360 freeze-frame data can't improve on this
(only the event's own actor is identified by name in a 360 frame).

Usage:
    python scripts/generate_possession_shape_data_wwc2023.py
"""

import json
import os
from collections import defaultdict
from pathlib import Path

project_root = Path(__file__).parent.parent
os.chdir(project_root)

MATCH_ID = 3906390
RAW_PATH = f"data/raw/statsbomb/events_{MATCH_ID}.json"
OUT_PATH = "public/data/statsbomb/wwc2023-final-possession-shape.json"

# On-ball event types that carry a meaningful player location. Excludes
# purely administrative types (Substitution, Half Start/End, Tactical
# Shift, Starting XI, Injury Stoppage, Bad Behaviour, Player On/Off,
# Offside, Shield, Goal Keeper) that either lack a location or don't
# reflect where a player was actually standing/acting.
ON_BALL_TYPES = {
    "Pass", "Ball Receipt*", "Carry", "Pressure", "Ball Recovery", "Duel",
    "Dribble", "Block", "Foul Committed", "Clearance", "Foul Won", "Shot",
    "Miscontrol", "Dispossessed", "Dribbled Past", "Interception", "50/50",
}


def load_events():
    with open(RAW_PATH) as f:
        return json.load(f)


def get_starting_lineups(events):
    lineups = {}
    formations = {}
    for e in events:
        if e["type"]["name"] != "Starting XI":
            continue
        team = e["team"]["name"]
        formations[team] = str(e["tactics"]["formation"])
        lineups[team] = [
            {
                "playerId": p["player"]["id"],
                "fullName": p["player"]["name"],
                "jerseyNumber": p["jersey_number"],
                "position": p["position"]["name"],
            }
            for p in e["tactics"]["lineup"]
        ]
    return lineups, formations


def main():
    events = load_events()
    lineups, formations = get_starting_lineups(events)
    starting_ids = {
        p["playerId"] for team_lineup in lineups.values() for p in team_lineup
    }

    # sums[playerId][state] -> [sum_x, sum_y, n]
    sums = defaultdict(lambda: {"offense": [0.0, 0.0, 0], "defense": [0.0, 0.0, 0]})

    for e in events:
        if e["type"]["name"] not in ON_BALL_TYPES:
            continue
        if "location" not in e or "player" not in e:
            continue
        player_id = e["player"]["id"]
        if player_id not in starting_ids:
            continue
        state = "offense" if e["team"]["name"] == e["possession_team"]["name"] else "defense"
        x, y = e["location"]
        bucket = sums[player_id][state]
        bucket[0] += x
        bucket[1] += y
        bucket[2] += 1

    players = []
    for team, team_lineup in lineups.items():
        for p in team_lineup:
            entry = {
                "team": team,
                "fullName": p["fullName"],
                "playerId": p["playerId"],
                "jerseyNumber": p["jerseyNumber"],
                "position": p["position"],
            }
            for state in ("offense", "defense"):
                sx, sy, n = sums[p["playerId"]][state]
                entry[state] = (
                    {"x": round(sx / n, 2), "y": round(sy / n, 2), "n": n}
                    if n > 0
                    else None
                )
            players.append(entry)

    out = {
        "matchId": MATCH_ID,
        "teams": sorted(lineups.keys()),
        "formations": formations,
        "players": players,
    }

    Path(OUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, separators=(",", ":"))

    print(f"✓ Wrote {len(players)} players to {OUT_PATH}")
    for p in players:
        off_n = p["offense"]["n"] if p["offense"] else 0
        def_n = p["defense"]["n"] if p["defense"] else 0
        print(f"  {p['team']:16s} {p['fullName']:35s} off n={off_n:4d}  def n={def_n:4d}")


if __name__ == "__main__":
    main()
