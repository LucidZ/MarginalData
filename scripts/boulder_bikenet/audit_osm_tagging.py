"""Tagging audit: how much of Boulder's bike network does BikeNetKit's protected-infra
(PBI) filter see, versus painted lanes and other bike facilities it ignores?

Writes ./results/boulder-osm-bike-audit.gpkg (one layer, `category` column) and prints km
per category.
"""

import os

import osmnx as ox
import pandas as pd

CITY = "Boulder, Colorado, USA"

TAGS = ["highway", "cycleway", "cycleway:right", "cycleway:left", "cycleway:both",
        "bicycle", "access", "cyclestreet", "bicycle_road", "segregated", "surface", "name"]
for t in TAGS:
    if t not in ox.settings.useful_tags_way:
        ox.settings.useful_tags_way.append(t)

CYCLEWAY_COLS = ["cycleway", "cycleway:right", "cycleway:left", "cycleway:both"]


def has(row, cols, pattern):
    return any(isinstance(row.get(c), str) and pattern in row.get(c) for c in cols)


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
    # Not counted by BikeNetKit
    if has(row, CYCLEWAY_COLS, "lane"):
        return "painted lane (ignored)"
    if has(row, CYCLEWAY_COLS, "shared_lane"):
        return "sharrow (ignored)"
    if hw in ("path", "footway", "track", "bridleway") and bike not in ("no", "dismount"):
        return "path, bike access untagged (ignored)"
    return None


def main():
    g = ox.graph_from_place(CITY, network_type="all", simplify=True, retain_all=True)
    g = ox.convert.to_undirected(g)
    edges = ox.graph_to_gdfs(g, nodes=False)
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
    main()
