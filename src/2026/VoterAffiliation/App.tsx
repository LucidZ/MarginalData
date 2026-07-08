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

const HIGHLIGHT_COUNTIES = ["Denver", "El Paso", "Jefferson", "Arapahoe", "Adams", "Boulder", "Larimer", "Weld", "Douglas", "Pueblo"];

function countyColor(pctDemOfMajor: number): string {
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

// Barycentric mapping: bottom-left = 100% Dem, bottom-right = 100% Rep, top = 100% Unaffiliated
function ternCoords(dem: number, rep: number, una: number, W: number, H: number) {
  const tot = dem + rep + una;
  const r = rep / tot, u = una / tot;
  return { x: (r + u / 2) * W, y: (1 - u) * H };
}

export default function App() {
  const [data, setData] = useState<County[] | null>(null);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [view, setView] = useState<"state" | "counties">("counties");
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  const [lockedCounty, setLockedCounty] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 480 });
  const [chartType, setChartType] = useState<"ternary" | "cartesian">("ternary");
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
        const h = Math.min(Math.max(w * 0.68, 300), 540);
        setDimensions({ width: w, height: h });
      }
    });
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const isMobile = dimensions.width < 500;

  const { margin, innerWidth, innerHeight } = useMemo(() => {
    const m = isMobile
      ? { top: 20, right: 12, bottom: 44, left: 46 }
      : { top: 36, right: 36, bottom: 58, left: 66 };
    return {
      margin: m,
      innerWidth: dimensions.width - m.left - m.right,
      innerHeight: dimensions.height - m.top - m.bottom,
    };
  }, [dimensions, isMobile]);

  const ternMargin = useMemo(
    () => isMobile
      ? { top: 36, right: 20, bottom: 52, left: 40 }
      : { top: 52, right: 52, bottom: 64, left: 52 },
    [isMobile]
  );

  const triW = dimensions.width - ternMargin.left - ternMargin.right;
  const triH = triW * Math.sqrt(3) / 2;
  const ternarySvgHeight = ternMargin.top + triH + ternMargin.bottom;
  const svgHeight = chartType === "ternary" ? ternarySvgHeight : dimensions.height;

  const { xScale, yScale, rScale } = useMemo(() => {
    const xScale = scaleLinear().domain([1, 0]).range([0, innerWidth]);
    const yScale = scaleLinear().domain([0, 1]).range([innerHeight, 0]);
    const maxTotal = data ? (max(data, (d) => max(d.years, (y) => y.total)) ?? 1) : 1;
    const rScale = scaleSqrt().domain([0, maxTotal]).range([2, isMobile ? 15 : 22]);
    return { xScale, yScale, rScale };
  }, [innerWidth, innerHeight, data, isMobile]);

  const trailLine = useMemo(
    () =>
      line<YearData>()
        .x((d) => xScale(d.pctDemOfMajor))
        .y((d) => yScale(d.pctMinor))
        .curve(curveMonotoneX),
    [xScale, yScale]
  );

  const ternaryLine = useMemo(
    () =>
      line<YearData>()
        .x((d) => ternCoords(d.dem / d.total, d.rep / d.total, d.minor / d.total, triW, triH).x)
        .y((d) => ternCoords(d.dem / d.total, d.rep / d.total, d.minor / d.total, triW, triH).y)
        .curve(curveMonotoneX),
    [triW, triH]
  );

  const getYearData = useCallback(
    (county: County, year: number) => county.years.find((y) => y.year === year),
    []
  );

  const getTrailData = useCallback(
    (county: County) => county.years.filter((y) => y.year <= selectedYear),
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
      return { year, dem, rep, minor, total, pctDemOfMajor: dem / (dem + rep), pctMinor: minor / total };
    });
  }, [data]);

  const stateTotal = useMemo(
    () => stateByYear.find((s) => s.year === selectedYear) ?? null,
    [stateByYear, selectedYear]
  );

  const xTicks = isMobile ? [0, 0.25, 0.5, 0.75, 1.0] : [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0];
  const yTicks = isMobile ? [0, 0.25, 0.5, 0.75, 1.0] : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const ternGridU = [0.5];

  if (!data) return <div className="va-loading">Loading data…</div>;

  const activeCounty = lockedCounty ?? hoveredCounty;
  const activeData = activeCounty ? data.find((c) => c.county === activeCounty) ?? null : null;
  const activeYearData = activeData ? getYearData(activeData, selectedYear) : null;

  const stateCx = stateTotal ? xScale(stateTotal.pctDemOfMajor) : innerWidth / 2;
  const stateCy = stateTotal ? yScale(stateTotal.pctMinor) : innerHeight / 2;

  const stateTernPos = stateTotal
    ? ternCoords(stateTotal.dem / stateTotal.total, stateTotal.rep / stateTotal.total, stateTotal.pctMinor, triW, triH)
    : { x: triW / 2, y: triH / 2 };

  const toState = view === "state";
  const isLocked = lockedCounty !== null;

  const activeStats = activeYearData && activeCounty
    ? { name: activeCounty, ...activeYearData }
    : stateTotal
    ? { name: "Colorado", ...stateTotal }
    : null;

  function xTickLabel(t: number): { label: string; cls: string } {
    if (t === 0.5) return { label: "Even", cls: "even" };
    if (t === 0) return { label: "100% R", cls: "rep" };
    if (t === 1) return { label: "100% D", cls: "dem" };
    if (t > 0.5) return { label: `D ${Math.round(t * 100)}%`, cls: "dem" };
    return { label: `R ${Math.round((1 - t) * 100)}%`, cls: "rep" };
  }

  return (
    <div className="va-root">
      <h1 className="va-title">The chart we almost made</h1>
      <p className="va-subtitle">
        Colorado voter registration, 2016–2026 — two ways to visualize a three-way split
      </p>

      <div className="va-chart-type-row">
        <div className="va-toggle">
          <button
            className={`va-toggle-btn ${chartType === "ternary" ? "active" : ""}`}
            onClick={() => { setChartType("ternary"); setLockedCounty(null); setHoveredCounty(null); }}
          >
            Ternary (triangle)
          </button>
          <button
            className={`va-toggle-btn ${chartType === "cartesian" ? "active" : ""}`}
            onClick={() => { setChartType("cartesian"); setLockedCounty(null); setHoveredCounty(null); }}
          >
            Scatter plot
          </button>
        </div>
      </div>

      <div className="va-commentary">
        {chartType === "ternary" ? (
          <div key="ternary" className="va-commentary-inner">
            <p className="va-commentary-text">
              The ternary plot is the textbook encoding for three-part composition data. Each corner represents 100% of one group — Democrat, Republican, or Unaffiliated — and every county sits at the balance point of its registrations. No party gets privileged axis treatment.
            </p>
            <p className="va-commentary-text va-commentary-caveat">
              The problem: Colorado's defining story — unaffiliated voters overtaking both major parties — shows up here only as a slow drift toward the top corner, visually tangled with the left-right partisan shift. You can see it if you look for it. It doesn't announce itself.
            </p>
          </div>
        ) : (
          <div key="cartesian" className="va-commentary-inner">
            <p className="va-commentary-text">
              This version makes a deliberate editorial choice: collapse Democrat vs. Republican into a single horizontal axis, and give the vertical axis entirely to unaffiliated growth. That's not a neutral decision — it subordinates the partisan competition to the larger trend.
            </p>
            <p className="va-commentary-text va-commentary-insight">
              The payoff is immediate: every county is moving upward. The left-right spread barely changed over ten years. The vertical spread changed dramatically. The scatter plot makes that inescapable. The triangle hid it.
            </p>
          </div>
        )}
      </div>

      <div className="va-controls">
        <div className="va-toggle">
          <button
            className={`va-toggle-btn ${toState ? "active" : ""}`}
            onClick={() => { setView("state"); setLockedCounty(null); setHoveredCounty(null); }}
          >
            Statewide
          </button>
          <button
            className={`va-toggle-btn ${!toState ? "active" : ""}`}
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

      {activeStats && (
        <div className={`va-stats-strip ${activeCounty ? "is-county" : ""} ${isLocked ? "is-locked" : ""}`}>
          <span className="va-stats-name">{activeStats.name}</span>
          <span className="va-stats-total">{activeStats.total.toLocaleString()} voters</span>
          <span className="va-stats-minor">{Math.round(activeStats.minor / activeStats.total * 100)}% Unaffiliated</span>
          <span className="va-stats-dem">{Math.round(activeStats.dem / activeStats.total * 100)}% Democrat</span>
          <span className="va-stats-rep">{Math.round(activeStats.rep / activeStats.total * 100)}% Republican</span>
          {isLocked && (
            <button className="va-stats-unlock" onClick={() => setLockedCounty(null)}>✕</button>
          )}
        </div>
      )}

      <div className="va-chart-wrap" ref={containerRef}>
        <svg width={dimensions.width} height={svgHeight}>
          {chartType === "cartesian" ? (
            <g transform={`translate(${margin.left},${margin.top})`}>
              {/* Grid */}
              {yTicks.map((t) => (
                <line key={t} x1={0} x2={innerWidth} y1={yScale(t)} y2={yScale(t)} stroke="#e8e8e8" strokeWidth={1} />
              ))}
              {xTicks.map((t) => (
                <line key={t} x1={xScale(t)} x2={xScale(t)} y1={0} y2={innerHeight} stroke="#e8e8e8" strokeWidth={1} />
              ))}

              {/* 50/50 reference */}
              <line x1={xScale(0.5)} x2={xScale(0.5)} y1={0} y2={innerHeight} stroke="#ccc" strokeWidth={1.5} strokeDasharray="4,3" />
              {!isMobile && (
                <text x={xScale(0.5)} y={-6} textAnchor="middle" className="va-ref-label">50/50</text>
              )}

              {/* County trails */}
              {data.map((county) => {
                const trail = getTrailData(county);
                if (trail.length < 2) return null;
                const isActive = county.county === activeCounty;
                const yd = getYearData(county, selectedYear);
                if (!yd) return null;
                const cx = xScale(yd.pctDemOfMajor);
                const cy = yScale(yd.pctMinor);
                const tx = toState ? stateCx - cx : 0;
                const ty = toState ? stateCy - cy : 0;
                return (
                  <g
                    key={`trail-${county.county}`}
                    style={{
                      transform: `translate(${tx}px, ${ty}px)`,
                      opacity: toState ? 0 : 1,
                      transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                    }}
                  >
                    <path
                      d={trailLine(trail) ?? ""}
                      fill="none"
                      stroke={isActive ? countyColor(trail[trail.length - 1].pctDemOfMajor) : "#bbb"}
                      strokeWidth={isActive ? 2.5 : 0.8}
                      opacity={isActive ? 0.9 : isLocked ? 0.12 : 0.28}
                    />
                  </g>
                );
              })}

              {/* County dots */}
              {data.map((county) => {
                const yd = getYearData(county, selectedYear);
                if (!yd) return null;
                const isActive = county.county === activeCounty;
                const isLockTarget = county.county === lockedCounty;
                const isHighlighted = HIGHLIGHT_COUNTIES.includes(county.county);
                const cx = xScale(yd.pctDemOfMajor);
                const cy = yScale(yd.pctMinor);
                const r = rScale(yd.total);
                const color = countyColor(yd.pctDemOfMajor);
                const tx = toState ? stateCx - cx : 0;
                const ty = toState ? stateCy - cy : 0;
                return (
                  <g
                    key={`dot-${county.county}`}
                    style={{
                      transform: `translate(${tx}px, ${ty}px)`,
                      opacity: toState ? 0.1 : isLocked && !isActive ? 0.35 : 1,
                      transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                      pointerEvents: toState ? "none" : "auto",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => { if (!isLocked) setHoveredCounty(county.county); }}
                    onMouseLeave={() => { if (!isLocked) setHoveredCounty(null); }}
                    onClick={() => {
                      setLockedCounty(prev => prev === county.county ? null : county.county);
                      setHoveredCounty(null);
                    }}
                  >
                    <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
                    {isLockTarget && (
                      <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#111" strokeWidth={1.5} strokeDasharray="3,2.5" />
                    )}
                    <circle
                      cx={cx} cy={cy} r={r}
                      fill={color}
                      fillOpacity={isActive ? 1 : 0.75}
                      stroke={isActive ? "#111" : isHighlighted ? "#555" : "white"}
                      strokeWidth={isActive ? 2 : 1}
                    />
                    {isActive && (
                      <text x={cx} y={cy - r - 5} textAnchor="middle" className="va-county-label-hovered">
                        {county.county}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* State dot + trail */}
              {stateTotal && (() => {
                const trail = stateByYear.filter((s) => s.year <= selectedYear);
                const r = isMobile ? 13 : 18;
                const color = countyColor(stateTotal.pctDemOfMajor);
                return (
                  <g style={{ opacity: toState ? 1 : 0, transition: "opacity 0.5s", pointerEvents: toState ? "auto" : "none" }}>
                    {trail.length >= 2 && (
                      <path d={trailLine(trail) ?? ""} fill="none" stroke={color} strokeWidth={2.5} opacity={0.6} />
                    )}
                    {trail.map((s) => s.year < selectedYear && (
                      <circle key={s.year} cx={xScale(s.pctDemOfMajor)} cy={yScale(s.pctMinor)} r={4} fill={color} fillOpacity={0.35} stroke="none" />
                    ))}
                    <circle cx={stateCx} cy={stateCy} r={r} fill={color} fillOpacity={0.9} stroke="#111" strokeWidth={2} />
                    <text x={stateCx} y={stateCy - r - 5} textAnchor="middle" className="va-county-label-hovered">
                      Colorado
                    </text>
                  </g>
                );
              })()}

              {/* X axis */}
              <g transform={`translate(0,${innerHeight})`}>
                <line x1={0} x2={innerWidth} stroke="#aaa" />
                {xTicks.map((t) => {
                  const { label, cls } = xTickLabel(t);
                  return (
                    <g key={t} transform={`translate(${xScale(t)},0)`}>
                      <line y2={5} stroke="#aaa" />
                      <text y={18} textAnchor="middle" className={`va-tick-label ${cls}`}>{label}</text>
                    </g>
                  );
                })}
                {!isMobile && (
                  <text x={innerWidth / 2} y={46} textAnchor="middle" className="va-axis-title">
                    Share of major-party voters
                  </text>
                )}
              </g>

              {/* Y axis */}
              <g>
                <line y1={0} y2={innerHeight} stroke="#aaa" />
                {yTicks.map((t) => (
                  <g key={t} transform={`translate(0,${yScale(t)})`}>
                    <line x2={-5} stroke="#aaa" />
                    <text x={-8} textAnchor="end" dominantBaseline="middle" className="va-tick-label">
                      {`${Math.round(t * 100)}%`}
                    </text>
                  </g>
                ))}
                {!isMobile && (
                  <text
                    transform={`translate(${-48},${innerHeight / 2}) rotate(-90)`}
                    textAnchor="middle"
                    className="va-axis-title"
                  >
                    % Unaffiliated / Minor party
                  </text>
                )}
              </g>
            </g>
          ) : (
            <g transform={`translate(${ternMargin.left},${ternMargin.top})`}>
              {/* Triangle border */}
              <path
                d={`M ${triW / 2} 0 L ${triW} ${triH} L 0 ${triH} Z`}
                fill="none"
                stroke="#ccc"
                strokeWidth={1.5}
              />

              {/* Nested inverted triangles as grid reference — each marks an unaffiliated% level */}
              {ternGridU.map((u) => {
                const topLeft = { x: (u / 2) * triW, y: (1 - u) * triH };
                const topRight = { x: (1 - u / 2) * triW, y: (1 - u) * triH };
                const bottom = { x: triW / 2, y: triH };
                return (
                  <g key={u}>
                    <path
                      d={`M ${topLeft.x} ${topLeft.y} L ${topRight.x} ${topRight.y} L ${bottom.x} ${bottom.y} Z`}
                      fill="none"
                      stroke="#e8e8e8"
                      strokeWidth={1}
                    />
                    <text x={topLeft.x - 5} y={topLeft.y} textAnchor="end" dominantBaseline="middle" className="va-tern-tick">
                      {Math.round(u * 100)}%
                    </text>
                  </g>
                );
              })}

              {/* Dem = Rep center line */}
              <line
                x1={triW / 2} y1={0}
                x2={triW / 2} y2={triH}
                stroke="#ccc"
                strokeWidth={1.5}
                strokeDasharray="4,3"
              />

              {/* Vertex labels */}
              <text x={triW / 2} y={-12} textAnchor="middle" className="va-tern-vertex va-tern-vertex-una">
                Unaffiliated
              </text>
              <text x={0} y={triH + 20} textAnchor="middle" className="va-tern-vertex va-tern-vertex-dem">
                Democrat
              </text>
              <text x={triW} y={triH + 20} textAnchor="middle" className="va-tern-vertex va-tern-vertex-rep">
                Republican
              </text>
              {!isMobile && (
                <text x={triW / 2} y={triH + 20} textAnchor="middle" className="va-tern-tick va-tern-tick-mid">
                  50/50
                </text>
              )}

              {/* County trails */}
              {data.map((county) => {
                const trail = getTrailData(county);
                if (trail.length < 2) return null;
                const isActive = county.county === activeCounty;
                const yd = getYearData(county, selectedYear);
                if (!yd) return null;
                const { x: cx, y: cy } = ternCoords(yd.dem / yd.total, yd.rep / yd.total, yd.minor / yd.total, triW, triH);
                const tx = toState ? stateTernPos.x - cx : 0;
                const ty = toState ? stateTernPos.y - cy : 0;
                return (
                  <g
                    key={`tern-trail-${county.county}`}
                    style={{
                      transform: `translate(${tx}px, ${ty}px)`,
                      opacity: toState ? 0 : 1,
                      transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                    }}
                  >
                    <path
                      d={ternaryLine(trail) ?? ""}
                      fill="none"
                      stroke={isActive ? countyColor(trail[trail.length - 1].pctDemOfMajor) : "#bbb"}
                      strokeWidth={isActive ? 2.5 : 0.8}
                      opacity={isActive ? 0.9 : isLocked ? 0.12 : 0.28}
                    />
                  </g>
                );
              })}

              {/* County dots */}
              {data.map((county) => {
                const yd = getYearData(county, selectedYear);
                if (!yd) return null;
                const isActive = county.county === activeCounty;
                const isLockTarget = county.county === lockedCounty;
                const isHighlighted = HIGHLIGHT_COUNTIES.includes(county.county);
                const { x: cx, y: cy } = ternCoords(yd.dem / yd.total, yd.rep / yd.total, yd.minor / yd.total, triW, triH);
                const r = rScale(yd.total);
                const color = countyColor(yd.pctDemOfMajor);
                const tx = toState ? stateTernPos.x - cx : 0;
                const ty = toState ? stateTernPos.y - cy : 0;
                return (
                  <g
                    key={`tern-dot-${county.county}`}
                    style={{
                      transform: `translate(${tx}px, ${ty}px)`,
                      opacity: toState ? 0.1 : isLocked && !isActive ? 0.35 : 1,
                      transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                      pointerEvents: toState ? "none" : "auto",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => { if (!isLocked) setHoveredCounty(county.county); }}
                    onMouseLeave={() => { if (!isLocked) setHoveredCounty(null); }}
                    onClick={() => {
                      setLockedCounty(prev => prev === county.county ? null : county.county);
                      setHoveredCounty(null);
                    }}
                  >
                    <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
                    {isLockTarget && (
                      <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke="#111" strokeWidth={1.5} strokeDasharray="3,2.5" />
                    )}
                    <circle
                      cx={cx} cy={cy} r={r}
                      fill={color}
                      fillOpacity={isActive ? 1 : 0.75}
                      stroke={isActive ? "#111" : isHighlighted ? "#555" : "white"}
                      strokeWidth={isActive ? 2 : 1}
                    />
                    {isActive && (
                      <text x={cx} y={cy - r - 5} textAnchor="middle" className="va-county-label-hovered">
                        {county.county}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* State dot + trail (ternary) */}
              {stateTotal && (() => {
                const trail = stateByYear.filter((s) => s.year <= selectedYear);
                const r = isMobile ? 13 : 18;
                const color = countyColor(stateTotal.pctDemOfMajor);
                return (
                  <g style={{ opacity: toState ? 1 : 0, transition: "opacity 0.5s", pointerEvents: toState ? "auto" : "none" }}>
                    {trail.length >= 2 && (
                      <path d={ternaryLine(trail) ?? ""} fill="none" stroke={color} strokeWidth={2.5} opacity={0.6} />
                    )}
                    {trail.map((s) => {
                      if (s.year >= selectedYear) return null;
                      const { x, y } = ternCoords(s.dem / s.total, s.rep / s.total, s.minor / s.total, triW, triH);
                      return <circle key={s.year} cx={x} cy={y} r={4} fill={color} fillOpacity={0.35} stroke="none" />;
                    })}
                    <circle cx={stateTernPos.x} cy={stateTernPos.y} r={r} fill={color} fillOpacity={0.9} stroke="#111" strokeWidth={2} />
                    <text x={stateTernPos.x} y={stateTernPos.y - r - 5} textAnchor="middle" className="va-county-label-hovered">
                      Colorado
                    </text>
                  </g>
                );
              })()}
            </g>
          )}
        </svg>
      </div>

      <p className="va-footnote">
        Dot size proportional to total registered voters. Trails show each county's path from 2016 through {selectedYear}.
        "Unaffiliated" includes minor party registrants (Green, Libertarian, etc.).
        {chartType === "ternary"
          ? " Ternary chart places each county at its barycentric position in Democrat / Republican / Unaffiliated space — each axis shows that group's share of total registrations."
          : " Scatter plot collapses D/R onto a single axis so the vertical axis can be dedicated to unaffiliated growth."}
        {" "}Data: Colorado Secretary of State.
      </p>
    </div>
  );
}
