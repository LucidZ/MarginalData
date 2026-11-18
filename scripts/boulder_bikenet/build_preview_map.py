"""Bundle the versioned BikeNetKit Boulder runs + input data + tagging audit into one
self-contained Leaflet HTML preview with a version switcher (not a site page; for eyeballing).

Usage:
    python -I build_preview_map.py <work_dir> <audit_results_dir> <out.html>

<work_dir> holds v0..v4/results/ and data/ (crashes_bike.gpkg, lodes_trips.csv), as produced by
run_bikenetkit.py, fetch_crashes.py and fetch_lodes.py. Tools a version didn't rerun fall back
to v1's output (their inputs are identical).
"""

import json
import os
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


def mapillary_token():
    """VITE_MAPILLARY_TOKEN from the env or the repo's .env.local. Never written into the HTML:
    main() puts it in a sibling mapillary-token.js (gitignored with the rest of data/)."""
    if os.environ.get("VITE_MAPILLARY_TOKEN"):
        return os.environ["VITE_MAPILLARY_TOKEN"]
    env = Path(__file__).resolve().parents[2] / ".env.local"
    for line in env.read_text().splitlines() if env.exists() else []:
        key, _, val = line.partition("=")
        if key.strip() == "VITE_MAPILLARY_TOKEN":
            return val.strip().strip("'\"")
    return ""


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
    token, token_js = mapillary_token(), Path(out_path).parent / "mapillary-token.js"
    if token:
        token_js.write_text(f"window.MLY_TOKEN = {json.dumps(token)};\n")
    else:
        print("warning: no VITE_MAPILLARY_TOKEN, photo panel disabled")

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
    crashes["severity"] = crashes["Severity"].fillna("").replace(  # source typos: NOPN-, POSSIBLY
        {"NOPN-INCAPACITATING INJURY": "Non-incapacitating injury", "POSSIBLY INJURY": "Possible injury"}
    ).str.capitalize()
    crashes["year"] = crashes["ReportedYear"].fillna(0).astype(int)
    D["crashes"] = json.loads(crashes[["year", "severity", "geometry"]].to_json(drop_id=True))
    trips = pd.read_csv(work / "data" / "lodes_trips.csv")
    D["commutes"] = desire_lines(trips)
    D["commute_total"] = int(trips.num.sum())

    html = TEMPLATE.replace("__DATA__", json.dumps(D, separators=(",", ":")))
    if token and token in html:
        sys.exit("refusing to write: Mapillary token found in the HTML")
    Path(out_path).write_text(html)
    print("wrote", out_path, f"{len(html) / 1e6:.1f} MB")


TEMPLATE = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Boulder BikeNetKit Versions</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script src="mapillary-token.js"></script><!-- optional, gitignored; written by the builder -->
<style>
:root{--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--bg:#fff;--accent:#e8590c}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:13px/1.45 system-ui,sans-serif}
#wrap{display:flex;height:100%}
#panel{width:330px;flex:none;overflow-y:auto;border-right:1px solid var(--line);padding:14px 16px;box-sizing:border-box}
#map{flex:1}
#mapwrap{flex:1;position:relative;display:flex}
#photo{position:absolute;top:10px;right:10px;width:380px;max-width:calc(100% - 20px);z-index:1000;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,.14);padding:10px 12px;box-sizing:border-box}
#photo[hidden]{display:none}
.ph-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px}
.ph-head b{font-size:13px}
#ph-close{border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:var(--muted);padding:0 2px}
#ph-img{background:#f2f2f4;border-radius:5px;min-height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden;color:var(--muted);text-align:center}
#ph-img img{display:block;width:100%;height:auto}
#ph-meta{margin:6px 0 4px}
.ph-ctl{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ph-ctl button{border:1px solid var(--line);background:#fafafa;border-radius:6px;padding:3px 8px;font:inherit;cursor:pointer}
.ph-ctl button:disabled{opacity:.4;cursor:default}
.ph-ctl a{margin-left:auto}
.ph-attr{font-size:11px;color:var(--muted);margin-top:4px}
a{color:#1c5fa8}
li.go{cursor:pointer}li.go:hover{text-decoration:underline}
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
@media (max-width:700px){#wrap{flex-direction:column}#panel{width:100%;height:45%;border-right:0;border-bottom:1px solid var(--line)}
#photo{top:auto;bottom:10px;width:auto;left:10px;right:10px}#ph-img img{max-height:30vh;object-fit:contain}}
</style></head><body><div id="wrap"><div id="panel">
<h1>Boulder bike network, five ways</h1>
<p class="sub">BikeNetKit runs on Boulder, CO. Versions differ only in the data fed in.
Click any line, crash, list item or spot on the map for the nearest street-level photo.</p>
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
<h2>Top 10 Fix gaps <span class="tag">(click to inspect)</span></h2><ol id="fixlist"></ol>
<h2>Grow (from scratch): first 10 links</h2><ol id="growlist"></ol>
</div><div id="mapwrap"><div id="map"></div>
<div id="photo" hidden>
  <div class="ph-head"><b id="ph-title"></b><button id="ph-close" title="Close">&times;</button></div>
  <div id="ph-img"></div>
  <div id="ph-meta" class="tag"></div>
  <div class="ph-ctl"><button id="ph-prev" title="Previous candidate">&lsaquo;</button><span id="ph-n" class="tag"></span>
    <button id="ph-next" title="Next candidate">&rsaquo;</button><button id="ph-flip">Look the other way</button>
    <a id="ph-open" target="_blank" rel="noopener">Open in Mapillary &#8599;</a></div>
  <div class="ph-attr" id="ph-attr"></div>
</div></div></div>
<script>
const D = __DATA__;
const MLY = window.MLY_TOKEN || '';
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
const bind = (f, l) => {
  l.bindTooltip(tip(f.properties), {sticky: true});
  l.on('click', e => { L.DomEvent.stopPropagation(e); inspect(f, e.latlng); });
};

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
        {style: {color: '#555', weight: 2.5, dashArray: '3 5', opacity: .9}, onEachFeature: (f, l) => {
          l.bindTooltip('dropped vs v1<br>' + tip(f.properties), {sticky: true});
          l.on('click', e => { L.DomEvent.stopPropagation(e); inspect(f, e.latlng, 'Dropped vs v1'); });
        }}));
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
    `<li class="go ${showDiff && D.differs[version].includes('fix') && !fixBase.has(f.properties.key) ? 'new' : ''}">${f.properties.name} <span class="tag">${f.properties.length} m</span></li>`).join('');
  const gr = D.tools[version].grow.geo.features.slice(0, 10);
  const grBase = new Set(v1keys.grow.slice(0, 10).map(f => f.properties.key));
  document.getElementById('growlist').innerHTML = gr.map(f =>
    `<li class="go ${showDiff && D.differs[version].includes('grow') && !grBase.has(f.properties.key) ? 'new' : ''}">${f.properties.streets} <span class="tag">${(f.properties.length / 1000).toFixed(1)} km, cum ${(f.properties.length_cumulative / 1000).toFixed(1)} km</span></li>`).join('');
  const go = (id, feats, kind) => [...document.getElementById(id).children].forEach((li, i) => li.onclick = () => {
    const f = feats[i];
    map.fitBounds(L.geoJSON(f).getBounds(), {maxZoom: 17, padding: [60, 60]});
    inspect(f, midpoint(f.geometry), kind);
  });
  go('fixlist', fix, 'fix'); go('growlist', gr, 'grow');
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

// ---- Street-level photo panel (Mapillary Graph API, single image per click) ----
const M_LAT = 110540, M_LON = 111320 * Math.cos(40.015 * Math.PI / 180);
const xy = ([lon, lat]) => [lon * M_LON, lat * M_LAT];
const lines = g => g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
const dist = (a, b) => { const [ax, ay] = xy(a), [bx, by] = xy(b); return Math.hypot(ax - bx, ay - by); };

function bearingAt(geom, ll) { // compass bearing of the segment nearest to ll, or null for points
  const [px, py] = xy([ll.lng, ll.lat]);
  let best = null, bd = Infinity;
  for (const cs of lines(geom)) for (let i = 1; i < cs.length; i++) {
    const [ax, ay] = xy(cs[i - 1]), [bx, by] = xy(cs[i]), dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(ax + t * dx - px, ay + t * dy - py);
    if (d < bd) { bd = d; best = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; }
  }
  return best;
}
function midpoint(geom) { // along-length midpoint of the longest part
  const cs = lines(geom).sort((a, b) => b.length - a.length)[0];
  if (!cs) return L.latLng(geom.coordinates[1], geom.coordinates[0]);
  const seg = cs.slice(1).map((c, i) => dist(cs[i], c)), half = seg.reduce((a, b) => a + b, 0) / 2;
  let acc = 0;
  for (let i = 0; i < seg.length; i++) {
    if (acc + seg[i] >= half) { const t = (half - acc) / (seg[i] || 1), a = cs[i], b = cs[i + 1];
      return L.latLng(a[1] + t * (b[1] - a[1]), a[0] + t * (b[0] - a[0])); }
    acc += seg[i];
  }
  return L.latLng(cs[0][1], cs[0][0]);
}

function featureTitle(f, kind) {
  const p = f.properties;
  if (kind === 'fix' || (p.benefit !== undefined)) return `Fix gap #${p.ordering + 1}: ${p.name}`;
  if (kind === 'grow' || p.length_cumulative !== undefined) return `Grow link #${p.ordering + 1}: ${p.streets}`;
  if (p.link_length !== undefined) return `Link #${p.ordering + 1} (${p.link_length} m)`;
  if (p.severity !== undefined) return `Bike crash ${p.year}${p.severity ? ', ' + p.severity.toLowerCase() : ''}`;
  if (p.workers !== undefined) return `Commute flow (${p.workers} workers)`;
  if (p.name !== undefined) return `Painted lane${p.name ? ': ' + p.name : ''}`;
  return 'Selected line';
}

const ph = id => document.getElementById('ph-' + id);
const photoLayer = L.layerGroup().addTo(map);
const P = {req: 0, ll: null, bearing: null, imgs: [], list: [], i: 0, flipped: false};
const FIELDS = 'id,captured_at,compass_angle,computed_compass_angle,geometry,computed_geometry,is_pano,thumb_1024_url,creator';

function inspect(f, ll, kind) {
  const prefix = kind === 'Dropped vs v1' ? 'Dropped vs v1 — ' : '';
  photoAt(ll, bearingAt(f.geometry, ll), prefix + featureTitle(f, kind));
}
map.on('click', e => photoAt(e.latlng, null, 'Clicked spot'));

async function fetchImages(ll, r) {
  const dLat = r / M_LAT, dLon = r / M_LON;
  const bbox = [ll.lng - dLon, ll.lat - dLat, ll.lng + dLon, ll.lat + dLat].map(v => v.toFixed(6)).join(',');
  const res = await fetch(`https://graph.mapillary.com/images?access_token=${MLY}&fields=${FIELDS}&bbox=${bbox}&limit=500`);
  if (!res.ok) throw new Error(`Mapillary ${res.status}`);
  const here = [ll.lng, ll.lat];
  return ((await res.json()).data || []).map(m => {
    const at = (m.computed_geometry || m.geometry).coordinates;
    return {...m, at, angle: m.computed_compass_angle ?? m.compass_angle, d: dist(at, here)};
  }).filter(m => m.d <= r);
}

async function photoAt(ll, bearing, title) {
  const req = ++P.req;
  Object.assign(P, {ll, bearing, imgs: [], list: [], i: 0, flipped: false});
  document.getElementById('photo').hidden = false;
  ph('title').textContent = title;
  ph('meta').textContent = ph('attr').textContent = ph('n').textContent = '';
  ph('open').style.visibility = 'hidden';
  for (const b of ['prev', 'next', 'flip']) ph(b).disabled = true;
  photoLayer.clearLayers();
  L.circleMarker(ll, {radius: 6, color: '#111', weight: 2, fill: false, interactive: false}).addTo(photoLayer);
  if (!MLY) { ph('img').textContent = 'No mapillary-token.js next to this page (rebuild with VITE_MAPILLARY_TOKEN in .env.local).'; return; }
  ph('img').textContent = 'Looking for photos…';
  try {
    let imgs = await fetchImages(ll, 25);
    if (!imgs.length) imgs = await fetchImages(ll, 50);
    if (req !== P.req) return;
    P.imgs = imgs;
    if (!imgs.length) { ph('img').textContent = 'No Mapillary photos within 50 m.'; return; }
    rank(true); show();
  } catch (err) {
    if (req === P.req) ph('img').textContent = 'Photo lookup failed: ' + err.message;
  }
}

// Order: flat photos facing the wanted way (most recent first), then 360° panoramas, then the rest.
// No street bearing (crash / empty map click): just most recent first; "other way" flips the first pick.
function rank(auto) {
  let want = P.bearing;
  if (want !== null && P.flipped) want = (want + 180) % 360;
  if (want === null && P.flipped && P.first) want = (P.first.angle + 180) % 360;
  const tier = m => want === null ? (m.is_pano ? 1 : 0) : m.is_pano ? 1 : angDiff(m.angle, want) <= 40 ? 0 : 2;
  P.list = [...P.imgs].sort((a, b) => tier(a) - tier(b) || b.captured_at - a.captured_at || a.d - b.d);
  // a street has two directions: start with whichever has an aligned photo
  if (auto && P.bearing !== null && !P.flipped && tier(P.list[0]) !== 0 && P.imgs.some(m => !m.is_pano && angDiff(m.angle, P.bearing) > 140)) {
    P.flipped = true; return rank();
  }
  P.want = want; P.tier = tier; P.i = 0;
  if (!P.flipped) P.first = P.list[0];
}

function show() {
  const m = P.list[P.i], tier = P.tier(m);
  ph('img').innerHTML = `<img alt="Mapillary street-level photo" src="${m.thumb_1024_url}">`;
  const when = new Date(m.captured_at).toLocaleDateString('en-US', {year: 'numeric', month: 'short', day: 'numeric'});
  const facing = m.is_pano ? '360° panorama' : `facing ${Math.round(m.angle)}°` +
    (P.want === null ? '' : tier === 0 ? (P.bearing === null ? ' (opposite view)' : ' (along the street)')
      : ` (${Math.round(angDiff(m.angle, P.want))}° off ${P.bearing === null ? 'the opposite view' : 'the street'})`);
  const none = P.want !== null && P.tier(P.list[0]) !== 0 ? 'No flat photo faces this way within range. ' : '';
  ph('meta').innerHTML = `${none}<b>${when}</b> · ${Math.round(m.d)} m away · ${facing}`;
  ph('n').textContent = `${P.i + 1} / ${P.list.length}`;
  ph('prev').disabled = P.i === 0; ph('next').disabled = P.i === P.list.length - 1; ph('flip').disabled = false;
  ph('open').href = `https://www.mapillary.com/app/?pKey=${m.id}&focus=photo`;
  ph('open').style.visibility = 'visible';
  ph('attr').textContent = `© ${m.creator?.username || 'contributor'}, Mapillary, CC-BY-SA`;
  photoLayer.clearLayers();
  L.circleMarker(P.ll, {radius: 6, color: '#111', weight: 2, fill: false, interactive: false}).addTo(photoLayer);
  const [lon, lat] = m.at, a = m.angle * Math.PI / 180, r = 18;
  const tipLL = [lat + Math.cos(a) * r / M_LAT, lon + Math.sin(a) * r / M_LON];
  if (!m.is_pano) L.polyline([[lat, lon], tipLL], {color: '#111', weight: 3, interactive: false}).addTo(photoLayer);
  L.circleMarker([lat, lon], {radius: 5, color: '#fff', weight: 1.5, fillColor: '#111', fillOpacity: 1, interactive: false}).addTo(photoLayer);
}
ph('prev').onclick = () => { P.i--; show(); };
ph('next').onclick = () => { P.i++; show(); };
ph('flip').onclick = () => { P.flipped = !P.flipped; rank(); show(); };
ph('close').onclick = () => { document.getElementById('photo').hidden = true; photoLayer.clearLayers(); P.req++; };
boxes(); render();
</script></body></html>"""

if __name__ == "__main__":
    main(*sys.argv[1:4])
