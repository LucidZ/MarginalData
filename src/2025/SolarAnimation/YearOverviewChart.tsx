import { useMemo } from "react";
import { scaleLinear, scaleTime, line, max, extent, curveMonotoneX } from "d3";
import type { DailyTotal } from "./types";

interface YearOverviewChartProps {
  dailyTotals: DailyTotal[];
  currentDayIndex: number;
  hoveredDayIndex: number | null;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  onHover: (dayIndex: number | null) => void;
  onClick: (dayIndex: number) => void;
  interactive: boolean;
  showCurrentDay?: boolean;
}

export const YearOverviewChart = ({
  dailyTotals,
  currentDayIndex,
  hoveredDayIndex,
  width,
  height,
  margin,
  onHover,
  onClick,
  interactive,
  showCurrentDay = true,
}: YearOverviewChartProps) => {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Parse dates and create scales
  const { xScale, yScale, lineGenerator } = useMemo(() => {
    const dataWithDates = dailyTotals.map((d) => ({
      ...d,
      dateObj: new Date(d.date),
    }));

    const xScale = scaleTime()
      .domain(extent(dataWithDates, (d) => d.dateObj) as [Date, Date])
      .range([0, innerWidth]);

    const maxMWh = max(dailyTotals, (d) => d.total_mwh) || 200000;

    const yScale = scaleLinear()
      .domain([0, maxMWh])
      .range([innerHeight, 0])
      .nice();

    const lineGenerator = line<(typeof dataWithDates)[0]>()
      .x((d) => xScale(d.dateObj))
      .y((d) => yScale(d.total_mwh))
      .curve(curveMonotoneX);

    return { xScale, yScale, lineGenerator, dataWithDates };
  }, [dailyTotals, innerWidth, innerHeight]);

  const currentDate = new Date(dailyTotals[currentDayIndex].date);
  const currentX = xScale(currentDate);

  // Mouse event handlers for interactivity
  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (!interactive) return;

    const svgRect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;

    // Find closest day index
    const hoveredDate = xScale.invert(mouseX);
    const dayIndex = dailyTotals.findIndex((d) => {
      const date = new Date(d.date);
      return Math.abs(date.getTime() - hoveredDate.getTime()) < 12 * 60 * 60 * 1000; // Within 12 hours
    });

    if (dayIndex !== -1 && dayIndex !== hoveredDayIndex) {
      onHover(dayIndex);
    }
  };

  const handleMouseLeave = () => {
    if (!interactive) return;
    onHover(null);
  };

  const handleClick = (e: React.MouseEvent<SVGRectElement>) => {
    if (!interactive) return;

    const svgRect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;

    // Find closest day index
    const clickedDate = xScale.invert(mouseX);
    const dayIndex = dailyTotals.findIndex((d) => {
      const date = new Date(d.date);
      return Math.abs(date.getTime() - clickedDate.getTime()) < 12 * 60 * 60 * 1000; // Within 12 hours
    });

    if (dayIndex !== -1) {
      onClick(dayIndex);
    }
  };

  // Calculate hover indicator position
  const hoveredX = hoveredDayIndex !== null
    ? xScale(new Date(dailyTotals[hoveredDayIndex].date))
    : null;

  // Generate month ticks
  const monthTicks = useMemo(() => {
    const ticks: Date[] = [];
    for (let month = 0; month < 12; month++) {
      ticks.push(new Date(2024, month, 1));
    }
    return ticks;
  }, []);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const pathData = lineGenerator(
    dailyTotals.map((d) => ({ ...d, dateObj: new Date(d.date) }))
  );

  // Format date for display
  const formatDate = (dateString: string) => {
    // Parse date as UTC to avoid timezone issues
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    const monthName = date.toLocaleDateString("en-US", { month: "long" });
    return `${monthName} ${day}, ${year}`;
  };

  const displayDateIndex = hoveredDayIndex ?? currentDayIndex;
  const displayDate = formatDate(dailyTotals[displayDateIndex].date);

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {/* Date label in top right corner */}
      {interactive && (
        <text
          x={innerWidth}
          y={-5}
          textAnchor="end"
          fontSize={12}
          fill="#888"
          fontWeight="500"
        >
          {displayDate}
        </text>
      )}

      {/* Y-axis */}
      <g>
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={innerHeight}
          stroke="#333"
          strokeWidth={1}
        />
        {yScale.ticks(3).map((tick) => (
          <g key={tick} transform={`translate(0,${yScale(tick)})`}>
            <line x1={0} x2={-6} y1={0} y2={0} stroke="#333" />
            <text
              x={-10}
              y={0}
              dy="0.32em"
              textAnchor="end"
              fontSize={10}
              fill="#666"
            >
              {(tick / 1000).toFixed(0)}k
            </text>
          </g>
        ))}
        <text
          transform={`translate(-50,${innerHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={12}
          fill="#333"
          fontWeight="bold"
        >
          Daily MWh
        </text>
      </g>

      {/* X-axis */}
      <g transform={`translate(0,${innerHeight})`}>
        <line
          x1={0}
          y1={0}
          x2={innerWidth}
          y2={0}
          stroke="#333"
          strokeWidth={1}
        />
        {monthTicks.map((tick, i) => {
          const x = xScale(tick);
          return (
            <g key={i} transform={`translate(${x},0)`}>
              <line x1={0} x2={0} y1={0} y2={6} stroke="#333" />
              <text x={0} y={18} textAnchor="middle" fontSize={10} fill="#666">
                {monthNames[i]}
              </text>
            </g>
          );
        })}
      </g>

      {/* Grid lines */}
      <g opacity={0.1}>
        {yScale.ticks(3).map((tick) => (
          <line
            key={tick}
            x1={0}
            x2={innerWidth}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="#666"
          />
        ))}
      </g>

      {/* Line chart */}
      {pathData && (
        <path
          d={pathData}
          fill="none"
          stroke="#ff8c00"
          strokeWidth={2}
          opacity={0.6}
        />
      )}

      {/* Current day indicator (red vertical line) */}
      {showCurrentDay && (
        <>
          <line
            x1={currentX}
            y1={0}
            x2={currentX}
            y2={innerHeight}
            stroke="#e74c3c"
            strokeWidth={3}
          />

          {/* Current day marker (circle) */}
          <circle
            cx={currentX}
            cy={yScale(dailyTotals[currentDayIndex].total_mwh)}
            r={5}
            fill="#e74c3c"
          />
        </>
      )}

      {/* Hover indicator (only in interactive mode) */}
      {interactive && hoveredX !== null && (
        <>
          <line
            x1={hoveredX}
            y1={0}
            x2={hoveredX}
            y2={innerHeight}
            stroke="#666"
            strokeWidth={1}
            strokeDasharray="4,4"
            opacity={0.6}
            pointerEvents="none"
          />
          <circle
            cx={hoveredX}
            cy={yScale(dailyTotals[hoveredDayIndex!].total_mwh)}
            r={4}
            fill="#666"
            opacity={0.8}
            pointerEvents="none"
          />
        </>
      )}

      {/* Interactive overlay rect for mouse events */}
      <rect
        x={0}
        y={0}
        width={innerWidth}
        height={innerHeight}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ cursor: interactive ? "pointer" : "default" }}
      />
    </g>
  );
};
