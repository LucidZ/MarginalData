# Scripts

Data processing and build scripts for MarginalData visualizations.

## Available Scripts

### `generate_voter_age_data.py`

Builds the dataset for "The Shape of the Electorate" (`/2026/VoterAge`): eligible citizens,
registered voters and votes by single year of age (18-100) for every November election
2012-2024.

**Purpose**: Takes population *levels* from the Census Population Estimates Program (PEP) and
*rates* (citizen share, registration, turnout) from the CPS November Voting and Registration
Supplement's Table 1. See the module docstring for why each quantity comes from where it does.

**Requirements**:
- `openpyxl`, plus `xlrd` >= 2 for the 2012/2014 tables, which are legacy `.xls`
  (no API key - these are public downloads from census.gov)

**Usage**:
```bash
python scripts/generate_voter_age_data.py

# Re-run without re-fetching (reuses data/voter_age/ cache)
python scripts/generate_voter_age_data.py --skip-download
```

**Output**:
- File: `public/data/voter-age.json`
- Size: ~195KB

**Known data quirk**: 2018's Table 1 workbook has two sheets, `Table 1` and `Table 1a`
(margins of error), and the *active* sheet is 1a. The script picks the sheet by name and
checks that every year's title starts with `Table 1.`, so a margins-of-error sheet fails
loudly instead of parsing as data.

**When to run**:
- Once to generate the initial dataset
- Re-run if Census revises a published table, or to extend to a new election cycle

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
