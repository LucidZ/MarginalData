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
python -I scripts/boulder_bikenet/route_test.py $W $W/routing           # builds routing/boulder-street-graph-v3.graphml
python -I scripts/boulder_bikenet/build_commute_proto.py $W $W/routing/commute-proto.html
(cd <tmp> && python -I .../audit_osm_tagging.py $W/routing/boulder-street-graph-v3.graphml \
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
