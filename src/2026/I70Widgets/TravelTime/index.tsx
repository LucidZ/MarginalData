import { area, line, scaleLinear } from "d3";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fmtDate, fmtInt, hourLabel } from "../../I70Crossfilter/format";
import type { Direction } from "../../I70Crossfilter/types";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";
import {
  CALIBRATION_FROM,
  H0,
  JAM_CARS,
  KINDS,
  LANES,
  MILES,
  calibration,
  carsAt,
  dayCurves,
  downstreamName,
  hourRows,
  impossibleHours,
  kindSummary,
  slowestHour,
  upstreamName,
  type CalPoint,
  type DayCurves,
  type HourRow,
  type Sets,
} from "./ncurve";

const PRESETS: { date: string; dir: Direction; label: string }[] = [
  { date: "2023-03-08", dir: "wb", label: "Quiet Wednesday" },
  { date: "2023-02-04", dir: "wb", label: "Clear ski Saturday" },
  { date: "2020-01-05", dir: "eb", label: "New Year's Sunday" },
  { date: "2023-07-29", dir: "wb", label: "Summer Saturday" },
  { date: "2025-07-27", dir: "eb", label: "Busiest 2025 Sunday" },
  { date: "2016-03-23", dir: "eb", label: "Blizzard Wednesday" },
];

const DAY_MS = 86400000;
const MAX_MPH = 70;

/** Fractional hour to "9:42a". */
const clock = (t: number) => {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  const [hh, mm] = m === 60 ? [h + 1, 0] : [h, m];
  const label = hourLabel(hh);
  return `${label.slice(0, -1)}:${String(mm).padStart(2, "0")}${label.slice(-1)}`;
};
const hourSpan = (h: number) => `${hourLabel(h)}–${hourLabel(h + 1)}`;
const fmtMph = (r: HourRow, freeMph: number) =>
  r.free ? `free flow (${freeMph} mph assumed)` : `${Math.round(r.mph)} mph`;

export default function TravelTime() {
  const { data, error } = useData();
  const [date, setDate] = useState("2020-01-05");
  const [dir, setDir] = useState<Direction>("eb");
  const [berthoud, setBerthoud] = useState(true);
  const [freeMph, setFreeMph] = useState(55);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();

  const sets = useMemo<Sets | null>(() => {
    if (!data) return null;
    const get = (id: string) => data.find((d) => d.days.id === id);
    const twin = get("twin");
    const tunnel = get("tunnel");
    const bert = get("berthoud");
    return twin && tunnel && bert ? { twin, tunnel, berthoud: bert } : null;
  }, [data]);

  const day = sets ? Math.round((Date.parse(`${date}T00:00:00Z`) - sets.twin.dates[0].getTime()) / DAY_MS) : -1;
  const inRange = sets != null && day >= 0 && day < sets.twin.n;
  const curves = useMemo(
    () => (sets && inRange ? dayCurves(sets, day, dir, berthoud, freeMph) : null),
    [sets, inRange, day, dir, berthoud, freeMph],
  );
  const rows = useMemo(() => (curves ? hourRows(curves, freeMph) : []), [curves, freeMph]);
  const cal = useMemo(() => (sets ? calibration(sets, dir, berthoud, freeMph) : []), [sets, dir, berthoud, freeMph]);
  const kinds = useMemo(() => kindSummary(cal), [cal]);

  const compact = width < 560;
  const up = upstreamName(dir, berthoud);
  const down = downstreamName(dir, berthoud);
  const dateObj = new Date(`${date}T00:00:00Z`);
  const minDate = sets ? sets.twin.dates[0].toISOString().slice(0, 10) : undefined;
  const maxDate = sets ? sets.twin.dates[sets.twin.n - 1].toISOString().slice(0, 10) : undefined;
  const hoverRow = hoverT != null ? (rows.find((r) => r.hour === Math.floor(hoverT)) ?? null) : null;

  const pickDay = (i: number) => {
    if (!sets) return;
    setDate(sets.twin.dates[i].toISOString().slice(0, 10));
    setHoverT(null);
  };

  const slow = rows.length ? slowestHour(rows) : null;
  const slowHours = rows.filter((r) => !r.free && r.hour >= 6 && r.hour < 21).length;
  const peakCars = rows.length ? Math.max(...rows.map((r) => r.cars)) : 0;
  const nImpossible = rows.length ? impossibleHours(rows) : 0;

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>Counting the cars in between</h1>
      <p className="i70w-intro">
        Two counters {MILES} miles apart. Count every car past each one from {hourLabel(H0)}, scale the upstream count
        by the share of cars that actually reach the downstream counter, and the gap between the two running totals is
        how many cars are on the stretch right now. More cars on the same {MILES} miles at the same flow means slower
        cars: speed = flow ÷ cars per mile. When there are fewer cars than free flow would hold, call it free flow.
      </p>

      <div className="i70w-controls">
        <div className="i70w-chips" role="group" aria-label="Example days">
          {PRESETS.map((p) => (
            <button
              key={p.date}
              aria-pressed={date === p.date && dir === p.dir}
              onClick={() => {
                setDate(p.date);
                setDir(p.dir);
                setHoverT(null);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="i70w-controls">
        <label className="i70w-flow">
          Day
          <input
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
        <div className="i70w-seg" role="group" aria-label="Direction">
          {(["wb", "eb"] as Direction[]).map((d) => (
            <button key={d} aria-pressed={dir === d} onClick={() => setDir(d)}>
              {d === "wb" ? "Westbound" : "Eastbound"}
            </button>
          ))}
        </div>
        <label className="i70w-flow">
          <input type="checkbox" checked={berthoud} onChange={(e) => setBerthoud(e.target.checked)} />
          Count US-40 (Berthoud) as through traffic
        </label>
      </div>
      <div className="i70w-controls">
        <label className="i70w-flow">
          Free-flow speed
          <input
            type="range"
            min={45}
            max={65}
            step={5}
            value={freeMph}
            onChange={(e) => setFreeMph(Number(e.target.value))}
          />
          <output>{freeMph} mph</output>
        </label>
      </div>

      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}

      <div ref={wrapRef} className="i70w-canvas-wrap">
        {sets && !curves && (
          <p className="i70w-note">
            {fmtDate(dateObj)}: a counter is missing an hour that day, so there are no curves to compare.
          </p>
        )}
        {curves && slow && (
          <>
            <p className="i70w-summary">
              <strong>{fmtDate(dateObj)}</strong>{" "}
              {dateObj.toLocaleDateString("en-US", {
                timeZone: "UTC",
                weekday: "long",
              })}
              , {dir === "wb" ? "westbound" : "eastbound"}. Upstream scaled by {curves.share.toFixed(2)}; starts with{" "}
              {fmtInt(curves.startCars)} cars on the stretch at {hourLabel(H0)} and ends with {fmtInt(curves.endCars)}{" "}
              at midnight, what free flow would hold.{" "}
              {slowHours === 0 ? (
                <>
                  Free flow all day ({hourLabel(6)}–{hourLabel(21)}).
                </>
              ) : (
                <>
                  Slowest hour {hourSpan(slow.hour)}: <strong>{Math.round(slow.mph)} mph</strong>; {slowHours} hour
                  {slowHours > 1 ? "s" : ""} below free flow.
                </>
              )}{" "}
              At most {fmtInt(peakCars)} cars between the counters (a full jam holds about {fmtInt(JAM_CARS)}).
              {nImpossible > 0 &&
                ` ${nImpossible} daytime hour${nImpossible > 1 ? "s" : ""} would have fewer than zero cars; held at zero.`}
            </p>
            <CumulativeChart
              curves={curves}
              width={width}
              compact={compact}
              up={up}
              down={down}
              hoverT={hoverT}
              setHoverT={setHoverT}
            />
            <CarsChart
              rows={rows}
              width={width}
              compact={compact}
              freeMph={freeMph}
              hoverRow={hoverRow}
              setHoverT={setHoverT}
            />
            <SpeedChart
              rows={rows}
              width={width}
              compact={compact}
              freeMph={freeMph}
              hoverRow={hoverRow}
              setHoverT={setHoverT}
            />
            <SpacingChart
              rows={rows}
              width={width}
              compact={compact}
              hoverRow={hoverRow}
              setHoverT={setHoverT}
              title="Seconds per car, per lane"
              note="3,600 ÷ (flow per lane): straight from the counters, no running balance."
              unit="s"
              value={(r) => (r.flow > 0 ? (3600 * LANES) / r.flow : null)}
            />
            <SpacingChart
              rows={rows}
              width={width}
              compact={compact}
              hoverRow={hoverRow}
              setHoverT={setHoverT}
              title="Feet per car, per lane"
              note={`${MILES} mi × 5,280 ft × ${LANES} lanes ÷ cars on the stretch: carries the running-balance error.`}
              unit="ft"
              value={(r) => (r.cars > 0 ? (MILES * 5280 * LANES) / r.cars : null)}
            />
          </>
        )}
        {sets && (
          <CalibrationStrip
            points={cal}
            kinds={kinds}
            width={width}
            compact={compact}
            freeMph={freeMph}
            dates={sets.twin.dates}
            selected={day}
            onPick={pickDay}
          />
        )}
      </div>

      <h2 className="i70w-h2">What to trust</h2>
      <ul className="i70w-notes">
        <li>
          <strong>The threshold makes quiet days pass by construction.</strong> Calling it free flow whenever there are
          fewer cars than free flow would hold is the same as capping the speed at the free-flow speed. That cleans up
          the nights and quiet days, but it doesn't test anything: the earlier version of this widget, without the cap,
          put quiet days at over 100 mph.
        </li>
        <li>
          <strong>The share still isn't constant.</strong> About a fifth of the traffic enters or leaves between the
          counters without being counted: Loveland ski area, Loveland Pass, Idaho Springs, Georgetown. When they come
          and go at different times from the through traffic, the gap between the curves moves for reasons that have
          nothing to do with speed. Hours that would have fewer than zero cars are the same error, caught in the act;
          they're held at zero, which adds cars that then never leave. The result is fragile on quiet days: starting and
          ending at the free-flow load instead of zero adds only 50–150 cars, but it drops the share of quiet westbound
          midweek days that stay at free flow all day from 72% to 45%. Weekends barely move (about 2 mph slower).
        </li>
        <li>
          <strong>Lanes.</strong> Spacing per lane and the jam ceiling assume {LANES} lanes each way. Eastbound has a
          third, the weekend express lane, for part of the way.
        </li>
        <li>
          <strong>Closures break it.</strong> When the road closes, cars turn back instead of waiting, so the count of
          cars in between stops being real.
        </li>
      </ul>
    </div>
  );
}

interface ChartBase {
  width: number;
  compact: boolean;
}

const margins = (compact: boolean, top = 16) => ({
  top,
  right: compact ? 16 : 90,
  bottom: 32,
  left: compact ? 48 : 60,
});

const hourTicks = (compact: boolean) => {
  const out: number[] = [];
  for (let h = 6; h <= 24; h += compact ? 6 : 3) out.push(h);
  return out;
};

function HourAxis({ x, y0, compact }: { x: (h: number) => number; y0: number; compact: boolean }) {
  return (
    <>
      {hourTicks(compact).map((h) => (
        <text key={h} className="i70w-tick" x={x(h)} y={y0 + 18} textAnchor="middle">
          {hourLabel(h)}
        </text>
      ))}
    </>
  );
}

/** Pointer x to a fractional hour, clamped to the counted day. */
const pointerHour = (e: React.PointerEvent<SVGSVGElement>, invert: (px: number) => number) => {
  const r = e.currentTarget.getBoundingClientRect();
  return Math.min(Math.max(invert(e.clientX - r.left), H0), 23.999);
};

function CumulativeChart({
  curves,
  width,
  compact,
  up,
  down,
  hoverT,
  setHoverT,
}: ChartBase & {
  curves: DayCurves;
  up: string;
  down: string;
  hoverT: number | null;
  setHoverT: (t: number | null) => void;
}) {
  const height = compact ? 260 : 320;
  const m = margins(compact, 24);
  const x = scaleLinear([H0, 24], [m.left, width - m.right]);
  const y = scaleLinear([0, curves.total], [height - m.bottom, m.top]).nice();
  const path = (n: number[]) =>
    line<number>()
      .x((_, i) => x(curves.hours[i]))
      .y((v) => y(v))(n) ?? "";
  const at = (n: number[], t: number) => {
    const i = Math.min(Math.floor(t - H0), n.length - 2);
    return n[i] + (n[i + 1] - n[i]) * (t - curves.hours[i]);
  };

  return (
    <figure className="i70w-fig">
      <figcaption>
        Cars counted since {hourLabel(H0)}
        <span className="i70w-legend">
          <span>
            <i style={{ background: "var(--car)" }} />
            {up} × {curves.share.toFixed(2)} (upstream)
          </span>
          <span>
            <i style={{ background: "var(--counter)" }} />
            {down} (downstream)
          </span>
        </span>
      </figcaption>
      <svg
        width={width}
        height={height}
        onPointerMove={(e) => setHoverT(pointerHour(e, x.invert))}
        onPointerLeave={() => setHoverT(null)}
        role="img"
        aria-label="Running totals at the upstream and downstream counters"
      >
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line className="i70w-grid" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
            <text className="i70w-tick" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        <HourAxis x={x} y0={height - m.bottom} compact={compact} />
        <line className="i70w-axis" x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} />
        <path d={path(curves.up)} fill="none" stroke="var(--car)" strokeWidth={2} />
        <path d={path(curves.down)} fill="none" stroke="var(--counter)" strokeWidth={2} />
        {hoverT != null && (
          <g>
            <line
              x1={x(hoverT)}
              x2={x(hoverT)}
              y1={y(at(curves.up, hoverT))}
              y2={y(at(curves.down, hoverT))}
              stroke="var(--text-primary)"
              strokeWidth={2}
            />
            <circle
              cx={x(hoverT)}
              cy={y(at(curves.up, hoverT))}
              r={4}
              fill="var(--car)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
            <circle
              cx={x(hoverT)}
              cy={y(at(curves.down, hoverT))}
              r={4}
              fill="var(--counter)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      <p className="i70w-readout">
        {hoverT != null
          ? `${clock(hoverT)}: ${fmtInt(at(curves.up, hoverT))} in (incl. ${fmtInt(curves.startCars)} there at ${hourLabel(H0)}), ${fmtInt(at(curves.down, hoverT))} out → ${fmtInt(carsAt(curves, hoverT))} cars between the counters`
          : "Hover the chart: the vertical gap between the curves is the cars on the stretch."}
      </p>
    </figure>
  );
}

interface HourChartProps extends ChartBase {
  rows: HourRow[];
  freeMph: number;
  hoverRow: HourRow | null;
  setHoverT: (t: number | null) => void;
}

function CarsChart({ rows, width, compact, freeMph, hoverRow, setHoverT }: HourChartProps) {
  const height = compact ? 220 : 260;
  const m = margins(compact);
  const x = scaleLinear([H0, 24], [m.left, width - m.right]);
  const lo = Math.min(0, ...rows.map((r) => r.rawCars));
  const hi = Math.max(...rows.map((r) => Math.max(r.cars, r.freeFlowCars)));
  const y = scaleLinear([lo, hi * 1.08], [height - m.bottom, m.top]).nice();
  const mid = (r: HourRow) => x(r.hour + 0.5);
  const carsPath =
    line<HourRow>()
      .x(mid)
      .y((r) => y(r.cars))(rows) ?? "";
  const rawPath =
    line<HourRow>()
      .x(mid)
      .y((r) => y(r.rawCars))(rows) ?? "";
  const freePath =
    line<HourRow>()
      .x(mid)
      .y((r) => y(r.freeFlowCars))(rows) ?? "";
  // Extra cars above what free flow would hold: the slowdown.
  const extra =
    area<HourRow>()
      .x(mid)
      .y0((r) => y(r.freeFlowCars))
      .y1((r) => y(Math.max(r.cars, r.freeFlowCars)))(rows) ?? "";

  return (
    <figure className="i70w-fig">
      <figcaption>
        Cars between the counters
        <span className="i70w-legend">
          <span>
            <i style={{ background: "var(--text-primary)" }} />
            On the stretch
          </span>
          <span>
            <i className="i70w-dash" />
            What free flow ({freeMph} mph) would hold
          </span>
          <span>
            <i style={{ background: "var(--counter)", opacity: 0.35 }} />
            Extra cars: slower than free flow
          </span>
          {lo < 0 && (
            <span>
              <i className="i70w-dot-line" />
              Without the zero floor
            </span>
          )}
        </span>
      </figcaption>
      <svg
        width={width}
        height={height}
        onPointerMove={(e) => setHoverT(pointerHour(e, x.invert))}
        onPointerLeave={() => setHoverT(null)}
        role="img"
        aria-label="Cars between the counters through the day, against what free flow would hold"
      >
        {lo < 0 && (
          <>
            <rect
              x={m.left}
              width={width - m.left - m.right}
              y={y(0)}
              height={y(lo) - y(0)}
              className="i70w-impossible"
            />
            {y(lo) - y(0) > 16 && (
              <text className="i70w-tick" x={m.left + 6} y={y(lo) - 4}>
                Impossible: fewer than zero cars
              </text>
            )}
          </>
        )}
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line className="i70w-grid" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
            <text className="i70w-tick" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        <HourAxis x={x} y0={height - m.bottom} compact={compact} />
        <line className="i70w-axis" x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} />
        <path d={extra} fill="var(--counter)" opacity={0.35} />
        <path d={freePath} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />
        {lo < 0 && <path d={rawPath} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="2 3" />}
        <path d={carsPath} fill="none" stroke="var(--text-primary)" strokeWidth={2} />
        {hoverRow && (
          <g>
            <line className="i70w-cross" x1={mid(hoverRow)} x2={mid(hoverRow)} y1={m.top} y2={height - m.bottom} />
            <circle
              cx={mid(hoverRow)}
              cy={y(hoverRow.cars)}
              r={4}
              fill="var(--text-primary)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      <p className="i70w-readout">
        {hoverRow
          ? `${hourSpan(hoverRow.hour)}: ${fmtInt(hoverRow.cars)} cars on the stretch, ${fmtInt(hoverRow.flow)}/hr flowing through; free flow would hold ${fmtInt(hoverRow.freeFlowCars)}.${hoverRow.cars > 0 ? ` One car every ${fmtInt((5280 * LANES * MILES) / hoverRow.cars)} ft per lane.` : ""}`
          : `Free flow holds flow × ${MILES} miles ÷ ${freeMph} mph. A full jam would hold about ${fmtInt(JAM_CARS)}.`}
      </p>
    </figure>
  );
}

function SpeedChart({ rows, width, compact, freeMph, hoverRow, setHoverT }: HourChartProps) {
  const height = compact ? 220 : 260;
  const m = margins(compact);
  const x = scaleLinear([H0, 24], [m.left, width - m.right]);
  const y = scaleLinear([0, MAX_MPH], [height - m.bottom, m.top]);
  const mid = (r: HourRow) => x(r.hour + 0.5);
  const speedPath =
    line<HourRow>()
      .x(mid)
      .y((r) => y(r.mph))(rows) ?? "";

  return (
    <figure className="i70w-fig">
      <figcaption>
        Implied speed, mph
        <span className="i70w-legend">
          <span>
            <i style={{ background: "var(--text-primary)" }} />
            Flow ÷ cars per mile
          </span>
        </span>
      </figcaption>
      <svg
        width={width}
        height={height}
        onPointerMove={(e) => setHoverT(pointerHour(e, x.invert))}
        onPointerLeave={() => setHoverT(null)}
        role="img"
        aria-label="Implied speed through the day"
      >
        {y.ticks(7).map((t) => (
          <g key={t}>
            <line className="i70w-grid" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
            <text className="i70w-tick" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <HourAxis x={x} y0={height - m.bottom} compact={compact} />
        <line className="i70w-axis" x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} />
        {!compact && (
          <text className="i70w-direct" x={width - m.right + 8} y={y(freeMph)} dy="0.32em">
            Free flow
          </text>
        )}
        <path d={speedPath} fill="none" stroke="var(--text-primary)" strokeWidth={2} />
        {rows.map((r) => (
          <circle
            key={r.hour}
            cx={mid(r)}
            cy={y(r.mph)}
            r={r.free ? 2.5 : 3.5}
            fill={r.free ? "var(--surface-1)" : "var(--text-primary)"}
            stroke="var(--text-primary)"
            strokeWidth={1.5}
          />
        ))}
        {hoverRow && (
          <line className="i70w-cross" x1={mid(hoverRow)} x2={mid(hoverRow)} y1={m.top} y2={height - m.bottom} />
        )}
      </svg>
      <p className="i70w-readout">
        {hoverRow
          ? `${hourSpan(hoverRow.hour)}: ${fmtMph(hoverRow, freeMph)}`
          : "Hollow dots: fewer cars than free flow would hold, so free flow is assumed."}
      </p>
    </figure>
  );
}

/** Reference chart: one spacing measure per hour, bumper to bumper. */
function SpacingChart({
  rows,
  width,
  compact,
  hoverRow,
  setHoverT,
  title,
  note,
  unit,
  value,
}: Omit<HourChartProps, "freeMph"> & {
  title: string;
  note: string;
  unit: string;
  value: (r: HourRow) => number | null;
}) {
  const height = compact ? 180 : 200;
  const m = margins(compact);
  const x = scaleLinear([H0, 24], [m.left, width - m.right]);
  // Night hours are nearly empty and would flatten the day; scale to daytime
  // and let the night run off the top (clipped, not pinned).
  const dayMax = Math.max(...rows.filter((r) => r.hour >= 6 && r.hour < 21).map((r) => value(r) ?? 0));
  const y = scaleLinear([0, dayMax * 1.1], [height - m.bottom, m.top]).nice();
  const mid = (r: HourRow) => x(r.hour + 0.5);
  const path =
    line<HourRow>()
      .defined((r) => value(r) != null)
      .x(mid)
      .y((r) => y(value(r) ?? 0))(rows) ?? "";
  const clipId = `i70w-clip-${unit}`;
  const fmt = (v: number) => (unit === "s" ? v.toFixed(1) : fmtInt(v));
  const hv = hoverRow ? value(hoverRow) : null;

  return (
    <figure className="i70w-fig">
      <figcaption>{title}</figcaption>
      <svg
        width={width}
        height={height}
        onPointerMove={(e) => setHoverT(pointerHour(e, x.invert))}
        onPointerLeave={() => setHoverT(null)}
        role="img"
        aria-label={title}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={m.top} width={width} height={height - m.top - m.bottom} />
          </clipPath>
        </defs>
        {y.ticks(5).map((t) => (
          <g key={t}>
            <line className="i70w-grid" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
            <text className="i70w-tick" x={m.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        <HourAxis x={x} y0={height - m.bottom} compact={compact} />
        <line className="i70w-axis" x1={m.left} x2={width - m.right} y1={y(0)} y2={y(0)} />
        <g clipPath={`url(#${clipId})`}>
          <path d={path} fill="none" stroke="var(--text-primary)" strokeWidth={2} />
          {rows.map((r) => {
            const v = value(r);
            return v == null ? null : <circle key={r.hour} cx={mid(r)} cy={y(v)} r={2.5} fill="var(--text-primary)" />;
          })}
        </g>
        {hoverRow && (
          <line className="i70w-cross" x1={mid(hoverRow)} x2={mid(hoverRow)} y1={m.top} y2={height - m.bottom} />
        )}
      </svg>
      <p className="i70w-readout">
        {hoverRow
          ? `${hourSpan(hoverRow.hour)}: ${hv == null ? "no cars" : `${fmt(hv)} ${unit} per car`}`
          : `${note} Night hours run off the top.`}
      </p>
    </figure>
  );
}

// Deterministic jitter so dots hold still across re-renders.
const jitter = (i: number) => {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};

function CalibrationStrip({
  points,
  kinds,
  width,
  compact,
  freeMph,
  dates,
  selected,
  onPick,
}: ChartBase & {
  points: CalPoint[];
  kinds: ({ mph: number; impossibleShare: number } | null)[];
  freeMph: number;
  dates: Date[];
  selected: number;
  onPick: (day: number) => void;
}) {
  const [hover, setHover] = useState<CalPoint | null>(null);
  const rowH = compact ? 56 : 48;
  const labelW = compact ? 0 : 330;
  const m = { top: compact ? 20 : 8, right: 16, bottom: 32, left: 16 + labelW };
  const height = m.top + rowH * KINDS.length + m.bottom;
  const x = scaleLinear([0, freeMph + 3], [m.left, width - m.right]).clamp(true);
  const rowY = (k: number) => m.top + rowH * k + rowH / 2 + (compact ? 8 : 0);
  const py = (p: CalPoint) => rowY(p.kind) + jitter(p.day) * (rowH * 0.5);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: CalPoint | null = null;
    let bd = 10;
    for (const p of points) {
      const dd = Math.hypot(x(p.mph) - mx, py(p) - my);
      if (dd < bd) {
        bd = dd;
        best = p;
      }
    }
    setHover(best);
  };
  const sel = points.find((p) => p.day === selected);

  return (
    <figure className="i70w-fig">
      <figcaption>
        Every day of each kind since {CALIBRATION_FROM}, at its slowest hour ({hourLabel(6)}–{hourLabel(21)}). Quiet
        midweek = Tue–Thu in Apr–May and Oct–Nov. Click a dot to load that day.
      </figcaption>
      <div className="i70w-scatter">
        <svg
          width={width}
          height={height}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onClick={() => hover && onPick(hover.day)}
          style={{ cursor: hover ? "pointer" : "default" }}
          role="img"
          aria-label="Slowest hour of each day, grouped by kind of day"
        >
          {x.ticks(compact ? 5 : 8).map((t) => (
            <g key={t}>
              <line className="i70w-grid" x1={x(t)} x2={x(t)} y1={m.top} y2={height - m.bottom} />
              <text className="i70w-tick" x={x(t)} y={height - m.bottom + 18} textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
          <text className="i70w-tick" x={width - m.right} y={height - 2} textAnchor="end">
            mph →
          </text>
          {KINDS.map((k, i) => {
            const s = kinds[i];
            return (
              <text
                key={k.label}
                className="i70w-direct"
                x={compact ? m.left : m.left - 12}
                y={compact ? rowY(i) - rowH / 2 + 4 : rowY(i)}
                dy="0.32em"
                textAnchor={compact ? "start" : "end"}
              >
                {k.label}
                {s && ` · ${Math.round(s.mph)} mph, ${Math.round(s.impossibleShare * 100)}% dip below 0`}
              </text>
            );
          })}
          {points.map((p) => (
            <circle key={p.day} cx={x(p.mph)} cy={py(p)} r={2} fill="var(--car)" opacity={0.4} />
          ))}
          {kinds.map(
            (s, i) =>
              s && (
                <line
                  key={i}
                  x1={x(s.mph)}
                  x2={x(s.mph)}
                  y1={rowY(i) - rowH * 0.35}
                  y2={rowY(i) + rowH * 0.35}
                  stroke="var(--text-primary)"
                  strokeWidth={2}
                />
              ),
          )}
          {sel && (
            <circle
              cx={x(sel.mph)}
              cy={py(sel)}
              r={5}
              fill="var(--counter)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          )}
          {hover && (
            <circle
              cx={x(hover.mph)}
              cy={py(hover)}
              r={5}
              fill="var(--car)"
              stroke="var(--surface-1)"
              strokeWidth={2}
            />
          )}
        </svg>
        {hover && (
          <div
            className="i70w-tip"
            style={{
              left: Math.min(x(hover.mph) + 12, width - 190),
              top: Math.max(py(hover) - 70, 0),
            }}
          >
            <strong>{fmtDate(dates[hover.day])}</strong>
            <span>
              {dates[hover.day].toLocaleDateString("en-US", {
                timeZone: "UTC",
                weekday: "long",
              })}
            </span>
            <span>
              Slowest {hourSpan(hover.slowHour)}: {hover.mph >= freeMph ? "free flow" : `${Math.round(hover.mph)} mph`}
            </span>
            {hover.impossible > 0 && <span>{hover.impossible} h below zero cars</span>}
          </div>
        )}
      </div>
      <p className="i70w-readout">
        Black ticks: each kind's median. Days that never drop below free flow stack at {freeMph}. "Dip below 0" = share
        of days with an hour of fewer than zero cars.{sel ? " Orange: the day above." : ""}
      </p>
    </figure>
  );
}
