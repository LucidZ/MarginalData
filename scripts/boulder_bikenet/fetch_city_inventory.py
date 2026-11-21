"""Download the City of Boulder's own bike facility inventory (the layers behind the city's
Bike Map web app, experience.arcgis.com/.../7654aa43144b4406bd803c7c332ca13a) as GeoJSON.

Writes <out_dir>/city_<name>.geojson for each layer below, in EPSG:4326.

Usage:
    python -I fetch_city_inventory.py <out_dir> [layer ...]   (default: all)
"""

import json
import os
import sys

import requests

BASE = "https://gis.bouldercolorado.gov"
LAYERS = {
    # Full on-street inventory (bike lanes, buffered/protected, shared lanes, ...).
    "onstreet": "ags_svr3/rest/services/trans/BikePedALL/MapServer/1",
    # Full off-street inventory (multi-use paths, sidewalks, connectors, ...).
    "offstreet": "ags_svr3/rest/services/trans/BikePedALL/MapServer/0",
    "osmp_trails": "ags_svr2/rest/services/osmp/TrailsNEW/MapServer/4",
    "city_limits": "ags_svr1/rest/services/plan/CityLimits/MapServer/0",
    # Sidewalk riding is only legal in residential and park zones (city bike guide)
    "zoning": "ags_svr1/rest/services/plan/ZoningDistricts/MapServer/0",
    "dismount": "ags_svr3/rest/services/trans/DismountZones/MapServer/0",
}
PAGE = 1000


def fetch(path):
    url = f"{BASE}/{path}/query"
    ids = requests.get(url, params={"where": "1=1", "returnIdsOnly": "true", "f": "json"},
                       timeout=60).json()["objectIds"]
    ids.sort()
    feats = []
    for i in range(0, len(ids), PAGE):
        r = requests.post(url, data={"objectIds": ",".join(map(str, ids[i:i + PAGE])),
                                     "outFields": "*", "outSR": 4326, "f": "geojson"}, timeout=120)
        r.raise_for_status()
        feats += r.json()["features"]
    return {"type": "FeatureCollection", "features": feats}


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    for name, path in LAYERS.items():
        if sys.argv[2:] and name not in sys.argv[2:]:
            continue
        fc = fetch(path)
        with open(os.path.join(out, f"city_{name}.geojson"), "w") as f:
            json.dump(fc, f)
        print(f"{name}: {len(fc['features'])} features")


if __name__ == "__main__":
    main()
