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
python -I scripts/boulder_bikenet/audit_osm_tagging.py   # from $W/audit/.. writes ./results
python -I scripts/boulder_bikenet/build_preview_map.py $W $W/audit $W/boulder-versions.html
```
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
- [ ] verify top gaps on the ground / imagery
- [ ] next experiment: real-destination seed points (CU, Pearl, schools, transit) as a new axis
- [ ] decide whether to report the bikenetlib tag bug upstream (ask Lucas first)
