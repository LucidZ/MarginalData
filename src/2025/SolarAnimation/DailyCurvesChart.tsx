import { useMemo } from "react";
import { scaleLinear, line, max, curveMonotoneX } from "d3";
import type { IntradayDataPoint } from "./types";

interface DailyCurvesChartProps {
  currentDayIndex: number;
  trailingDays: number;
  permanentDays: Set<number>;
  curves: Record<string, IntradayDataPoint[]>;
  dates: string[];
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

export const DailyCurvesChart = ({
  currentDayIndex,
  trailingDays,
  permanentDays,
  curves,
  dates,
  width,
  height,
  margin,
}: DailyCurvesChartProps) => {
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Calculate scales
  const xScale = useMemo(
    () =>
      scaleLinear()
        .domain([0, 24 * 60]) // 0 to 1440 minutes (24 hours)
        .range([0, innerWidth]),
    [innerWidth]
  );

  const yScale = useMemo(() => {
    // Find max MW across all curves to keep scale consistent
    const allMW = Object.values(curves).flatMap((curve) =>
      curve.map((d) => d.mw)
    );
    const maxMW = max(allMW) || 20000;

    return scaleLinear().domain([0, maxMW]).range([innerHeight, 0]).nice();
  }, [curves, innerHeight]);

  // Generate line path
  const lineGenerator = useMemo(
    () =>
      line<IntradayDataPoint>()
        .x((d) => xScale(d.minute_of_day))
        .y((d) => yScale(d.mw))
        .curve(curveMonotoneX),
    [xScale, yScale]
  );

  // Determine which days to show (current + trailing + permanent)
  const visibleDays = useMemo(() => {
    const days: Array<{
      date: string;
      dayIndex: number;
      opacity: number;
      strokeWidth: number;
      isPermanent: boolean;
    }> = [];

    // Add permanent days (peak and min) - always visible with distinct styling
    permanentDays.forEach((dayIndex) => {
      if (dayIndex >= 0 && dayIndex < dates.length) {
        days.push({
          date: dates[dayIndex],
          dayIndex,
          opacity: 0.4,
          strokeWidth: 2,
          isPermanent: true,
        });
      }
    });

    // Add trailing days and current day
    for (let i = trailingDays; i >= 0; i--) {
      const dayIndex = currentDayIndex - i;
      if (dayIndex >= 0 && dayIndex < dates.length) {
        const date = dates[dayIndex];
        // Current day: full opacity and thick line
        // Trailing days: fade out
        const opacity = i === 0 ? 1 : Math.max(0, 1 - i / trailingDays);
        const strokeWidth = i === 0 ? 3 : 1.5;
        days.push({ date, dayIndex, opacity, strokeWidth, isPermanent: false });
      }
    }

    return days;
  }, [currentDayIndex, trailingDays, dates, permanentDays]);

  // Generate hour ticks (0, 6, 12, 18, 24)
  const hourTicks = [0, 6, 12, 18, 24];

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
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
        {yScale.ticks(5).map((tick) => (
          <g key={tick} transform={`translate(0,${yScale(tick)})`}>
            <line x1={0} x2={-6} y1={0} y2={0} stroke="#333" />
            <text
              x={-10}
              y={0}
              dy="0.32em"
              textAnchor="end"
              fontSize={12}
              fill="#666"
            >
              {(tick / 1000).toFixed(0)}k MW
            </text>
          </g>
        ))}
        <text
          transform={`translate(-60,${innerHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={14}
          fill="#333"
          fontWeight="bold"
        >
          Solar Generation
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
        {hourTicks.map((hour) => {
          const x = xScale(hour * 60);
          return (
            <g key={hour} transform={`translate(${x},0)`}>
              <line x1={0} x2={0} y1={0} y2={6} stroke="#333" />
              <text
                x={0}
                y={20}
                textAnchor="middle"
                fontSize={12}
                fill="#666"
              >
                {hour === 0 ? "12am" : hour < 12 ? `${hour}am` : hour === 12 ? "12pm" : `${hour - 12}pm`}
              </text>
            </g>
          );
        })}
        <text
          x={innerWidth / 2}
          y={45}
          textAnchor="middle"
          fontSize={14}
          fill="#333"
          fontWeight="bold"
        >
          Time of Day (Pacific)
        </text>
      </g>

      {/* Grid lines */}
      <g opacity={0.1}>
        {yScale.ticks(5).map((tick) => (
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

      {/* Daily curves */}
      <g>
        {visibleDays.map(({ date, dayIndex, opacity, strokeWidth, isPermanent }) => {
          const curve = curves[date];
          if (!curve) return null;

          const pathData = lineGenerator(curve);
          if (!pathData) return null;

          // Determine color:
          // - Permanent days (peak/min): distinct colors
          // - Current day: orange
          // - Trailing days: gray
          let color = "#999"; // default for trailing days

          if (isPermanent) {
            // Use different colors for peak vs min
            // We can check the date to determine which one
            color = dayIndex === currentDayIndex ? "#ff8c00" : "#e74c3c"; // Red for permanent
          } else if (opacity === 1) {
            // Current day
            color = "#ff8c00";
          }

          return (
            <path
              key={`${date}-${isPermanent ? 'permanent' : 'current'}`}
              d={pathData}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          );
        })}
      </g>
    </g>
  );
};
