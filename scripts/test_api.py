#!/usr/bin/env python3
"""Test the Census API to see if it works"""

import requests

base_url = "https://api.census.gov/data/timeseries/idb/1year"

# Try different parameter formats
test_configs = [
    {
        "name": "Test 1: Using 'for' clause",
        "params": {
            "get": "NAME,AGE,POP,YR",
            "for": "genc standard countries and areas:US",
            "time": "2020",
            "SEX": "1"
        }
    },
    {
        "name": "Test 2: Using time parameter",
        "params": {
            "get": "NAME,AGE,POP",
            "time": "2020",
            "SEX": "1"
        }
    }
]

for config in test_configs:
    print(f"\n{'='*60}")
    print(config["name"])
    print(f"{'='*60}")
    print(f"Params: {config['params']}")

    try:
        response = requests.get(base_url, params=config["params"], timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"URL: {response.url}")

        if response.status_code == 200:
            data = response.json()
            print(f"\nSuccess! Got {len(data)} rows")
            print("\nFirst 5 rows:")
            for i, row in enumerate(data[:5]):
                print(f"  {row}")
            print(f"\nLast 5 rows:")
            for i, row in enumerate(data[-5:]):
                print(f"  {row}")
        else:
            print(f"Error: {response.text}")

    except Exception as e:
        print(f"Exception: {e}")
