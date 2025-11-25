# Scripts

Data processing and build scripts for MarginalData visualizations.

## Available Scripts

### `generate_solar_animation_data.py`

Generates optimized JSON data for the solar animation D3/React visualization.

**Purpose**: Processes CAISO solar generation data for 2024 and creates a JSON file containing:
- Daily total MWh production (for year overview chart)
- 5-minute interval generation data (for daily curve chart)
- Key dates with commentary (solstices, peak/min generation days)

**Requirements**:
- CAISO data must be cached at `data/raw/solar_fuel_mix_2024-01-01_2025-01-01.csv`
- Run the data fetching notebook first if cache doesn't exist

**Usage**:
```bash
python scripts/generate_solar_animation_data.py
```

**Output**:
- File: `public/data/solar_animation_2024.json`
- Size: ~2-3 MB (uncompressed)

**When to run**:
- After fetching new CAISO data
- Before building the React visualization
- When updating key dates or commentary
