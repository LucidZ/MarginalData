"""Tagging audit: how much of Boulder's bike network does BikeNetKit's protected-infra
(PBI) filter see, versus painted lanes and other bike facilities it ignores?

Writes ./results/boulder-osm-bike-audit.gpkg (one layer, `category` column) and prints km
per category.

Usage:
    python -I audit_osm_tagging.py <graphml> <fix_gpkg>

<graphml> = the routing graph cache (route_test.py builds it from the local Geofabrik extract, so
the audit and the router read the same OSM snapshot), clipped to <fix_gpkg>'s City boundary.
"""

import os
import sys

import geopandas as gpd

import osmnx as ox
import pandas as pd


TAGS = ["highway", "cycleway", "cycleway:right", "cycleway:left", "cycleway:both",
        "oneway", "oneway:bicycle", "bicycle", "access", "cyclestreet", "bicycle_road", "segregated", "surface", "name"]
for t in TAGS:
    if t not in ox.settings.useful_tags_way:
        ox.settings.useful_tags_way.append(t)

CYCLEWAY_COLS = ["cycleway", "cycleway:right", "cycleway:left", "cycleway:both"]


def has(row, cols, pattern):
    return any(isinstance(row.get(c), str) and pattern in row.get(c) for c in cols)


# On-street bike facility levels: 2 = track (separated), 1 = painted lane, 0 = none
# (shared_lane / sharrow, shoulder, share_busway, no, ...).
LEVEL = {"track": 2, "opposite_track": 2, "lane": 1, "opposite_lane": 1}


def tag_vals(row, key):
    v = row.get(key)
    return [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, str)]  # drops None/NaN


def side_level(row, side, contraflow=False):
    """Facility on one side of the way ("right" = travel along the way's drawing direction on a
    two-way street). A side tag overrides cycleway:both / cycleway. None means the side's bike
    facility is mapped as a separate way. List values come from simplified edges that merged
    several ways; take the least protected."""
    vals = tag_vals(row, f"cycleway:{side}") or tag_vals(row, "cycleway:both") or tag_vals(row, "cycleway")
    vals = [v for v in vals if v != "separate"] if vals else ["no"]
    if not vals:
        return None
    if not contraflow:  # opposite_* are contraflow lanes on a one-way street
        vals = [v for v in vals if not v.startswith("opposite")] or ["no"]
    return min(LEVEL.get(v, 0) for v in vals)


def is_true(v):
    v = v[0] if isinstance(v, list) else v
    return v in (True, "True", "yes", "true", "1")


def direction_level(row, direction):
    """Facility level for one direction of travel: "forward"/"backward" on a two-way street,
    "oneway" (with traffic) or "contraflow" (against it, where oneway:bicycle=no)."""
    if direction == "forward":
        lv = [side_level(row, "right")]
    elif direction == "backward":
        lv = [side_level(row, "left")]
    elif direction == "contraflow":
        lv = [side_level(row, "left", contraflow=True)]
    else:  # oneway: a left-side lane runs with traffic unless it is the contraflow lane
        bikes_both = (row.get("oneway:bicycle") or "") == "no"
        lv = [side_level(row, "right")] + ([] if bikes_both else [side_level(row, "left")])
    return max((x for x in lv if x is not None), default=0)


def undirected_level(row):
    """Lesser of the directions a bike may ride: a climbing lane with a sharrow downhill is 0.
    Sides mapped as separate ways don't count against the street."""
    if is_true(row.get("oneway")):
        dirs = ["oneway"] + (["contraflow"] if row.get("oneway:bicycle") == "no" else [])
        return min(direction_level(row, d) for d in dirs)
    lv = [x for x in (side_level(row, "right"), side_level(row, "left")) if x is not None]
    return min(lv, default=0)


def categorize(row):
    hw = row.get("highway")
    bike = row.get("bicycle")
    if row.get("access") == "private":
        return None
    # Mirrors bikenetlib.osm.PBI_CUSTOM_FILTER
    if hw in ("cycleway", "living_street") or row.get("cyclestreet") == "yes" or row.get("bicycle_road") == "yes":
        return "protected (counted)"
    if hw in ("path", "pedestrian", "footway") and bike in ("designated", "yes", "permissive"):
        return "protected (counted)"
    if has(row, CYCLEWAY_COLS, "track"):
        return "protected (counted)"
    # Not counted by BikeNetKit. Painted only if every direction has a lane (lesser protection).
    if undirected_level(row) >= 1:
        return "painted lane (ignored)"
    if has(row, CYCLEWAY_COLS, "shared_lane"):
        return "sharrow (ignored)"
    if hw in ("path", "footway", "track", "bridleway") and bike not in ("no", "dismount"):
        return "path, bike access untagged (ignored)"
    return None


def main(graphml, fix_gpkg):
    g = ox.convert.to_undirected(ox.load_graphml(graphml))
    edges = ox.graph_to_gdfs(g, nodes=False)
    city = gpd.read_file(fix_gpkg, layer="City boundary").to_crs(edges.crs).union_all()
    edges = edges[edges.intersects(city)].copy()
    edges["geometry"] = edges.intersection(city)
    edges = edges[edges.geom_type.isin(["LineString", "MultiLineString"])]
    for c in TAGS:
        if c not in edges:
            edges[c] = None
        edges[c] = edges[c].apply(lambda v: v[0] if isinstance(v, list) else v)
    edges["category"] = edges.apply(categorize, axis=1)
    bike = edges[edges["category"].notna()].copy()
    bike["km"] = bike.to_crs(26913).length / 1000

    summary = bike.groupby("category")["km"].sum().sort_values(ascending=False).round(1)
    print(summary.to_string())

    print("\nTop named streets with painted lanes (km):")
    lanes = bike[bike["category"] == "painted lane (ignored)"]
    print(lanes.groupby("name")["km"].sum().sort_values(ascending=False).head(15).round(2).to_string())

    os.makedirs("results", exist_ok=True)
    keep = ["category", "highway", "bicycle", "name", "km", "geometry"] + CYCLEWAY_COLS
    bike[keep].reset_index(drop=True).to_file("results/boulder-osm-bike-audit.gpkg", layer="bike")
    pd.DataFrame(summary).to_csv("results/boulder-osm-bike-audit-summary.csv")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(*sys.argv[1:3])
