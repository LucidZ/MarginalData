import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  scaleLinear,
  scaleSqrt,
  max,
  line,
  curveMonotoneX,
} from "d3";
import "./App.css";

interface YearData {
  year: number;
  dem: number;
  rep: number;
  minor: number;
  total: number;
  pctDemOfMajor: number;
  pctMinor: number;
}

interface County {
  county: string;
  years: YearData[];
}

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const MARGIN = { top: 40, right: 40, bottom: 58, left: 70 };

const HIGHLIGHT_COUNTIES = ["Denver", "El Paso", "Jefferson", "Arapahoe", "Adams", "Boulder", "Larimer", "Weld", "Douglas", "Pueblo"];

function countyColor(pctDemOfMajor: number): string {
  // Blue for Dem, red for Rep
  if (pctDemOfMajor >= 0.5) {
    const t = (pctDemOfMajor - 0.5) / 0.5;
    const r = Math.round(60 + (1 - t) * (180 - 60));
    const g = Math.round(80 + (1 - t) * (120 - 80));
    const b = Math.round(180 + t * (220 - 180));
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (0.5 - pctDemOfMajor) / 0.5;
    const r = Math.round(180 + t * (220 - 180));
    const g = Math.round(80 + (1 - t) * (100 - 80));
    const b = Math.round(80 + (1 - t) * (160 - 80));
    return `rgb(${r},${g},${b})`;
  }
}

export default function App() {
  const [data, setData] = useState<County[] | null>(null);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [view, setView] = useState<"state" | "counties">("counties");
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 520 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/data/co_voter_affiliation.json")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const el = entries[0];
      if (el) {
        const w = Math.min(el.contentRect.width, 820);
        const h = Math.min(Math.max(w * 0.72, 380), 580);
        setDimensions({ width: w, height: h });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const innerWidth = dimensions.width - MARGIN.left - MARGIN.right;
  const innerHeight = dimensions.height - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale, rScale } = useMemo(() => {
    const xScale = scaleLinear().domain([1, 0]).range([0, innerWidth]);
    const yScale = scaleLinear().domain([0, 1]).range([innerHeight, 0]);
    const maxTotal = data ? (max(data, (d) => max(d.years, (y) => y.total)) ?? 1) : 1;
    const rScale = scaleSqrt().domain([0, maxTotal]).range([2, 22]);
    return { xScale, yScale, rScale };
  }, [innerWidth, innerHeight, data]);

  const trailLine = useMemo(
    () =>
      line<YearData>()
        .x((d) => xScale(d.pctDemOfMajor))
        .y((d) => yScale(d.pctMinor))
        .curve(curveMonotoneX),
    [xScale, yScale]
  );

  const getYearData = useCallback(
    (county: County, year: number) =>
      county.years.find((y) => y.year === year),
    []
  );

  const getTrailData = useCallback(
    (county: County) =>
      county.years.filter((y) => y.year <= selectedYear),
    [selectedYear]
  );

  const stateByYear = useMemo(() => {
    if (!data) return [];
    return YEARS.map((year) => {
      const rows = data.flatMap((c) => c.years.filter((y) => y.year === year));
      const total = rows.reduce((s, y) => s + y.total, 0);
      const dem = rows.reduce((s, y) => s + y.dem, 0);
      const rep = rows.reduce((s, y) => s + y.rep, 0);
      const minor = rows.reduce((s, y) => s + y.minor, 0);
      return {
        year,
        dem, rep, minor, total,
        pctDemOfMajor: dem / (dem + rep),
        pctMinor: minor / total,
      };
    });
  }, [data]);

  const stateTotal = useMemo(
    () => stateByYear.find((s) => s.year === selectedYear) ?? null,
    [stateByYear, selectedYear]
  );

  const xTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const yTicks = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

  if (!data) return <div className="va-loading">Loading data…</div>;

  const hoveredData = hoveredCounty
    ? data.find((c) => c.county === hoveredCounty) ?? null
    : null;
  const hoveredYearData = hoveredData ? getYearData(hoveredData, selectedYear) : null;

  return (
    <div className="va-root">
      <h1 className="va-title">
        Colorado voter registration has shifted dramatically toward unaffiliated
      </h1>
      <p className="va-subtitle">
        Share of voters by party affiliation, 2016–2026 · Colorado counties
      </p>

      <div className="va-controls">
        <div className="va-toggle">
          <button
            className={`va-toggle-btn ${view === "state" ? "active" : ""}`}
            onClick={() => setView("state")}
          >
            Statewide
          </button>
          <button
            className={`va-toggle-btn ${view === "counties" ? "active" : ""}`}
            onClick={() => setView("counties")}
          >
            By county
          </button>
        </div>
        <div className="va-year-control">
          <span className="va-year-label">Year: <strong>{selectedYear}</strong></span>
          <input
            type="range"
            min={0}
            max={YEARS.length - 1}
            value={YEARS.indexOf(selectedYear)}
            onChange={(e) => setSelectedYear(YEARS[+e.target.value])}
            className="va-slider"
          />
          <div className="va-year-ticks">
            {YEARS.map((y) => (
              <span
                key={y}
                className={`va-year-tick ${y === selectedYear ? "active" : ""}`}
                onClick={() => setSelectedYear(y)}
              >
                {y}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="va-chart-row">
        <div className="va-legend-left">
          {stateTotal && (
            <div className="va-state-summary">
              <div className="va-state-name">Colorado statewide</div>
              <div className="va-state-voters">{stateTotal.total.toLocaleString()} registered voters</div>
              <div className="va-stat minor">{Math.round(stateTotal.minor / stateTotal.total * 100)}% Unaffiliated/Minor</div>
              <div className="va-stat dem">{Math.round(stateTotal.dem / stateTotal.total * 100)}% Democrat</div>
              <div className="va-stat rep">{Math.round(stateTotal.rep / stateTotal.total * 100)}% Republican</div>
            </div>
          )}
          {hoveredYearData && hoveredCounty && (
            <div className="va-tooltip">
              <div className="va-tooltip-county">{hoveredCounty}</div>
              <div className="va-tooltip-voters">{hoveredYearData.total.toLocaleString()} registered voters</div>
              <div className="va-stat minor">{Math.round(hoveredYearData.pctMinor * 100)}% Unaffiliated/Minor</div>
              <div className="va-stat dem">{Math.round(hoveredYearData.dem / hoveredYearData.total * 100)}% Democrat</div>
              <div className="va-stat rep">{Math.round(hoveredYearData.rep / hoveredYearData.total * 100)}% Republican</div>
              <div className="va-tooltip-axis">
                {hoveredYearData.pctDemOfMajor >= 0.5
                  ? `→ ${Math.round(hoveredYearData.pctDemOfMajor * 100)}% Dem of major-party voters`
                  : `→ ${Math.round((1 - hoveredYearData.pctDemOfMajor) * 100)}% Rep of major-party voters`}
              </div>
            </div>
          )}
        </div>

        <div className="va-chart-wrap" ref={containerRef}>
          <svg width={dimensions.width} height={dimensions.height}>
            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* Grid lines */}
              {yTicks.map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  stroke="#e5e5e5"
                  strokeWidth={1}
                />
              ))}
              {xTicks.map((t) => (
                <line
                  key={t}
                  x1={xScale(t)}
                  x2={xScale(t)}
                  y1={0}
                  y2={innerHeight}
                  stroke="#e5e5e5"
                  strokeWidth={1}
                />
              ))}

              {/* 50/50 vertical reference line */}
              <line
                x1={xScale(0.5)}
                x2={xScale(0.5)}
                y1={0}
                y2={innerHeight}
                stroke="#bbb"
                strokeWidth={1.5}
                strokeDasharray="4,3"
              />
              <text
                x={xScale(0.5)}
                y={-8}
                textAnchor="middle"
                className="va-ref-label"
              >
                50/50 split
              </text>

              {/* County trails + dots */}
              {view === "counties" && <>
                {data.map((county) => {
                  const trail = getTrailData(county);
                  if (trail.length < 2) return null;
                  const isHovered = county.county === hoveredCounty;
                  const isHighlighted = HIGHLIGHT_COUNTIES.includes(county.county);
                  return (
                    <path
                      key={`trail-${county.county}`}
                      d={trailLine(trail) ?? ""}
                      fill="none"
                      stroke={isHovered ? countyColor(trail[trail.length - 1].pctDemOfMajor) : "#bbb"}
                      strokeWidth={isHovered ? 2.5 : isHighlighted ? 1 : 0.8}
                      opacity={isHovered ? 0.9 : isHighlighted ? 0.5 : 0.3}
                    />
                  );
                })}
                {data.map((county) => {
                  const yd = getYearData(county, selectedYear);
                  if (!yd) return null;
                  const isHovered = county.county === hoveredCounty;
                  const isHighlighted = HIGHLIGHT_COUNTIES.includes(county.county);
                  const cx = xScale(yd.pctDemOfMajor);
                  const cy = yScale(yd.pctMinor);
                  const r = rScale(yd.total);
                  const color = countyColor(yd.pctDemOfMajor);
                  return (
                    <g
                      key={`dot-${county.county}`}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHoveredCounty(county.county)}
                      onMouseLeave={() => setHoveredCounty(null)}
                    >
                      <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
                      <circle
                        cx={cx} cy={cy} r={r}
                        fill={color}
                        fillOpacity={isHovered ? 1 : 0.75}
                        stroke={isHovered ? "#222" : isHighlighted ? "#555" : "white"}
                        strokeWidth={isHovered ? 2 : 1}
                      />
                      {(isHighlighted || isHovered) && (
                        <text x={cx} y={cy - r - 4} textAnchor="middle" className="va-county-label" fontWeight={isHovered ? "bold" : "normal"}>
                          {county.county}
                        </text>
                      )}
                    </g>
                  );
                })}
              </>}

              {/* State trail + dot */}
              {view === "state" && stateTotal && (() => {
                const trail = stateByYear.filter((s) => s.year <= selectedYear);
                const cx = xScale(stateTotal.pctDemOfMajor);
                const cy = yScale(stateTotal.pctMinor);
                const r = 18;
                const color = countyColor(stateTotal.pctDemOfMajor);
                return (
                  <g>
                    {trail.length >= 2 && (
                      <path
                        d={trailLine(trail) ?? ""}
                        fill="none"
                        stroke={color}
                        strokeWidth={2.5}
                        opacity={0.6}
                      />
                    )}
                    {trail.map((s) => s.year < selectedYear && (
                      <circle
                        key={s.year}
                        cx={xScale(s.pctDemOfMajor)}
                        cy={yScale(s.pctMinor)}
                        r={4}
                        fill={color}
                        fillOpacity={0.35}
                        stroke="none"
                      />
                    ))}
                    <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.85} stroke="#222" strokeWidth={2} />
                    <text x={cx} y={cy - r - 5} textAnchor="middle" className="va-county-label" fontWeight="bold">
                      Colorado
                    </text>
                  </g>
                );
              })()}

              {/* X axis */}
              <g transform={`translate(0,${innerHeight})`}>
                <line x1={0} x2={innerWidth} stroke="#999" />
                {xTicks.map((t) => (
                  <g key={t} transform={`translate(${xScale(t)},0)`}>
                    <line y2={5} stroke="#999" />
                    <text y={18} textAnchor="middle" className="va-tick-label">
                      {`${Math.round(Math.max(t, 1 - t) * 100)}%`}
                    </text>
                  </g>
                ))}
                <text
                  x={innerWidth / 2}
                  y={48}
                  textAnchor="middle"
                  className="va-axis-title"
                >
                  Share of major-party voters (Democrat ← · → Republican)
                </text>
              </g>

              {/* Y axis */}
              <g>
                <line y1={0} y2={innerHeight} stroke="#999" />
                {yTicks.map((t) => (
                  <g key={t} transform={`translate(0,${yScale(t)})`}>
                    <line x2={-5} stroke="#999" />
                    <text x={-9} textAnchor="end" dominantBaseline="middle" className="va-tick-label">
                      {`${Math.round(t * 100)}%`}
                    </text>
                  </g>
                ))}
                <text
                  transform={`translate(${-52},${innerHeight / 2}) rotate(-90)`}
                  textAnchor="middle"
                  className="va-axis-title"
                >
                  % Unaffiliated / Minor party voters
                </text>
              </g>
            </g>
          </svg>
        </div>
      </div>

      <p className="va-footnote">
        Dot size proportional to total registered voters. Trails show each county's path from 2016 through {selectedYear}.
        "Unaffiliated" includes minor party registrants (Green, Libertarian, etc.).
        Data: Colorado Secretary of State, monthly voter registration statistics.
      </p>
    </div>
  );
}
