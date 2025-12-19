#!/usr/bin/env python3
"""
Process USGS Geographic Names data for Colorado summits and fetch elevations.
Creates a GeoJSON file with all summit data.
"""

import csv
import json
import time
import requests
from pathlib import Path

def parse_dms_to_decimal(dms: str) -> float:
    """
    Convert DMS (Degrees Minutes Seconds) to decimal degrees.
    Format: DDMMSSN or DDDMMSSW
    """
    if not dms or dms == '0.0':
        return None

    # Remove direction letter
    direction = dms[-1]
    dms = dms[:-1]

    # Parse based on length
    if len(dms) == 6:  # DDMMSS
        degrees = int(dms[0:2])
        minutes = int(dms[2:4])
        seconds = int(dms[4:6])
    elif len(dms) == 7:  # DDDMMSS
        degrees = int(dms[0:3])
        minutes = int(dms[3:5])
        seconds = int(dms[5:7])
    else:
        return None

    decimal = degrees + minutes/60 + seconds/3600

    # Make negative for West and South
    if direction in ['W', 'S']:
        decimal = -decimal

    return decimal

def get_elevation_usgs(lat: float, lon: float) -> float:
    """
    Fetch elevation for a single coordinate using USGS Elevation Point Query Service.
    Returns elevation in feet. This uses high-resolution 1/3 arc-second data.
    """
    try:
        response = requests.get(
            'https://epqs.nationalmap.gov/v1/json',
            params={
                'x': lon,
                'y': lat,
                'units': 'Feet',
                'wkid': 4326,
                'includeDate': False
            },
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        return result['value']
    except Exception as e:
        print(f"Error fetching elevation for {lat}, {lon}: {e}")
        return None

def process_summits(input_file: Path, output_file: Path):
    """
    Process USGS data to extract summits and enrich with elevation data.
    """
    summits = []

    print(f"Reading USGS data from {input_file}", flush=True)

    # Read the pipe-delimited file
    with open(input_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter='|')

        for row in reader:
            # Filter for summits only
            if row['feature_class'] != 'Summit':
                continue

            # Get coordinates
            lat = float(row['prim_lat_dec']) if row['prim_lat_dec'] else None
            lon = float(row['prim_long_dec']) if row['prim_long_dec'] else None

            if lat is None or lon is None:
                continue

            summits.append({
                'name': row['feature_name'],
                'lat': lat,
                'lon': lon,
                'county': row['county_name'],
                'feature_id': row['feature_id'],
                'map_name': row['map_name'],
            })

    print(f"Found {len(summits)} summits", flush=True)
    print("Fetching elevations from USGS (this will take a while)...", flush=True)

    # Fetch elevations one at a time from USGS
    for i, summit in enumerate(summits):
        elevation_feet = get_elevation_usgs(summit['lat'], summit['lon'])

        if elevation_feet:
            summit['elevation_feet'] = round(elevation_feet)
            summit['elevation_meters'] = round(elevation_feet / 3.28084)
        else:
            summit['elevation_feet'] = None
            summit['elevation_meters'] = None

        # Progress update every 100 summits
        if (i + 1) % 100 == 0:
            print(f"Processed {i + 1}/{len(summits)} summits", flush=True)

        # Be nice to the API - small delay between requests
        time.sleep(0.1)

    # Convert to GeoJSON
    features = []
    for summit in summits:
        if summit['elevation_feet']:
            features.append({
                'type': 'Feature',
                'geometry': {
                    'type': 'Point',
                    'coordinates': [summit['lon'], summit['lat']]
                },
                'properties': {
                    'name': summit['name'],
                    'elevation': summit['elevation_feet'],
                    'elevationMeters': summit['elevation_meters'],
                    'county': summit['county'],
                    'featureId': summit['feature_id'],
                    'mapName': summit['map_name'],
                }
            })

    geojson = {
        'type': 'FeatureCollection',
        'features': features
    }

    # Write output
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with open(output_file, 'w') as f:
        json.dump(geojson, f, indent=2)

    print(f"\nWrote {len(features)} summits to {output_file}", flush=True)

    # Print some statistics
    elevations = [f['properties']['elevation'] for f in features]
    print(f"\nStatistics:", flush=True)
    print(f"  Min elevation: {min(elevations)} ft", flush=True)
    print(f"  Max elevation: {max(elevations)} ft", flush=True)
    print(f"  Summits over 13,000 ft: {sum(1 for e in elevations if e >= 13000)}", flush=True)
    print(f"  Summits over 14,000 ft: {sum(1 for e in elevations if e >= 14000)}", flush=True)

if __name__ == '__main__':
    input_file = Path('data/raw/DomesticNames_CO.txt')
    output_file = Path('src/2025/HowMany13ers/data/all-colorado-summits.json')

    process_summits(input_file, output_file)
