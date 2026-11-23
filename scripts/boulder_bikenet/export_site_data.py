"""Export the BoulderBikeNet site page's data (src/2026/BoulderBikeNet) to public/data/boulder-bikenet/:

    network.json  map layers + BikeNetKit results for all versions. Tool geometries are stored once
                  in a shared table (the versions mostly re-rank the same links) and features point
                  at them by index; coordinates rounded to 1e-5 deg (~1 m).
    graph.json    bike routing graph for "Your route", same packing as build_commute_proto.py, with
                  edge shapes simplified. Loaded only when the reader opens route mode.
    places.json   addresses + named places inside the routing graph's area, from the same local
                  Geofabrik extract, for the in-page From/To search (no geocoding service).

Usage:
    python -I export_site_data.py <work_dir> <out_dir>

Same inputs as build_preview_map.py (work_dir = data/boulder_bikenet) plus the routing graph cache
route_test.py builds in <work_dir>/routing/. Classes come from OpenStreetMap only (2026-11-22: the
City of Boulder inventory is no longer mixed in; fixes go to OSM). The painted-lane map layer comes
from the same graph classes.
"""

import gzip
import json
import sys
from pathlib import Path

import geopandas as gpd
from shapely.geometry import LineString, Point

sys.path.insert(0, str(Path(__file__).parent))
import build_commute_proto as proto  # noqa: E402
import build_preview_map as bpm  # noqa: E402
import route_test as rt  # noqa: E402

# Advanced choices on the page: what counts as protected x data fed to the tools (run_bikenetkit.py)
VERSIONS = {"bike": "Bike facilities only, no data", "bike_crashes": "Bike facilities only, crashes",
            "shared": "+ shared sidewalks, no data", "shared_crashes": "+ shared sidewalks, crashes"}
DEFAULT = "bike"
NOTES = {
    "bike": "Protected = bike paths, multi-use paths and protected bike lanes, as mapped in OpenStreetMap. "
            "Painted lanes and sidewalks don't count.",
    "bike_crashes": "Same network; bike crashes (Boulder PD, 2018–24) reweight Grow ordering and Fix gap ranking. "
                    "Link unchanged.",
    "shared": "Sidewalks and walking paths that OpenStreetMap marks as open to bikes also count "
              "as protected, so streets with one look covered. Fix isn't run: with most streets covered, its "
              "gaps mean little.",
    "shared_crashes": "Sidewalks count as protected, and bike crashes reweight Grow. Link unchanged; Fix not run.",
}


def tool_source(run, tool):
    """Run directory holding a run's results for one tool. Grow from scratch ignores the existing
    network (old v1 / v2 runs); Link ignores crashes; Fix isn't run with shared sidewalks (None)."""
    crashes = run.endswith("_crashes")
    if tool == "fix" and run.startswith("shared"):
        return None
    if tool == "grow":
        return "v2" if crashes else "v1"
    if tool == "link":
        return run.split("_")[0]
    return run


def edges_layer(path):
    return gpd.read_file(path, layer="edges")




def rounded(c, nd=5):
    return round(c, nd) if isinstance(c, float) else [rounded(x, nd) for x in c]


def compact(fc):
    """GeoJSON FeatureCollection with coordinates rounded to ~1 m."""
    for f in fc["features"]:
        f["geometry"]["coordinates"] = rounded(f["geometry"]["coordinates"])
    return fc


def dump(obj, path):
    s = json.dumps(obj, separators=(",", ":"))
    Path(path).write_text(s)
    gz = len(gzip.compress(s.encode(), 9))
    print(f"wrote {path}: {len(s) / 1e6:.2f} MB raw, {gz / 1e6:.2f} MB gzip")


def painted_lanes(g, boundary):
    """Streets inside the city with a painted lane every way you can ride them (the lesser of the
    directions, as on the route context map), from the routing graph's classes."""
    by_street = {}
    for u, v, d in g.edges(data=True):
        by_street.setdefault((min(u, v), max(u, v), round(d["length"], 1)), []).append((u, v, d))
    rows = []
    for edges in by_street.values():
        if all(d["cls"] == "painted" for _, _, d in edges):
            u, v, d = edges[0]
            geom = d.get("geometry") or LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])
            rows.append({"name": rt.first(d.get("name")) or "", "geometry": geom})
    lanes = gpd.GeoDataFrame(rows, crs=4326)
    return lanes[lanes.intersects(boundary)]


def network(work, g):
    differs = {v: [t for t in bpm.FILES if tool_source(v, t) != tool_source(DEFAULT, t)] for v in VERSIONS}
    out = {"versions": VERSIONS, "default": DEFAULT, "notes": NOTES, "differs": differs, "tools": {}, "geoms": []}

    fix_v1 = bpm.find(work / "v1" / "results", bpm.FILES["fix"][0])
    boundary = gpd.read_file(fix_v1, layer="City boundary").to_crs(4326).union_all()
    out["painted"] = compact(bpm.to_geojson(painted_lanes(g, boundary), ["name"]))
    nets = work / "data" / "networks"  # build_tool_networks.py: what the tools were told is protected
    bike, shared = edges_layer(nets / "bike" / "bike_network.gpkg"), edges_layer(nets / "shared" / "bike_network.gpkg")
    out["protected"] = compact(bpm.to_geojson(bike, []))
    in_bike = set(zip(bike["u"], bike["v"], bike["key"]))
    extra = shared[[e not in in_bike for e in zip(shared["u"], shared["v"], shared["key"])]]
    out["protected_shared"] = compact(bpm.to_geojson(extra, []))  # added on top in the "shared" runs
    out["boundary"] = compact(bpm.to_geojson(gpd.read_file(fix_v1, layer="City boundary"), [], 5))
    streets = gpd.read_file(fix_v1, layer="Existing street network")

    # Shared geometry table: identical lines across versions/tools are stored once
    geom_id = {}
    for v in VERSIONS:
        out["tools"][v] = {}
        for tool, (pattern, layer) in bpm.FILES.items():
            src = tool_source(v, tool)
            if src is None:
                continue
            path = bpm.find(work / src / "results", pattern)
            if path is None:
                print(f"warning: no {tool} results in {src}")
                continue
            t = gpd.read_file(path, layer=layer)
            if tool == "link":  # as bpm.tool_layer, plus street names for the panel's list
                t = t[t["link_length"] > 0].copy()
                t["share_after"] = (t["lcc_share"] * 100).round(1)
                t["streets"] = bpm.street_names(t, streets)
                fc = bpm.to_geojson(t, ["ordering", "link_length", "share_after", "streets"], 0)
            else:
                fc = bpm.tool_layer(t, tool, streets)
            feats = []
            for f in fc["features"]:
                geom = {"type": f["geometry"]["type"], "coordinates": rounded(f["geometry"]["coordinates"])}
                k = json.dumps(geom, separators=(",", ":"))
                if k not in geom_id:
                    geom_id[k] = len(out["geoms"])
                    out["geoms"].append(geom)
                feats.append({**f["properties"], "g": geom_id[k]})
            out["tools"][v][tool] = {"src": src, "features": feats}
    print(f"tool geometries: {len(geom_id)} unique")

    crashes = gpd.read_file(work / "data" / "crashes_bike.gpkg")
    crashes["severity"] = crashes["Severity"].fillna("").replace(
        {"NOPN-INCAPACITATING INJURY": "Non-incapacitating injury", "POSSIBLY INJURY": "Possible injury"}
    ).str.capitalize()
    crashes["year"] = crashes["ReportedYear"].fillna(0).astype(int)
    out["crashes"] = compact(json.loads(crashes[["year", "severity", "geometry"]].to_json(drop_id=True)))
    return out


def graph(work, simplify_deg=1.5e-5):
    g = rt.prepare(rt.load_graph(work, work / "routing"))
    for _, _, d in g.edges(data=True):  # ~1.5 m tolerance; endpoints are kept, so topology is unchanged
        if "geometry" in d:
            d["geometry"] = d["geometry"].simplify(simplify_deg)
    D = proto.export(g)
    D.update(classes=rt.CLASSES, profiles=rt.PROFILES, osm_source=g.graph.get("osm_source", ""))
    return g, D


PLACE_KEYS = ["place", "amenity", "shop", "leisure", "tourism", "office", "craft", "healthcare", "building", "landuse",
              "natural", "historic", "railway", "public_transport", "aeroway"]


SKIP_VALUES = {"bare_rock", "tree", "scrub", "grassland", "rock", "stone", "cliff", "scree", "wetland", "stop_position"}


def places(work):
    """Addresses (house number + street) and named places within the routing area. Compact:
    a = [house number, street index, lat*1e5, lon*1e5], p = [name, kind, lat*1e5, lon*1e5]."""
    import osmium
    from shapely import contains_xy
    from shapely.prepared import prep

    fix = next((work / "v1" / "results").glob("boulder-fixbikenet-gaps.gpkg"))
    area = gpd.read_file(fix, layer="City boundary").to_crs(26913).buffer(1000).to_crs(4326).iloc[0]
    inside = prep(area)
    west, south, east, north = area.bounds
    pbf = work.parent / "osm" / rt.PBF_NAME

    addrs, seen_addr, named, seen_name = [], set(), [], set()
    streets, street_i = [], {}
    # with_areas() also yields multipolygon relations (malls, big parks, campuses) as areas
    fp = osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY | osmium.osm.RELATION).with_locations().with_areas()
    for o in fp:
        if o.is_area() and o.from_way():  # closed ways already come through as ways
            continue
        tags = o.tags
        has_addr = "addr:housenumber" in tags and "addr:street" in tags
        name = tags.get("name")
        kind = next((k for k in PLACE_KEYS if k in tags), None)
        if not has_addr and not (name and kind):
            continue
        if o.is_node():
            lat, lon = o.lat, o.lon
        elif o.is_way() or o.is_area():  # buildings, parks: average of the outline's nodes
            nodes = o.nodes if o.is_way() else [n for ring in o.outer_rings() for n in ring]
            pts = [(n.lat, n.lon) for n in nodes if n.location.valid()]
            if not pts:
                continue
            lat, lon = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        else:
            continue
        if not (west <= lon <= east and south <= lat <= north) or not inside.contains(Point(lon, lat)):
            continue
        ll = [round(lat * 1e5), round(lon * 1e5)]
        if has_addr:
            num, st = tags["addr:housenumber"].strip(), tags["addr:street"].split(";")[0].strip()
            if (num, st) not in seen_addr:
                seen_addr.add((num, st))
                if st not in street_i:
                    street_i[st] = len(streets)
                    streets.append(st)
                addrs.append([num, street_i[st], *ll])
        value = tags.get(kind) if kind else None
        if name and kind and value not in SKIP_VALUES:
            label = name.lower() if kind == "public_transport" else (name, value)  # one entry per stop name
            if label not in seen_name:
                seen_name.add(label)
                named.append([name, "bus stop" if kind == "public_transport" else value.replace("_", " "), *ll])
    print(f"places: {len(addrs):,} addresses on {len(streets):,} streets, {len(named):,} named places")
    return {"streets": streets, "a": addrs, "p": named}


def main(work, out_dir):
    work, out_dir = Path(work), Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    g, D = graph(work)
    dump(network(work, g), out_dir / "network.json")
    dump(D, out_dir / "graph.json")
    dump(places(work), out_dir / "places.json")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(*sys.argv[1:3])
