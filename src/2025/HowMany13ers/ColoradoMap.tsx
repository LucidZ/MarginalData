import { useMemo } from 'react';
import { scaleSequential, scaleLinear } from 'd3-scale';
import { interpolateYlOrRd } from 'd3-scale-chromatic';

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
}

function ColoradoMap({ summits }: ColoradoMapProps) {
  const width = 1000;
  const height = 600;
  const padding = 40;

  // Colorado bounds
  const coloradoBounds = {
    west: -109.05,
    east: -102.04,
    south: 37,
    north: 41,
  };

  // Create scales for x and y
  const xScale = useMemo(() => {
    return scaleLinear()
      .domain([coloradoBounds.west, coloradoBounds.east])
      .range([padding, width - padding]);
  }, [width]);

  const yScale = useMemo(() => {
    return scaleLinear()
      .domain([coloradoBounds.south, coloradoBounds.north])
      .range([height - padding, padding]); // Inverted because SVG y-axis goes down
  }, [height]);

  const colorScale = useMemo(() => {
    const elevations = summits.map((s) => s.properties.elevation);
    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    return scaleSequential(interpolateYlOrRd).domain([minElev, maxElev]);
  }, [summits]);

  // Draw Colorado border as a simple rectangle
  const borderPath = useMemo(() => {
    const x1 = xScale(coloradoBounds.west);
    const x2 = xScale(coloradoBounds.east);
    const y1 = yScale(coloradoBounds.north);
    const y2 = yScale(coloradoBounds.south);
    return `M ${x1} ${y1} L ${x2} ${y1} L ${x2} ${y2} L ${x1} ${y2} Z`;
  }, [xScale, yScale]);

  return (
    <div>
      <svg width={width} height={height} style={{ border: '1px solid #ccc' }}>
        <rect width={width} height={height} fill="#e8f4f8" />

        {/* Colorado border */}
        <path
          d={borderPath}
          fill="#f0f0f0"
          stroke="#333"
          strokeWidth={2}
        />

        {/* Summit points */}
        {summits.map((summit, i) => {
          const [lon, lat] = summit.geometry.coordinates;
          const x = xScale(lon);
          const y = yScale(lat);

          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3}
              fill={colorScale(summit.properties.elevation)}
              opacity={0.7}
              stroke="white"
              strokeWidth={0.5}
            >
              <title>
                {summit.properties.name} - {summit.properties.elevation.toLocaleString()} ft
                {'\n'}
                {summit.properties.county} County
              </title>
            </circle>
          );
        })}
      </svg>

      <div style={{ marginTop: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>Elevation:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '12px' }}>
            {Math.min(...summits.map((s) => s.properties.elevation)).toLocaleString()} ft
          </span>
          <div
            style={{
              width: '200px',
              height: '20px',
              background: 'linear-gradient(to right, #ffffcc, #ffeda0, #fed976, #feb24c, #fd8d3c, #fc4e2a, #e31a1c, #bd0026, #800026)',
              border: '1px solid #ccc',
            }}
          />
          <span style={{ fontSize: '12px' }}>
            {Math.max(...summits.map((s) => s.properties.elevation)).toLocaleString()} ft
          </span>
        </div>
      </div>
    </div>
  );
}

export default ColoradoMap;
