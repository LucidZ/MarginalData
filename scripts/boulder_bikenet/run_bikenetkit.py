"""Run BikeNetKit's GrowBikeNet, LinkBikeNet and FixBikeNet on Boulder, CO for one run.
Outputs land in ./results of the working directory.

Runs (2026-11-19, see .claude/boulder-bikenet-spec.md) = what counts as protected x data:
    bike            bike facilities only, no data
    bike_crashes    bike facilities only, bike crashes as point_data (Grow, Fix)
    shared          + sidewalks where bikes are allowed, no data
    shared_crashes  + sidewalks, crashes
The existing network comes from build_tool_networks.py (<data_dir>/networks/<baseline>/), not from
OSM tags. Link doesn't take crashes, so it runs only in bike and shared. Grow from scratch
doesn't use the existing network: its results are the old v1 (no data) / v2 (crashes) runs.

Old versions v0-v4 (stock / default / crashes / commutes / crashes+commutes, all reading OSM
tags) are in git history before this change; v3/v4 were dropped as commutes barely changed
anything, v0 because the tag bug it showed can't affect imported networks.

Usage (from an empty output dir, with a py3.12 env that has the three packages):
    python -I /path/to/run_bikenetkit.py <run> <data_dir> [tool,tool]   (default: all of the run's tools)
"""

import sys
import time

import osmnx as ox

RUN = sys.argv[1] if len(sys.argv) > 1 else "bike"
BASELINE = RUN.split("_")[0]
DATA_DIR = (sys.argv[2].rstrip("/") + "/") if len(sys.argv) > 2 else "./"

# Workaround for a bikenetlib bug (osm.py calls useful_tags_way.extend(tag) on a string,
# adding single characters). Without these tags kept on download, path/footway +
# bicycle=designated and cycleway=track never get flagged as protected infra.
for tag in ["highway", "cycleway", "bicycle", "cycleway:right", "cycleway:left", "cycleway:both",
            "cyclestreet", "bicycle_road", "access", "area", "service", "motor_vehicle", "motorcar"]:
    if tag not in ox.settings.useful_tags_way:
        ox.settings.useful_tags_way.append(tag)

import fixbikenet as fbn  # noqa: E402
import growbikenet as gbn  # noqa: E402
import linkbikenet as lbn  # noqa: E402

CITY = "Boulder, Colorado, USA"
CITY_ID = "boulder"
CRASHES = "crashes_bike.gpkg"
CRASH_RUNS = {"bike_crashes", "shared_crashes"}
BIKE_NETWORK = f"networks/{BASELINE}/bike_network.gpkg"
FIX_STREETS = f"networks/{BASELINE}/fix_streets.gpkg"
LINK_STREETS = f"networks/{BASELINE}/link_streets.gpkg"

for settings in (gbn.settings, fbn.settings, lbn.settings):
    settings.import_path = DATA_DIR
# Match FixBikeNet's 100 m default; GrowBikeNet's 500 m default credits crashes to links
# several blocks away
gbn.settings.import_point_data_snap_distance = 100


def crash_files():
    return {"point_data": CRASHES} if RUN in CRASH_RUNS else {}


def run_grow_existing():
    # Extend the existing protected network rather than growing from scratch
    return gbn.growbikenet(CITY, city_id=CITY_ID, existing_network_spacing="auto",
                           import_files={**crash_files(), "bike_network": BIKE_NETWORK})


def run_link():
    # 'largest_to_closest' (the default) crashes on Boulder when a component has no street
    # route to the main network (path is None in get_underway_connections)
    return lbn.linkbikenet(CITY, city_id=CITY_ID, link_strategy="largest_to_second",
                           import_files={"bike_network": BIKE_NETWORK, "street_network": LINK_STREETS})


def run_fix():
    return fbn.fixbikenet(CITY, city_id=CITY_ID, export_plot=True,
                          import_files={**crash_files(), "street_network": FIX_STREETS})


TOOLS_BY_RUN = {
    "bike": ["fix", "link", "grow_existing"],
    "bike_crashes": ["fix", "grow_existing"],
    "shared": ["link", "grow_existing"],
    "shared_crashes": ["grow_existing"],
}
TOOLS = {"grow_existing": run_grow_existing, "link": run_link, "fix": run_fix}

if __name__ == "__main__":
    print(f"### {RUN}: data_dir={DATA_DIR} baseline={BASELINE} crashes={bool(crash_files())}", flush=True)
    for name in sys.argv[3].split(",") if len(sys.argv) > 3 else TOOLS_BY_RUN[RUN]:
        t0 = time.time()
        print(f"=== {name}", flush=True)
        try:
            out = TOOLS[name]()
            print(f"=== {name} done in {time.time() - t0:.0f}s, {len(out)} rows", flush=True)
        except Exception as e:
            print(f"=== {name} FAILED after {time.time() - t0:.0f}s: {e!r}", flush=True)
