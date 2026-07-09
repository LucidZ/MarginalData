import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { scaleLinear, scaleSqrt, max, line, curveMonotoneX } from "d3";

interface YearData {
  year: number;
  dem: number;
  rep: number;
  minor: number;
  total: number;
  pctDemOfMajor: number;
  pctMinor: number;
}

export interface County {
  county: string;
  years: YearData[];
}

interface VoterChartProps {
  data: County[];
  chartType: "ternary" | "cartesian";
  year: number;
  view: "state" | "counties";
  // When non-empty: these counties are highlighted, others dimmed, interaction disabled
  forcedHighlights?: string[];
  interactive?: boolean;
}

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const LARGE_COUNTIES = ["Denver", "El Paso", "Jefferson", "Arapahoe", "Adams", "Boulder", "Larimer", "Weld", "Douglas", "Pueblo"];

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

function ternCoords(dem: number, rep: number, una: number, W: number, H: number) {
  const tot = dem + rep + una;
  const r = rep / tot;
  const u = una / tot;
  return { x: (r + u / 2) * W, y: (1 - u) * H };
}

export default function VoterChart({
  data,
  chartType,
  year,
  view,
  forcedHighlights = [],
  interactive = true,
}: VoterChartProps) {
  const [hoveredCounty, setHoveredCounty] = useState<string | null>(null);
  const [lockedCounty, setLockedCounty] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 480 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!interactive) {
      setHoveredCounty(null);
      setLockedCounty(null);
    }
  }, [interactive]);

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
    () =>
      isMobile
        ? { top: 36, right: 20, bottom: 52, left: 40 }
        : { top: 52, right: 52, bottom: 64, left: 52 },
    [isMobile]
  );

  const triW = dimensions.width - ternMargin.left - ternMargin.right;
  const triH = (triW * Math.sqrt(3)) / 2;
  const ternarySvgHeight = ternMargin.top + triH + ternMargin.bottom;
  const svgHeight = chartType === "ternary" ? ternarySvgHeight : dimensions.height;

  const { xScale, yScale, rScale } = useMemo(() => {
    const xScale = scaleLinear().domain([1, 0]).range([0, innerWidth]);
    const yScale = scaleLinear().domain([0, 1]).range([innerHeight, 0]);
    const maxTotal = max(data, (d) => max(d.years, (y) => y.total)) ?? 1;
    const rScale = scaleSqrt()
      .domain([0, maxTotal])
      .range([2, isMobile ? 15 : 22]);
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
        .x(
          (d) =>
            ternCoords(
              d.dem / d.total,
              d.rep / d.total,
              d.minor / d.total,
              triW,
              triH
            ).x
        )
        .y(
          (d) =>
            ternCoords(
              d.dem / d.total,
              d.rep / d.total,
              d.minor / d.total,
              triW,
              triH
            ).y
        )
        .curve(curveMonotoneX),
    [triW, triH]
  );

  const getYearData = useCallback(
    (county: County, y: number) => county.years.find((d) => d.year === y),
    []
  );

  const getTrailData = useCallback(
    (county: County) => county.years.filter((d) => d.year <= year),
    [year]
  );

  const stateByYear = useMemo(() => {
    return YEARS.map((y) => {
      const rows = data.flatMap((c) => c.years.filter((d) => d.year === y));
      const total = rows.reduce((s, d) => s + d.total, 0);
      const dem = rows.reduce((s, d) => s + d.dem, 0);
      const rep = rows.reduce((s, d) => s + d.rep, 0);
      const minor = rows.reduce((s, d) => s + d.minor, 0);
      return {
        year: y,
        dem,
        rep,
        minor,
        total,
        pctDemOfMajor: dem / (dem + rep),
        pctMinor: minor / total,
      };
    });
  }, [data]);

  const stateTotal = useMemo(
    () => stateByYear.find((s) => s.year === year) ?? null,
    [stateByYear, year]
  );

  const xTicks = isMobile
    ? [0, 0.25, 0.5, 0.75, 1.0]
    : [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0];
  const yTicks = isMobile
    ? [0, 0.25, 0.5, 0.75, 1.0]
    : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const ternGridU = [0.5];

  const toState = view === "state";
  const isLocked = lockedCounty !== null;

  const activeCounty = interactive ? lockedCounty ?? hoveredCounty : null;
  const effectiveHighlights =
    forcedHighlights.length > 0
      ? forcedHighlights
      : activeCounty
      ? [activeCounty]
      : [];
  const hasHighlights = effectiveHighlights.length > 0;
  const isForcedMode = forcedHighlights.length > 0;

  const stateCx = stateTotal ? xScale(stateTotal.pctDemOfMajor) : innerWidth / 2;
  const stateCy = stateTotal ? yScale(stateTotal.pctMinor) : innerHeight / 2;
  const stateTernPos = stateTotal
    ? ternCoords(
        stateTotal.dem / stateTotal.total,
        stateTotal.rep / stateTotal.total,
        stateTotal.pctMinor,
        triW,
        triH
      )
    : { x: triW / 2, y: triH / 2 };

  const activeData =
    interactive && activeCounty
      ? data.find((c) => c.county === activeCounty) ?? null
      : null;
  const activeYearData = activeData ? getYearData(activeData, year) : null;
  const activeStats =
    activeYearData && activeCounty
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
    <div className="va-chart-component">
      {interactive && activeStats && (
        <div
          className={`va-stats-strip ${activeCounty ? "is-county" : ""} ${
            isLocked ? "is-locked" : ""
          }`}
        >
          <span className="va-stats-name">{activeStats.name}</span>
          <span className="va-stats-total">
            {activeStats.total.toLocaleString()} voters
          </span>
          <span className="va-stats-minor">
            {Math.round((activeStats.minor / activeStats.total) * 100)}% Unaffiliated
          </span>
          <span className="va-stats-dem">
            {Math.round((activeStats.dem / activeStats.total) * 100)}% Democrat
          </span>
          <span className="va-stats-rep">
            {Math.round((activeStats.rep / activeStats.total) * 100)}% Republican
          </span>
          {isLocked && (
            <button
              className="va-stats-unlock"
              onClick={() => setLockedCounty(null)}
            >
              ✕
            </button>
          )}
        </div>
      )}

      <div className="va-chart-wrap" ref={containerRef}>
        <svg width={dimensions.width} height={svgHeight}>
          {chartType === "cartesian" ? (
            <g transform={`translate(${margin.left},${margin.top})`}>
              {yTicks.map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  stroke="#e8e8e8"
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
                  stroke="#e8e8e8"
                  strokeWidth={1}
                />
              ))}
              <line
                x1={xScale(0.5)}
                x2={xScale(0.5)}
                y1={0}
                y2={innerHeight}
                stroke="#ccc"
                strokeWidth={1.5}
                strokeDasharray="4,3"
              />
              {!isMobile && (
                <text
                  x={xScale(0.5)}
                  y={-6}
                  textAnchor="middle"
                  className="va-ref-label"
                >
                  50/50
                </text>
              )}

              {data.map((county) => {
                const trail = getTrailData(county);
                if (trail.length < 2) return null;
                const isHighlighted = effectiveHighlights.includes(county.county);
                const isDimmed = hasHighlights && !isHighlighted;
                const yd = getYearData(county, year);
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
                      transition:
                        "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                    }}
                  >
                    <path
                      d={trailLine(trail) ?? ""}
                      fill="none"
                      stroke={
                        isHighlighted
                          ? countyColor(trail[trail.length - 1].pctDemOfMajor)
                          : "#bbb"
                      }
                      strokeWidth={isHighlighted ? 2.5 : 0.8}
                      opacity={
                        isDimmed
                          ? isForcedMode
                            ? 0.04
                            : 0.12
                          : isHighlighted
                          ? 0.9
                          : 0.28
                      }
                    />
                  </g>
                );
              })}

              {data.map((county) => {
                const yd = getYearData(county, year);
                if (!yd) return null;
                const isHighlighted = effectiveHighlights.includes(county.county);
                const isLockTarget = county.county === lockedCounty;
                const isDimmed = hasHighlights && !isHighlighted;
                const isLargeCounty = LARGE_COUNTIES.includes(county.county);
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
                      opacity: toState
                        ? 0.1
                        : isDimmed
                        ? isForcedMode
                          ? 0.06
                          : 0.35
                        : 1,
                      transition:
                        "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                      pointerEvents:
                        interactive && !toState ? "auto" : "none",
                      cursor: interactive ? "pointer" : "default",
                    }}
                    onMouseEnter={() => {
                      if (interactive && !isLocked)
                        setHoveredCounty(county.county);
                    }}
                    onMouseLeave={() => {
                      if (interactive && !isLocked) setHoveredCounty(null);
                    }}
                    onClick={() => {
                      if (interactive) {
                        setLockedCounty((prev) =>
                          prev === county.county ? null : county.county
                        );
                        setHoveredCounty(null);
                      }
                    }}
                  >
                    <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
                    {isLockTarget && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 5}
                        fill="none"
                        stroke="#111"
                        strokeWidth={1.5}
                        strokeDasharray="3,2.5"
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={color}
                      fillOpacity={isHighlighted ? 1 : 0.75}
                      stroke={
                        isHighlighted
                          ? "#111"
                          : isLargeCounty
                          ? "#555"
                          : "white"
                      }
                      strokeWidth={isHighlighted ? 2 : 1}
                    />
                    {isHighlighted && (
                      <text
                        x={cx}
                        y={cy - r - 5}
                        textAnchor="middle"
                        className="va-county-label-hovered"
                      >
                        {county.county}
                      </text>
                    )}
                  </g>
                );
              })}

              {stateTotal &&
                (() => {
                  const trail = stateByYear.filter((s) => s.year <= year);
                  const r = isMobile ? 13 : 18;
                  const color = countyColor(stateTotal.pctDemOfMajor);
                  return (
                    <g
                      style={{
                        opacity: toState ? 1 : 0,
                        transition: "opacity 0.5s",
                        pointerEvents: toState ? "auto" : "none",
                      }}
                    >
                      {trail.length >= 2 && (
                        <path
                          d={trailLine(trail) ?? ""}
                          fill="none"
                          stroke={color}
                          strokeWidth={2.5}
                          opacity={0.6}
                        />
                      )}
                      {trail.map(
                        (s) =>
                          s.year < year && (
                            <circle
                              key={s.year}
                              cx={xScale(s.pctDemOfMajor)}
                              cy={yScale(s.pctMinor)}
                              r={4}
                              fill={color}
                              fillOpacity={0.35}
                              stroke="none"
                            />
                          )
                      )}
                      <circle
                        cx={stateCx}
                        cy={stateCy}
                        r={r}
                        fill={color}
                        fillOpacity={0.9}
                        stroke="#111"
                        strokeWidth={2}
                      />
                      <text
                        x={stateCx}
                        y={stateCy - r - 5}
                        textAnchor="middle"
                        className="va-county-label-hovered"
                      >
                        Colorado
                      </text>
                    </g>
                  );
                })()}

              <g transform={`translate(0,${innerHeight})`}>
                <line x1={0} x2={innerWidth} stroke="#aaa" />
                {xTicks.map((t) => {
                  const { label, cls } = xTickLabel(t);
                  return (
                    <g key={t} transform={`translate(${xScale(t)},0)`}>
                      <line y2={5} stroke="#aaa" />
                      <text
                        y={18}
                        textAnchor="middle"
                        className={`va-tick-label ${cls}`}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
                {!isMobile && (
                  <text
                    x={innerWidth / 2}
                    y={46}
                    textAnchor="middle"
                    className="va-axis-title"
                  >
                    Share of major-party voters
                  </text>
                )}
              </g>

              <g>
                <line y1={0} y2={innerHeight} stroke="#aaa" />
                {yTicks.map((t) => (
                  <g key={t} transform={`translate(0,${yScale(t)})`}>
                    <line x2={-5} stroke="#aaa" />
                    <text
                      x={-8}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="va-tick-label"
                    >
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
              <path
                d={`M ${triW / 2} 0 L ${triW} ${triH} L 0 ${triH} Z`}
                fill="none"
                stroke="#ccc"
                strokeWidth={1.5}
              />

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
                    <text
                      x={topLeft.x - 5}
                      y={topLeft.y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="va-tern-tick"
                    >
                      {Math.round(u * 100)}%
                    </text>
                  </g>
                );
              })}

              <line
                x1={triW / 2}
                y1={0}
                x2={triW / 2}
                y2={triH}
                stroke="#ccc"
                strokeWidth={1.5}
                strokeDasharray="4,3"
              />

              <text
                x={triW / 2}
                y={-12}
                textAnchor="middle"
                className="va-tern-vertex va-tern-vertex-una"
              >
                Unaffiliated
              </text>
              <text
                x={0}
                y={triH + 20}
                textAnchor="middle"
                className="va-tern-vertex va-tern-vertex-dem"
              >
                Democrat
              </text>
              <text
                x={triW}
                y={triH + 20}
                textAnchor="middle"
                className="va-tern-vertex va-tern-vertex-rep"
              >
                Republican
              </text>
              {!isMobile && (
                <text
                  x={triW / 2}
                  y={triH + 20}
                  textAnchor="middle"
                  className="va-tern-tick va-tern-tick-mid"
                >
                  50/50
                </text>
              )}

              {data.map((county) => {
                const trail = getTrailData(county);
                if (trail.length < 2) return null;
                const isHighlighted = effectiveHighlights.includes(county.county);
                const isDimmed = hasHighlights && !isHighlighted;
                const yd = getYearData(county, year);
                if (!yd) return null;
                const { x: cx, y: cy } = ternCoords(
                  yd.dem / yd.total,
                  yd.rep / yd.total,
                  yd.minor / yd.total,
                  triW,
                  triH
                );
                const tx = toState ? stateTernPos.x - cx : 0;
                const ty = toState ? stateTernPos.y - cy : 0;
                return (
                  <g
                    key={`tern-trail-${county.county}`}
                    style={{
                      transform: `translate(${tx}px, ${ty}px)`,
                      opacity: toState ? 0 : 1,
                      transition:
                        "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                    }}
                  >
                    <path
                      d={ternaryLine(trail) ?? ""}
                      fill="none"
                      stroke={
                        isHighlighted
                          ? countyColor(trail[trail.length - 1].pctDemOfMajor)
                          : "#bbb"
                      }
                      strokeWidth={isHighlighted ? 2.5 : 0.8}
                      opacity={
                        isDimmed
                          ? isForcedMode
                            ? 0.04
                            : 0.12
                          : isHighlighted
                          ? 0.9
                          : 0.28
                      }
                    />
                  </g>
                );
              })}

              {data.map((county) => {
                const yd = getYearData(county, year);
                if (!yd) return null;
                const isHighlighted = effectiveHighlights.includes(county.county);
                const isLockTarget = county.county === lockedCounty;
                const isDimmed = hasHighlights && !isHighlighted;
                const isLargeCounty = LARGE_COUNTIES.includes(county.county);
                const { x: cx, y: cy } = ternCoords(
                  yd.dem / yd.total,
                  yd.rep / yd.total,
                  yd.minor / yd.total,
                  triW,
                  triH
                );
                const r = rScale(yd.total);
                const color = countyColor(yd.pctDemOfMajor);
                const tx = toState ? stateTernPos.x - cx : 0;
                const ty = toState ? stateTernPos.y - cy : 0;
                return (
                  <g
                    key={`tern-dot-${county.county}`}
                    style={{
                      transform: `translate(${tx}px, ${ty}px)`,
                      opacity: toState
                        ? 0.1
                        : isDimmed
                        ? isForcedMode
                          ? 0.06
                          : 0.35
                        : 1,
                      transition:
                        "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.5s",
                      pointerEvents:
                        interactive && !toState ? "auto" : "none",
                      cursor: interactive ? "pointer" : "default",
                    }}
                    onMouseEnter={() => {
                      if (interactive && !isLocked)
                        setHoveredCounty(county.county);
                    }}
                    onMouseLeave={() => {
                      if (interactive && !isLocked) setHoveredCounty(null);
                    }}
                    onClick={() => {
                      if (interactive) {
                        setLockedCounty((prev) =>
                          prev === county.county ? null : county.county
                        );
                        setHoveredCounty(null);
                      }
                    }}
                  >
                    <circle cx={cx} cy={cy} r={r + 6} fill="transparent" />
                    {isLockTarget && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r + 5}
                        fill="none"
                        stroke="#111"
                        strokeWidth={1.5}
                        strokeDasharray="3,2.5"
                      />
                    )}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={color}
                      fillOpacity={isHighlighted ? 1 : 0.75}
                      stroke={
                        isHighlighted
                          ? "#111"
                          : isLargeCounty
                          ? "#555"
                          : "white"
                      }
                      strokeWidth={isHighlighted ? 2 : 1}
                    />
                    {isHighlighted && (
                      <text
                        x={cx}
                        y={cy - r - 5}
                        textAnchor="middle"
                        className="va-county-label-hovered"
                      >
                        {county.county}
                      </text>
                    )}
                  </g>
                );
              })}

              {stateTotal &&
                (() => {
                  const trail = stateByYear.filter((s) => s.year <= year);
                  const r = isMobile ? 13 : 18;
                  const color = countyColor(stateTotal.pctDemOfMajor);
                  return (
                    <g
                      style={{
                        opacity: toState ? 1 : 0,
                        transition: "opacity 0.5s",
                        pointerEvents: toState ? "auto" : "none",
                      }}
                    >
                      {trail.length >= 2 && (
                        <path
                          d={ternaryLine(trail) ?? ""}
                          fill="none"
                          stroke={color}
                          strokeWidth={2.5}
                          opacity={0.6}
                        />
                      )}
                      {trail.map((s) => {
                        if (s.year >= year) return null;
                        const { x, y: sy } = ternCoords(
                          s.dem / s.total,
                          s.rep / s.total,
                          s.minor / s.total,
                          triW,
                          triH
                        );
                        return (
                          <circle
                            key={s.year}
                            cx={x}
                            cy={sy}
                            r={4}
                            fill={color}
                            fillOpacity={0.35}
                            stroke="none"
                          />
                        );
                      })}
                      <circle
                        cx={stateTernPos.x}
                        cy={stateTernPos.y}
                        r={r}
                        fill={color}
                        fillOpacity={0.9}
                        stroke="#111"
                        strokeWidth={2}
                      />
                      <text
                        x={stateTernPos.x}
                        y={stateTernPos.y - r - 5}
                        textAnchor="middle"
                        className="va-county-label-hovered"
                      >
                        Colorado
                      </text>
                    </g>
                  );
                })()}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
