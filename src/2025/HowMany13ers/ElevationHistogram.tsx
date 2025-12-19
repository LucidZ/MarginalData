import { useMemo, useRef, useState, useEffect } from "react";
import { scaleLinear } from "d3-scale";
import { interpolateYlOrRd } from "d3-scale-chromatic";
import { bin } from "d3-array";

interface ElevationHistogramProps {
  elevations: number[];
  minElevation: number;
  maxElevation: number;
  setMinElevation: (val: number) => void;
  setMaxElevation: (val: number) => void;
  elevationExtent: [number, number];
  width: number;
  height: number;
}

function ElevationHistogram({
  elevations,
  minElevation,
  maxElevation,
  setMinElevation,
  setMaxElevation,
  elevationExtent,
  width,
  height,
}: ElevationHistogramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState<
    "top" | "bottom" | "middle" | null
  >(null);
  const [dragStart, setDragStart] = useState<{
    y: number;
    minElev: number;
    maxElev: number;
  } | null>(null);

  const margin = { top: 20, right: 40, bottom: 60, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Create histogram bins (100 ft buckets)
  const bucketSize = 100;
  const histogramData = useMemo(() => {
    const [minElev, maxElev] = elevationExtent;
    const numBuckets = Math.ceil((maxElev - minElev) / bucketSize);

    const histogram = bin().domain([minElev, maxElev]).thresholds(numBuckets);

    const bins = histogram(elevations);

    return bins.map((bin) => ({
      x0: bin.x0 || 0,
      x1: bin.x1 || 0,
      count: bin.length,
      midpoint: ((bin.x0 || 0) + (bin.x1 || 0)) / 2,
    }));
  }, [elevations, elevationExtent, bucketSize]);

  // Scales - now Y is elevation, X is count
  const yScale = useMemo(() => {
    return scaleLinear().domain(elevationExtent).range([innerHeight, 0]);
  }, [elevationExtent, innerHeight]);

  const xScale = useMemo(() => {
    const maxCount = Math.max(...histogramData.map((d) => d.count));
    return scaleLinear().domain([0, maxCount]).range([0, innerWidth]);
  }, [histogramData, innerWidth]);

  const colorScale = useMemo(() => {
    return scaleLinear<string>()
      .domain(elevationExtent)
      .range([interpolateYlOrRd(0.2), interpolateYlOrRd(0.9)]);
  }, [elevationExtent]);

  // Handle mouse and touch events
  const handleStart = (clientY: number, type: "top" | "bottom" | "middle") => {
    setIsDragging(type);
    setDragStart({
      y: clientY,
      minElev: minElevation,
      maxElev: maxElevation,
    });
  };

  const handleMouseDown = (
    e: React.MouseEvent,
    type: "top" | "bottom" | "middle"
  ) => {
    e.preventDefault();
    handleStart(e.clientY, type);
  };

  const handleTouchStart = (
    e: React.TouchEvent,
    type: "top" | "bottom" | "middle"
  ) => {
    e.preventDefault();
    handleStart(e.touches[0].clientY, type);
  };

  useEffect(() => {
    const handleMove = (clientY: number) => {
      if (!isDragging || !dragStart || !svgRef.current) return;

      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const y = clientY - rect.top - margin.top;
      const elevation = yScale.invert(y);

      if (isDragging === "top") {
        // Dragging top edge - change maximum (top = higher elevation)
        const newMax = Math.min(
          elevationExtent[1],
          Math.max(elevation, minElevation + bucketSize)
        );
        setMaxElevation(Math.round(newMax / bucketSize) * bucketSize);
      } else if (isDragging === "bottom") {
        // Dragging bottom edge - change minimum (bottom = lower elevation)
        const newMin = Math.max(
          elevationExtent[0],
          Math.min(elevation, maxElevation - bucketSize)
        );
        setMinElevation(Math.round(newMin / bucketSize) * bucketSize);
      } else if (isDragging === "middle") {
        // Dragging middle - move both
        const dy = clientY - dragStart.y;
        const dElev = yScale.invert(dy) - yScale.invert(0);
        const range = dragStart.maxElev - dragStart.minElev;

        let newMin = dragStart.minElev + dElev;
        let newMax = dragStart.maxElev + dElev;

        // Keep within bounds
        if (newMin < elevationExtent[0]) {
          newMin = elevationExtent[0];
          newMax = newMin + range;
        }
        if (newMax > elevationExtent[1]) {
          newMax = elevationExtent[1];
          newMin = newMax - range;
        }

        setMinElevation(Math.round(newMin / bucketSize) * bucketSize);
        setMaxElevation(Math.round(newMax / bucketSize) * bucketSize);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      handleMove(e.touches[0].clientY);
    };

    const handleEnd = () => {
      setIsDragging(null);
      setDragStart(null);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleEnd);
      document.addEventListener("touchmove", handleTouchMove, {
        passive: false,
      });
      document.addEventListener("touchend", handleEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [
    isDragging,
    dragStart,
    yScale,
    elevationExtent,
    minElevation,
    maxElevation,
    setMinElevation,
    setMaxElevation,
    bucketSize,
  ]);

  // Brush position
  const brushY = yScale(maxElevation);
  const brushHeight = yScale(minElevation) - yScale(maxElevation);

  // Count peaks in the current elevation range
  const peaksInRange = useMemo(() => {
    return elevations.filter((e) => e >= minElevation && e <= maxElevation)
      .length;
  }, [elevations, minElevation, maxElevation]);

  return (
    <div>
      <div
        style={{ marginBottom: "10px", fontSize: "13px", lineHeight: "1.5" }}
      >
        <div style={{ fontWeight: "bold" }}>
          {peaksInRange.toLocaleString()} peaks between
        </div>
        <div>
          {minElevation.toLocaleString()} - {maxElevation.toLocaleString()} feet
        </div>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ cursor: isDragging ? "grabbing" : "default" }}
      >
        <g transform={`translate(${margin.left},${margin.top})`}>
          {/* Vertical gridlines */}
          {xScale.ticks(3).map((tick, i) => (
            <line
              key={`gridline-${i}`}
              x1={xScale(tick)}
              y1={0}
              x2={xScale(tick)}
              y2={innerHeight}
              stroke="#ddd"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
          ))}

          {/* Histogram bars */}
          {histogramData.map((d, i) => {
            const barY = yScale(d.x1);
            const barHeight = yScale(d.x0) - yScale(d.x1);
            const barWidth = xScale(d.count);
            const isInBrush = d.x1 > minElevation && d.x0 < maxElevation;

            return (
              <rect
                key={i}
                x={0}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={colorScale(d.midpoint)}
                opacity={isInBrush ? 0.8 : 0.3}
                stroke="white"
                strokeWidth={0.5}
              />
            );
          })}

          {/* X-axis (count) */}
          <g transform={`translate(0,${innerHeight})`}>
            <line x1={0} y1={0} x2={innerWidth} y2={0} stroke="#666" />
            {xScale.ticks(3).map((tick, i) => (
              <g key={i}>
                <line
                  x1={xScale(tick)}
                  y1={0}
                  x2={xScale(tick)}
                  y2={5}
                  stroke="#666"
                />
                <text
                  x={xScale(tick)}
                  y={20}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#666"
                >
                  {tick}
                </text>
              </g>
            ))}
            <text
              x={innerWidth / 2}
              y={40}
              textAnchor="middle"
              fontSize="12"
              fill="#666"
            >
              Number of Peaks
            </text>
          </g>

          {/* Y-axis (elevation) */}
          <g>
            <line x1={0} y1={0} x2={0} y2={innerHeight} stroke="#666" />
            {yScale.ticks(8).map((tick, i) => (
              <g key={i}>
                <line
                  x1={-5}
                  y1={yScale(tick)}
                  x2={0}
                  y2={yScale(tick)}
                  stroke="#666"
                />
                <text
                  x={-10}
                  y={yScale(tick)}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize="11"
                  fill="#666"
                >
                  {tick.toLocaleString()}
                </text>
              </g>
            ))}
            <text
              x={-35}
              y={innerHeight / 2}
              textAnchor="middle"
              fontSize="12"
              fill="#666"
              transform={`rotate(-90, -35, ${innerHeight / 2})`}
            >
              Elevation (ft)
            </text>
          </g>

          {/* Brush overlay */}
          <g>
            {/* Main draggable brush area - covers the full height for easy discovery */}
            <rect
              x={0}
              y={brushY}
              width={innerWidth}
              height={brushHeight}
              fill="#007bff"
              opacity={0.15}
              cursor="grab"
              onMouseDown={(e) => handleMouseDown(e, "middle")}
              onTouchStart={(e) => handleTouchStart(e, "middle")}
              style={{ transition: isDragging === 'middle' ? 'none' : 'opacity 0.2s' }}
            />

            {/* Top edge handle (higher elevation) - subtle, for advanced users */}
            <rect
              x={0}
              y={brushY - 3}
              width={innerWidth}
              height={6}
              fill="#007bff"
              opacity={0.6}
              cursor="ns-resize"
              onMouseDown={(e) => handleMouseDown(e, "top")}
              onTouchStart={(e) => handleTouchStart(e, "top")}
            />

            {/* Bottom edge handle (lower elevation) - subtle, for advanced users */}
            <rect
              x={0}
              y={brushY + brushHeight - 3}
              width={innerWidth}
              height={6}
              fill="#007bff"
              opacity={0.6}
              cursor="ns-resize"
              onMouseDown={(e) => handleMouseDown(e, "bottom")}
              onTouchStart={(e) => handleTouchStart(e, "bottom")}
            />

            {/* Visual indicator lines at edges */}
            <line
              x1={0}
              y1={brushY}
              x2={innerWidth}
              y2={brushY}
              stroke="#007bff"
              strokeWidth={2}
              pointerEvents="none"
            />
            <line
              x1={0}
              y1={brushY + brushHeight}
              x2={innerWidth}
              y2={brushY + brushHeight}
              stroke="#007bff"
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}

export default ElevationHistogram;
