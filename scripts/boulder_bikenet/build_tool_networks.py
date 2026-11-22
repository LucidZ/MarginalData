"""Feed BikeNetKit our own idea of "the existing protected network" instead of letting it read OSM
tags. Built from the routing graph's classes (OSM only), so the tools, the map and "Your route"
agree on what counts.

Baselines:
    bike    bike facilities only: protected class (OSM cycleways, designated paths, protected lanes)
    shared  bike + sidewalks / walking paths where bikes are allowed ("shared path/sidewalk")

A street counts only if every direction you can ride it is in the baseline (the lesser of the
directions, as on the maps). Only what connects to the main street network (city + 1 km) is kept.
Writes, per baseline, to <data_dir>/networks/<baseline>/:
    bike_network.gpkg   baseline edges in the city   (Grow, Link: import_files["bike_network"])
    fix_streets.gpkg    drivable streets + baseline, in the city (Fix: import_files["street_network"])
    link_streets.gpkg   every rideable street and path (Link: import_files["street_network"]; its
                        own download lacks paths our bike network has)
Fix and Link read protected from tags, so in the street files baseline edges become
highway=cycleway and every other edge loses its bike tags. Link also simplifies its street graph,
merging nodes where `cycleway`/`highway` don't change, which would drop bike-network nodes; every
edge of link_streets gets a unique `cycleway` value (an id, never a real cycleway value) so none
are merged.

Usage:
    python -I build_tool_networks.py <work_dir> <data_dir>
"""

import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox
from shapely.geometry import LineString

sys.path.insert(0, str(Path(__file__).parent))
import route_test as rt  # noqa: E402

BASELINES = {"bike": {"protected"}, "shared": {"protected", "shared path/sidewalk"}}
# bikenetlib's CARPBI_NETWORK_CUSTOM_FILTER, car part
CAR_HW = {"motorway", "trunk", "primary", "secondary", "tertiary", "residential", "motorway_link", "trunk_link",
          "primary_link", "secondary_link", "tertiary_link", "service", "unclassified", "living_street"}
NO_CAR_SERVICE = {"emergency_access", "parking", "parking_aisle", "private"}
BIKE_TAGS = ["cycleway", "cycleway:right", "cycleway:left", "cycleway:both", "bicycle", "cyclestreet",
             "bicycle_road", "segregated"]
KEEP = ["osmid", "highway", "name", "length", "oneway", "access", "service"] + BIKE_TAGS


def undirected(g, boundary):
    """One undirected edge per street (directed twins merged), with the set of classes its
    directions have and whether it touches the city."""
    groups = {}
    for u, v, d in g.edges(data=True):
        groups.setdefault((min(u, v), max(u, v), round(d["length"], 1)), []).append((u, v, d))
    h = nx.MultiGraph(crs=g.graph["crs"])
    for (a, b, _), edges in groups.items():
        u, v, d = edges[0]
        geom = d.get("geometry") or LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])
        if u != a:
            geom = LineString(geom.coords[::-1])
        attrs = {k: rt.first(d[k]) for k in KEEP if d.get(k) is not None}
        h.add_edge(a, b, key=h.number_of_edges(a, b), geometry=geom,
                   classes=",".join(sorted({e["cls"] for _, _, e in edges})), car=is_car(d),
                   city=geom.intersects(boundary), **attrs)
    for n in h.nodes:
        h.nodes[n].update(x=g.nodes[n]["x"], y=g.nodes[n]["y"])
    return h


def is_car(d):
    return (rt.first(d.get("highway")) in CAR_HW and rt.first(d.get("service")) not in NO_CAR_SERVICE
            and rt.first(d.get("access")) not in ("private", "no"))


def in_baseline(d, base):
    return set(d["classes"].split(",")) <= BASELINES[base]


def save(h, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Renumber parallel edges from key 0: filtering can drop a pair's key-0 edge and keep key 1, and
    # GrowBikeNet looks edges up as (u, v, 0) (KeyError otherwise)
    r = nx.MultiGraph(**h.graph)
    r.add_nodes_from(h.nodes(data=True))
    r.add_edges_from((u, v, d) for u, v, d in h.edges(data=True))
    h = r
    h.remove_nodes_from([n for n in list(h.nodes) if h.degree(n) == 0])
    ox.io.save_graph_geopackage(h, path)
    km = sum(d["length"] for _, _, d in h.edges(data=True)) / 1000
    print(f"wrote {path}: {h.number_of_edges()} edges, {km:.0f} km")


def main(work, data_dir):
    work, data_dir = Path(work), Path(data_dir)
    g = rt.prepare(rt.load_graph(work, work / "routing"))
    fix = next((work / "v1" / "results").glob("boulder-fixbikenet-gaps.gpkg"))
    boundary = gpd.read_file(fix, layer="City boundary").to_crs(4326).union_all()
    h = undirected(g, boundary)
    h = h.subgraph(max(nx.connected_components(h), key=len)).copy()
    for base in BASELINES:
        out = data_dir / "networks" / base
        edges = lambda keep: h.edge_subgraph([e for e in h.edges(keys=True) if keep(h.edges[e])]).copy()  # noqa: E731
        save(edges(lambda d: d["city"] and in_baseline(d, base)), out / "bike_network.gpkg")
        fix = tagged(edges(lambda d: d["city"] and (d["car"] or in_baseline(d, base))), base)
        save(fix.subgraph(max(nx.connected_components(fix), key=len)), out / "fix_streets.gpkg")
        link = tagged(h.copy(), base)
        for i, (_, _, d) in enumerate(link.edges(data=True)):
            d["cycleway"] = f"e{i}"
        save(link, out / "link_streets.gpkg")


def tagged(streets, base):
    """Street graph whose OSM bike tags say what the baseline says: baseline edges are cycleways,
    nothing else is bike infrastructure."""
    for _, _, d in streets.edges(data=True):
        for t in BIKE_TAGS:
            d.pop(t, None)
        if in_baseline(d, base):
            d["highway"] = "cycleway"
        elif d["highway"] == "living_street":
            d["highway"] = "residential"
    return streets

if __name__ == "__main__":
    main(*sys.argv[1:3])
