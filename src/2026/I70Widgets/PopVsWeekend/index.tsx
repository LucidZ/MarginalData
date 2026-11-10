import { extent, format, line, mean, scaleLinear } from "d3";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dirLabel, fmtInt } from "../../I70Crossfilter/format";
import type { CounterId, Dataset } from "../../I70Crossfilter/types";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import { POPULATION, POP_LABEL, type PopArea } from "./population";

type Dir = "wb" | "eb" | "both";
type DayType = "weekend" | "weekday";
type View = "pct" | "raw";
type Chart = "main" | "rate";

interface YearPoint {
  year: number;
  pop: number; // thousands
  avg: number; // vehicles per day
  rate: number; // vehicles per 1,000 residents
  nDays: number;
  coverage: number; // share of that year's days of this type with usable data
}

const COUNTERS: { id: CounterId; label: string }[] = [
  { id: "genesee", label: "Genesee" },
  { id: "twin", label: "Twin Tunnels" },
  { id: "tunnel", label: "Eisenhower Tunnel" },
  { id: "berthoud", label: "Berthoud Pass" },
];

// Below this share of the year's days, the average leans on whichever
// months happened to be counted; drawn hollow and never offered as a base.
const MIN_COVERAGE = 0.8;

const dirName = (counter: CounterId, dir: Dir) => (dir === "both" ? "Both ways" : dirLabel(counter, dir));
const fmtPop = (k: number) => (k >= 1000 ? `${format(".2f")(k / 1000)}M` : `${fmtInt(k)}K`);
const fmtPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}%`;
const fmtRate = format(".1f");

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** One point per year: average daily vehicles on complete, closure-free days of the chosen type. */
const buildYears = (ds: Dataset, dir: Dir, dayType: DayType, area: PopArea): YearPoint[] => {
  const { days, n, dates } = ds;
  const sums = new Map<number, { vals: number[]; possible: number }>();
  for (let i = 0; i < n; i++) {
    const d = dates[i];
    if (isWeekend(d) !== (dayType === "weekend")) continue;
    const year = d.getUTCFullYear();
    let s = sums.get(year);
    if (!s) sums.set(year, (s = { vals: [], possible: 0 }));
    s.possible++;
    if (!days.complete[i] || days.closure[i]) continue;
    const w = days.wbTotal[i];
    const e = days.ebTotal[i];
    const v = dir === "wb" ? w : dir === "eb" ? e : w == null || e == null ? null : w + e;
    if (v != null && v > 0) s.vals.push(v);
  }
  const pts: YearPoint[] = [];
  for (const [year, s] of sums) {
    const pop = POPULATION[area][year];
    if (pop == null || s.vals.length === 0) continue;
    const avg = mean(s.vals) ?? 0;
    pts.push({ year, pop, avg, rate: avg / pop, nDays: s.vals.length, coverage: s.vals.length / s.possible });
  }
  return pts.sort((a, b) => a.year - b.year);
};

/** Pearson r over the full-coverage years. */
const pearson = (pts: YearPoint[]) => {
  const xs = pts.map((p) => p.pop);
  const ys = pts.map((p) => p.avg);
  const mx = mean(xs) ?? 0;
  const my = mean(ys) ?? 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
};

/**
 * Two linear scales with the same pixels per unit, each spanning at least
 * its data (plus 0, the base year) and stretched to fill the plot. A 45°
 * line on screen is then exactly "grew by the same %".
 */
const equalScales = (
  xs: number[],
  ys: number[],
  [x0, x1]: [number, number],
  [y0, y1]: [number, number], // y0 = bottom pixel
) => {
  const span = (vals: number[]) => {
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const pad = (hi - lo) * 0.08 || 5;
    return [lo - pad, hi + pad] as const;
  };
  const [xl, xh] = span(xs);
  const [yl, yh] = span(ys);
  const k = Math.min((x1 - x0) / (xh - xl), (y0 - y1) / (yh - yl));
  const xw = (x1 - x0) / k;
  const yw = (y0 - y1) / k;
  // Spare room goes up and to the right, where the diagonal carries on.
  return {
    x: scaleLinear([xl, xl + xw], [x0, x1]),
    y: scaleLinear([yl, yl + yw], [y0, y1]),
  };
};

export default function PopVsWeekend() {
  const { data, error } = useData();
  const [counter, setCounter] = useState<CounterId>("twin");
  const [dir, setDir] = useState<Dir>("both");
  const [dayType, setDayType] = useState<DayType>("weekend");
  const [area, setArea] = useState<PopArea>("metro");
  const [view, setView] = useState<View>("pct");
  const [baseChoice, setBaseChoice] = useState<number | null>(null);
  const [hover, setHover] = useState<{ p: YearPoint; chart: Chart } | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();

  const ds = data?.find((d) => d.days.id === counter) ?? null;
  const pts = useMemo(() => (ds ? buildYears(ds, dir, dayType, area) : []), [ds, dir, dayType, area]);
  const full = pts.filter((p) => p.coverage >= MIN_COVERAGE);
  const r = full.length > 2 ? pearson(full) : NaN;

  // The chosen base survives toggles when it still has full coverage;
  // otherwise fall back to the earliest year that does.
  const base = full.find((p) => p.year === baseChoice) ?? full[0] ?? pts[0];
  const pctX = (p: YearPoint) => (base ? (p.pop / base.pop - 1) * 100 : 0);
  const pctY = (p: YearPoint) => (base ? (p.avg / base.avg - 1) * 100 : 0);

  const compact = width < 560;
  const height = compact ? 380 : 500;
  const m = { top: 28, right: 24, bottom: 44, left: compact ? 52 : 60 };
  const xRange: [number, number] = [m.left, width - m.right];
  const yRange: [number, number] = [height - m.bottom, m.top];

  const { x, y, xv, yv } = useMemo(() => {
    if (view === "pct") {
      const s = equalScales(pts.map(pctX), pts.map(pctY), xRange, yRange);
      return { ...s, xv: pctX, yv: pctY };
    }
    const [xlo, xhi] = extent(pts, (p) => p.pop) as [number, number];
    const [ylo, yhi] = extent(pts, (p) => p.avg) as [number, number];
    const xp = ((xhi ?? 1) - (xlo ?? 0)) * 0.06 || 1;
    const yp = ((yhi ?? 1) - (ylo ?? 0)) * 0.08 || 1;
    return {
      x: scaleLinear([(xlo ?? 0) - xp, (xhi ?? 1) + xp], xRange).nice(),
      y: scaleLinear([(ylo ?? 0) - yp, (yhi ?? 1) + yp], yRange).nice(),
      xv: (p: YearPoint) => p.pop,
      yv: (p: YearPoint) => p.avg,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts, view, base, width, height]);

  const px = (p: YearPoint) => x(xv(p));
  const py = (p: YearPoint) => y(yv(p));
  const path = line<YearPoint>(px, py)(pts) ?? "";
  const first = pts[0]?.year;
  const last = pts[pts.length - 1]?.year;
  // Every year on a wide screen; ends, round years and the base on a phone.
  const labelled = (yr: number) =>
    !compact || yr === first || yr === last || yr === base?.year || yr % 5 === 0;

  // "Grew in step" diagonal, clipped to where both domains overlap.
  const [dxl, dxh] = x.domain();
  const [dyl, dyh] = y.domain();
  const dLo = Math.max(dxl, dyl);
  const dHi = Math.min(dxh, dyh);

  // Per-1,000-residents strip under the scatter.
  const rateH = compact ? 190 : 220;
  const rm = { top: 24, right: compact ? 24 : 120, bottom: 28, left: m.left };
  const rx = scaleLinear([first ?? 0, last ?? 1], [rm.left, width - rm.right]);
  const ry = useMemo(() => {
    const [lo, hi] = extent(pts, (p) => p.rate) as [number, number];
    const pad = ((hi ?? 1) - (lo ?? 0)) * 0.12 || 1;
    return scaleLinear([(lo ?? 0) - pad, (hi ?? 1) + pad], [rateH - rm.bottom, rm.top]).nice();
  }, [pts, rateH, rm.bottom, rm.top]);
  const ratePath = line<YearPoint>((p) => rx(p.year), (p) => ry(p.rate))(pts) ?? "";

  const counterLabel = COUNTERS.find((c) => c.id === counter)?.label;
  const dayWord = dayType === "weekend" ? "weekend" : "weekday";
  const fill = (p: YearPoint) =>
    p.coverage < MIN_COVERAGE ? "var(--surface-1)" : p.year === 2020 ? "var(--counter)" : "var(--car)";
  const stroke = (p: YearPoint) => (p.year === 2020 ? "var(--counter)" : "var(--car)");

  const hoverHandlers = (p: YearPoint, chart: Chart) => ({
    onPointerEnter: () => setHover({ p, chart }),
    onPointerLeave: () => setHover(null),
  });

  const tip = (p: YearPoint) => (
    <>
      <strong>{p.year}</strong>
      <span>
        {fmtInt(p.pop * 1000)} people
        {base && p !== base && ` (${fmtPct(pctX(p))} vs ${base.year})`}
      </span>
      <span>
        {fmtInt(p.avg)} vehicles a {dayWord} day
        {base && p !== base && ` (${fmtPct(pctY(p))})`}
      </span>
      <span>{fmtRate(p.rate)} per 1,000 residents</span>
      <span>
        {p.nDays} {dayWord} days counted ({Math.round(p.coverage * 100)}%)
      </span>
    </>
  );

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>More Denver, more traffic?</h1>
      <p className="i70w-intro">
        One dot per year, joined in order. Across: how much Denver's population has grown since a base
        year. Up: how much the average {dayWord} day's traffic has grown at one counter. Both axes use the
        same scale, so the diagonal is growth in step: above it, traffic outgrew the city; below it, the
        city outgrew the traffic.
      </p>

      <div className="i70w-controls">
        <div className="i70w-seg" role="group" aria-label="Counter">
          {COUNTERS.map((c) => (
            <button key={c.id} aria-pressed={counter === c.id} onClick={() => setCounter(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Direction">
          {(["both", "wb", "eb"] as Dir[]).map((d) => (
            <button key={d} aria-pressed={dir === d} onClick={() => setDir(d)}>
              {dirName(counter, d)}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Days">
          {(["weekend", "weekday"] as DayType[]).map((t) => (
            <button key={t} aria-pressed={dayType === t} onClick={() => setDayType(t)}>
              {t === "weekend" ? "Weekends" : "Weekdays"}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Population">
          {(["metro", "city"] as PopArea[]).map((a) => (
            <button key={a} aria-pressed={area === a} onClick={() => setArea(a)}>
              {POP_LABEL[a]}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Axes">
          <button aria-pressed={view === "pct"} onClick={() => setView("pct")}>
            % change
          </button>
          <button aria-pressed={view === "raw"} onClick={() => setView("raw")}>
            Raw counts
          </button>
        </div>
        <label className="i70w-flow">
          Base year
          <select value={base?.year ?? ""} onChange={(e) => setBaseChoice(Number(e.target.value))}>
            {full.map((p) => (
              <option key={p.year} value={p.year}>
                {p.year}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}
      <div className="i70w-canvas-wrap i70w-scatter" ref={wrapRef}>
        {pts.length > 0 && base && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${pts.length} years: Denver population against average ${dayWord} traffic`}
          >
            {y.ticks(compact ? 5 : 7).map((t) => (
              <g key={`y${t}`}>
                <line
                  className="i70w-grid"
                  style={view === "pct" && t === 0 ? { stroke: "var(--baseline)" } : undefined}
                  x1={m.left}
                  x2={width - m.right}
                  y1={y(t)}
                  y2={y(t)}
                />
                <text className="i70w-tick" x={m.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {view === "pct" ? fmtPct(t) : fmtInt(t)}
                </text>
              </g>
            ))}
            {x.ticks(compact ? 4 : 7).map((t) => (
              <g key={`x${t}`}>
                <line
                  className="i70w-grid"
                  style={view === "pct" && t === 0 ? { stroke: "var(--baseline)" } : undefined}
                  x1={x(t)}
                  x2={x(t)}
                  y1={m.top}
                  y2={height - m.bottom}
                />
                <text className="i70w-tick" x={x(t)} y={height - m.bottom + 16} textAnchor="middle">
                  {view === "pct" ? fmtPct(t) : fmtPop(t)}
                </text>
              </g>
            ))}
            <text className="i70w-direct" x={(m.left + width - m.right) / 2} y={height - 8} textAnchor="middle">
              {POP_LABEL[area]} population{view === "pct" && `, change since ${base.year}`} →
            </text>
            <text className="i70w-direct" x={0} y={14}>
              ↑ Average {dayWord} day{view === "pct" ? `, change since ${base.year}` : ", vehicles"}
            </text>

            {view === "pct" && dHi > dLo && (
              <g>
                <line
                  x1={x(dLo)}
                  y1={y(dLo)}
                  x2={x(dHi)}
                  y2={y(dHi)}
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                />
                <text
                  className="i70w-tick"
                  transform={`translate(${x(dHi) - 6},${y(dHi) + 14}) rotate(-45)`}
                  textAnchor="end"
                >
                  grew in step
                </text>
                <text className="i70w-direct" x={m.left + 10} y={m.top + 14} style={{ fill: "var(--muted)" }}>
                  Traffic outgrew population
                </text>
                <text
                  className="i70w-direct"
                  x={width - m.right - 10}
                  y={height - m.bottom - 10}
                  textAnchor="end"
                  style={{ fill: "var(--muted)" }}
                >
                  Population outgrew traffic
                </text>
              </g>
            )}

            <path d={path} fill="none" stroke="var(--baseline)" strokeWidth={1.25} />

            {pts.map((p) => {
              const on = hover?.p.year === p.year;
              return (
                <g key={p.year}>
                  {p === base && view === "pct" && (
                    <circle cx={px(p)} cy={py(p)} r={9} fill="none" stroke="var(--text-secondary)" />
                  )}
                  <circle
                    cx={px(p)}
                    cy={py(p)}
                    r={on ? 6.5 : 4.5}
                    fill={fill(p)}
                    stroke={stroke(p)}
                    strokeWidth={p.coverage < MIN_COVERAGE ? 1.5 : 1}
                  />
                  {labelled(p.year) && (
                    <text className="i70w-tick" x={px(p) + 7} y={py(p) - 7}>
                      {p.year}
                    </text>
                  )}
                  <circle cx={px(p)} cy={py(p)} r={14} fill="transparent" {...hoverHandlers(p, "main")} />
                </g>
              );
            })}
          </svg>
        )}
        {hover?.chart === "main" && (
          <div
            className="i70w-tip"
            style={{ left: Math.min(px(hover.p) + 12, width - 200), top: Math.max(py(hover.p) - 100, 0) }}
          >
            {tip(hover.p)}
          </div>
        )}
      </div>

      <h2 className="i70w-h2">Vehicles per 1,000 residents</h2>
      <p className="i70w-note">
        The same comparison as a ratio: a flat line is growth in step. Above the dashed {base?.year} line
        means above the diagonal.
      </p>
      <div className="i70w-canvas-wrap i70w-scatter">
        {pts.length > 0 && base && (
          <svg width={width} height={rateH} role="img" aria-label="Average traffic per 1,000 residents by year">
            {ry.ticks(4).map((t) => (
              <g key={`r${t}`}>
                <line className="i70w-grid" x1={rm.left} x2={width - rm.right} y1={ry(t)} y2={ry(t)} />
                <text className="i70w-tick" x={rm.left - 8} y={ry(t)} textAnchor="end" dominantBaseline="middle">
                  {fmtRate(t)}
                </text>
              </g>
            ))}
            {rx.ticks(compact ? 4 : 8).map((t) => (
              <text key={`t${t}`} className="i70w-tick" x={rx(t)} y={rateH - 8} textAnchor="middle">
                {t}
              </text>
            ))}
            <line
              x1={rm.left}
              x2={width - rm.right}
              y1={ry(base.rate)}
              y2={ry(base.rate)}
              stroke="var(--muted)"
              strokeDasharray="4 4"
            />
            {!compact && (
              <text className="i70w-tick" x={width - rm.right + 6} y={ry(base.rate)} dominantBaseline="middle">
                in step with {base.year}
              </text>
            )}
            <path d={ratePath} fill="none" stroke="var(--baseline)" strokeWidth={1.25} />
            {pts.map((p) => (
              <g key={p.year}>
                <circle
                  cx={rx(p.year)}
                  cy={ry(p.rate)}
                  r={hover?.p.year === p.year ? 5.5 : 3.5}
                  fill={fill(p)}
                  stroke={stroke(p)}
                  strokeWidth={p.coverage < MIN_COVERAGE ? 1.5 : 1}
                />
                <circle cx={rx(p.year)} cy={ry(p.rate)} r={12} fill="transparent" {...hoverHandlers(p, "rate")} />
              </g>
            ))}
          </svg>
        )}
        {hover?.chart === "rate" && (
          <div
            className="i70w-tip"
            style={{
              left: Math.min(rx(hover.p.year) + 12, width - 200),
              top: Math.max(ry(hover.p.rate) - 100, 0),
            }}
          >
            {tip(hover.p)}
          </div>
        )}
      </div>

      <p className="i70w-note">
        {counterLabel}, {dirName(counter, dir).toLowerCase()}, {first}–{last}
        {view === "raw" && Number.isFinite(r) && ` · r = ${r.toFixed(2)} over the solid dots`}. Weekends are
        Saturday and Sunday, holidays not separated. Days missing any hour or flagged as a closure are left
        out; hollow dots are years with under {MIN_COVERAGE * 100}% of their {dayWord} days usable, so their
        average leans on whichever months got counted, and they can't be the base year. 2020 in orange. The
        answer depends on the base year: pick a different one and every dot shifts. In-step growth is a
        yardstick, not an expectation: on busy days the road runs near its hourly ceiling, so traffic can
        only grow by staying busy for longer or by adding lanes (the eastbound express lane opened at Twin
        Tunnels in December 2015). Population: Census Bureau July 1 estimates via FRED (metro{" "}
        <a href="https://fred.stlouisfed.org/series/DNVPOP">DNVPOP</a>, from 2000; city and county{" "}
        <a href="https://fred.stlouisfed.org/series/CODENV5POP">CODENV5POP</a>). The current partial year has
        no population estimate yet, so it is left off.
      </p>
    </div>
  );
}
