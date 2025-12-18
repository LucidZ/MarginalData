interface FilterControlsProps {
  minElevation: number;
  maxElevation: number;
  setMinElevation: (val: number) => void;
  setMaxElevation: (val: number) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  selectedCounty: string;
  setSelectedCounty: (val: string) => void;
  counties: string[];
  elevationExtent: [number, number];
}

function FilterControls({
  minElevation,
  maxElevation,
  setMinElevation,
  setMaxElevation,
  searchTerm,
  setSearchTerm,
  selectedCounty,
  setSelectedCounty,
  counties,
  elevationExtent,
}: FilterControlsProps) {
  const presets = [
    { label: 'All Summits', min: elevationExtent[0], max: elevationExtent[1] },
    { label: '14ers (14,000+ ft)', min: 14000, max: elevationExtent[1] },
    { label: '13ers (13,000-13,999 ft)', min: 13000, max: 13999 },
    { label: '12ers (12,000-12,999 ft)', min: 12000, max: 12999 },
    { label: 'Above 10,000 ft', min: 10000, max: elevationExtent[1] },
  ];

  return (
    <div
      style={{
        padding: '20px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        backgroundColor: '#f9f9f9',
      }}
    >
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Search by Name:
        </label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Enter summit name..."
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Filter by County:
        </label>
        <select
          value={selectedCounty}
          onChange={(e) => setSelectedCounty(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <option value="">All Counties</option>
          {counties.map((county) => (
            <option key={county} value={county}>
              {county}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Quick Filters:
        </label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setMinElevation(preset.min);
                setMaxElevation(preset.max);
              }}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid #007bff',
                borderRadius: '4px',
                backgroundColor:
                  minElevation === preset.min && maxElevation === preset.max
                    ? '#007bff'
                    : 'white',
                color:
                  minElevation === preset.min && maxElevation === preset.max
                    ? 'white'
                    : '#007bff',
                cursor: 'pointer',
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          Elevation Range: {minElevation.toLocaleString()} - {maxElevation.toLocaleString()} ft
        </label>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
              Min: {minElevation.toLocaleString()} ft
            </label>
            <input
              type="range"
              min={elevationExtent[0]}
              max={elevationExtent[1]}
              step={100}
              value={minElevation}
              onChange={(e) => setMinElevation(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
              Max: {maxElevation.toLocaleString()} ft
            </label>
            <input
              type="range"
              min={elevationExtent[0]}
              max={elevationExtent[1]}
              step={100}
              value={maxElevation}
              onChange={(e) => setMaxElevation(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default FilterControls;
