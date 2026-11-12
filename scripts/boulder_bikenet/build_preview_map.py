"""Bundle the versioned BikeNetKit Boulder runs + input data + tagging audit into one
self-contained Leaflet HTML preview with a version switcher (not a site page; for eyeballing).

Usage:
    python -I build_preview_map.py <work_dir> <audit_results_dir> <out.html>

<work_dir> holds v0..v4/results/ and data/ (crashes_bike.gpkg, lodes_trips.csv), as produced by
run_bikenetkit.py, fetch_crashes.py and fetch_lodes.py. Tools a version didn't rerun fall back
to v1's output (their inputs are identical).
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

VERSIONS = {
    "v0": "Stock (unpatched tags, no data)",
    "v1": "Default (no data)",
    "v2": "Crashes",
    "v3": "Commutes",
    "v4": "Crashes + commutes",
}
DIFFERS = {  # which tools actually differ from v1 in each version
    "v0": ["fix", "link", "grow", "grow_existing"], "v1": [],
    "v2": ["fix", "grow", "grow_existing"], "v3": ["grow", "grow_existing"],
    "v4": ["fix", "grow", "grow_existing"],
}
FILES = {
    "fix": ("boulder-fixbikenet-gaps.gpkg", "Identified gaps"),
    "link": ("boulder-linkbikenet-largest_to_second.gpkg", "Identified links"),
    "grow": ("boulder-growbikenet-*-from_scratch.gpkg", "Grown bike network"),
    "grow_existing": ("boulder-growbikenet-*-from_bikenw.gpkg", "Grown bike network"),
}


def to_geojson(gdf, cols, simplify_m=2):
    gdf = gdf.to_crs(26913)
    if simplify_m:
        gdf["geometry"] = gdf.geometry.simplify(simplify_m)
    gdf = gdf.to_crs(4326)[cols + ["geometry"]]
    return json.loads(gdf.to_json(drop_id=True))


def pair_key(df):
    return [f"{min(a, b)}-{max(a, b)}" for a, b in zip(df["source"].astype("int64"), df["target"].astype("int64"))]


def find(results, pattern):
    hits = sorted(results.glob(pattern))
    return hits[0] if hits else None


def load_tool(work, version, tool):
    pattern, layer = FILES[tool]
    for v in ([version] if tool in DIFFERS[version] else []) + ["v1"]:
        path = find(work / v / "results", pattern)
        if path:
            return gpd.read_file(path, layer=layer), v
    return None, None


def street_names(g, streets, top=2):
    """Label each routed link with the street names it mostly runs along."""
    g = g.to_crs(26913)
    s = streets.to_crs(26913)[["name", "geometry"]].dropna(subset=["name"])
    s["name"] = s["name"].astype(str).str.strip("[]").str.replace("'", "")
    labels = []
    for geom in g.geometry:
        near = s[s.intersects(geom.buffer(4))]
        if near.empty:
            labels.append("unnamed path")
            continue
        overlap = near.geometry.intersection(geom.buffer(4)).length
        top_names = overlap.groupby(near["name"]).sum().nlargest(top).index.tolist()
        labels.append(" / ".join(top_names))
    return labels


def tool_layer(g, tool, streets=None):
    if tool == "fix":
        g["name"] = g["name"].fillna("n/a")
        g["key"] = pair_key(g)
        g["benefit"] = g["benefit"].round(0)
        return to_geojson(g, ["key", "ordering", "name", "length", "benefit"], 0)
    if tool == "link":
        g = g[g["link_length"] > 0].copy()
        g["share_after"] = (g["lcc_share"] * 100).round(1)
        return to_geojson(g, ["ordering", "link_length", "share_after"], 0)
    g["key"] = pair_key(g)
    # Extending runs report cumulative length including the existing network (~200 km);
    # rebase so the slider counts new km only
    g = g.sort_values("ordering")
    g["length_cumulative"] -= g["length_cumulative"].iloc[0] - g["length"].iloc[0]
    g["streets"] = street_names(g, streets)
    return to_geojson(g, ["key", "ordering", "streets", "length", "length_cumulative"], 0)


def desire_lines(trips, cell_m=600, top=250):
    """Aggregate block-level OD to a coarse grid and keep the heaviest cell pairs."""
    o = gpd.GeoSeries(gpd.points_from_xy(trips.o_lon, trips.o_lat), crs=4326).to_crs(26913)
    d = gpd.GeoSeries(gpd.points_from_xy(trips.d_lon, trips.d_lat), crs=4326).to_crs(26913)
    t = pd.DataFrame({
        "ox": (o.x // cell_m).astype(int), "oy": (o.y // cell_m).astype(int),
        "dx": (d.x // cell_m).astype(int), "dy": (d.y // cell_m).astype(int), "num": trips.num.values,
    })
    t = t[(t.ox != t.dx) | (t.oy != t.dy)]
    agg = t.groupby(["ox", "oy", "dx", "dy"]).num.sum().nlargest(top).reset_index()
    from shapely.geometry import LineString
    geoms = [LineString([((r.ox + .5) * cell_m, (r.oy + .5) * cell_m), ((r.dx + .5) * cell_m, (r.dy + .5) * cell_m)])
             for r in agg.itertuples()]
    gdf = gpd.GeoDataFrame({"workers": agg.num}, geometry=geoms, crs=26913)
    return to_geojson(gdf, ["workers"], 0)


def main(work, audit_dir, out_path):
    work, audit_dir = Path(work), Path(audit_dir)
    D = {"versions": VERSIONS, "differs": DIFFERS, "tools": {}}

    audit = gpd.read_file(audit_dir / "boulder-osm-bike-audit.gpkg")
    audit["name"] = audit["name"].fillna("")
    D["painted"] = to_geojson(audit[audit["category"] == "painted lane (ignored)"].copy(), ["name"])

    fix_v1 = find(work / "v1" / "results", FILES["fix"][0])
    D["protected"] = to_geojson(gpd.read_file(fix_v1, layer="Existing bike network"), ["length"])
    fix_v0 = find(work / "v0" / "results", FILES["fix"][0])
    if fix_v0:
        D["protected_v0"] = to_geojson(gpd.read_file(fix_v0, layer="Existing bike network"), ["length"])
    D["boundary"] = to_geojson(gpd.read_file(fix_v1, layer="City boundary"), [], 5)
    streets = gpd.read_file(fix_v1, layer="Existing street network")

    for v in VERSIONS:
        D["tools"][v] = {}
        for tool in FILES:
            g, src = load_tool(work, v, tool)
            if g is not None:
                D["tools"][v][tool] = {"src": src, "geo": tool_layer(g, tool, streets)}
                print(v, tool, "from", src, len(g))

    crashes = gpd.read_file(work / "data" / "crashes_bike.gpkg")
    crashes["severity"] = crashes["Severity"].fillna("").str.title()
    crashes["year"] = crashes["ReportedYear"].fillna(0).astype(int)
    D["crashes"] = json.loads(crashes[["year", "severity", "geometry"]].to_json(drop_id=True))
    trips = pd.read_csv(work / "data" / "lodes_trips.csv")
    D["commutes"] = desire_lines(trips)
    D["commute_total"] = int(trips.num.sum())

    html = TEMPLATE.replace("__DATA__", json.dumps(D, separators=(",", ":")))
    Path(out_path).write_text(html)
    print("wrote", out_path, f"{len(html) / 1e6:.1f} MB")


TEMPLATE = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Boulder BikeNetKit Versions</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
:root{--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--bg:#fff;--accent:#e8590c}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:13px/1.45 system-ui,sans-serif}
#wrap{display:flex;height:100%}
#panel{width:330px;flex:none;overflow-y:auto;border-right:1px solid var(--line);padding:14px 16px;box-sizing:border-box}
#map{flex:1}
h1{font-size:16px;margin:0 0 2px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 6px}
.sub{color:var(--muted);margin:0 0 8px}
.vbtns{display:flex;flex-wrap:wrap;gap:4px}
.vbtns button{border:1px solid var(--line);background:#fafafa;border-radius:6px;padding:5px 8px;font:inherit;cursor:pointer}
.vbtns button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
label{display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer}
.sw{display:inline-block;width:16px;height:4px;border-radius:2px;flex:none}
.tag{font-size:11px;color:var(--muted)}
.tag.diff{color:var(--accent);font-weight:600}
ol{margin:4px 0;padding-left:22px}li{margin:1px 0}
li.new{color:var(--accent);font-weight:600}
input[type=range]{width:100%}
@media (max-width:700px){#wrap{flex-direction:column}#panel{width:100%;height:45%;border-right:0;border-bottom:1px solid var(--line)}}
</style></head><body><div id="wrap"><div id="panel">
<h1>Boulder bike network, five ways</h1>
<p class="sub">BikeNetKit runs on Boulder, CO. Versions differ only in the data fed in.</p>
<h2>Version</h2><div class="vbtns" id="vbtns"></div>
<p class="sub" id="vnote"></p>
<label><input type="checkbox" id="diff" checked> Highlight changes vs v1</label>
<h2>Recommendations</h2><div id="toolboxes"></div>
<div id="growctl"><div class="tag">Grow layers: show first <b id="kmv"></b> km of build order</div>
<input type="range" id="km" min="2" max="115" step="1" value="30"></div>
<h2>Inputs</h2>
<label><input type="checkbox" id="l_protected" checked><span class="sw" style="background:#2f6fb3"></span>Protected network (what the tools see)</label>
<label><input type="checkbox" id="l_painted"><span class="sw" style="background:#e9a23b"></span>Painted lanes (ignored by tools)</label>
<label><input type="checkbox" id="l_crashes"><span class="sw" style="background:#c2255c;height:8px;width:8px;border-radius:4px"></span>Bike crashes 2018–24 (<span id="ncr"></span>)</label>
<label><input type="checkbox" id="l_commutes"><span class="sw" style="background:#5f3dc4"></span>Intra-city commutes, LODES 2024</label>
<h2>Top 10 Fix gaps</h2><ol id="fixlist"></ol>
<h2>Grow (from scratch): first 10 links</h2><ol id="growlist"></ol>
</div><div id="map"></div></div>
<script>
const D = __DATA__;
const TOOLS = {
  fix: {label: 'FixBikeNet top-50 gaps', color: '#d62728', on: true},
  link: {label: 'LinkBikeNet links', color: '#7b3fb5', on: false},
  grow: {label: 'GrowBikeNet from scratch', color: '#1f8a4c', on: false},
  grow_existing: {label: 'GrowBikeNet extending existing', color: '#127a85', on: false},
};
const ACCENT = '#e8590c';
const map = L.map('map', {preferCanvas: true}).setView([40.015, -105.255], 13);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  {attribution: 'Tiles &copy; Esri | Data &copy; OpenStreetMap contributors, City of Boulder, US Census LODES', maxZoom: 16}).addTo(map);
L.geoJSON(D.boundary, {style: {color: '#888', weight: 1, fill: false, dashArray: '4 4'}, interactive: false}).addTo(map);
const tip = p => Object.entries(p).filter(([k]) => k !== 'key').map(([k, v]) => `${k}: ${v}`).join('<br>');
const bind = (f, l) => l.bindTooltip(tip(f.properties), {sticky: true});

let version = 'v1';
const state = {fix: true, link: false, grow: false, grow_existing: false};
const layers = {};
const v1keys = {};
for (const t of ['fix', 'grow', 'grow_existing']) {
  const g = D.tools.v1[t]; v1keys[t] = g ? g.geo.features : [];
}

// Static input layers
const inputs = {
  protected: L.geoJSON(D.protected, {style: {color: '#2f6fb3', weight: 2.2, opacity: .7}, interactive: false}),
  protected_v0: D.protected_v0 ? L.geoJSON(D.protected_v0, {style: {color: '#2f6fb3', weight: 2.2, opacity: .7}, interactive: false}) : null,
  painted: L.geoJSON(D.painted, {style: {color: '#e9a23b', weight: 2, opacity: .8}, onEachFeature: bind}),
  crashes: L.geoJSON(D.crashes, {pointToLayer: (f, ll) => L.circleMarker(ll, {radius: 3.5, color: '#fff', weight: .8, fillColor: '#c2255c', fillOpacity: .85}), onEachFeature: bind}),
  commutes: (() => { const mx = Math.max(...D.commutes.features.map(f => f.properties.workers));
    return L.geoJSON(D.commutes, {style: f => ({color: '#5f3dc4', weight: .6 + 5 * f.properties.workers / mx, opacity: .35}), onEachFeature: bind}); })(),
};
document.getElementById('ncr').textContent = D.crashes.features.length;

function inBudget(t, f) {
  if (!t.startsWith('grow')) return true;
  return f.properties.length_cumulative - f.properties.length < +document.getElementById('km').value * 1000;
}
function v1Set(t) {
  return new Set(v1keys[t].filter(f => inBudget(t, f)).map(f => f.properties.key));
}

function render() {
  const showDiff = document.getElementById('diff').checked && version !== 'v1';
  for (const t in TOOLS) {
    if (layers[t]) { map.removeLayer(layers[t]); delete layers[t]; }
    const entry = D.tools[version][t];
    if (!entry || !state[t]) continue;
    const feats = entry.geo.features.filter(f => inBudget(t, f));
    const changed = showDiff && D.differs[version].includes(t) && t !== 'link';
    const base = changed ? v1Set(t) : null;
    const n = Math.max(1, feats.length);
    const style = f => {
      const r = f.properties.ordering / n;
      const isNew = changed && !base.has(f.properties.key);
      return {color: isNew ? ACCENT : TOOLS[t].color, weight: (isNew ? 6 : 5) - 3 * r, opacity: changed && !isNew ? .45 : .95};
    };
    const group = L.featureGroup([L.geoJSON({type: 'FeatureCollection', features: feats}, {style, onEachFeature: bind})]);
    if (changed) { // dropped vs v1: dashed gray
      const cur = new Set(feats.map(f => f.properties.key));
      const gone = v1keys[t].filter(f => inBudget(t, f) && !cur.has(f.properties.key));
      group.addLayer(L.geoJSON({type: 'FeatureCollection', features: gone},
        {style: {color: '#555', weight: 2.5, dashArray: '3 5', opacity: .9}, onEachFeature: (f, l) => l.bindTooltip('dropped vs v1<br>' + tip(f.properties), {sticky: true})}));
    }
    layers[t] = group.addTo(map);
  }
  for (const k of ['painted', 'crashes', 'commutes'])
    document.getElementById('l_' + k).checked ? inputs[k].addTo(map) : map.removeLayer(inputs[k]);
  const prot = document.getElementById('l_protected').checked;
  const pv = version === 'v0' && inputs.protected_v0 ? inputs.protected_v0 : inputs.protected;
  for (const p of [inputs.protected, inputs.protected_v0]) if (p && p !== pv) map.removeLayer(p);
  prot ? pv.addTo(map).bringToBack() : map.removeLayer(pv);
  if (map.hasLayer(inputs.commutes)) inputs.commutes.bringToBack();
  lists(showDiff);
}

function lists(showDiff) {
  const fix = D.tools[version].fix.geo.features.slice(0, 10);
  const fixBase = new Set(v1keys.fix.slice(0, 10).map(f => f.properties.key));
  document.getElementById('fixlist').innerHTML = fix.map(f =>
    `<li class="${showDiff && D.differs[version].includes('fix') && !fixBase.has(f.properties.key) ? 'new' : ''}">${f.properties.name} <span class="tag">${f.properties.length} m</span></li>`).join('');
  const gr = D.tools[version].grow.geo.features.slice(0, 10);
  const grBase = new Set(v1keys.grow.slice(0, 10).map(f => f.properties.key));
  document.getElementById('growlist').innerHTML = gr.map(f =>
    `<li class="${showDiff && D.differs[version].includes('grow') && !grBase.has(f.properties.key) ? 'new' : ''}">${f.properties.streets} <span class="tag">${(f.properties.length / 1000).toFixed(1)} km, cum ${(f.properties.length_cumulative / 1000).toFixed(1)} km</span></li>`).join('');
}

const NOTES = {
  v0: 'BikeNetKit out of the box. A tag bug hides designated multi-use paths and cycle tracks: the tools see ~95 km of protected network instead of ~205 km.',
  v1: 'Tag bug patched, no extra data. Baseline for comparison.',
  v2: 'Bike crashes (Boulder PD, 2018–24) reweight Grow ordering and Fix gap ranking. Link unchanged.',
  v3: 'Intra-city commute flows (LODES 2024) reweight Grow ordering. Fix and Link unchanged.',
  v4: 'Crashes + commutes, 50/50 blend, reweight Grow ordering. Fix uses crashes (= v2). Link unchanged.',
};
const vb = document.getElementById('vbtns');
for (const v in D.versions) {
  const b = document.createElement('button'); b.textContent = `${v} ${D.versions[v]}`; b.dataset.v = v;
  b.onclick = () => { version = v; for (const x of vb.children) x.classList.toggle('on', x.dataset.v === v); boxes(); render(); };
  if (v === version) b.classList.add('on'); vb.appendChild(b);
}
function boxes() {
  document.getElementById('vnote').textContent = NOTES[version];
  document.getElementById('toolboxes').innerHTML = Object.entries(TOOLS).map(([t, c]) => {
    const differs = D.differs[version].includes(t);
    const tag = version === 'v1' ? '' : differs ? '<span class="tag diff">differs from v1</span>' : '<span class="tag">same as v1</span>';
    return `<label><input type="checkbox" data-t="${t}" ${state[t] ? 'checked' : ''}><span class="sw" style="background:${c.color}"></span>${c.label} ${tag}</label>`;
  }).join('');
  for (const cb of document.querySelectorAll('#toolboxes input')) cb.onchange = e => { state[e.target.dataset.t] = e.target.checked; render(); };
}
for (const id of ['diff', 'l_protected', 'l_painted', 'l_crashes', 'l_commutes']) document.getElementById(id).onchange = render;
const km = document.getElementById('km');
km.oninput = () => { document.getElementById('kmv').textContent = km.value; render(); };
document.getElementById('kmv').textContent = km.value;
boxes(); render();
</script></body></html>"""

if __name__ == "__main__":
    main(*sys.argv[1:4])
