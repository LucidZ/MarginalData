"""Build OSMnx street graphs from a local Geofabrik extract instead of the public Overpass API
(Overpass asks scripted clients to use extracts or their own instance).

    python -I osm_extract.py download <dir>   # once, or to refresh: Geofabrik's daily Colorado file

graph_from_extract() mirrors ox.graph_from_polygon(polygon, network_type="all"): same way
filter, 500 m buffer, truncate -> largest component -> simplify -> truncate to the polygon. Two
differences: the data source, and simplification never merges ways whose bike-relevant tags differ
(OSMnx stores such merged tags as a list in arbitrary set order, so the class of a merged
cycleway+residential edge flipped between builds). Needs `osmium` (pyosmium) besides osmnx.
"""

import hashlib
import sys
import urllib.request
from pathlib import Path
from xml.sax.saxutils import quoteattr

import networkx as nx
import osmium
import osmnx as ox

URL = "https://download.geofabrik.de/north-america/us/colorado-latest.osm.pbf"
PBF_NAME = "colorado-latest.osm.pbf"

# ox._overpass network_type="all": ["highway"]["area"!~"yes"]["highway"!~"abandoned|..."]
EXCLUDED_HIGHWAY = {"abandoned", "construction", "no", "planned", "platform", "proposed", "raceway",
                    "razed", "rest_area", "services"}
# Tags the bike classes read; ways that differ in any of these stay separate edges
CLASS_TAGS = ["highway", "bicycle", "access", "foot", "footway", "cyclestreet", "bicycle_road", "oneway:bicycle",
              "cycleway", "cycleway:right", "cycleway:left", "cycleway:both"]


def download(dest):
    """Fetch the extract and check it against Geofabrik's published md5. One request each."""
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    pbf = dest / PBF_NAME
    want = urllib.request.urlopen(URL + ".md5").read().decode().split()[0]
    urllib.request.urlretrieve(URL, pbf)
    md5 = hashlib.md5()
    with open(pbf, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            md5.update(chunk)
    if md5.hexdigest() != want:
        raise SystemExit(f"md5 mismatch for {pbf}: {md5.hexdigest()} != {want}")
    print("downloaded", pbf, snapshot(pbf))


def snapshot(pbf):
    """OSM data timestamp of the extract."""
    return osmium.io.Reader(str(pbf), osmium.osm.NOTHING).header().get("osmosis_replication_timestamp")


def keep_way(tags):
    hw = tags.get("highway")
    return hw is not None and "yes" not in tags.get("area", "") and not any(x in hw for x in EXCLUDED_HIGHWAY)


def write_xml(pbf, bbox, xml_path):
    """All network ways with a node inside bbox (whole ways, like Overpass), plus their nodes."""
    west, south, east, north = bbox
    ways, need = [], set()
    fp = (osmium.FileProcessor(str(pbf), osmium.osm.NODE | osmium.osm.WAY).with_locations()
          .with_filter(osmium.filter.EntityFilter(osmium.osm.WAY)).with_filter(osmium.filter.KeyFilter("highway")))
    for w in fp:
        if not keep_way(w.tags):
            continue
        if not any(n.location.valid() and west <= n.lon <= east and south <= n.lat <= north for n in w.nodes):
            continue
        refs = [n.ref for n in w.nodes]
        ways.append((w.id, refs, dict(w.tags)))
        need.update(refs)

    with open(xml_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="osm_extract.py">\n')
        nodes = osmium.FileProcessor(str(pbf), osmium.osm.NODE).with_filter(osmium.filter.IdFilter(need))
        for n in nodes:
            tags = "".join(f"<tag k={quoteattr(t.k)} v={quoteattr(t.v)}/>" for t in n.tags)
            f.write(f'<node id="{n.id}" lat="{n.lat:.7f}" lon="{n.lon:.7f}">{tags}</node>\n')
        for wid, refs, tags in ways:
            f.write(f'<way id="{wid}">' + "".join(f'<nd ref="{r}"/>' for r in refs)
                    + "".join(f"<tag k={quoteattr(k)} v={quoteattr(v)}/>" for k, v in tags.items()) + "</way>\n")
        f.write("</osm>\n")
    print(f"extract: {len(ways):,} ways, {len(need):,} nodes -> {xml_path}")


def graph_from_extract(pbf, polygon, xml_path):
    """ox.graph_from_polygon(polygon, network_type="all", simplify=True, retain_all=False), from pbf
    (but see CLASS_TAGS)."""
    poly_proj, crs = ox.projection.project_geometry(polygon)
    poly_buff, _ = ox.projection.project_geometry(poly_proj.buffer(500), crs=crs, to_latlong=True)
    write_xml(pbf, poly_buff.bounds, xml_path)

    g_buff = ox.graph_from_xml(xml_path, simplify=False, retain_all=True)
    g_buff = ox.truncate.truncate_graph_polygon(g_buff, poly_buff)
    g_buff = ox.truncate.largest_component(g_buff, strongly=False)
    g_buff = ox.simplify_graph(g_buff, edge_attrs_differ=[t for t in CLASS_TAGS if t in ox.settings.useful_tags_way])
    g = ox.truncate.truncate_graph_polygon(g_buff, polygon)
    g = ox.truncate.largest_component(g, strongly=False)
    nx.set_node_attributes(g, ox.stats.count_streets_per_node(g_buff, nodes=g.nodes), name="street_count")
    g.graph["osm_source"] = f"{URL} ({snapshot(pbf)})"
    print(f"graph: {len(g):,} nodes, {len(g.edges):,} edges from {g.graph['osm_source']}")
    return g


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "download":
        download(sys.argv[2])
    else:
        raise SystemExit(__doc__)
