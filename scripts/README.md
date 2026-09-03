# Scripts

Data processing and build scripts for MarginalData visualizations.

## Available Scripts

### `generate_voter_age_data.py`

Builds the dataset for the "Electorate Is Older Than the Country" voter-participation-by-age
story: national single-year-of-age turnout, national 5-bin turnout across five election cycles,
and state-level 5-bin turnout for the mail-in-voting and midterm-severity beats.

**Purpose**: Downloads and normalizes two US Census Bureau CPS November Voting and Registration
Supplement tables (Table 1: national by single year of age; Table 4c: by state, 5 age bins)
across 2016/2018/2020/2022/2024, then derives the "under-35 representation gap"
(share of votes cast by 18-34-year-olds minus their share of eligible citizens) used throughout
the story.

**Requirements**:
- `openpyxl` (no API key - these are public XLSX downloads from census.gov)

**Usage**:
```bash
python scripts/generate_voter_age_data.py

# Re-run without re-fetching (reuses data/voter_age/ cache)
python scripts/generate_voter_age_data.py --skip-download
```

**Output**:
- File: `public/data/voter-age.json`
- Size: ~140KB

**Known data quirk**: 2018's Table 1 file is mislabeled at the source (Census serves Table 1a,
margins of error, at the URL whose link text says "Table 1") — there's no alternate filename to
recover the real Table 1 for that year. The script skips single-year-of-age for 2018 rather than
silently parsing the wrong table; Table 4c for 2018 is unaffected. See the module docstring for
detail.

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
