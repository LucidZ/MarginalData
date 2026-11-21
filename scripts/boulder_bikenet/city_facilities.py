"""Bike classes from the City of Boulder's own inventory (fetch_city_inventory.py output), on the
OSM street graph. Where a city facility runs along an edge, the city's type wins; where the city
has nothing (outside its data, or no match), the edge keeps its OSM class.

- Street edges match city on-street lines riding the same way: the city draws a lane per side of
  the street, in its direction of travel (ONEWAY FT = as drawn, TF = reversed, B/blank = both).
- Path edges match city off-street lines (no direction).
- City bicycles = No on a path or trail makes the edge "dismount" (walk the bike). The city never
  removes an edge: OSM decides what exists and connects, the city only relabels.
- City bike guide: riding on sidewalks is legal only in residential and park zones, and never in
  the Downtown / Hill dismount zones. So a bikes-allowed sidewalk or plaza path whose nearest
  zoning (within ZONE_M, by length) is commercial, industrial or mixed use, and any walking path
  in a dismount zone, counts as no bikes (dismount). Sidewalks with no zoning nearby keep the city's flag.
  Multi-use paths are exempt (the guide allows designated multi-use paths everywhere).

Matching is as in compare_city_inventory.py (10 m pieces, nearest aligned within 15 m / 30 deg);
an edge takes the city class covering the most of it, if that is at least half its length. Only
city LIFECYCLE = Active features count.
"""

import os

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString

from compare_city_inventory import CRS, MATCH_M, MAX_ANGLE, pieces

STREET = "street"  # no bike facility: becomes quiet / busy street from the OSM road class
NO_BIKES = "dismount"  # a route class (route_test.CLASSES): no riding, walk the bike
ON_STREET = {"Protected Bike Lane": "protected", "Separated Bike Lane": "protected",
             "On-Street Bike Lane": "painted", "Contra Flow Bike Lane": "painted",
             "Bikeable Shoulder": "painted", "Designated Bike Route": STREET,
             "Residential Street": STREET, "Connector": STREET}
BIKE_PATHS = {"Multi-Use Path", "Bike Park Path", "Connector Path"}
WALK_PATHS = {"Pedestrian Path", "Sidewalk", "Plaza Path", "Social Trail"}
PATH_HW = {"path", "footway", "cycleway", "pedestrian", "track", "bridleway", "steps"}
MIN_SHARE = 0.5
SIDEWALKS = {"Sidewalk", "Plaza Path"}
NO_SIDEWALK_ZONES = ("B", "DT", "I", "MU")  # zoning code prefixes: business, downtown, industrial, mixed use
ZONE_M = 40


def off_street_class(facility, bicycles):
    if bicycles == "No":
        return NO_BIKES
    if facility in BIKE_PATHS:
        return "protected"
    if facility in WALK_PATHS:
        return "shared path/sidewalk" if bicycles == "Yes" else "path/sidewalk (untagged)"
    return None


def load(city_dir):
    """City lines in CRS with `cls` and `both` (True = no direction of travel)."""
    on = gpd.read_file(os.path.join(city_dir, "city_onstreet.geojson"))
    on = on[(on["LIFECYCLE"] == "Active") & on["FACILITYTYPE"].isin(ON_STREET)].to_crs(CRS)
    on["cls"] = on["FACILITYTYPE"].map(ON_STREET)
    on["both"] = ~on["ONEWAY"].isin(["FT", "TF"])
    tf = on["ONEWAY"] == "TF"
    on.loc[tf, "geometry"] = on.loc[tf, "geometry"].reverse()

    off = gpd.read_file(os.path.join(city_dir, "city_offstreet.geojson"))
    off = off[off["LIFECYCLE"] == "Active"].to_crs(CRS).reset_index(drop=True)
    off["cls"] = [off_street_class(f, b) for f, b in zip(off["FACILITYTYPE"], off["BICYCLES"])]
    off.loc[no_riding(off, city_dir), "cls"] = NO_BIKES
    trails = gpd.read_file(os.path.join(city_dir, "city_osmp_trails.geojson")).to_crs(CRS)
    trails["cls"] = np.where(trails["BICYCLES"] == "Yes", "protected", NO_BIKES)
    off = pd.concat([off[["cls", "geometry"]], trails[["cls", "geometry"]]], ignore_index=True)
    off = off[off["cls"].notna()].assign(both=True)
    return on[["cls", "both", "geometry"]], gpd.GeoDataFrame(off, crs=CRS)


def no_riding(off, city_dir):
    """Mask of bikes-allowed walking paths where the bike guide says riding is illegal."""
    walk = off["FACILITYTYPE"].isin(WALK_PATHS) & (off["BICYCLES"] == "Yes")
    dz = gpd.read_file(os.path.join(city_dir, "city_dismount.geojson")).to_crs(CRS).union_all()
    in_dz = walk & (off.intersection(dz).length > off.length / 2)
    side = off[walk & off["FACILITYTYPE"].isin(SIDEWALKS)]
    zones = gpd.read_file(os.path.join(city_dir, "city_zoning.geojson")).to_crs(CRS)
    zones["bad"] = zones["ZONING"].str.startswith(NO_SIDEWALK_ZONES)
    p = pieces(side.assign(fid=side.index), "fid")
    pts = gpd.GeoDataFrame(p[["cls", "m"]], geometry=gpd.points_from_xy(p.x, p.y), crs=CRS)
    near = gpd.sjoin_nearest(pts, zones[["bad", "geometry"]], max_distance=ZONE_M)
    near = near[~near.index.duplicated()]
    bad_m = near[near["bad"]].groupby("cls")["m"].sum()
    zoned_m = near.groupby("cls")["m"].sum()
    commercial = (bad_m.reindex(zoned_m.index, fill_value=0) > zoned_m / 2)
    in_comm = off.index.isin(commercial[commercial].index)
    print(f"sidewalks -> no bikes: commercial zoning {off.length[in_comm].sum() / 1000:.0f} km, "
          f"dismount zones {off.length[in_dz & ~in_comm].sum() / 1000:.1f} km")
    return in_dz | in_comm


def match(a, b):
    """For each piece of a, the class of the nearest piece of b within MATCH_M that runs the same
    way (or either way, where b's line has no direction)."""
    pts_a = gpd.GeoDataFrame(a[["heading"]], geometry=gpd.points_from_xy(a.x, a.y), crs=CRS)
    pts_b = gpd.GeoDataFrame(b[["heading", "cls", "both"]], geometry=gpd.points_from_xy(b.x, b.y), crs=CRS)
    j = gpd.sjoin(pts_a.assign(geometry=pts_a.buffer(MATCH_M)), pts_b, predicate="contains")
    d = (j["heading_left"] - j["heading_right"]).abs() % 360
    d = np.minimum(d, 360 - d)
    d = np.where(j["both"], np.minimum(d, 180 - d), d)
    j = j[d <= MAX_ANGLE].copy()
    j["dist"] = np.hypot(a.x.to_numpy()[j.index] - b.x.to_numpy()[j["index_right"]],
                         a.y.to_numpy()[j.index] - b.y.to_numpy()[j["index_right"]])
    best = j.sort_values("dist").groupby(level=0).first()
    return best["cls"].reindex(a.index)


def first(v):
    return v[0] if isinstance(v, list) else v


def edge_line(g, u, v, d):
    return d.get("geometry") or LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])


def city_classes(g, city_dir):
    """{(u, v, key): city class} for every directed edge the city covers."""
    on, off = load(city_dir)
    fams = {"street": [], "path": []}
    for u, v, k, d in g.edges(keys=True, data=True):
        fams["path" if first(d.get("highway")) in PATH_HW else "street"].append((u, v, k, d))
    out = {}
    for fam, city in (("street", on), ("path", off)):
        edges = fams[fam]
        lines = gpd.GeoDataFrame({"cls": range(len(edges))}, crs=4326,
                                 geometry=[edge_line(g, u, v, d) for u, v, _, d in edges]).to_crs(CRS)
        ep = pieces(lines, "cls")
        ep["city"] = match(ep, pieces(city, "cls", ["both"])).to_numpy()
        total = ep.groupby("cls")["m"].sum()
        share = ep.dropna(subset=["city"]).groupby(["cls", "city"])["m"].sum() / total
        share = share.reset_index().sort_values("m").groupby("cls").last()
        share = share[share["m"] >= MIN_SHARE]
        for i, c in share["city"].items():
            u, v, k, _ = edges[i]
            out[(u, v, k)] = c
    return out


def apply(g, city_dir, arterial):
    """Set edge classes from the city in place (marks them src='city'); returns km per class
    change. arterial(d) says whether a no-facility street is busy."""
    km = {}
    for (u, v, k), c in city_classes(g, city_dir).items():
        d = g.edges[u, v, k]
        if c == STREET:
            c = "busy street" if arterial(d) else "quiet street"
        if c != d["cls"]:
            change = f"{d['cls']} -> {c}"
            km[change] = km.get(change, 0) + d["length"] / 1000
        d["cls"], d["src"] = c, "city"
    return km
