"""How different is the City of Boulder's own bike facility inventory from our OSM classification?

Both are cut into ~10 m pieces. Each piece is matched to the nearest piece of the other dataset
within 15 m whose bearing is within 30 degrees (so a multi-use path doesn't match the road it
runs beside). Prints km cross-tabs both ways and writes the pieces with their match to
<out_dir>/city-vs-osm.gpkg (layers `city`, `osm`) for mapping.

Usage:
    python -I compare_city_inventory.py <city_dir> <audit_gpkg> <fix_gpkg> <out_dir>

<city_dir> = fetch_city_inventory.py output; <audit_gpkg> = audit_osm_tagging.py output;
<fix_gpkg> supplies the same City boundary the audit was clipped to.
"""

import os
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely

CRS = 26913
PIECE_M = 10
MATCH_M = 15
MAX_ANGLE = 30

# City inventory class -> comparable bucket. Crossings, sidewalks and residential streets aren't
# facilities in either scheme; they stay out.
CITY_CLASS = {
    ("onstreet", "Protected Bike Lane"): "protected bike lane",
    ("onstreet", "Separated Bike Lane"): "protected bike lane",
    ("onstreet", "On-Street Bike Lane"): "painted lane",
    ("onstreet", "Contra Flow Bike Lane"): "painted lane",
    ("onstreet", "Bikeable Shoulder"): "bikeable shoulder",
    ("onstreet", "Designated Bike Route"): "designated route / sharrow",
    ("offstreet", "Multi-Use Path"): "multi-use path",
    ("offstreet", "Bike Park Path"): "multi-use path",
    ("offstreet", "Connector Path"): "multi-use path",
}
OSM_SHORT = {
    "protected (counted)": "protected",
    "painted lane (ignored)": "painted lane",
    "sharrow (ignored)": "sharrow",
    "path, bike access untagged (ignored)": "path, bike untagged",
}


def load_city(city_dir, boundary):
    parts = []
    for layer in ("onstreet", "offstreet"):
        g = gpd.read_file(os.path.join(city_dir, f"city_{layer}.geojson"))
        g = g[g["LIFECYCLE"] == "Active"]
        g["cls"] = [CITY_CLASS.get((layer, t)) for t in g["FACILITYTYPE"]]
        parts.append(g[g["cls"].notna()][["cls", "FACILITYTYPE", "geometry"]])
    trails = gpd.read_file(os.path.join(city_dir, "city_osmp_trails.geojson"))
    trails = trails[trails["BICYCLES"] == "Yes"].assign(cls="OSMP bike trail", FACILITYTYPE="OSMP trail")
    parts.append(trails[["cls", "FACILITYTYPE", "geometry"]])
    g = pd.concat(parts, ignore_index=True).to_crs(CRS)
    return clip(g, boundary)


def clip(g, boundary):
    g = g[g.intersects(boundary)].copy()
    g["geometry"] = g.intersection(boundary)
    return g[g.geom_type.isin(["LineString", "MultiLineString"])]


def pieces(g, col, extra=()):
    """Explode lines into ~PIECE_M segments: midpoint, bearing (0-180), heading (0-360, direction
    drawn), length, plus the line's `extra` columns."""
    g = g.explode(index_parts=False)
    rows = []
    for vals, line in zip(zip(g[col], *(g[c] for c in extra)), g.geometry):
        n = max(1, int(round(line.length / PIECE_M)))
        d = np.linspace(0, line.length, n + 1)
        pts = shapely.line_interpolate_point(line, d)
        xy = shapely.get_coordinates(pts)
        for i in range(n):
            (x0, y0), (x1, y1) = xy[i], xy[i + 1]
            seg = d[i + 1] - d[i]
            if seg <= 0:
                continue
            heading = np.degrees(np.arctan2(y1 - y0, x1 - x0)) % 360
            rows.append((*vals, (x0 + x1) / 2, (y0 + y1) / 2, heading % 180, heading, seg,
                         shapely.LineString([(x0, y0), (x1, y1)])))
    df = pd.DataFrame(rows, columns=["cls", *extra, "x", "y", "bearing", "heading", "m", "geometry"])
    return gpd.GeoDataFrame(df, geometry="geometry", crs=CRS)


def match(a, b):
    """For each piece of a, the class of the nearest aligned piece of b within MATCH_M."""
    pts_a = gpd.GeoDataFrame(a[["bearing"]], geometry=gpd.points_from_xy(a.x, a.y), crs=CRS)
    pts_b = gpd.GeoDataFrame(b[["bearing", "cls"]], geometry=gpd.points_from_xy(b.x, b.y), crs=CRS)
    j = gpd.sjoin(pts_a.assign(geometry=pts_a.buffer(MATCH_M)), pts_b, predicate="contains")
    diff = (j["bearing_left"] - j["bearing_right"]).abs()
    j = j[np.minimum(diff, 180 - diff) <= MAX_ANGLE].copy()
    bx, by = b.x.to_numpy(), b.y.to_numpy()
    j["dist"] = np.hypot(a.x.to_numpy()[j.index] - bx[j["index_right"]],
                         a.y.to_numpy()[j.index] - by[j["index_right"]])
    best = j.sort_values("dist").groupby(level=0).first()
    return best["cls"].reindex(a.index).fillna("no match")


def crosstab(df, rows, cols):
    t = df.pivot_table(index=rows, columns=cols, values="km", aggfunc="sum", fill_value=0)
    t["total"] = t.sum(axis=1)
    return t.sort_values("total", ascending=False).round(1)


def main(city_dir, audit_gpkg, fix_gpkg, out_dir):
    boundary = gpd.read_file(fix_gpkg, layer="City boundary").to_crs(CRS).union_all()
    city = load_city(city_dir, boundary)
    osm = gpd.read_file(audit_gpkg).to_crs(CRS)
    osm["cls"] = osm["category"].map(OSM_SHORT)
    osm = clip(osm, boundary)

    cp, op = pieces(city, "cls"), pieces(osm, "cls")
    cp["match"], op["match"] = match(cp, op), match(op, cp)
    cp["km"], op["km"] = cp.m / 1000, op.m / 1000

    pd.set_option("display.width", 200)
    print("City inventory km (rows) by matched OSM category (cols):")
    print(crosstab(cp, "cls", "match").to_string())
    print("\nOSM km (rows) by matched city category (cols):")
    print(crosstab(op, "cls", "match").to_string())

    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "city-vs-osm.gpkg")
    cp.drop(columns=["x", "y"]).to_file(out, layer="city")
    op.drop(columns=["x", "y"]).to_file(out, layer="osm")
    crosstab(cp, "cls", "match").to_csv(os.path.join(out_dir, "city-vs-osm-city-rows.csv"))
    crosstab(op, "cls", "match").to_csv(os.path.join(out_dir, "city-vs-osm-osm-rows.csv"))


if __name__ == "__main__":
    main(*sys.argv[1:5])
