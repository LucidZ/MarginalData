#!/usr/bin/env python3
"""
Fetch US population data from Census International Database API
Downloads population by single year of age and sex for years 1950-2100
"""

import requests
import json
import time
from typing import List, Dict

def fetch_year_data(year: int) -> List[Dict]:
    """Fetch population data for a specific year"""
    base_url = "https://api.census.gov/data/timeseries/idb/1year"

    # Fetch males
    params_male = {
        "get": "NAME,AGE,POP,YR",
        "for": "genc standard countries and areas:US",
        "time": str(year),
        "SEX": "1"
    }

    # Fetch females
    params_female = {
        "get": "NAME,AGE,POP,YR",
        "for": "genc standard countries and areas:US",
        "time": str(year),
        "SEX": "2"
    }

    print(f"Fetching data for year {year}...", end=" ", flush=True)

    try:
        # Get male data
        response_male = requests.get(base_url, params=params_male, timeout=30)
        response_male.raise_for_status()
        data_male = response_male.json()

        # Small delay to avoid rate limiting
        time.sleep(0.1)

        # Get female data
        response_female = requests.get(base_url, params=params_female, timeout=30)
        response_female.raise_for_status()
        data_female = response_female.json()

        # Process the data
        # First row is headers, rest is data
        rows_male = data_male[1:]  # Skip header
        rows_female = data_female[1:]  # Skip header

        # Create dictionary for fast lookup
        year_data = {}

        # Process males
        for row in rows_male:
            age = int(row[1])  # AGE column
            year_data[age] = {
                "year": year,
                "age": age,
                "male": int(row[2]),  # POP column
                "female": 0
            }

        # Add female data
        for row in rows_female:
            age = int(row[1])
            female_pop = int(row[2])

            if age in year_data:
                year_data[age]["female"] = female_pop
            else:
                year_data[age] = {
                    "year": year,
                    "age": age,
                    "male": 0,
                    "female": female_pop
                }

        # Convert to list sorted by age
        result = [year_data[age] for age in sorted(year_data.keys())]

        print(f"✓ ({len(result)} age groups)")
        return result

    except Exception as e:
        print(f"✗ Error: {e}")
        return []

def main():
    """Fetch all years and save to JSON"""
    all_data = []

    # Fetch data for each year from 1950 to 2100
    years = list(range(1950, 2101))

    print(f"Fetching US population data for {len(years)} years (1950-2100)...")
    print("="*70)

    for year in years:
        year_data = fetch_year_data(year)
        all_data.extend(year_data)

        # Add a longer delay every 10 requests to be nice to the API
        if year % 10 == 0:
            time.sleep(0.5)

    # Save to JSON
    output_file = "../src/2025/PopulationPyramid/data/us_population.json"

    print("="*70)
    print(f"Saving {len(all_data)} records to {output_file}...")

    with open(output_file, 'w') as f:
        json.dump(all_data, f, indent=2)

    print("Done!")

    # Print summary statistics
    print(f"\nSummary:")
    total_years = len(set(d['year'] for d in all_data))
    total_ages = len(set(d['age'] for d in all_data if d['year'] == 2020))

    print(f"  Years: {min(d['year'] for d in all_data)} - {max(d['year'] for d in all_data)} ({total_years} years)")
    print(f"  Ages: {min(d['age'] for d in all_data)} - {max(d['age'] for d in all_data)} ({total_ages} age groups)")
    print(f"  Total records: {len(all_data):,}")

    # Calculate 2020 totals
    data_2020 = [d for d in all_data if d['year'] == 2020]
    male_2020 = sum(d['male'] for d in data_2020)
    female_2020 = sum(d['female'] for d in data_2020)

    print(f"\n  2020 Population:")
    print(f"    Male: {male_2020:,}")
    print(f"    Female: {female_2020:,}")
    print(f"    Total: {male_2020 + female_2020:,}")

if __name__ == "__main__":
    main()
