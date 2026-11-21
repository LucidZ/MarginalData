"""Prototype "add your commute": export the bike-routing graph built by route_test.py and inline it
into a self-contained Leaflet page that routes in the browser (A*, three cost profiles, nothing
leaves the page except map tile requests).

Usage:
    python -I build_commute_proto.py <work_dir> <out.html>

<work_dir> = data/boulder_bikenet; reuses the cached graph in <work_dir>/routing/.
Edge classes and profile multipliers come from route_test.py (single source of truth).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import route_test as rt  # noqa: E402

COORD = 1e6  # coordinates stored as integer micro-degrees


def export(g):
    nodes = list(g.nodes)
    idx = {n: i for i, n in enumerate(nodes)}
    cls_i = {c: i for i, c in enumerate(rt.CLASSES)}
    names, name_i = [""], {"": 0}
    # Merge each directed edge with its reverse twin (same ends, length, class); parallel ways that
    # differ (e.g. a road and its side path) stay separate edges.
    merged = {}
    for u, v, d in g.edges(data=True):
        a, b = idx[u], idx[v]
        key = (min(a, b), max(a, b), round(d["length"], 1), d["cls"], d["arterial"])
        e = merged.get(key)
        if e is None:
            geom = d.get("geometry")
            pts = list(geom.coords)[1:-1] if geom is not None else []
            if a > b:
                pts = pts[::-1]  # store shape oriented low index -> high index
            name = rt.first(d.get("name")) or ""
            if name not in name_i:
                name_i[name] = len(names)
                names.append(name)
            e = merged[key] = {"dirs": set(), "pts": pts, "name": name_i[name]}
        e["dirs"].add(a < b)

    # Streets whose class depends on direction of travel (e.g. climbing lane + downhill sharrow);
    # the context map shows these at the lesser class.
    seen = {}
    for (a, b, length, cls, art) in merged:
        seen.setdefault((a, b, length), set()).add(cls)

    E, SO, SP = [], [0], []
    for (a, b, length, cls, art), e in merged.items():
        ow = 0 if len(e["dirs"]) == 2 else 1 if True in e["dirs"] else 2  # 1: a->b only, 2: b->a only
        mixed = len(seen[(a, b, length)]) > 1
        E += [a, b, round(length * 10), cls_i[cls] | (int(art) << 3) | (ow << 4) | (int(mixed) << 6), e["name"]]
        for x, y in e["pts"]:
            SP += [round(x * COORD), round(y * COORD)]
        SO.append(len(SP) // 2)
    XY = [round(g.nodes[n][c] * COORD) for n in nodes for c in ("x", "y")]
    print(f"export: {len(nodes)} nodes, {len(merged)} edges, {len(SP) // 2} shape points, {len(names)} names")
    return {"xy": XY, "e": E, "so": SO, "sp": SP, "names": names}


def main(work, out_path):
    work = Path(work)
    g = rt.prepare(rt.load_graph(work, work / "routing"))
    D = export(g)
    D.update(classes=rt.CLASSES, profiles=rt.PROFILES, origins=rt.ORIGINS, dests=rt.DESTS)
    html = TEMPLATE.replace("__DATA__", json.dumps(D, separators=(",", ":")))
    Path(out_path).write_text(html)
    print("wrote", out_path, f"{len(html) / 1e6:.1f} MB")


TEMPLATE = r"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Boulder Commute Prototype</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<style>
:root{--ink:#1d1d1f;--muted:#6b6b70;--line:#e3e3e6;--bg:#fff;--soft:#f6f6f8}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:13px/1.45 system-ui,sans-serif}
#wrap{display:flex;height:100%}
#panel{width:360px;flex:none;overflow-y:auto;border-right:1px solid var(--line);padding:14px 16px;box-sizing:border-box}
#map{flex:1}
h1{font-size:16px;margin:0 0 4px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 6px}
.sub{color:var(--muted);margin:0 0 8px}
.prof{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.prof button{border:0;border-right:1px solid var(--line);background:#fafafa;padding:7px 4px;font:inherit;cursor:pointer;text-align:center}
.prof button:last-child{border-right:0}
.prof button.on{background:var(--ink);color:#fff}
.prof b{display:block;font-size:13px}.prof span{font-size:11px;opacity:.75}
#pdesc{margin:6px 0 0}
.big{font-size:22px;font-weight:600;margin:4px 0 0}
.big small{font-size:13px;font-weight:400;color:var(--muted)}
.bar{display:flex;height:12px;border-radius:3px;overflow:hidden;margin:8px 0 6px;background:var(--soft)}
.bar i{display:block;height:100%}
.legend div{display:flex;align-items:center;gap:6px;margin:2px 0}
.legend .sw{width:14px;height:5px;border-radius:2px;flex:none}
.legend .pct{margin-left:auto;font-variant-numeric:tabular-nums}
table{border-collapse:collapse;width:100%;font-size:12px}
td,th{padding:4px;border-bottom:1px solid var(--line);text-align:right;font-variant-numeric:tabular-nums}
td:first-child,th:first-child{text-align:left}
tr.r{cursor:pointer}tr.r:hover{background:var(--soft)}tr.sel{background:#eef3fb}
select,button.plain{font:inherit;border:1px solid var(--line);background:#fafafa;border-radius:6px;padding:4px 8px;cursor:pointer}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#empty{background:var(--soft);border-radius:8px;padding:10px 12px;color:var(--muted)}
@media (max-width:700px){#wrap{flex-direction:column-reverse}#panel{width:100%;height:48%;border-right:0;border-top:1px solid var(--line)}}
</style></head><body><div id="wrap"><div id="panel">
<h1>Your commute</h1>
<p class="sub">Click the map to drop a start, click again for the end. Drag either pin to adjust.
Routing runs in your browser; nothing you click is sent anywhere.</p>
<h2>Route style</h2>
<div class="prof" id="prof"></div>
<p class="sub" id="pdesc"></p>
<div id="empty">Drop two pins to see your route.</div>
<div id="result" hidden>
  <div class="big" id="km"></div>
  <div class="sub" id="via"></div>
  <div class="bar" id="bar"></div>
  <div class="legend" id="legend"></div>
  <h2>Compare styles</h2>
  <table><thead><tr><th>Style</th><th>km</th><th>extra vs direct</th><th>protected</th><th>busy st.</th></tr></thead><tbody id="cmp"></tbody></table>
  <label class="row" style="margin-top:8px"><input type="checkbox" id="ghost" checked> Show the other styles on the map</label>
</div>
<h2>Test routes</h2>
<div class="row"><select id="tests"><option value="">Pick a test pair…</option></select>
<button class="plain" id="reset">Clear pins</button></div>
<p class="sub" style="margin-top:14px">Streets: OpenStreetMap, snapshot at build time. Protected = separated paths and
cycle tracks; painted = on-street bike lanes; busy street = arterial with no bike lane.</p>
</div><div id="map"></div></div>
<script>
const D = __DATA__;
const COL = {'protected': '#2f6fb3', 'shared path/sidewalk': '#7fb2e0', 'painted': '#e9a23b', 'quiet street': '#8a8f98', 'busy street': '#d62728', 'path/sidewalk (untagged)': '#9b59b6'};
const LABEL = {'protected': 'Protected path / track', 'painted': 'Painted bike lane', 'quiet street': 'Quiet street, no lane',
  'busy street': 'Busy street, no lane', 'path/sidewalk (untagged)': 'Path or sidewalk (bike access untagged)'};
const PROFS = {direct: ['Direct', 'near-shortest'], balanced: ['Balanced', 'avoids busy streets'], cautious: ['Cautious', 'protected first']};
const PDESC = {
  direct: 'Close to the shortest route, but takes a bike path or lane when one runs alongside for about the same distance.',
  balanced: 'A busy street without a lane counts as 3× its length; painted lanes and quiet streets cost a little extra.',
  cautious: 'A busy street without a lane counts as 6× its length; stays on protected paths even for longer detours.',
};
const SPEED_KMH = 16;

// ---- Graph ----
const N = D.xy.length / 2, E = D.e.length / 5;
const lat0 = 40.015, MX = 111320 * Math.cos(lat0 * Math.PI / 180), MY = 110540;
const X = new Float64Array(N), Y = new Float64Array(N);
for (let i = 0; i < N; i++) { X[i] = D.xy[2 * i] / 1e6 * MX; Y[i] = D.xy[2 * i + 1] / 1e6 * MY; }
const EA = new Int32Array(E), EB = new Int32Array(E), ELEN = new Float64Array(E), ECLS = new Uint8Array(E), EART = new Uint8Array(E), ENAME = new Int32Array(E);
const deg = new Int32Array(N + 1);
for (let k = 0; k < E; k++) {
  const a = D.e[5 * k], b = D.e[5 * k + 1], f = D.e[5 * k + 3], ow = (f >> 4) & 3;
  EA[k] = a; EB[k] = b; ELEN[k] = D.e[5 * k + 2] / 10; ECLS[k] = f & 7; EART[k] = (f >> 3) & 1; ENAME[k] = D.e[5 * k + 4];
  if (ow !== 2) deg[a + 1]++;
  if (ow !== 1) deg[b + 1]++;
}
for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
const ADJ = new Int32Array(deg[N]), fill = deg.slice(0, N); // ADJ holds edge id, negated-1 when traversed b->a
for (let k = 0; k < E; k++) {
  const ow = (D.e[5 * k + 3] >> 4) & 3;
  if (ow !== 2) ADJ[fill[EA[k]]++] = k;
  if (ow !== 1) ADJ[fill[EB[k]]++] = -k - 1;
}
const COSTS = {};
for (const p in D.profiles) {
  const m = D.profiles[p], c = new Float64Array(E);
  for (let k = 0; k < E; k++) {
    const cls = D.classes[ECLS[k]];
    c[k] = ELEN[k] * m[cls === 'painted' && EART[k] ? 'arterial_painted' : cls];
  }
  COSTS[p] = c;
}

// A* (multipliers are >= 1 and edge length >= straight line, so straight-line distance is admissible)
const G = new Float64Array(N), PREV = new Int32Array(N), SEEN = new Int32Array(N);
let stamp = 0;
function astar(s, t, cost) {
  stamp++;
  const hk = [], hv = []; // binary heap of (f, node), lazy deletion
  const push = (f, v) => { let i = hk.length; hk.push(f); hv.push(v);
    while (i) { const p = (i - 1) >> 1; if (hk[p] <= f) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = f; hv[i] = v; };
  const pop = () => { const v = hv[0], lk = hk.pop(), lv = hv.pop(), n = hk.length;
    if (n) { let i = 0; for (;;) { let m = 2 * i + 1; if (m >= n) break; if (m + 1 < n && hk[m + 1] < hk[m]) m++; if (hk[m] >= lk) break; hk[i] = hk[m]; hv[i] = hv[m]; i = m; } hk[i] = lk; hv[i] = lv; }
    return v; };
  const h = v => .999 * Math.hypot(X[v] - X[t], Y[v] - Y[t]);
  SEEN[s] = stamp; G[s] = 0; PREV[s] = 0; push(h(s), s);
  const done = new Uint8Array(N);
  while (hk.length) {
    const u = pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === t) break;
    for (let j = deg[u]; j < deg[u + 1]; j++) {
      const r = ADJ[j], k = r >= 0 ? r : -r - 1, v = r >= 0 ? EB[k] : EA[k];
      const g = G[u] + cost[k];
      if (SEEN[v] !== stamp || g < G[v]) { SEEN[v] = stamp; G[v] = g; PREV[v] = r; push(g + h(v), v); }
    }
  }
  if (SEEN[t] !== stamp) return null;
  const steps = [];
  for (let v = t; v !== s;) { const r = PREV[v], k = r >= 0 ? r : -r - 1; steps.push(r); v = r >= 0 ? EA[k] : EB[k]; }
  return steps.reverse();
}

// Snap: grid index over nodes
const CELL = 200, grid = new Map();
const ck = (cx, cy) => cx * 100000 + cy;
for (let i = 0; i < N; i++) { const k = ck(Math.floor(X[i] / CELL), Math.floor(Y[i] / CELL)); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
function snap(ll) {
  const x = ll.lng * MX, y = ll.lat * MY, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let best = -1, bd = Infinity;
  for (let r = 0; r < 15 && (best < 0 || (r - 1) * CELL < bd); r++)
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      for (const i of grid.get(ck(cx + dx, cy + dy)) || []) { const d = Math.hypot(X[i] - x, Y[i] - y); if (d < bd) { bd = d; best = i; } }
    }
  return best;
}

const nodeLL = i => [D.xy[2 * i + 1] / 1e6, D.xy[2 * i] / 1e6];
function edgeCoords(r) { // [lat, lon] list along traversal direction
  const k = r >= 0 ? r : -r - 1, pts = [nodeLL(EA[k])];
  for (let j = D.so[k]; j < D.so[k + 1]; j++) pts.push([D.sp[2 * j + 1] / 1e6, D.sp[2 * j] / 1e6]);
  pts.push(nodeLL(EB[k]));
  return r >= 0 ? pts : pts.reverse();
}

function summarize(steps) {
  const by = Object.fromEntries(D.classes.map(c => [c, 0])), names = {};
  let m = 0;
  for (const r of steps) {
    const k = r >= 0 ? r : -r - 1, len = ELEN[k];
    m += len; by[D.classes[ECLS[k]]] += len;
    const nm = D.names[ENAME[k]]; if (nm) names[nm] = (names[nm] || 0) + len;
  }
  const via = Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n);
  return {m, by, via};
}

// ---- Map + UI ----
const map = L.map('map', {preferCanvas: true}).setView([40.015, -105.258], 13);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  {attribution: 'Tiles &copy; Esri | Streets &copy; OpenStreetMap contributors', maxZoom: 19, maxNativeZoom: 16}).addTo(map);
(() => { // faint protected network for context
  const lines = [];
  for (let k = 0; k < E; k++) if (ECLS[k] === 0 && !(D.e[5 * k + 3] & 64)) lines.push(edgeCoords(k));
  L.polyline(lines, {color: COL.protected, weight: 1.5, opacity: .35, interactive: false}).addTo(map);
})();

let profile = 'balanced', pins = [], results = null;
const routeLayer = L.layerGroup().addTo(map);
const pinIcon = (txt, fill) => L.divIcon({className: '', iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:${fill};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);color:#fff;font:600 12px/22px system-ui;text-align:center">${txt}</div>`});

const pb = document.getElementById('prof');
for (const p in PROFS) {
  const b = document.createElement('button'); b.dataset.p = p;
  b.innerHTML = `<b>${PROFS[p][0]}</b><span>${PROFS[p][1]}</span>`;
  b.onclick = () => { profile = p; draw(); }; pb.appendChild(b);
}
const sel = document.getElementById('tests');
for (const o in D.origins) for (const d in D.dests) sel.add(new Option(`${o} → ${d}`, JSON.stringify([D.origins[o], D.dests[d]])));
sel.onchange = () => { if (!sel.value) return; const [a, b] = JSON.parse(sel.value);
  setPins([L.latLng(a[0], a[1]), L.latLng(b[0], b[1])]); map.fitBounds(L.latLngBounds([a, b]), {padding: [60, 60]}); };
document.getElementById('reset').onclick = () => { setPins([]); sel.value = ''; };
document.getElementById('ghost').onchange = draw;

function setPins(lls) {
  for (const p of pins) map.removeLayer(p);
  pins = lls.map((ll, i) => {
    const mk = L.marker(ll, {draggable: true, icon: pinIcon(i ? 'B' : 'A', i ? '#111' : '#2b8a3e')}).addTo(map);
    let raf = 0;
    mk.on('drag', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; solve(); }); });
    mk.on('dragend', solve);
    return mk;
  });
  solve();
}
map.on('click', e => { if (pins.length < 2) setPins([...pins.map(p => p.getLatLng()), e.latlng]); });

function solve() {
  results = null;
  if (pins.length === 2) {
    const s = snap(pins[0].getLatLng()), t = snap(pins[1].getLatLng());
    if (s >= 0 && t >= 0 && s !== t) {
      results = {s, t};
      for (const p in D.profiles) { const steps = astar(s, t, COSTS[p]); results[p] = steps && {steps, ...summarize(steps)}; }
    }
  }
  draw();
}

function draw() {
  for (const b of pb.children) b.classList.toggle('on', b.dataset.p === profile);
  document.getElementById('pdesc').textContent = PDESC[profile];
  routeLayer.clearLayers();
  const ok = results && results[profile];
  document.getElementById('empty').hidden = !!ok;
  document.getElementById('empty').textContent = pins.length === 2 ? 'No route found between these points.' : pins.length ? 'Now click the end point.' : 'Drop two pins to see your route.';
  document.getElementById('result').hidden = !ok;
  if (!ok) return;
  if (document.getElementById('ghost').checked)
    for (const p in D.profiles) if (p !== profile && results[p])
      L.polyline(results[p].steps.map(edgeCoords), {color: '#444', weight: 2.5, opacity: .55, dashArray: '2 6', interactive: false}).addTo(routeLayer);
  const R = results[profile];
  // white casing, then runs of the same class
  L.polyline(R.steps.map(edgeCoords), {color: '#fff', weight: 10, opacity: .9, interactive: false}).addTo(routeLayer);
  let run = [], cls = null;
  const flush = () => { if (run.length) L.polyline(run, {color: COL[cls], weight: 6, opacity: .95, interactive: false}).addTo(routeLayer); };
  for (const r of R.steps) {
    const k = r >= 0 ? r : -r - 1, c = D.classes[ECLS[k]], pts = edgeCoords(r);
    if (c !== cls) { flush(); run = [pts[0]]; cls = c; }
    run.push(...pts.slice(1));
  }
  flush();
  for (const [i, n] of [[0, results.s], [1, results.t]]) { // dashed hop from pin to snapped street
    L.polyline([pins[i].getLatLng(), nodeLL(n)], {color: '#111', weight: 1.5, dashArray: '3 4', interactive: false}).addTo(routeLayer);
  }

  const km = R.m / 1000, short = results.direct ? results.direct.m : R.m;
  document.getElementById('km').innerHTML = `${km.toFixed(1)} km <small>· about ${Math.round(km / SPEED_KMH * 60)} min at ${SPEED_KMH} km/h</small>`;
  document.getElementById('via').textContent = R.via.length ? 'Mostly via ' + R.via.join(', ') : '';
  document.getElementById('bar').innerHTML = D.classes.map(c => `<i style="width:${100 * R.by[c] / R.m}%;background:${COL[c]}" title="${LABEL[c]}"></i>`).join('');
  document.getElementById('legend').innerHTML = D.classes.filter(c => R.by[c] > 0).sort((a, b) => R.by[b] - R.by[a]).map(c =>
    `<div><i class="sw" style="background:${COL[c]}"></i>${LABEL[c]}<span class="pct">${Math.round(100 * R.by[c] / R.m)}%</span></div>`).join('');
  document.getElementById('cmp').innerHTML = Object.keys(PROFS).filter(p => results[p]).map(p => {
    const x = results[p], extra = 100 * (x.m / short - 1);
    return `<tr class="r ${p === profile ? 'sel' : ''}" data-p="${p}"><td>${PROFS[p][0]}</td><td>${(x.m / 1000).toFixed(1)}</td>
      <td>${extra < .5 ? '—' : '+' + Math.round(extra) + '%'}</td><td>${Math.round(100 * x.by.protected / x.m)}%</td><td>${Math.round(100 * x.by['busy street'] / x.m)}%</td></tr>`;
  }).join('');
  for (const tr of document.querySelectorAll('#cmp tr')) tr.onclick = () => { profile = tr.dataset.p; draw(); };
}
draw();
</script></body></html>"""

if __name__ == "__main__":
    main(*sys.argv[1:3])
