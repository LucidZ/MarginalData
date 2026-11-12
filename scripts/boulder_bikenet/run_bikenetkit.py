"""Run BikeNetKit's GrowBikeNet, LinkBikeNet and FixBikeNet on Boulder, CO for one data
version. Outputs land in ./results of the working directory.

Versions (see .claude/boulder-bikenet-spec.md):
    v0  stock: no data, unpatched OSM tags (reference)
    v1  no data
    v2  bike crashes as point_data            (Grow, Fix)
    v3  LODES commutes as trip_data           (Grow only; Fix has no trip support)
    v4  crashes + commutes                    (Grow; Fix = crashes)

Tools whose inputs don't change vs v1 are skipped (Link in v2-v4, Fix in v3).

Usage (from an empty output dir, with a py3.12 env that has the three packages):
    python -I /path/to/run_bikenetkit.py <version> <data_dir>
"""

import sys
import time

import osmnx as ox

VERSION = sys.argv[1] if len(sys.argv) > 1 else "v1"
DATA_DIR = (sys.argv[2].rstrip("/") + "/") if len(sys.argv) > 2 else "./"

# Workaround for a bikenetlib bug (osm.py calls useful_tags_way.extend(tag) on a string,
# adding single characters). Without these tags kept on download, path/footway +
# bicycle=designated and cycleway=track never get flagged as protected infra.
if VERSION != "v0":
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
TRIPS = "lodes_trips.csv"

POINTS = {"v2": CRASHES, "v4": CRASHES}
TRIP_FILES = {"v3": TRIPS, "v4": TRIPS}

for settings in (gbn.settings, fbn.settings):
    settings.import_path = DATA_DIR
# Match FixBikeNet's 100 m default; GrowBikeNet's 500 m default credits crashes to links
# several blocks away
gbn.settings.import_point_data_snap_distance = 100


def grow_files():
    files = {}
    if VERSION in POINTS:
        files["point_data"] = POINTS[VERSION]
    if VERSION in TRIP_FILES:
        files["trip_data"] = TRIP_FILES[VERSION]
    return files


def run_grow():
    return gbn.growbikenet(CITY, city_id=CITY_ID, export_plots=False, import_files=grow_files())


def run_grow_existing():
    # Extend the existing protected network rather than growing from scratch
    return gbn.growbikenet(CITY, city_id=CITY_ID, existing_network_spacing="auto", import_files=grow_files())


def run_link():
    # 'largest_to_closest' (the default) crashes on Boulder when a component has no street
    # route to the main network (path is None in get_underway_connections)
    return lbn.linkbikenet(CITY, city_id=CITY_ID, link_strategy="largest_to_second")


def run_fix():
    files = {"point_data": POINTS[VERSION]} if VERSION in POINTS else {}
    return fbn.fixbikenet(CITY, city_id=CITY_ID, export_plot=True, import_files=files)


TOOLS_BY_VERSION = {
    "v0": ["fix", "link", "grow", "grow_existing"],
    "v1": ["fix", "link", "grow", "grow_existing"],
    "v2": ["fix", "grow", "grow_existing"],
    "v3": ["grow", "grow_existing"],
    "v4": ["fix", "grow", "grow_existing"],
}
TOOLS = {"grow": run_grow, "grow_existing": run_grow_existing, "link": run_link, "fix": run_fix}

if __name__ == "__main__":
    print(f"### {VERSION}: data_dir={DATA_DIR} grow_files={grow_files()}", flush=True)
    for name in TOOLS_BY_VERSION[VERSION]:
        t0 = time.time()
        print(f"=== {name}", flush=True)
        try:
            out = TOOLS[name]()
            print(f"=== {name} done in {time.time() - t0:.0f}s, {len(out)} rows", flush=True)
        except Exception as e:
            print(f"=== {name} FAILED after {time.time() - t0:.0f}s: {e!r}", flush=True)
