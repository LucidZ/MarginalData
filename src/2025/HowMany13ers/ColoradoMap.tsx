import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON } from 'react-leaflet';
import { scaleSequential } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';
import coloradoBoundary from './data/colorado-boundary.json';
import 'leaflet/dist/leaflet.css';

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
  };
}

interface ColoradoMapProps {
  summits: Summit[];
  height?: number;
}

function ColoradoMap({ summits, height = 600 }: ColoradoMapProps) {
  // Center of Colorado
  const center: [number, number] = [39.0, -105.5];

  // Colorado bounds for restricting map view
  const coloradoBounds: [[number, number], [number, number]] = [
    [36.8, -109.2], // Southwest corner
    [41.2, -101.8]  // Northeast corner
  ];

  const colorScale = useMemo(() => {
    if (summits.length === 0) return scaleSequential(interpolateYlOrRd).domain([0, 15000]);
    const elevations = summits.map((s) => s.properties.elevation);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    return scaleSequential(interpolateYlOrRd).domain([minElev, maxElev]);
  }, [summits]);

  return (
    <div>
      <MapContainer
        center={center}
        zoom={7}
        minZoom={7}
        maxZoom={13}
        maxBounds={coloradoBounds}
        maxBoundsViscosity={0.8}
        style={{ height: `${height}px`, width: '100%' }}
        scrollWheelZoom={true}
      >
        {/* Terrain basemap - USGS Topo or Esri World Topo work better at all zoom levels */}
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
          minZoom={7}
          maxZoom={13}
        />

        {/* Colorado border */}
        <GeoJSON
          data={coloradoBoundary as any}
          style={{
            fillColor: 'transparent',
            fillOpacity: 0,
            color: '#333',
            weight: 3,
          }}
        />

        {/* Summit markers */}
        {summits.map((summit, i) => {
          const [lon, lat] = summit.geometry.coordinates;
          const color = colorScale(summit.properties.elevation);

          return (
            <CircleMarker
              key={i}
              center={[lat, lon]}
              radius={4}
              pathOptions={{
                fillColor: color,
                fillOpacity: 0.7,
                color: 'white',
                weight: 1,
              }}
            >
              <Popup>
                <div>
                  <strong>{summit.properties.name}</strong>
                  <br />
                  Elevation: {summit.properties.elevation.toLocaleString()} ft
                  <br />
                  ({summit.properties.elevationMeters.toLocaleString()} m)
                  <br />
                  County: {summit.properties.county}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Elevation:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {summits.length > 0 && (
            <>
              <span style={{ fontSize: '12px' }}>
                {Math.min(...summits.map((s) => s.properties.elevation)).toLocaleString()} ft
              </span>
              <div
                style={{
                  width: '200px',
                  height: '20px',
                  background:
                    'linear-gradient(to right, #ffffcc, #ffeda0, #fed976, #feb24c, #fd8d3c, #fc4e2a, #e31a1c, #bd0026, #800026)',
                  border: '1px solid #ccc',
                }}
              />
              <span style={{ fontSize: '12px' }}>
                {Math.max(...summits.map((s) => s.properties.elevation)).toLocaleString()} ft
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ColoradoMap;
