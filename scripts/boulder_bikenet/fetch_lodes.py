"""Build BikeNetKit trip_data for Boulder from Census LODES8 home->work commute flows.

Keeps block pairs where both home and work blocks lie inside the Boulder city boundary
(intra-city commutes; in-commuters from outside are dropped, as BikeNetKit's 500 m snap to
seed points would drop them anyway). All jobs (JT00), all modes.

Usage:
    python -I fetch_lodes.py <out_dir> <boundary.gpkg> [year]

Writes <out_dir>/lodes_trips.csv with o_lat,o_lon,d_lat,d_lon,num (+ straight-line km).
"""

import sys
import urllib.request
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

BASE = "https://lehd.ces.census.gov/data/lodes/LODES8/co"


def download(url, path):
    if not path.exists():
        print("downloading", url, flush=True)
        urllib.request.urlretrieve(url, path)
    return path


def main(out_dir, boundary_path, year="2024"):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    od_path = download(f"{BASE}/od/co_od_main_JT00_{year}.csv.gz", out_dir / f"co_od_main_JT00_{year}.csv.gz")
    xw_path = download(f"{BASE}/co_xwalk.csv.gz", out_dir / "co_xwalk.csv.gz")

    xw = pd.read_csv(xw_path, usecols=["tabblk2020", "blklatdd", "blklondd"], dtype={"tabblk2020": str})
    boundary = gpd.read_file(boundary_path, layer="City boundary").to_crs(4326).geometry.iloc[0]
    pts = gpd.GeoDataFrame(xw, geometry=gpd.points_from_xy(xw.blklondd, xw.blklatdd), crs=4326)
    # Cheap bbox prefilter, then exact containment
    minx, miny, maxx, maxy = boundary.bounds
    pts = pts.cx[minx:maxx, miny:maxy]
    inside = pts[pts.within(boundary)].set_index("tabblk2020")[["blklatdd", "blklondd"]]
    print(f"{len(inside)} census blocks inside Boulder boundary")

    od = pd.read_csv(od_path, usecols=["w_geocode", "h_geocode", "S000"], dtype={"w_geocode": str, "h_geocode": str})
    total_jobs_in_boulder = od[od.w_geocode.isin(inside.index)].S000.sum()
    od = od[od.h_geocode.isin(inside.index) & od.w_geocode.isin(inside.index) & (od.h_geocode != od.w_geocode)]

    trips = pd.DataFrame({
        "o_lat": inside.loc[od.h_geocode, "blklatdd"].values,
        "o_lon": inside.loc[od.h_geocode, "blklondd"].values,
        "d_lat": inside.loc[od.w_geocode, "blklatdd"].values,
        "d_lon": inside.loc[od.w_geocode, "blklondd"].values,
        "num": od.S000.values,
    })
    lat0 = np.radians(40.015)
    trips["km"] = np.hypot((trips.d_lat - trips.o_lat) * 111.2,
                           (trips.d_lon - trips.o_lon) * 111.2 * np.cos(lat0)).round(2)
    trips.to_csv(out_dir / "lodes_trips.csv", index=False)

    print(f"LODES {year}: {total_jobs_in_boulder:,} jobs located in Boulder (state residents)")
    print(f"intra-Boulder commutes kept: {trips.num.sum():,} workers across {len(trips):,} block pairs "
          f"({trips.num.sum() / total_jobs_in_boulder:.0%} of Boulder jobs)")
    print("straight-line km quantiles (worker-weighted):",
          np.round(np.quantile(np.repeat(trips.km, trips.num), [0.25, 0.5, 0.75, 0.9]), 1))


if __name__ == "__main__":
    main(*sys.argv[1:])
