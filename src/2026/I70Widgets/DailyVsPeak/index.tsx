import { Delaunay, extent, max, quantile, scaleLinear } from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { dirLabel, fmtDate, fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { MISSING, type CounterId, type Dataset } from "../../I70Crossfilter/types";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";

type Dir = "wb" | "eb" | "both";
type ColorBy = "none" | "weekend" | "season";

interface Point {
  day: number;
  peak: number;
  peakHour: number;
  total: number;
  group: number;
}

// Fixed hue order (crossfilter's validated --cat-* tokens). Group 0 of each
// grouping is the recessive "everything else".
const GROUPINGS: Record<ColorBy, { labels: string[]; colors: string[]; key: (d: Date) => number }> = {
  none: { labels: ["All days"], colors: ["--car"], key: () => 0 },
  weekend: {
    labels: ["Weekday", "Weekend"],
    colors: ["--off", "--cat-2"],
    key: (d) => (d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 1 : 0),
  },
  season: {
    labels: ["Spring / fall", "Ski season (Dec–Mar)", "Summer (Jun–Aug)"],
    colors: ["--off", "--cat-1", "--cat-4"],
    key: (d) => {
      const m = d.getUTCMonth();
      if (m === 11 || m <= 2) return 1;
      if (m >= 5 && m <= 7) return 2;
      return 0;
    },
  },
};

const COUNTERS: { id: CounterId; label: string }[] = [
  { id: "twin", label: "Twin Tunnels" },
  { id: "tunnel", label: "Eisenhower Tunnel" },
  { id: "berthoud", label: "Berthoud Pass" },
];

const dirName = (counter: CounterId, dir: Dir) => (dir === "both" ? "Both ways" : dirLabel(counter, dir));

/** One point per complete, closure-free day: busiest hour vs. the day's total. */
const buildPoints = (ds: Dataset, dir: Dir, colorBy: ColorBy): Point[] => {
  const { days, n, dates, wb, eb } = ds;
  const key = GROUPINGS[colorBy].key;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    if (!days.complete[i] || days.closure[i]) continue;
    let peak = -1;
    let peakHour = 0;
    let total = 0;
    let ok = true;
    for (let h = 0; h < 24; h++) {
      const a = wb[i * 24 + h];
      const b = eb[i * 24 + h];
      if (a === MISSING || b === MISSING) {
        ok = false;
        break;
      }
      const v = dir === "wb" ? a : dir === "eb" ? b : a + b;
      total += v;
      if (v > peak) {
        peak = v;
        peakHour = h;
      }
    }
    if (ok && total > 0) pts.push({ day: i, peak, peakHour, total, group: key(dates[i]) });
  }
  // Recessive group drawn first so the highlighted ones sit on top.
  return pts.sort((p, q) => p.group - q.group);
};

export default function DailyVsPeak() {
  const { data, error } = useData();
  const [counter, setCounter] = useState<CounterId>("twin");
  const [dir, setDir] = useState<Dir>("wb");
  const [colorBy, setColorBy] = useState<ColorBy>("season");
  const [yearFrom, setYearFrom] = useState(1996);
  const [hover, setHover] = useState<Point | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const ds = data?.find((d) => d.days.id === counter) ?? null;
  const lastYear = ds ? ds.dates[ds.n - 1].getUTCFullYear() : 2026;

  const allPoints = useMemo(() => (ds ? buildPoints(ds, dir, colorBy) : []), [ds, dir, colorBy]);
  const points = useMemo(
    () => (ds ? allPoints.filter((p) => ds.dates[p.day].getUTCFullYear() >= yearFrom) : []),
    [ds, allPoints, yearFrom],
  );

  const compact = width < 560;
  const height = compact ? 380 : 520;
  const m = { top: 28, right: 28, bottom: 44, left: compact ? 48 : 56 };

  // Domains from every year so the axes hold still while the year filter moves.
  const x = useMemo(() => {
    // A handful of counter glitches (e.g. 9,317 in one hour) would squash
    // everything else; cap at the 99.95th percentile and pin those to the edge.
    const hi = quantile(allPoints, 0.9995, (p) => p.peak) ?? 1;
    return scaleLinear([0, hi * 1.08], [m.left, width - m.right]).nice();
  }, [allPoints, width, m.left, m.right]);
  const y = useMemo(() => {
    const hi = max(allPoints, (p) => p.total) ?? 1;
    return scaleLinear([0, hi * 1.03], [height - m.bottom, m.top]).nice();
  }, [allPoints, height, m.bottom, m.top]);

  const xMax = x.range()[1];
  const px = (p: Point) => Math.min(x(p.peak), xMax);
  const nClipped = points.filter((p) => x(p.peak) > xMax).length;

  const delaunay = useMemo(
    () => Delaunay.from(points, (p) => Math.min(x(p.peak), xMax), (p) => y(p.total)),
    [points, x, y, xMax],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(canvas);
    const v = (name: string) => css.getPropertyValue(name).trim();
    const font = `${compact ? 11 : 12}px system-ui, sans-serif`;

    ctx.clearRect(0, 0, width, height);

    // Grid + axes
    ctx.font = font;
    ctx.lineWidth = 1;
    ctx.fillStyle = v("--muted");
    ctx.strokeStyle = v("--gridline");
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of y.ticks(compact ? 5 : 8)) {
      ctx.beginPath();
      ctx.moveTo(m.left, Math.round(y(t)) + 0.5);
      ctx.lineTo(width - m.right, Math.round(y(t)) + 0.5);
      ctx.stroke();
      ctx.fillText(fmtInt(t), m.left - 8, y(t));
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const t of x.ticks(compact ? 5 : 10)) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x(t)) + 0.5, m.top);
      ctx.lineTo(Math.round(x(t)) + 0.5, height - m.bottom);
      ctx.stroke();
      ctx.fillText(fmtInt(t), x(t), height - m.bottom + 6);
    }
    ctx.strokeStyle = v("--baseline");
    ctx.beginPath();
    ctx.moveTo(m.left, height - m.bottom + 0.5);
    ctx.lineTo(width - m.right, height - m.bottom + 0.5);
    ctx.stroke();

    ctx.fillStyle = v("--text-secondary");
    ctx.fillText("Busiest hour of the day (vehicles) →", (m.left + width - m.right) / 2, height - 18);
    ctx.textAlign = "left";
    ctx.fillText("↑ Vehicles that day", 0, 2);

    // Dots
    const colors = GROUPINGS[colorBy].colors.map(v);
    const r = compact ? 1.6 : 2;
    ctx.globalAlpha = colorBy === "none" ? 0.35 : 0.5;
    for (const p of points) {
      ctx.fillStyle = colors[p.group];
      ctx.beginPath();
      ctx.arc(px(p), y(p.total), r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (hover) {
      ctx.beginPath();
      ctx.arc(px(hover), y(hover.total), 5, 0, Math.PI * 2);
      ctx.fillStyle = colors[hover.group];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = v("--surface-1");
      ctx.stroke();
    }
  }, [points, x, y, width, height, compact, colorBy, hover, m.left, m.right, m.top, m.bottom]);

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const i = delaunay.find(mx, my);
    const p = points[i];
    if (!p || Math.hypot(px(p) - mx, y(p.total) - my) > 24) setHover(null);
    else setHover(p);
  };

  const grouping = GROUPINGS[colorBy];
  const [peakLo, peakHi] = extent(points, (p) => p.peak);
  const ratio = (p: Point) => (p.total / p.peak).toFixed(1);

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>Busy hour, busy day</h1>
      <p className="i70w-intro">
        One dot per day. Across: the day's busiest hour. Up: every vehicle that day. If the road has a hard
        hourly ceiling, the dots pile up against a wall on the right while the daily total keeps climbing:
        the day gets busier by staying busy for longer, not by getting any busier at its peak.
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
          {(["wb", "eb", "both"] as Dir[]).map((d) => (
            <button key={d} aria-pressed={dir === d} onClick={() => setDir(d)}>
              {dirName(counter, d)}
            </button>
          ))}
        </div>
        <label className="i70w-flow">
          Color by
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="none">Nothing</option>
            <option value="weekend">Weekday / weekend</option>
            <option value="season">Season</option>
          </select>
        </label>
        <label className="i70w-flow">
          Since
          <input
            type="range"
            min={1996}
            max={lastYear}
            value={yearFrom}
            onChange={(e) => setYearFrom(Number(e.target.value))}
          />
          <output>{yearFrom}</output>
        </label>
      </div>

      {colorBy !== "none" && (
        <div className="i70w-legend">
          {grouping.labels.map((l, g) => (
            <span key={l}>
              <i style={{ background: `var(${grouping.colors[g]})` }} />
              {l}
            </span>
          ))}
        </div>
      )}

      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}
      <div className="i70w-canvas-wrap i70w-scatter" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ width, height }}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Scatter of ${points.length} days: busiest hour against daily total`}
        />
        {hover && ds && (
          <div
            className="i70w-tip"
            style={{
              left: Math.min(px(hover) + 12, width - 190),
              top: Math.max(y(hover.total) - 70, 0),
            }}
          >
            <strong>{fmtDate(ds.dates[hover.day])}</strong>
            <span>
              {ds.dates[hover.day].toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" })}
            </span>
            <span>
              {fmtInt(hover.total)} vehicles that day
            </span>
            <span>
              Busiest hour {fmtInt(hover.peak)} ({hourLabel(hover.peakHour)}–{hourLabel(hover.peakHour + 1)})
            </span>
            <span>Day = {ratio(hover)}× its busiest hour</span>
          </div>
        )}
      </div>
      <p className="i70w-note">
        {fmtInt(points.length)} days at {COUNTERS.find((c) => c.id === counter)?.label},{" "}
        {dirName(counter, dir).toLowerCase()}, {yearFrom}–{lastYear}
        {peakLo != null && ` · busiest hours ${fmtInt(peakLo)}–${fmtInt(peakHi ?? 0)}`}.
        {nClipped > 0 && ` ${nClipped} day${nClipped > 1 ? "s" : ""} with an off-scale busiest hour (the biggest look like counter glitches) pinned to the right edge.`} Days missing any hour
        or flagged as a closure are left out. Axes stay fixed as the year slider moves.
      </p>
    </div>
  );
}
