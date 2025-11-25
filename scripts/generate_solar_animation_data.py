#!/usr/bin/env python3
"""
Generate Solar Animation Data for D3/React Visualization

This script processes CAISO solar generation data for 2024 and creates
an optimized JSON file for the interactive solar animation visualization.

Output structure:
- daily_totals: Daily MWh production for year overview chart
- intraday_curves: 5-minute interval data for daily curve chart
- key_dates: Notable dates (solstices, peak/min generation) with commentary

Usage:
    python scripts/generate_solar_animation_data.py
"""

import pandas as pd
import numpy as np
import json
import os
import sys
from pathlib import Path

# Ensure we're running from project root
project_root = Path(__file__).parent.parent
os.chdir(project_root)

def load_caiso_data():
    """Load and prepare CAISO fuel mix data for 2024."""
    DATA_DIR = 'data/raw'
    cache_file = f'{DATA_DIR}/solar_fuel_mix_2024-01-01_2025-01-01.csv'

    if not os.path.exists(cache_file):
        print(f"❌ Error: Cache file not found: {cache_file}")
        print("Please run the data fetching notebook first.")
        sys.exit(1)

    print("Loading CAISO data...")
    fuel_mix = pd.read_csv(cache_file, parse_dates=['Time'])
    fuel_mix['Time'] = pd.to_datetime(fuel_mix['Time'], utc=True)
    fuel_mix = fuel_mix[fuel_mix['Time'].dt.year == 2024]

    # Convert to Pacific Time
    fuel_mix['Time_Local'] = fuel_mix['Time'].dt.tz_convert('America/Los_Angeles')
    fuel_mix['Date'] = fuel_mix['Time_Local'].dt.date
    fuel_mix['Minute_of_Day'] = fuel_mix['Time_Local'].dt.hour * 60 + fuel_mix['Time_Local'].dt.minute

    print(f"✓ Loaded {len(fuel_mix)} rows for 2024")
    return fuel_mix

def calculate_daily_totals(fuel_mix):
    """Calculate daily total MWh for each day."""
    print("Calculating daily totals...")
    daily_totals = fuel_mix.groupby('Date').agg({
        'Solar': lambda x: (x * (5/60)).sum()  # Convert MW to MWh (5-min intervals)
    }).reset_index()
    daily_totals.columns = ['date', 'total_mwh']
    daily_totals['day_index'] = range(len(daily_totals))
    daily_totals['date'] = daily_totals['date'].astype(str)

    print(f"✓ Calculated totals for {len(daily_totals)} days")
    return daily_totals

def build_intraday_curves(fuel_mix, daily_totals):
    """Build 5-minute resolution curves for each day."""
    print("Building intraday curves...")
    intraday_curves = {}

    for date in daily_totals['date']:
        date_obj = pd.to_datetime(date).date()
        day_data = fuel_mix[fuel_mix['Date'] == date_obj].copy()

        # Create curve data
        curve = day_data[['Minute_of_Day', 'Solar']].copy()
        curve.columns = ['minute_of_day', 'mw']

        intraday_curves[date] = curve.to_dict('records')

    print(f"✓ Built curves for {len(intraday_curves)} days")
    return intraday_curves

def identify_key_dates(daily_totals):
    """Identify notable dates with commentary."""
    # Find peak and minimum generation days
    peak_day = daily_totals.loc[daily_totals['total_mwh'].idxmax()]
    min_day = daily_totals.loc[daily_totals['total_mwh'].idxmin()]

    print(f"\n📊 Key dates identified:")
    print(f"  Peak generation: {peak_day['date']} - {peak_day['total_mwh']:.0f} MWh")
    print(f"  Min generation: {min_day['date']} - {min_day['total_mwh']:.0f} MWh")

    # Define key dates with commentary
    key_dates = [
        {
            "date": "2024-06-21",
            "label": "Summer Solstice",
            "commentary": "Longest day of the year. Solar panels generate power for over 14 hours, with peak generation around 1 PM Pacific Time."
        },
        {
            "date": peak_day['date'],
            "label": "Peak Generation Day",
            "commentary": f"Highest daily solar generation of 2024: {peak_day['total_mwh']:.0f} MWh. Clear skies and long summer days combine for maximum output."
        },
        {
            "date": "2024-12-21",
            "label": "Winter Solstice",
            "commentary": "Shortest day of the year. Solar generation drops dramatically - less than 10 hours of useful sunlight and lower sun angle reduces efficiency."
        },
        {
            "date": min_day['date'],
            "label": "Minimum Generation Day",
            "commentary": f"Lowest daily solar generation of 2024: {min_day['total_mwh']:.0f} MWh. Weather conditions like clouds and rain can significantly impact solar output, even more than seasonal variations."
        }
    ]

    return key_dates

def write_output(data, output_path):
    """Write JSON data to file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    print(f"\nWriting to {output_path}...")
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)

    file_size = os.path.getsize(output_path)
    print(f"✓ File written: {file_size / 1024 / 1024:.2f} MB")

    return file_size

def print_sample_output(data):
    """Print sample of generated data for verification."""
    print("\n📊 Sample daily_totals (first 3 days):")
    for record in data['daily_totals'][:3]:
        print(f"  {record}")

    print("\n📊 Sample intraday curve for 2024-06-21 (first 5 points):")
    sample_date = '2024-06-21'
    if sample_date in data['intraday_curves']:
        for record in data['intraday_curves'][sample_date][:5]:
            print(f"  {record}")

    print("\n📊 Key dates:")
    for key_date in data['key_dates']:
        print(f"  {key_date['date']}: {key_date['label']}")

def main():
    """Main execution function."""
    print("=" * 60)
    print("Solar Animation Data Generator")
    print("=" * 60)

    # Load data
    fuel_mix = load_caiso_data()

    # Calculate daily totals
    daily_totals = calculate_daily_totals(fuel_mix)

    # Build intraday curves
    intraday_curves = build_intraday_curves(fuel_mix, daily_totals)

    # Identify key dates
    key_dates = identify_key_dates(daily_totals)

    # Build final JSON structure
    output_data = {
        "metadata": {
            "year": 2024,
            "total_days": len(daily_totals),
            "interval_minutes": 5,
            "is_leap_year": True
        },
        "daily_totals": daily_totals.to_dict('records'),
        "intraday_curves": intraday_curves,
        "key_dates": key_dates
    }

    # Write output
    output_path = 'public/data/solar_animation_2024.json'
    write_output(output_data, output_path)

    # Print sample
    print_sample_output(output_data)

    print("\n" + "=" * 60)
    print("✓ Data generation complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
