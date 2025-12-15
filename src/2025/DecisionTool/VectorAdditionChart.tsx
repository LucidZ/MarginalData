import { useMemo } from "react";
import { ComparisonRow } from "./App";

interface VectorAdditionChartProps {
  optionAName: string;
  optionBName: string;
  rows: ComparisonRow[];
}

export default function VectorAdditionChart({
  optionAName,
  optionBName,
  rows,
}: VectorAdditionChartProps) {
  // Chart dimensions
  const padding = 60;
  const width = 600;
  const height = 600;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Calculate vectors and positions
  const vectorData = useMemo(() => {
    const placedRows = rows.filter((row) => row.chartData);
    if (placedRows.length === 0) return null;

    // Convert each row to a vector (change from A to B)
    const vectors = placedRows.map((row) => ({
      id: row.id,
      category: row.category,
      dx: row.chartData!.bPosition.x - row.chartData!.aPosition.x,
      dy: row.chartData!.bPosition.y - row.chartData!.aPosition.y,
    }));

    // Calculate sequential positions starting from origin (0, 0)
    let currentX = 0;
    let currentY = 0;
    const positions = vectors.map((vector) => {
      const startX = currentX;
      const startY = currentY;
      currentX += vector.dx;
      currentY += vector.dy;
      return {
        id: vector.id,
        category: vector.category,
        startX,
        startY,
        endX: currentX,
        endY: currentY,
      };
    });

    // Final aggregate endpoint
    const aggregateEnd = { x: currentX, y: currentY };

    // Calculate bounds for zoom
    const allX = [0, ...positions.map((p) => p.endX)];
    const allY = [0, ...positions.map((p) => p.endY)];
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    // Add padding to bounds (20% on each side)
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const paddingPercent = 0.2;
    const boundMinX = minX - rangeX * paddingPercent;
    const boundMaxX = maxX + rangeX * paddingPercent;
    const boundMinY = minY - rangeY * paddingPercent;
    const boundMaxY = maxY + rangeY * paddingPercent;

    // Ensure square aspect ratio
    const boundRangeX = boundMaxX - boundMinX;
    const boundRangeY = boundMaxY - boundMinY;
    const maxRange = Math.max(boundRangeX, boundRangeY);

    // Center the smaller dimension
    const finalMinX = boundMinX - (maxRange - boundRangeX) / 2;
    const finalMaxX = boundMaxX + (maxRange - boundRangeX) / 2;
    const finalMinY = boundMinY - (maxRange - boundRangeY) / 2;
    const finalMaxY = boundMaxY + (maxRange - boundRangeY) / 2;

    return {
      positions,
      aggregateEnd,
      bounds: {
        minX: finalMinX,
        maxX: finalMaxX,
        minY: finalMinY,
        maxY: finalMaxY,
        range: maxRange,
      },
    };
  }, [rows]);

  // Convert data coordinates to SVG coordinates
  const toSVGCoords = (x: number, y: number) => {
    if (!vectorData) return { x: 0, y: 0 };
    const { bounds } = vectorData;
    const svgX = padding + ((x - bounds.minX) / bounds.range) * chartWidth;
    const svgY =
      padding + chartHeight - ((y - bounds.minY) / bounds.range) * chartHeight;
    return { x: svgX, y: svgY };
  };

  if (!vectorData || vectorData.positions.length === 0) {
    return (
      <div className="value-joy-chart">
        <h2>Step 3: Vector Addition</h2>
        <p className="instruction-text">
          Place at least one category on the chart above to see the vector
          addition
        </p>
      </div>
    );
  }

  const { positions, aggregateEnd, bounds } = vectorData;
  const origin = toSVGCoords(0, 0);
  const aggregateSVG = toSVGCoords(aggregateEnd.x, aggregateEnd.y);

  return (
    <div className="value-joy-chart">
      <h2>See the Big Picture</h2>
      <p className="step-description">
        All your categories combined into a single comparison vector
      </p>
      <p className="instruction-text">
        The aggregate line shows the overall difference between {optionAName} and {optionBName}
      </p>

      <div className="chart-container">
        <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((value) => {
            const gridX = bounds.minX + value * bounds.range;
            const gridY = bounds.minY + value * bounds.range;
            const svgGridX = toSVGCoords(gridX, 0).x;
            const svgGridY = toSVGCoords(0, gridY).y;

            return (
              <g key={`grid-${value}`}>
                {/* Vertical grid lines */}
                <line
                  className="grid-line"
                  x1={svgGridX}
                  y1={padding}
                  x2={svgGridX}
                  y2={padding + chartHeight}
                />
                {/* Horizontal grid lines */}
                <line
                  className="grid-line"
                  x1={padding}
                  y1={svgGridY}
                  x2={padding + chartWidth}
                  y2={svgGridY}
                />
              </g>
            );
          })}

          {/* Axes through origin */}
          <line
            className="axis-line"
            x1={origin.x}
            y1={padding}
            x2={origin.x}
            y2={padding + chartHeight}
          />
          <line
            className="axis-line"
            x1={padding}
            y1={origin.y}
            x2={padding + chartWidth}
            y2={origin.y}
          />

          {/* Y-axis labels */}
          <text
            className="axis-label"
            x={20}
            y={padding + chartHeight}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${padding + chartHeight})`}
          >
            Less Joy
          </text>
          <text
            className="axis-label"
            x={20}
            y={origin.y}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${origin.y})`}
          >
            Equal
          </text>
          <text
            className="axis-label"
            x={20}
            y={padding}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${padding})`}
          >
            More Joy
          </text>

          {/* X-axis labels */}
          <text className="axis-label" x={padding} y={height - 20} textAnchor="middle">
            Less Valuable
          </text>
          <text
            className="axis-label"
            x={origin.x}
            y={height - 20}
            textAnchor="middle"
          >
            Equal
          </text>
          <text
            className="axis-label"
            x={padding + chartWidth}
            y={height - 20}
            textAnchor="middle"
          >
            More Valuable
          </text>

          {/* Draw sequential vectors */}
          {positions.map((pos) => {
            const start = toSVGCoords(pos.startX, pos.startY);
            const end = toSVGCoords(pos.endX, pos.endY);
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const angle =
              (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;

            // Flip label if upside down
            const isUpsideDown = angle > 90 || angle < -90;
            const labelAngle = isUpsideDown ? angle + 180 : angle;
            const labelOffset = -8;

            return (
              <g key={pos.id} opacity={0.5}>
                {/* Vector line with gradient */}
                <defs>
                  <linearGradient
                    id={`vec-gradient-${pos.id}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="0%"
                  >
                    <stop offset="0%" stopColor="#4a90e2" />
                    <stop offset="100%" stopColor="#ff8c42" />
                  </linearGradient>
                </defs>
                <line
                  className="connecting-line"
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={`url(#vec-gradient-${pos.id})`}
                />
                {/* Category label */}
                <text
                  className="category-label"
                  x={midX}
                  y={midY + labelOffset}
                  textAnchor="middle"
                  transform={`rotate(${labelAngle}, ${midX}, ${midY})`}
                >
                  {pos.category}
                </text>
                {/* Dots at endpoints */}
                <circle className="dot option-a" cx={start.x} cy={start.y} r={4} />
                <circle className="dot option-b" cx={end.x} cy={end.y} r={4} />
              </g>
            );
          })}

          {/* Aggregate line */}
          <defs>
            <linearGradient
              id="aggregate-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#4a90e2" />
              <stop offset="100%" stopColor="#ff8c42" />
            </linearGradient>
          </defs>
          <line
            className="connecting-line aggregate-line"
            x1={origin.x}
            y1={origin.y}
            x2={aggregateSVG.x}
            y2={aggregateSVG.y}
            stroke="url(#aggregate-gradient)"
            strokeWidth="4"
          />

          {/* Aggregate label */}
          {(() => {
            const midX = (origin.x + aggregateSVG.x) / 2;
            const midY = (origin.y + aggregateSVG.y) / 2;
            const angle =
              (Math.atan2(aggregateSVG.y - origin.y, aggregateSVG.x - origin.x) *
                180) /
              Math.PI;
            const isUpsideDown = angle > 90 || angle < -90;
            const labelAngle = isUpsideDown ? angle + 180 : angle;
            const labelOffset = -12;

            return (
              <text
                className="category-label aggregate-label"
                x={midX}
                y={midY + labelOffset}
                textAnchor="middle"
                transform={`rotate(${labelAngle}, ${midX}, ${midY})`}
              >
                Aggregate
              </text>
            );
          })()}

          {/* Aggregate endpoint dots with labels */}
          <circle
            className="dot option-a"
            cx={origin.x}
            cy={origin.y}
            r={6}
          />
          <circle
            className="dot option-b"
            cx={aggregateSVG.x}
            cy={aggregateSVG.y}
            r={6}
          />

          {/* Endpoint labels */}
          <text
            className="endpoint-label"
            x={origin.x}
            y={origin.y - 12}
            textAnchor="middle"
          >
            {optionAName}
          </text>
          <text
            className="endpoint-label"
            x={aggregateSVG.x}
            y={aggregateSVG.y - 12}
            textAnchor="middle"
          >
            {optionBName}
          </text>
        </svg>
      </div>
    </div>
  );
}
