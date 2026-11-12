"""Fetch bike-involved crashes from the City of Boulder open data Crash feature service
(Boulder PD reports, city only, 2017+) and write them as BikeNetKit point_data.

Usage:
    python -I fetch_crashes.py <out_dir>

Writes <out_dir>/crashes_bike_raw.geojson (as served) and <out_dir>/crashes_bike.gpkg
(EPSG:4326 points, num = 1 per crash, plus year/severity for display).
"""

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import geopandas as gpd

SERVICE = "https://services.arcgis.com/ePKBjXrBZ2vEEgWd/arcgis/rest/services/Crash/FeatureServer/0/query"
FIELDS = ["CaseNumber", "ReportedYear", "Severity", "NumSeriouslyInjured", "NumKilled",
          "PrmaryCollsionType", "Lat", "Lon"]
PAGE = 2000


def fetch_all():
    features, offset = [], 0
    while True:
        params = {
            "where": "BicyclesInvolved='YES'",
            "outFields": ",".join(FIELDS),
            "outSR": 4326,
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": PAGE,
            "orderByFields": "ESRI_OID",
        }
        with urllib.request.urlopen(f"{SERVICE}?{urllib.parse.urlencode(params)}") as r:
            page = json.load(r)
        features += page["features"]
        if len(page["features"]) < PAGE:
            return {"type": "FeatureCollection", "features": features}
        offset += PAGE


def main(out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    fc = fetch_all()
    (out_dir / "crashes_bike_raw.geojson").write_text(json.dumps(fc))

    gdf = gpd.GeoDataFrame.from_features(fc["features"], crs=4326)
    n_raw = len(gdf)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    # Drop points far outside Boulder (bad geocodes)
    gdf = gdf.cx[-105.40:-105.10, 39.90:40.15]
    gdf["num"] = 1
    gdf.to_file(out_dir / "crashes_bike.gpkg")
    print(f"{n_raw} bike crashes fetched, {len(gdf)} kept with valid in-area geometry")
    print(gdf.groupby("ReportedYear").size().to_string())


if __name__ == "__main__":
    main(sys.argv[1])
