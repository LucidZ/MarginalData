import { useState, useRef, useEffect } from "react";
import { ComparisonRow } from "./App";

interface ValueJoyChartProps {
  optionAName: string;
  optionBName: string;
  rows: ComparisonRow[];
  activeRowId: string | null;
  updateChartData: (
    id: string,
    aPosition: { x: number; y: number },
    bPosition: { x: number; y: number }
  ) => void;
}

interface DragState {
  isDragging: boolean;
  dotType: "a" | "b" | null;
  rowId: string | null;
}

export default function ValueJoyChart({
  optionAName,
  optionBName,
  rows,
  activeRowId,
  updateChartData,
}: ValueJoyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dotType: null,
    rowId: null,
  });

  // Chart dimensions
  const padding = 60;
  const width = 600;
  const height = 600;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const activeRow = rows.find((row) => row.id === activeRowId);

  // Convert chart coordinates (0-1) to SVG coordinates
  const toSVGCoords = (x: number, y: number) => ({
    x: padding + x * chartWidth,
    y: padding + chartHeight - y * chartHeight, // Invert Y axis
  });

  // Convert SVG coordinates to chart coordinates (0-1)
  const toChartCoords = (svgX: number, svgY: number) => {
    const x = Math.max(0, Math.min(1, (svgX - padding) / chartWidth));
    const y = Math.max(0, Math.min(1, 1 - (svgY - padding) / chartHeight));
    return { x, y };
  };

  const handlePointerDown = (
    e: React.PointerEvent,
    rowId: string,
    dotType: "a" | "b"
  ) => {
    e.preventDefault();
    (e.target as SVGElement).setPointerCapture(e.pointerId);
    setDragState({ isDragging: true, dotType, rowId });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.isDragging || !dragState.rowId || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const newPos = toChartCoords(svgX, svgY);

    const row = rows.find((r) => r.id === dragState.rowId);
    if (!row) return;

    const currentA = row.chartData?.aPosition || { x: 0.5, y: 0.5 };
    const currentB = row.chartData?.bPosition || { x: 0.5, y: 0.5 };

    if (dragState.dotType === "a") {
      updateChartData(dragState.rowId, newPos, currentB);
    } else {
      updateChartData(dragState.rowId, currentA, newPos);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState.isDragging) {
      (e.target as SVGElement).releasePointerCapture(e.pointerId);
      setDragState({ isDragging: false, dotType: null, rowId: null });
    }
  };

  // Initialize default positions for active row if not set
  useEffect(() => {
    if (activeRow && !activeRow.chartData) {
      updateChartData(
        activeRow.id,
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 }
      );
    }
  }, [activeRow?.id]);

  return (
    <div className="value-joy-chart">
      <h2>Map Your Feelings</h2>
      <p className="step-description">
        For each category, drag the dots to show how valuable it is and how it makes you feel
      </p>
      {activeRow ? (
        <p className="instruction-text">
          Drag the dots to position <strong>{activeRow.category || "this category"}</strong> for each option
        </p>
      ) : (
        <p className="instruction-text">
          Click a category above to start mapping
        </p>
      )}

      <div className="chart-container">
        <svg
          ref={svgRef}
          className="chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((value) => (
            <g key={`grid-${value}`}>
              {/* Horizontal grid lines */}
              <line
                className="grid-line"
                x1={padding}
                y1={padding + chartHeight - value * chartHeight}
                x2={padding + chartWidth}
                y2={padding + chartHeight - value * chartHeight}
              />
              {/* Vertical grid lines */}
              <line
                className="grid-line"
                x1={padding + value * chartWidth}
                y1={padding}
                x2={padding + value * chartWidth}
                y2={padding + chartHeight}
              />
            </g>
          ))}

          {/* Axes */}
          <line
            className="axis-line"
            x1={padding}
            y1={padding}
            x2={padding}
            y2={padding + chartHeight}
          />
          <line
            className="axis-line"
            x1={padding}
            y1={padding + chartHeight}
            x2={padding + chartWidth}
            y2={padding + chartHeight}
          />

          {/* Y-axis labels */}
          <text
            className="axis-label"
            x={20}
            y={padding + chartHeight}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${padding + chartHeight})`}
          >
            Ugh
          </text>
          <text
            className="axis-label"
            x={20}
            y={padding + chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${padding + chartHeight / 2})`}
          >
            Neutral
          </text>
          <text
            className="axis-label"
            x={20}
            y={padding}
            textAnchor="middle"
            transform={`rotate(-90, 20, ${padding})`}
          >
            Sparks Joy
          </text>

          {/* Y-axis title */}
          <text
            className="axis-title"
            x={5}
            y={padding + chartHeight / 2}
            textAnchor="middle"
            transform={`rotate(-90, 5, ${padding + chartHeight / 2})`}
          >
            <title>How does this make you feel emotionally?</title>
            Joy →
          </text>

          {/* X-axis labels */}
          <text
            className="axis-label"
            x={padding}
            y={height - 20}
            textAnchor="middle"
          >
            Not Valuable
          </text>
          <text
            className="axis-label"
            x={padding + chartWidth / 2}
            y={height - 20}
            textAnchor="middle"
          >
            Neutral
          </text>
          <text
            className="axis-label"
            x={padding + chartWidth}
            y={height - 20}
            textAnchor="middle"
          >
            Very Valuable
          </text>

          {/* X-axis title */}
          <text
            className="axis-title"
            x={padding + chartWidth / 2}
            y={height - 5}
            textAnchor="middle"
          >
            <title>How objectively important is this factor?</title>
            ← Value →
          </text>

          {/* Draw all placed rows */}
          {rows
            .filter((row) => row.chartData && row.id !== activeRowId)
            .map((row) => {
              const aPos = toSVGCoords(
                row.chartData!.aPosition.x,
                row.chartData!.aPosition.y
              );
              const bPos = toSVGCoords(
                row.chartData!.bPosition.x,
                row.chartData!.bPosition.y
              );
              const midX = (aPos.x + bPos.x) / 2;
              const midY = (aPos.y + bPos.y) / 2;
              const angle =
                (Math.atan2(bPos.y - aPos.y, bPos.x - aPos.x) * 180) / Math.PI;

              // Flip label if it would be upside down (angle between 90 and 270)
              const isUpsideDown = angle > 90 || angle < -90;
              const labelAngle = isUpsideDown ? angle + 180 : angle;
              const labelOffset = -8; // Always keep label above the line

              return (
                <g key={row.id} opacity={0.5}>
                  {/* Gradient line */}
                  <defs>
                    <linearGradient
                      id={`gradient-${row.id}`}
                      x1={aPos.x}
                      y1={aPos.y}
                      x2={bPos.x}
                      y2={bPos.y}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#4a90e2" />
                      <stop offset="100%" stopColor="#ff8c42" />
                    </linearGradient>
                  </defs>
                  <line
                    className="connecting-line"
                    x1={aPos.x}
                    y1={aPos.y}
                    x2={bPos.x}
                    y2={bPos.y}
                    stroke={`url(#gradient-${row.id})`}
                  />
                  {/* Category label */}
                  <text
                    className="category-label"
                    x={midX}
                    y={midY + labelOffset}
                    textAnchor="middle"
                    transform={`rotate(${labelAngle}, ${midX}, ${midY})`}
                  >
                    {row.category}
                  </text>
                  {/* Dots */}
                  <circle
                    className="dot option-a"
                    cx={aPos.x}
                    cy={aPos.y}
                    r={6}
                  />
                  <circle
                    className="dot option-b"
                    cx={bPos.x}
                    cy={bPos.y}
                    r={6}
                  />
                </g>
              );
            })}

          {/* Draw active row */}
          {activeRow && activeRow.chartData && (() => {
            const aPos = toSVGCoords(
              activeRow.chartData.aPosition.x,
              activeRow.chartData.aPosition.y
            );
            const bPos = toSVGCoords(
              activeRow.chartData.bPosition.x,
              activeRow.chartData.bPosition.y
            );
            const midX = (aPos.x + bPos.x) / 2;
            const midY = (aPos.y + bPos.y) / 2;
            const angle =
              (Math.atan2(bPos.y - aPos.y, bPos.x - aPos.x) * 180) / Math.PI;
            const isUpsideDown = angle > 90 || angle < -90;
            const labelAngle = isUpsideDown ? angle + 180 : angle;
            const labelOffset = -8;

            return (
              <g>
                {/* Gradient line */}
                <defs>
                  <linearGradient
                    id="active-gradient"
                    x1={aPos.x}
                    y1={aPos.y}
                    x2={bPos.x}
                    y2={bPos.y}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#4a90e2" />
                    <stop offset="100%" stopColor="#ff8c42" />
                  </linearGradient>
                </defs>
                <line
                  className="connecting-line"
                  x1={aPos.x}
                  y1={aPos.y}
                  x2={bPos.x}
                  y2={bPos.y}
                  stroke="url(#active-gradient)"
                />
                {/* Category label */}
                <text
                  className="category-label"
                  x={midX}
                  y={midY + labelOffset}
                  textAnchor="middle"
                  transform={`rotate(${labelAngle}, ${midX}, ${midY})`}
                >
                  {activeRow.category}
                </text>
                {/* Draggable dots */}
                <circle
                  className="dot option-a active"
                  cx={aPos.x}
                  cy={aPos.y}
                  r={8}
                  onPointerDown={(e) => handlePointerDown(e, activeRow.id, "a")}
                  style={{ cursor: dragState.isDragging ? "grabbing" : "grab" }}
                />
                <text
                  className="endpoint-label"
                  x={aPos.x}
                  y={aPos.y - 15}
                  textAnchor="middle"
                  style={{ pointerEvents: "none" }}
                >
                  {activeRow.optionA || "A"}
                </text>
                <circle
                  className="dot option-b active"
                  cx={bPos.x}
                  cy={bPos.y}
                  r={8}
                  onPointerDown={(e) => handlePointerDown(e, activeRow.id, "b")}
                  style={{ cursor: dragState.isDragging ? "grabbing" : "grab" }}
                />
                <text
                  className="endpoint-label"
                  x={bPos.x}
                  y={bPos.y - 15}
                  textAnchor="middle"
                  style={{ pointerEvents: "none" }}
                >
                  {activeRow.optionB || "B"}
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <div className="legend-dot option-a"></div>
          <span>{optionAName}</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot option-b"></div>
          <span>{optionBName}</span>
        </div>
      </div>
    </div>
  );
}
