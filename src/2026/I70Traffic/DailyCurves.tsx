import { useMemo } from "react";
import { line, scaleLinear } from "d3";
import type { Day, Direction, Station } from "./types";
import { fmtCount, hourTick } from "./format";

interface DailyCurvesProps {
  day: Day;
  stations: Station[];
  hour: number;
  yMax: number;
  width: number;
}

const MARGIN = { top: 22, right: 10, bottom: 24, left: 40 };
const PANEL_H = 150;
const GAP = 24;
const TICK_HOURS = [0, 6, 12, 18, 23];

// Hour (x) vs count (y), one line per counter, westbound and eastbound in
// separate panels. Stations share their direction's hue, faint (Copper) to
// strong (Genesee) west to east. Missing hours break the line.
export default function DailyCurves({ day, stations, hour, yMax, width }: DailyCurvesProps) {
  const isMobile = width < 600;
  const panelW = isMobile ? width : (width - GAP) / 2;
  const innerW = panelW - MARGIN.left - MARGIN.right;
  const innerH = PANEL_H - MARGIN.top - MARGIN.bottom;

  const x = useMemo(() => scaleLinear().domain([0, 23]).range([0, innerW]), [innerW]);
  const y = useMemo(() => scaleLinear().domain([0, yMax]).range([innerH, 0]), [yMax, innerH]);
  const path = useMemo(
    () =>
      line<number | null>()
        .defined((v) => v !== null)
        .x((_, i) => x(i))
        .y((v) => y(v ?? 0)),
    [x, y],
  );
  const yTicks = y.ticks(4);

  const panels: { dir: Direction; title: string }[] = [
    { dir: "wb", title: "Westbound (to the mountains)" },
    { dir: "eb", title: "Eastbound (to Denver)" },
  ];

  return (
    <div className="i70-curves" style={{ flexDirection: isMobile ? "column" : "row", gap: isMobile ? 8 : GAP }}>
      {panels.map(({ dir, title }) => (
        <svg key={dir} width={panelW} height={PANEL_H} className="i70-curve-panel" role="img"
          aria-label={`${day.label}: ${title} vehicles per hour by station`}>
          <text x={MARGIN.left} y={13} className="i70-panel-title">{title}</text>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={0} x2={innerW} y1={y(t)} y2={y(t)} className={t === 0 ? "i70-baseline" : "i70-gridline"} />
                <text x={-6} y={y(t)} dy="0.32em" textAnchor="end" className="i70-axis-text">
                  {t === 0 ? "0" : `${fmtCount(t / 1000)}k`}
                </text>
              </g>
            ))}
            {TICK_HOURS.map((h) => (
              <text key={h} x={x(h)} y={innerH + 16} textAnchor="middle" className="i70-axis-text">{hourTick(h)}</text>
            ))}
            <line x1={x(hour)} x2={x(hour)} y1={0} y2={innerH} className="i70-clock-line" />
            {stations.map((s, i) => {
              const series = day.counts[s.id]?.[dir] ?? null;
              if (!series) return null;
              const v = series[hour];
              return (
                <g key={s.id} className={`i70-curve i70-${dir}-${i + 1}`}>
                  <path d={path(series) ?? ""} className="i70-curve-line" />
                  {v !== null && <circle cx={x(hour)} cy={y(v)} r={3.5} className="i70-curve-dot" />}
                </g>
              );
            })}
          </g>
        </svg>
      ))}
    </div>
  );
}
