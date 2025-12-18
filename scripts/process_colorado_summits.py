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
from typing import List, Dict, Any

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

def get_elevation_batch(coordinates: List[tuple]) -> List[float]:
    """
    Fetch elevations for a batch of coordinates using Open-Elevation API.
    Returns elevations in meters.
    """
    if not coordinates:
        return []

    # Open-Elevation API expects locations in format: {"latitude": lat, "longitude": lon}
    locations = [{"latitude": lat, "longitude": lon} for lat, lon in coordinates]

    try:
        response = requests.post(
            'https://api.open-elevation.com/api/v1/lookup',
            json={"locations": locations},
            timeout=30
        )
        response.raise_for_status()
        results = response.json()['results']
        return [r['elevation'] for r in results]
    except Exception as e:
        print(f"Error fetching elevations: {e}")
        return [None] * len(coordinates)

def process_summits(input_file: Path, output_file: Path, batch_size: int = 100):
    """
    Process USGS data to extract summits and enrich with elevation data.
    """
    summits = []

    print(f"Reading USGS data from {input_file}")

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

    print(f"Found {len(summits)} summits")
    print("Fetching elevations...")

    # Fetch elevations in batches
    for i in range(0, len(summits), batch_size):
        batch = summits[i:i + batch_size]
        coordinates = [(s['lat'], s['lon']) for s in batch]

        elevations = get_elevation_batch(coordinates)

        for summit, elevation in zip(batch, elevations):
            summit['elevation_meters'] = elevation
            summit['elevation_feet'] = round(elevation * 3.28084) if elevation else None

        print(f"Processed {min(i + batch_size, len(summits))}/{len(summits)} summits")

        # Be nice to the API
        if i + batch_size < len(summits):
            time.sleep(1)

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

    print(f"\nWrote {len(features)} summits to {output_file}")

    # Print some statistics
    elevations = [f['properties']['elevation'] for f in features]
    print(f"\nStatistics:")
    print(f"  Min elevation: {min(elevations)} ft")
    print(f"  Max elevation: {max(elevations)} ft")
    print(f"  Summits over 13,000 ft: {sum(1 for e in elevations if e >= 13000)}")
    print(f"  Summits over 14,000 ft: {sum(1 for e in elevations if e >= 14000)}")

if __name__ == '__main__':
    input_file = Path('data/raw/DomesticNames_CO.txt')
    output_file = Path('src/2025/HowMany13ers/data/all-colorado-summits.json')

    process_summits(input_file, output_file)
