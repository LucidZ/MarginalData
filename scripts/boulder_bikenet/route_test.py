"""De-risk "add your commute": route test origin/destination pairs on a Boulder street graph
with a bike cost function, under a few cost profiles, and report how each route splits into
protected / painted / quiet street / busy street / untagged path. Writes a Leaflet HTML to eyeball
the routes plus a CSV of the stats.

Usage:
    python -I route_test.py <work_dir> <out_dir>

<work_dir> = data/boulder_bikenet (city boundary from v1's Fix gpkg). The street graph is built from
the local Geofabrik extract in data/osm/ (see osm_extract.py; no Overpass calls) and cached in
<out_dir>/boulder-street-graph-v3.graphml (v3: built from the extract; v2 was Overpass + footway tag).
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import networkx as nx
import osmnx as ox
import pandas as pd
from shapely.geometry import LineString

sys.path.insert(0, str(Path(__file__).parent))
from osm_extract import PBF_NAME, graph_from_extract  # noqa: E402
from audit_osm_tagging import (CYCLEWAY_COLS, categorize, direction_level, is_true,  # noqa: E402
                               undirected_level)  # (importing also extends ox.settings.useful_tags_way)

ox.settings.useful_tags_way += ["oneway:bicycle", "maxspeed", "lanes", "footway"]

# Rough neighborhood centroids; Lucas to adjust to real start/end points
ORIGINS = {
    "South Boulder": (39.9868, -105.2470),   # Table Mesa Dr / Moorhead Ave
    "North Boulder": (40.0450, -105.2830),   # Broadway / Violet, near N. Boulder Park
    "East Boulder": (40.0125, -105.2240),    # Arapahoe / Cherryvale
}
DESTS = {
    "Downtown Pearl": (40.0176, -105.2795),  # Pearl St Mall at 14th
    "East Pearl (Google)": (40.0203, -105.2520),  # 30th / Pearl
    "CU campus": (40.0089, -105.2706),       # Norlin Quad
}

EXCLUDE_HW = {"motorway", "motorway_link", "trunk", "trunk_link", "steps", "construction",
              "proposed", "raceway", "bridleway", "corridor", "elevator", "platform"}
ARTERIAL = {"primary", "primary_link", "secondary", "secondary_link", "tertiary", "tertiary_link"}
CLASSES = ["protected", "painted", "quiet street", "busy street", "path/sidewalk (untagged)"]

# Multipliers on length. "painted" on an arterial gets the arterial_painted value.
# "direct" is near-shortest: the small penalties only break near-ties, so a side path running
# next to a busy road wins over the road (pure distance picked the road on a few meters of
# mapping noise; the x1.1 weights add at most 70 m / 1.5% on the test pairs).
PROFILES = {
    "direct": {"protected": 1, "painted": 1.02, "arterial_painted": 1.05, "quiet street": 1.03,
               "busy street": 1.1, "path/sidewalk (untagged)": 1.05},
    "balanced": {"protected": 1, "painted": 1.2, "arterial_painted": 1.5, "quiet street": 1.3,
                 "busy street": 3, "path/sidewalk (untagged)": 1.6},
    "cautious": {"protected": 1, "painted": 1.5, "arterial_painted": 2.2, "quiet street": 1.6,
                 "busy street": 6, "path/sidewalk (untagged)": 2.2},
}


def first(v):
    return v[0] if isinstance(v, list) else v


def load_graph(work, out):
    cache = out / "boulder-street-graph-v3.graphml"
    if cache.exists():
        return ox.load_graphml(cache)
    fix = next((work / "v1" / "results").glob("boulder-fixbikenet-gaps.gpkg"))
    city = gpd.read_file(fix, layer="City boundary").to_crs(26913).buffer(1000).to_crs(4326).iloc[0]
    osm = work.parent / "osm"
    g = graph_from_extract(osm / PBF_NAME, city, osm / "boulder-buffered.osm")
    ox.save_graphml(g, cache)
    return g


def travel_direction(d):
    """Which side's cycleway tags apply to this directed edge (see audit direction_level). A
    simplified edge merged from ways drawn both ways has reversed=[False, True]: no single side."""
    if d.get("contraflow"):
        return "contraflow"
    if is_true(d.get("oneway")):
        return "oneway"
    rev = d.get("reversed")
    if isinstance(rev, list) and len(set(rev)) > 1:
        return None
    return "backward" if is_true(rev) else "forward"


def bike_class(d):
    row = {k: d.get(k) for k in ["highway", "bicycle", "access", "cyclestreet", "bicycle_road",
                                 "oneway", "oneway:bicycle"] + CYCLEWAY_COLS}
    row.update({k: first(row[k]) for k in ["highway", "bicycle", "access", "cyclestreet", "bicycle_road",
                                           "oneway:bicycle"]})
    # Off-street classes come from the way itself; on-street lanes depend on direction of travel
    cat = categorize({**row, **{c: None for c in CYCLEWAY_COLS}})
    if cat == "protected (counted)":
        return "protected"
    if cat == "path, bike access untagged (ignored)":
        return "path/sidewalk (untagged)"
    direction = travel_direction(d)
    level = undirected_level(row) if direction is None else direction_level(row, direction)
    if level == 2:
        return "protected"
    if level == 1:
        return "painted"
    return "busy street" if row["highway"] in ARTERIAL else "quiet street"


def prepare(g):
    drop = []
    for u, v, k, d in g.edges(keys=True, data=True):
        hw, bike, access = first(d.get("highway")), first(d.get("bicycle")), first(d.get("access"))
        if hw in EXCLUDE_HW or bike in ("no", "dismount") or access in ("private", "no") and bike not in ("yes", "designated"):
            drop.append((u, v, k))
            continue
        d["cls"] = bike_class(d)
        d["arterial"] = first(d.get("highway")) in ARTERIAL
    g.remove_edges_from(drop)
    # Contraflow: oneway streets where bikes may ride both ways
    add = []
    for u, v, k, d in g.edges(keys=True, data=True):
        if first(d.get("oneway:bicycle")) == "no" and not g.has_edge(v, u):
            r = dict(d, contraflow=True)
            r["cls"] = bike_class(r)
            if "geometry" in r:
                r["geometry"] = LineString(r["geometry"].coords[::-1])
            add.append((v, u, r))
    for v, u, r in add:
        g.add_edge(v, u, **r)
    g = g.subgraph(max(nx.strongly_connected_components(g), key=len)).copy()
    for _, _, d in g.edges(data=True):
        for name, m in PROFILES.items():
            key = "arterial_painted" if d["cls"] == "painted" and d["arterial"] else d["cls"]
            d["cost_" + name] = d["length"] * m[key]
    print(f"graph: {g.number_of_nodes()} nodes, {g.number_of_edges()} edges, {len(add)} contraflow edges added")
    return g


def best_edge(g, u, v, weight):
    return min(g[u][v].values(), key=lambda d: d[weight])


def route(g, a, b, profile):
    w = "cost_" + profile
    path = nx.shortest_path(g, a, b, weight=lambda u, v, ds: min(d[w] for d in ds.values()))
    segs = []
    for u, v in zip(path[:-1], path[1:]):
        d = best_edge(g, u, v, w)
        geom = d.get("geometry") or LineString([(g.nodes[u]["x"], g.nodes[u]["y"]), (g.nodes[v]["x"], g.nodes[v]["y"])])
        segs.append({"cls": d["cls"], "len": d["length"], "name": first(d.get("name")) or "", "geometry": geom})
    return segs


def main(work, out):
    work, out = Path(work), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    g = prepare(load_graph(work, out))

    pts = {**ORIGINS, **DESTS}
    nodes = dict(zip(pts, ox.distance.nearest_nodes(g, [p[1] for p in pts.values()], [p[0] for p in pts.values()])))
    rows, feats = [], []
    for o in ORIGINS:
        for dname in DESTS:
            for prof in PROFILES:
                segs = route(g, nodes[o], nodes[dname], prof)
                km = sum(s["len"] for s in segs) / 1000
                by = pd.Series({c: 0.0 for c in CLASSES})
                for s in segs:
                    by[s["cls"]] += s["len"] / 1000
                rows.append({"from": o, "to": dname, "profile": prof, "km": round(km, 2),
                             **{f"% {c}": round(100 * by[c] / km, 1) for c in CLASSES}})
                gdf = gpd.GeoDataFrame(segs, crs=4326)
                gdf["route"], gdf["profile"] = f"{o} → {dname}", prof
                feats += json.loads(gdf.to_json(drop_id=True))["features"]

    df = pd.DataFrame(rows)
    short = df[df.profile == "direct"].set_index(["from", "to"]).km
    df["detour %"] = [round(100 * (r.km / short[(r["from"], r["to"])] - 1), 1) for _, r in df.iterrows()]
    df.to_csv(out / "route-test.csv", index=False)
    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(df.to_string(index=False))

    data = {"feats": feats, "rows": df.to_dict("records"), "origins": ORIGINS, "dests": DESTS,
            "profiles": list(PROFILES), "multipliers": PROFILES, "classes": CLASSES}
    (out / "route-test.html").write_text(TEMPLATE.replace("__DATA__", json.dumps(data, separators=(",", ":"))))
    print("wrote", out / "route-test.html")


TEMPLATE = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Boulder Route Test</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
:root{--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--bg:#fff}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:13px/1.45 system-ui,sans-serif}
#wrap{display:flex;height:100%}
#panel{width:440px;flex:none;overflow-y:auto;border-right:1px solid var(--line);padding:14px 16px;box-sizing:border-box}
#map{flex:1}
h1{font-size:16px;margin:0 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:14px 0 6px}
.sub{color:var(--muted);margin:0 0 8px}
.btns{display:flex;flex-wrap:wrap;gap:4px}
.btns button{border:1px solid var(--line);background:#fafafa;border-radius:6px;padding:4px 8px;font:inherit;cursor:pointer}
.btns button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
table{border-collapse:collapse;width:100%;font-size:12px}
td,th{padding:3px 4px;border-bottom:1px solid var(--line);text-align:right}td:first-child,th:first-child{text-align:left}
tr.r{cursor:pointer}tr.r:hover{background:#f6f6f8}tr.sel{background:#eef3fb}
.bar{display:flex;height:9px;width:110px;border-radius:2px;overflow:hidden}.bar i{display:block;height:100%}
.key{display:flex;flex-wrap:wrap;gap:4px 12px}.key span{display:flex;align-items:center;gap:5px}
.sw{width:16px;height:4px;border-radius:2px;display:inline-block}
@media (max-width:700px){#wrap{flex-direction:column}#panel{width:100%;height:50%;border-right:0;border-bottom:1px solid var(--line)}}
</style></head><body><div id="wrap"><div id="panel">
<h1>Boulder route test</h1>
<p class="sub">Routing on the OSM street graph with a bike cost function. Click a row to show one route.</p>
<h2>Cost profile</h2><div class="btns" id="pbtns"></div>
<p class="sub" id="mult"></p>
<div class="key" id="key"></div>
<h2>Routes</h2>
<table><thead><tr><th>Route</th><th>km</th><th>detour</th><th>split</th><th>prot.</th></tr></thead><tbody id="rows"></tbody></table>
</div><div id="map"></div></div>
<script>
const D = __DATA__;
const COL = {'protected': '#2f6fb3', 'painted': '#e9a23b', 'quiet street': '#8a8f98', 'busy street': '#d62728', 'path/sidewalk (untagged)': '#9b59b6'};
const map = L.map('map', {preferCanvas: true}).setView([40.015, -105.258], 13);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  {attribution: 'Tiles &copy; Esri | Data &copy; OpenStreetMap contributors', maxZoom: 19, maxNativeZoom: 16}).addTo(map);
for (const [n, [lat, lon]] of Object.entries(D.origins))
  L.circleMarker([lat, lon], {radius: 7, color: '#fff', weight: 2, fillColor: '#111', fillOpacity: 1}).bindTooltip(n, {permanent: true, direction: 'right'}).addTo(map);
for (const [n, [lat, lon]] of Object.entries(D.dests))
  L.circleMarker([lat, lon], {radius: 7, color: '#111', weight: 2.5, fillColor: '#fff', fillOpacity: 1}).bindTooltip(n, {permanent: true, direction: 'right'}).addTo(map);
document.getElementById('key').innerHTML = D.classes.map(c => `<span><i class="sw" style="background:${COL[c]}"></i>${c}</span>`).join('');

let profile = 'balanced', sel = null, layer = null;
const pb = document.getElementById('pbtns');
for (const p of D.profiles) {
  const b = document.createElement('button'); b.textContent = p; b.dataset.p = p;
  b.onclick = () => { profile = p; draw(); }; pb.appendChild(b);
}
function draw() {
  for (const b of pb.children) b.classList.toggle('on', b.dataset.p === profile);
  const m = D.multipliers[profile];
  document.getElementById('mult').textContent = 'Cost per meter: ' + Object.entries(m).map(([k, v]) => `${k} ×${v}`).join(', ');
  const feats = D.feats.filter(f => f.properties.profile === profile && (!sel || f.properties.route === sel));
  if (layer) map.removeLayer(layer);
  layer = L.geoJSON({type: 'FeatureCollection', features: feats}, {
    style: f => ({color: COL[f.properties.cls], weight: sel ? 6 : 4, opacity: .85}),
    onEachFeature: (f, l) => l.bindTooltip(`${f.properties.route}<br>${f.properties.name || '(unnamed)'}: ${f.properties.cls}, ${Math.round(f.properties.len)} m`, {sticky: true}),
  }).addTo(map);
  if (sel && feats.length) map.fitBounds(layer.getBounds(), {padding: [40, 40]});
  document.getElementById('rows').innerHTML = D.rows.filter(r => r.profile === profile).map(r => {
    const id = `${r.from} → ${r.to}`;
    const bar = D.classes.map(c => `<i style="width:${r['% ' + c]}%;background:${COL[c]}"></i>`).join('');
    return `<tr class="r ${sel === id ? 'sel' : ''}" data-id="${id}"><td>${r.from}<br><span class="sub">→ ${r.to}</span></td><td>${r.km.toFixed(1)}</td><td>+${r['detour %']}%</td><td><div class="bar">${bar}</div></td><td>${Math.round(r['% protected'])}%</td></tr>`;
  }).join('');
  for (const tr of document.querySelectorAll('tr.r')) tr.onclick = () => { sel = sel === tr.dataset.id ? null : tr.dataset.id; draw(); };
}
draw();
</script></body></html>"""

if __name__ == "__main__":
    main(*sys.argv[1:3])
