# Boulder BikeNet — versioned BikeNetKit runs

Branch: `boulder-bikenet`. Scripts: `scripts/boulder_bikenet/`. Started 2026-11-12.

## Goal
Run BikeNetKit (GrowBikeNet, LinkBikeNet, FixBikeNet) on Boulder, CO in four versions that differ
only in the data fed in, and compare them on one preview map with a version switcher.

| Version | Data | Grow | Fix | Link |
|---|---|---|---|---|
| v0 stock | none, unpatched tags (reference only) | yes | yes | yes |
| v1 default | none | yes | yes | yes |
| v2 crashes | bike crashes as `point_data` | changes | changes | = v1 |
| v3 commutes | LODES OD as `trip_data` | changes | = v1 (no trip support) | = v1 |
| v4 both | crashes + LODES | changes | = v2 | = v1 |

Held constant across v1–v4: default grid seed points (square grid, quadrangulation, 1000 m spacing
from scratch; triangulation 1707 m + 854 m existing-network seeds when extending), city boundary =
Nominatim "Boulder, Colorado, USA", `import_data_impact` = 9 (default), trip/point balance = 0.5.
Custom/real-destination seed points are a separate later experiment.

## Data
- **Crashes**: City of Boulder open data crash dataset (Boulder PD, city only, 2017+). Filter to
  bike-involved. Output `crashes_bike.gpkg` (points, EPSG:4326, optional `num`).
- **Commutes**: LODES8 `co_od_main_JT00_<latest>.csv.gz` + `co_xwalk.csv.gz` (block lat/lon).
  Keep OD pairs with both ends within Boulder boundary (+ small buffer). Optional distance cap.
  Output `lodes_trips.csv` with `o_lat,o_lon,d_lat,d_lon,num`.
  Known blind spots: CU students (not jobs), in-commuters with origins outside the boundary
  (dropped by the 500 m snap), all modes not just bikes.

### Data as fetched (2026-11-12)
- Crashes: ArcGIS FeatureServer `services.arcgis.com/ePKBjXrBZ2vEEgWd/.../Crash/FeatureServer/0`
  (14,770 crashes, `BicyclesInvolved='YES'` = 782). 110 have no geometry in the source (mostly
  2017: only 20 of 106 geocoded), so 672 kept — effectively 2018–2024. `num` = 1 each (no
  severity weighting).
- LODES 2024: 89,843 Boulder jobs held by CO residents; 16,233 (18%) are intra-city
  (12,843 block pairs). Worker-weighted straight-line distance median 2.9 km, p90 5.9 km.
- Point-data snap set to 100 m for Grow too (Fix default is already 100 m; Grow default 500 m).

## Gotchas (verified)
- **bikenetlib tag bug**: `osm.py` does `useful_tags_way.extend(tag)` on strings, so `bicycle` /
  `cycleway` tags are lost; path/footway + bicycle=designated and cycleway=track never count as
  protected. Boulder: 95 km seen stock vs 205 km patched. Workaround in `run_bikenetkit.py`
  (append tags before importing tools). `BNK_UNPATCHED=1` reproduces stock.
- LinkBikeNet default `largest_to_closest` crashes on Boulder (`path` None in
  `get_underway_connections`); use `largest_to_second`.
- Point data snaps to nearest grown edge within 500 m by default
  (`settings.import_point_data_snap_distance`) — loose; consider 100 m.
- FixBikeNet local betweenness samples 300 random nodes (seeded, reproducible).
- Env: no conda; uv venv py3.12 in scratchpad, `pip install growbikenet linkbikenet fixbikenet`.
- CARTO basemap now needs an API key; preview uses Esri World Light Gray.

## Outputs
All in `data/boulder_bikenet/` (gitignored, ~107 MB): `v0..v4/results/*.gpkg`, `data/`
(crashes, LODES trips), `audit/` (OSM tagging audit), `boulder-versions.html` (preview map:
version switcher, "highlight changes vs v1" — new = orange, dropped = gray dashed, Grow km-budget
slider, crash + commute desire-line layers, top-10 Fix / first-10 Grow lists with street names).

## Reproduce
```
uv venv --python 3.12 <venv> && VIRTUAL_ENV=<venv> uv pip install growbikenet linkbikenet fixbikenet
W=data/boulder_bikenet
python -I scripts/boulder_bikenet/fetch_crashes.py $W/data
python -I scripts/boulder_bikenet/fetch_lodes.py <dl_dir> $W/v1/results/boulder-fixbikenet-gaps.gpkg 2024  # then copy lodes_trips.csv to $W/data
for v in v0 v1 v2 v3 v4; do (cd $W/$v && python -I ../../../scripts/boulder_bikenet/run_bikenetkit.py $v ../data); done
# OSM for our own scripts comes from a local Geofabrik extract, never public Overpass (their policy
# asks scripted clients not to). Refresh = re-download + delete the v3 graphml. BikeNetKit is fine
# as is: bikenetlib points osmnx at the toolkit's own server, overpass.bikenetkit.org.
python -I scripts/boulder_bikenet/osm_extract.py download data/osm      # Colorado .pbf, md5-checked
python -I scripts/boulder_bikenet/route_test.py $W $W/routing           # builds routing/boulder-street-graph-v4.graphml
python -I scripts/boulder_bikenet/build_commute_proto.py $W $W/routing/commute-proto.html
(cd <tmp> && python -I .../audit_osm_tagging.py $W/routing/boulder-street-graph-v4.graphml \
   $W/v1/results/boulder-fixbikenet-gaps.gpkg)                           # writes ./results -> copy to $W/audit
python -I scripts/boulder_bikenet/build_preview_map.py $W $W/audit $W/boulder-versions.html
```
(Python env for our scripts: osmnx osmium geopandas pyogrio shapely pandas scikit-learn.)
(fetch_lodes needs a v1 Fix gpkg only for the city boundary layer.) Full v0–v4 run ≈ 15 min.

## Results (2026-11-12)
- Fix: crashes change 21 of top 50 gaps, 4 of top 10 (new: Hartford Dr, Harvard Ln, 13th St,
  Valmont Rd). v2 Fix == v4 Fix exactly (deterministic).
- Grow from scratch, rank correlation of build order vs v1 (same 90 links in every version):
  crashes 0.42, commutes 0.84, both 0.71. First 25 km overlap with v1: 13/21, 20/22, 17/22.
  Crash weighting pulls early building toward downtown / Univ. Hill / N. Broadway crash cluster;
  commute weighting mostly agrees with plain betweenness (Folsom/Arapahoe/Pearl spine first).
- Grow extending: link sets differ slightly by version (97–101 of 109 shared). First 20 km
  overlap with v1: crashes 16/28, commutes 25/39, both 23/35. Its `length_cumulative` starts at
  the existing network length (~202 km); map rebases it.
- Link: 54% of 233 km protected network in largest component; ~7 km of links -> 80%.

## Roadmap (agreed with Lucas 2026-11-18)
- **MVP**: publish the current versioned map as a site route. Port preview HTML to the site's
  React/Vite stack (light mode only), shrink payload (3.8 MB inline now: simplify geometry, lazy-load
  per version), phone layout, label fixes (source typo "NOPN-INCAPACITATING" → Non-incapacitating),
  methods note (tag bug, painted lanes ignored, LODES blind spots, sources), OG card.
  **Plus Mapillary click-to-see panel** (moved up from v3, 2026-11-18): click any line/crash → nearest
  Mapillary photo in the side panel (most recent within ~25 m whose compass angle aligns with the
  street; capture date shown; "look the other way" toggle; "open in Mapillary" link). Optional
  coverage layer. Single image via Graph API, not MapillaryJS (save the full viewer for v3).
  Attribution: Mapillary, CC-BY-SA. Build it into the preview map first so Lucas can use it to
  ground-truth the top gaps, then carry into the MVP port.
  Token: `VITE_MAPILLARY_TOKEN` in `.env.local` (gitignored); Lucas creates the Mapillary dev app
  (don't sign up on Lucas's behalf). Preview builder should read the same var.
- **v1**: brief guided tutorial (3–4 steps: legend → switch to crashes version → km slider → one gap
  + its photo → explore).
- **v2**: user route. Dropped pins (no geocoding, nothing leaves the browser), client-side routing on
  a bundled Boulder street graph with a bike cost function (protected < painted < nothing, arterial
  penalty). Stats: % protected / painted / none today, and % protected if the selected version's
  first N km were built. De-risk first: validate routing against Lucas's commute + known routes.
- **v3**: ride-along walkthrough. Auto-generated stops along the route (status stretches, Fix gaps /
  early Grow links, crashes within ~30 m), scroll-driven follow camera, nearest Mapillary image per
  stop (reuses the MVP photo lookup; Lucas says Boulder coverage is good), MapillaryJS viewer here.
- Street View considered and set aside as default: Static $7/1k images after 10k free/mo, Dynamic
  $14/1k after 5k free (2026 pricing). ~10 images per walkthrough → ~1k free walkthroughs/mo; viral
  50k walkthroughs ≈ $2.9k. Possible capped fallback for stops without Mapillary coverage.

## Site page (2026-11-18, unlisted, not deployed)
`/2026/BoulderBikeNet` (registered in `src/App.tsx` outside ROUTES, like the I-70 sketches). Lucas: build
and refine, don't publish the network-only MVP; "plot your own path" likely ships in the first public
version. One page, two modes on one Leaflet map: **The network** (preview map port: versions, diff vs v1,
Grow km slider, inputs, top-10 Fix / Grow lists) and **Your route** (prototype port: pins, 3 styles,
split bar, compare table, examples). Shared Mapillary photo panel (`VITE_MAPILLARY_TOKEN`, inlined into
the page chunk at build: client token, acceptable; consider a separate site token restricted by domain).
Code: `src/2026/BoulderBikeNet/` (routing.ts = A* port, photos.ts, networkLayers.ts, routeLayers.ts).
Data: `python -I scripts/boulder_bikenet/export_site_data.py $W public/data/boulder-bikenet` (2026-11-19: audit arg dropped).
Payload (gzip, GitHub Pages compresses JSON): network.json 0.25 MB (5 versions share 758 geometries),
graph.json 0.71 MB (fetched on first route-mode open; shapes simplified 1.5e-5°), page JS 10 KB,
leaflet 42 KB, + Esri tiles and Mapillary images (~100–300 KB per photo). Smoke test:
`node tests/bikenet-page-check.mjs http://localhost:<port> <shot_dir>`.

Revisions after Lucas's first look (2026-11-18):
- 63rd St north of Jay "protected" was right: OSM maps a separate concrete sidepath (`highway=cycleway`,
  ~8 m off centerline); Mapillary Oct 2024 photos confirm. Lucas: keep side paths as protected.
- Network mode simplified: default = v1 data + "Extend today's network" (grow_existing) only. Method
  (radio, one at a time) and data versions live under a collapsed "Advanced". Panel shows that
  method's first/top 10; clicking one outlines it on the map, fades the rest, frames it, opens a photo;
  clicking a map line selects its list item. Plain names: Extend today's network / Build from scratch
  / Close the worst gaps / Connect isolated pieces. Link features now carry street names.
- Route mode: Google-Maps-style From/To search, all in-page (Lucas chose this over Nominatim to keep
  "nothing leaves your browser"): `places.json` (0.30 MB gz) = 30.1k OSM addresses + 3.4k named
  places (incl. multipolygon areas, neighbourhoods; bus stops deduped by name) from the local extract.
  Nicknames: CU, CU Boulder, 29th St Mall. Dropped/dragged pins are labelled "Near <address>".
  "Use my location" (browser geolocation), swap, A/B as fixed slots. Search ≈ 7 ms per keystroke.
- Open: the Extend list includes near-zero links (e.g. "Canal Path 0.0 km") from BikeNetKit's run.

## Status
- [x] v0–v4 runs, crash + LODES data, versioned preview map
- [x] commit scripts + spec on `boulder-bikenet`
- [x] Mapillary token in `.env.local` verified 2026-11-18 (Graph API `/images?bbox=…` works; near the
      Toedtli Dr gap: 148 images, 91 from 2025, 47 panos)
- [x] Mapillary photo panel in `build_preview_map.py` (2026-11-18, uncommitted). Token read from
      `VITE_MAPILLARY_TOKEN` env or `.env.local` and embedded in the local-only HTML (never publish it;
      the MVP must take the token from Vite env instead). Click a line / crash / empty map spot / Fix or
      Grow list item → Graph API `/images?bbox` ±25 m (falls back to ±50 m). Ranking: flat photos within
      40° of the street bearing at the click (most recent first), then 360° panos, then the rest; if
      only the opposite direction has aligned photos it starts there. ‹ › cycles candidates, "Look the
      other way" flips the wanted bearing, photo position + view direction drawn on the map. Uses
      `computed_compass_angle`/`computed_geometry` when present. All v1 top-10 gaps had a photo
      (8–128 candidates each; 7 of 10 from 2024–25). No coverage layer (needs vector tiles).
      Smoke test: `node tests/bikenet-photo-check.mjs <html> <shot_dir>` (needs network).
      Builder-only env: `uv pip install geopandas pyogrio shapely pandas numpy` is enough.
      Also fixed crash severity labels (source typos NOPN-INCAPACITATING, POSSIBLY INJURY).
- [ ] verify top gaps on the ground / imagery (use the photo panel)
- [~] **Routing de-risk** (2026-11-18, `scripts/boulder_bikenet/route_test.py` → `data/boulder_bikenet/routing/`
      route-test.html + .csv; OSM graph cached as graphml). osmnx `network_type="all"` on city + 1 km,
      motorway/trunk/steps/bicycle=no/private dropped, oneway respected + `oneway:bicycle=no` contraflow,
      largest strongly connected component (30.7k nodes). Edge classes reuse the audit `categorize()`:
      protected / painted / quiet street / busy street (primary–tertiary, no lane) / untagged path or
      sidewalk. Profiles = length multipliers: shortest (all 1), balanced (painted 1.2, painted on
      arterial 1.5, quiet 1.3, untagged path 1.6, busy 3), cautious (1.5/2.2/1.6/2.2/6).
      Test pairs (Lucas): from South (Table Mesa/Moorhead), North (Broadway/Violet), East
      (Arapahoe/Cherryvale) to Downtown Pearl (14th), East Pearl/Google (30th), CU (Norlin) — pins are
      my guesses, Lucas to adjust. Balanced: detour +0–17% over shortest, protected share 48–79% (vs
      2–45% on shortest), busy-street share 0% on all 9. Looks plausible on the map (Broadway path
      S→downtown, Arapahoe path E→downtown, 13th St lanes N→downtown). Sidepaths along arterials
      count as protected (driveway/intersection crossings not penalized). Lucas: "pretty good".
- [x] Client-side routing feasible (measured 2026-11-18): graph ≈ 0.5 MB gzip as packed binary
      (30.7k nodes, 44k edges, shapes), JS A* all three profiles 1.5 ms. Static site, no server needed.
- [~] **Commute prototype** `scripts/boulder_bikenet/build_commute_proto.py` →
      `data/boulder_bikenet/routing/commute-proto.html` (3.1 MB, graph inlined as JSON; MVP should ship
      packed binary). Drop/drag A-B pins, Shortest/Balanced/Cautious toggle (Lucas wants all three kept:
      riders differ), split bar, compare table, other styles as dashed ghosts, test-pair picker.
      Results match route_test.py exactly. 2026-11-18: "shortest" (pure distance) replaced by
      "direct" (busy ×1.1, arterial painted ×1.05, untagged path ×1.05, quiet ×1.03, painted ×1.02):
      pure distance took Broadway's roadway over the side path next to it on a few meters of mapping
      noise (Lucas spotted it at Broadway/Euclid). Direct adds ≤70 m (1.5%) on the 9 pairs and cuts
      busy share e.g. E→Pearl 76%→10%, S→Pearl 39%→2%; "extra" now measured vs direct. Next: Lucas tries his real commute; then "what if version X's
      first N km were built" re-labelling.
- Shared-sidewalk class tried and reverted (2026-11-18). Lucas: a curbed, bike-designated sidewalk
  counts as protected; exposure shows up at the crossings (already purple). Hanover Ave is tagged
  `highway=cycleway` "Hanover Multi-use Path", 10' (2025 Street View: wider-than-average sidewalk,
  planting strip in places) — stays protected. Graph cache is now `boulder-street-graph-v2.graphml`
  (adds `footway` tag; fresher OSM, small shifts in route numbers).
- **Direction-aware lanes + sharrow fix** (2026-11-18). Lucas spotted 17th St (curve near 40.011,
  -105.2725: climbing lane one way, sharrow the other, tagged `cycleway:left=lane` +
  `cycleway:right=shared_lane`) drawn the same as Folsom's real lanes. Two bugs in `categorize()`:
  (1) `has(..., "lane")` is a substring match, so every `shared_lane` (sharrow) counted as painted;
  (2) any side's lane counted for both directions. Now `audit_osm_tagging.py` has
  `side_level`/`direction_level`/`undirected_level`; the router classes each directed edge by its
  side (right = along the way, left = against; one-way: both sides, contraflow edges use left /
  `opposite_*`; merged edges with mixed `reversed` fall back to lesser). Maps without a direction
  (audit painted layer, proto's faint protected layer via bit 64 "mixed") show the **lesser** class.
  Same graph: painted 164 km -> 75 km + 90 km sharrows; only 8.7 km of street has a lane one way
  only — the sharrow bug was most of it. Routes barely move (≤ +90 m); painted share drops a lot
  (e.g. N->Pearl balanced 44% -> 21%), sharrow streets now count as quiet/busy. Audit can now run on
  the routing cache (`audit_osm_tagging.py <graphml> <v1 fix gpkg>`) — Overpass refused the
  scripted download that day; audit and router now share one OSM snapshot.
- **OSM from a local extract** (2026-11-18). `osm_extract.py`: Geofabrik `colorado-latest.osm.pbf`
  (389 MB, `data/osm/`, snapshot 2026-11-17T21:24Z, recorded in the graph's `osm_source`) ->
  pyosmium cut of network ways around the buffered polygon -> OSM XML -> same steps as
  `ox.graph_from_polygon(network_type="all")`. Matches the Overpass v2 graph: same tags on every
  way, 3 ways missing (added to OSM after the snapshot). One deliberate difference: simplification
  no longer merges ways whose bike tags differ (`edge_attrs_differ`). Before, merged edges stored
  tags as lists in arbitrary set order and `first()` picked one, so ~23 km of edges flipped class
  between builds (v2 vs first v3). Graph 32.7k -> 35.9k nodes; rebuilds are now byte-identical.
  Route effect vs v2: lengths within 90 m, busy share unchanged, protected share down 0–4.5 pts
  (merged half-path edges no longer count as all-protected). Audit: painted 73 km, sharrows 90,
  protected 240, untagged path 391.
  If more rigour is wanted later, without photos: (1) geometric side-path test — ~88 of 276 km of
  protected paths run within 20 m of a road centreline, stable across 60–90% thresholds (Hanover 100%);
  (2) Level of Traffic Stress (PeopleForBikes BNA rules on OSM); (3) check for a City of Boulder
  bike-facility inventory layer.
- Mapillary token handling (2026-11-18): never in HTML. Preview loads gitignored sibling
  `mapillary-token.js` written by the builder; builder refuses to write HTML containing the token.
  Token never in git history (checked all branches). MVP caveat: a `VITE_` var is bundled into the
  deployed JS (gh-pages commits) — decide: accept (it's a client token) or proxy.
- [ ] Fix gap `name` isn't stable across runs: the same 581 m gap is "Ludlow Street" in v1 and
      "Toedtli Drive" in v2 (it runs along Toedtli). Label gaps with `street_names()` like Grow does.
- [ ] MVP port to site
- [ ] next experiment: real-destination seed points (CU, Pearl, schools, transit) as a new axis
- [ ] decide whether to report the bikenetlib tag bug upstream (ask Lucas first)

## City of Boulder inventory vs OSM (2026-11-19)

Lucas asked whether the city's Bike Map (experience.arcgis.com/.../7654aa43144b4406bd803c7c332ca13a,
web map `cb1108c741a24c85b6e1fd94a40dd12b`) uses our data: no, it draws the city's own GIS
(`gis.bouldercolorado.gov/ags_svr3/rest/services/trans/`). Public, no login. Useful layers:
`BikePedALL/1` on-street inventory (FACILITYTYPE, BUFFERED/BUFFERTYPE, SNOWROUTE, ONEWAY,
NBRHDGRNWY, INSTALLDATE), `BikePedALL/0` off-street (MUP, sidewalk, ped path; BICYCLES, EBIKE,
SNOWROUTE, MATERIAL, WIDTH), `osmp/TrailsNEW/4` OSMP trails (BICYCLES/EBIKES). Also a full
`StreetCenterline` (SPEEDLIMIT, NUMLANES, ONEWAY, STREETCLASS) and `HighRiskNetwork` (HRN).
Scripts: `fetch_city_inventory.py <out>` -> `data/boulder_bikenet/city/`; `compare_city_inventory.py`
(10 m pieces, nearest aligned match within 15 m / 30 deg, city boundary) -> `city-vs-osm.gpkg` + CSVs.

City km (Active, in city boundary) -> what OSM has there:
- Multi-use path 136: OSM protected 122 (90%), untagged path 12, nothing 2.
- Protected/separated lane 9.7: OSM protected 9.0.
- Painted lane 130: OSM painted 74, OSM protected 20 (side path / track), no OSM lane ~31
  (shows as "path untagged" = nearest sidewalk, or no match), sharrow 5. OSM painted 73 -> 69 confirmed.
- Designated route 182: OSM sharrow 132; rest untagged in OSM. OSM sharrow 90 -> 80 confirmed.
- Bikeable shoulder 21: mostly nothing in OSM (no OSM equivalent in our audit).
- OSM protected with no city facility: 62 km, mostly city "Pedestrian Path" (28) or sidewalk (10)
  where OSM says path/footway + bicycle=designated/yes, plus Valmont Bike Park trails.
Reading: the two agree on the core (MUPs, protected lanes); the city adds ~55 km of painted lanes
and ~50 km of designated routes OSM lacks, plus shoulders; OSM's "protected" is looser on paths.
Winter: SNOWROUTE codes undocumented — on-street E/R/F + tier 1–3 (e.g. "E1, R1, F1"), off-street
T1–T3/TL1–TL2 (52 km of 136 km MUP tiered, 70 Unknown). The web app's winter filter uses
RP/RS/RC (small/medium/large storm), which match nothing in current data — find the key before
building a winter toggle.
- 2026-11-19 Lucas: winter toggle dropped (not MVP). Hybrid adopted: OSM stays the street graph,
  city facility types fill in what OSM leaves blank (`city_facilities.py`, called from
  `route_test.prepare(g, city_dir)`; `export_site_data.py` passes `<work>/city`). Rules: untagged
  street (or only cycleway=shoulder) along city lane/shoulder -> painted, along city protected lane
  -> protected; untagged path along city MUP / OSMP bike trail -> protected; edge needs >=50% of its
  length matched; OSM direction-specific tags win (no downgrades). Directed-edge km filled:
  busy->painted 24.5, quiet->painted 10.4, path->protected 42.9, street->protected 6.0.
  network.json painted layer = OSM painted + city-filled (1638 -> 1989 features). Test pairs: mean
  protected share +1.6–3.2 pts per profile, South Boulder routes +5–10 pts. Not changed: the
  "protected" network BikeNetKit (Grow/Link/Fix) runs on — still OSM-only.
- 2026-11-19 (later) Lucas decisions, superseding the fill-in rules above:
  - **City is the default classification** where it has data, OSM elsewhere (`city_facilities.py`
    rewritten: direction-aware — city on-street lines are one per side, ONEWAY FT = direction of
    travel; city bicycles=No removes the edge, e.g. downtown sidewalks). The city's data does record
    direction (Table Mesa: lane one way, designated route the other) — earlier claim it didn't was wrong.
  - **No riding against traffic**: contraflow edges kept only with an actual contraflow lane
    (13 of 24 kept: Pleasant St, Grove St).
  - New class **"shared path/sidewalk"** (city ped path / sidewalk with bikes allowed; OSM footway or
    non-designated path with bike access). Lucas: protected-ish but a rider preference. Route mode:
    "Where bikes may use the sidewalk, prefer: The road (default) / The sidewalk"; road prices
    shared like an untagged path, sidewalk like protected. Note under the breakdown shows km on them.
    City allows bikes on 807 km of sidewalk (all but downtown), so this matters.
  - 30th & Walnut: city has both the painted lane (per side) and the 12 ft 30th St Path (MUP,
    protected); route style picks.
  - **Tools get our network** (`build_tool_networks.py` -> `data/networks/<baseline>/`): Grow/Link
    via import_files bike_network, Fix via a street_network with tags rewritten (baseline edges ->
    highway=cycleway, others lose bike tags, living_street -> residential). Baselines: `bike`
    (protected class only, 196 km) and `shared` (+ shared path/sidewalk, 559 km).
  - **Versions replaced**: v0 (tag bug moot with imported networks), v3/v4 (commutes changed little)
    dropped. Runs = baseline x data: bike, bike_crashes, shared, shared_crashes (run dirs under
    `data/boulder_bikenet/`). Grow from scratch reuses old v1/v2 (no existing network); Link only
    per baseline. Page Advanced: "What counts as protected today" + "Data fed to the tools".
    Folsom example (why sidewalks can't be default): riders use the lane; with sidewalks counted the
    tools see the corridor as covered.
  - Shared-baseline Fix: 1.33M candidate gaps (vs ~4k) — every sidewalk end is a contact node.
- 2026-11-20 Lucas: the city bike guide says sidewalk riding is legal only in residential and park
  zones, never in the Downtown / Hill dismount zones (multi-use paths exempt). `city_facilities.py`
  now marks bikes-allowed Sidewalk / Plaza Path as no bikes when their nearest zoning within 40 m
  (by length, 10 m pieces) is B* / DT* / I* / MU* (89 km), plus any bikes-allowed walking path
  mostly inside a dismount zone (0.7 km; city already has 7.8 km of sidewalk there as bicycles=No).
  Sidewalks with no zoning within 40 m (~77 km) keep the city's flag (Lucas). Fetch layers `zoning`
  (plan/ZoningDistricts/0) and `dismount` (trans/DismountZones/0). Shared baseline now 504 km.
- 2026-11-20 Lucas: **Fix not run with the shared baseline** (~3 h per run, and gaps mean little
  when nearly every street counts as covered); sidewalks are an advanced turn-on, not a default.
  Runs: shared = link + grow_existing, shared_crashes = grow_existing. Page disables "Close the
  worst gaps" there (picking sidewalks while on Fix switches to Extend). The earlier shared
  grow_existing KeyError went away with the rebuilt network. Results 2026-11-20: bike fix 50 /
  link 162 / grow_existing 131; bike_crashes fix 50 / grow_existing 131; shared link 241 /
  grow_existing ~219 edges; shared_crashes grow_existing 117 rows. Site data regenerated, page
  test passes.
- 2026-11-20 Lucas: **OSM decides what exists, the city only labels.** Bug: Broadway Path was split
  at 13th St because a 6.6 m OSM cycleway piece matched a commercial-zone city sidewalk (no bikes)
  and was deleted, forcing routes onto Broadway. Now nothing city-derived removes an edge: no bikes
  -> new route class **"dismount"** (walk the bike, 3.5x length in every profile, brown, note with
  metres walked). OSM bicycle=no/dismount also -> dismount (were dropped). Still dropped: EXCLUDE_HW,
  access=private/no without bike permission, and bicycle=no/dismount with foot=no (foot=no alone is
  common on bikeable roads, e.g. Broadway). `foot` added to kept/simplify tags -> graph cache v4.
  Known quirk, accepted by Lucas ("people bike there anyway"): that 6.6 m piece is labelled dismount
  because short edges can match the nearest sidewalk over a 0.4 m-away MUP (piece-midpoint matching).

## OSM only (2026-11-22), supersedes the city-as-default rules above
- Trigger: 13th St downtown showed "quiet street" though it has a southbound contraflow lane. OSM
  and the city both had it (OSM: street `cycleway:left=separate` + a one-way `highway=cycleway`
  way 534549768 / 416472796; city: on-street "Contra Flow Bike Lane"). Our join compared OSM paths
  only to the city's off-street layer, so the lane matched a no-bikes downtown sidewalk -> dismount.
- Measured: only 1.9 km of street is tagged `cycleway:*=separate` (Baseline, 13th, Folsom), but
  ~31 km of OSM cycleways sit within 15 m of a city lane. Rules tried (scratch scripts, not kept):
  "city walk features never label OSM bike ways" flips 60 km shared->protected (undoes city-wins);
  "nearest city line from either layer" lets ~9 km of plain sidewalks become lanes; best was
  "city path first, then nearer of lane / sidewalk, for OSM bike ways only" (13.6 km changes).
- Lucas: no one-off judgement calls; connectivity tool, not trip planner; re-runs must stay simple.
  Chose **OSM only**; corrections go to OSM, not our pipeline. `export_site_data.py` and
  `build_tool_networks.py` call `rt.prepare(g)` with no city dir. `city_facilities.py`,
  `fetch_city_inventory.py`, `compare_city_inventory.py` kept (unused by the build; compare is the
  starting point if a city-vs-OSM disagreement list for mappers is ever wanted).
- What OSM-only loses (directed km, OSM vs city-hybrid): painted 167 vs 244, shared path/sidewalk
  120 vs 657 (OSM is silent on bikes for ~850 km of sidewalk; city zoning/dismount-zone sidewalk
  rules gone), protected 433 vs 438 (same size, ~60 km swapped each way). Tool baselines: bike
  196 -> 202 km, shared 504 -> 255 km. Attribution keeps "City of Boulder" (crash layer).
- Page: the click card (Street View) has an OSM section: "See the data" (openstreetmap.org/query
  at the spot: the ways and tags behind the class), "Leave a note" (note/new); no Edit link (the OSM page has one). `osm.ts`.
- GrowBikeNet KeyError `(u, v) not in index` (seen before on the shared network, "went away" on a
  rebuild): GrowBikeNet looks edges up as (u, v, 0), and `build_tool_networks.py` numbered parallel
  edges before filtering, so a pair whose key-0 twin wasn't in the baseline kept only key 1 (3 pairs
  OSM-only, e.g. Boulder Creek Path 388008322-12569138455). `save()` now renumbers keys from 0.

- 2026-11-23 Lucas: **commutes map layer removed** ("looks weird", and v3/v4 showed LODES commutes changed little for the tools). Dropped from the page (layer toggle, types, style) and from `export_site_data.py`; `network.json` stripped of `commutes`/`commute_total` (-35 KB). `lodes_trips.csv` and `build_commute_proto.py` (routing prototype, unrelated to LODES) stay.

## Plan-on-your-route, agreement view, US units (2026-11-23, uncommitted)
- Lucas: start from a user's route and show where the methods would change it; keep the network tab
  for exploration. Units are miles / feet everywhere (helpers `fmtLen`, `fmtMi`, `rideMin`, 10 mph).
- **Plan edges**: the tools' node ids don't match our graph (they re-index), so `export_site_data.plan_edges`
  matches by geometry: a graph edge counts when >= 70% of it is within 8 m of a recommendation line.
  Stored as `graph.json` `plan` (parallel to `network.json` `geoms`). Median matched length 1.2x the line
  (parallel side paths); 8 of 779 lines (all < 60 m) match nothing. `proto.export(g, index)` now fills
  (u, v, key) -> packed edge id.
- Route mode "Today / With the plan built": plan = the network view's method (+ slider for Grow) applied
  as protected edges (cost = min(today, protected); one-ways stay one-way). Panel shows Today vs Plan
  bars, off-road and busy-street shares, recs ridden on, and `improvesAt` = fewest recs that lower the
  route cost > 0.5% (binary search: cost only falls as recs are added). Grow: "It gets better at X mi
  of build order. Show that" jumps the slider. Map: new links green, today's route dashed black,
  plan's links faint green.
- Example rides (Extend, first 19 mi): North Boulder -> CU 60% -> 96% off road (first helps at 6.5 mi);
  South Boulder -> Pearl unchanged until 36.5 mi; East Boulder -> Pearl 85% -> 9x%.
- **Agreement** ("Where the methods agree", tool id `agree`, `export_site_data.agreement`): graph edges
  picked by >= 2 of Extend / Fix / Link (full outputs), joined into stretches >= 50 m. bike: 6 stretches
  all 3 agree (1.2 mi; 13th St / Mapleton, Kalmia / 19th, Folsom, Eisenhower...), 57 with two (~12 mi).
  Shared versions compare 2 methods (no Fix). Not made the default view (Extend still is).
- Also: top-10 rank badges on the network map, slider context ("125.7 mi today, adds 19.6 mi, +16%"),
  "Path, bike access unknown" + OSM note invite, sidewalk/dismount notes in feet with a 50 m floor,
  styles-tie note, LODES dropped from attribution, list numbers aligned on wrapped names.
- Tests: `tests/bikenet-plan-check.mjs` (new) + `tests/bikenet-page-check.mjs`, both pass, no errors.
