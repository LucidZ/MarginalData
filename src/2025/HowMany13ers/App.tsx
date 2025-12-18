import { useState, useMemo } from 'react';
import { scaleLinear } from 'd3-scale';
import ColoradoMap from './ColoradoMap';
import SummitTable from './SummitTable';
import FilterControls from './FilterControls';
import summitsData from './data/all-colorado-summits.json';

interface Summit {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    name: string;
    elevation: number;
    elevationMeters: number;
    county: string;
    featureId: string;
    mapName: string;
  };
}

interface SummitsGeoJSON {
  type: string;
  features: Summit[];
}

const data = summitsData as SummitsGeoJSON;

function App() {
  const [minElevation, setMinElevation] = useState(13000);
  const [maxElevation, setMaxElevation] = useState(15000);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<string>('');

  const filteredSummits = useMemo(() => {
    return data.features.filter((summit) => {
      const elevation = summit.properties.elevation;
      const name = summit.properties.name.toLowerCase();
      const county = summit.properties.county;

      const meetsElevation = elevation >= minElevation && elevation <= maxElevation;
      const meetsSearch = searchTerm === '' || name.includes(searchTerm.toLowerCase());
      const meetsCounty = selectedCounty === '' || county === selectedCounty;

      return meetsElevation && meetsSearch && meetsCounty;
    });
  }, [minElevation, maxElevation, searchTerm, selectedCounty]);

  const counties = useMemo(() => {
    const countySet = new Set(data.features.map((s) => s.properties.county));
    return Array.from(countySet).sort();
  }, []);

  const elevationExtent = useMemo(() => {
    const elevations = data.features.map((s) => s.properties.elevation);
    return [Math.min(...elevations), Math.max(...elevations)];
  }, []);

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '10px' }}>How Many 13ers? Colorado Summits Explorer</h1>
      <p style={{ marginBottom: '30px', color: '#666' }}>
        Explore all {data.features.length.toLocaleString()} named summits in Colorado.
        Currently showing {filteredSummits.length.toLocaleString()} summits.
      </p>

      <FilterControls
        minElevation={minElevation}
        maxElevation={maxElevation}
        setMinElevation={setMinElevation}
        setMaxElevation={setMaxElevation}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        selectedCounty={selectedCounty}
        setSelectedCounty={setSelectedCounty}
        counties={counties}
        elevationExtent={elevationExtent}
      />

      <div style={{ marginTop: '30px' }}>
        <h2>Map View</h2>
        <ColoradoMap summits={filteredSummits} />
      </div>

      <div style={{ marginTop: '40px' }}>
        <h2>Summit List</h2>
        <SummitTable summits={filteredSummits} />
      </div>
    </div>
  );
}

export default App;
