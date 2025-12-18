# How Many 13ers? Colorado Summits Explorer

An interactive visualization and explorer for all 3,210+ named summits in Colorado, based on USGS Geographic Names Information System (GNIS) data.

## Features

- **Interactive Map**: Visualize all Colorado summits on a map with color-coded elevation markers
- **Advanced Filtering**:
  - Filter by elevation range with dual sliders
  - Quick preset filters (14ers, 13ers, 12ers, etc.)
  - Search by summit name
  - Filter by county
- **Sortable Table**:
  - Sort by name, elevation, or county
  - Paginated display (50 summits per page)
  - Shows elevation in both feet and meters
  - Displays coordinates for each summit

## Data

The data comes from two sources:
1. **USGS GNIS** (`data/raw/DomesticNames_CO.txt`): All named geographic features in Colorado
2. **Open-Elevation API**: Elevation data fetched via API for each summit

### Data Processing

Run the processing script to regenerate the summit data:

```bash
python3 scripts/process_colorado_summits.py
```

This script:
- Filters USGS data to only "Summit" features (3,210 summits)
- Fetches elevation data from the Open-Elevation API
- Outputs a GeoJSON file with all summit data
- Takes about 30-40 seconds to process all summits

### Statistics

- Total Summits: 3,210
- Summits over 14,000 ft (14ers): 22
- Summits over 13,000 ft (13ers): 418
- Elevation Range: 3,619 ft - 14,396 ft

## Files

- `App.tsx` - Main application component with state management
- `ColoradoMap.tsx` - D3-based map visualization
- `SummitTable.tsx` - Sortable, paginated table component
- `FilterControls.tsx` - All filter UI controls
- `data/all-colorado-summits.json` - Processed summit data (GeoJSON)
- `coloradoBorder.json` - Colorado state boundary for map

## Future Enhancements

- Add topographic map layer
- Show climbing routes and trail information
- Add prominence data
- Filter by mountain range
- Export filtered data to CSV/GPX
- Show photos from each summit
