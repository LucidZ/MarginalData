import { line, scaleLinear } from "d3";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import type { Dataset } from "../../I70Crossfilter/types";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";

// The hero chart candidate for the weekend-warrior story: the average
// January–March day at the Eisenhower Tunnel, hours across, westbound above
// the axis and eastbound below, played back season by season.

type Span = "sat" | "friSun" | "thuMon" | "wedWed";
type Mode = "smooth" | "raw";

// getUTCDay() order: 0 = Sunday.
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SPANS: Record<Span, { label: string; dows: number[] }> = {
  sat: { label: "Saturday", dows: [6] },
  friSun: { label: "Fri–Sun", dows: [5, 6, 0] },
  thuMon: { label: "Thu–Mon", dows: [4, 5, 6, 0, 1] },
  wedWed: { label: "Wed–Wed", dows: [3, 4, 5, 6, 0, 1, 2, 3] },
};

const SKIP_HOLIDAYS = ["mlk", "presidents", "xmas_ny"];
// Tunnel WB timestamps ran up to ~1.25 h early from 2006 until the counter
// was serviced in May 2010. Those seasons' westbound shapes aren't drawn.
const DRIFT_WB = { from: 2006, to: 2010 };
const DEFAULT_PINS = [1996, 2013];
const STEP_MS = 450;

interface Prof {
  wb: number[] | null; // 24 hourly means, null = not usable
  eb: number[] | null;
  n: number; // days averaged
}
/** profiles[year][dow] */
type Profiles = Map<number, Prof[]>;

/** Hourly sums per season and weekday over usable days (Jan–Mar, complete, no closure, no holiday weekend). */
const buildSums = (ds: Dataset) => {
  const sums = new Map<number, { wb: number[]; eb: number[]; n: number }[]>();
  for (let i = 0; i < ds.n; i++) {
    const d = ds.dates[i];
    if (d.getUTCMonth() > 2) continue;
    if (SKIP_HOLIDAYS.includes(ds.days.holidays[ds.days.holiday[i]])) continue;
    if (!ds.days.complete[i] || ds.days.closure[i]) continue;
    const y = d.getUTCFullYear();
    let yr = sums.get(y);
    if (!yr) sums.set(y, (yr = Array.from({ length: 7 }, () => ({ wb: new Array(24).fill(0), eb: new Array(24).fill(0), n: 0 }))));
    const s = yr[d.getUTCDay()];
    for (let h = 0; h < 24; h++) {
      s.wb[h] += ds.wb[i * 24 + h];
      s.eb[h] += ds.eb[i * 24 + h];
    }
    s.n++;
  }
  return sums;
};

/** Per-season means, or centered 3-season means (day-weighted) when smoothing. */
const buildProfiles = (ds: Dataset, mode: Mode): Profiles => {
  const sums = buildSums(ds);
  const years = [...sums.keys()].sort((a, b) => a - b);
  const drift = (y: number) => y >= DRIFT_WB.from && y <= DRIFT_WB.to;
  const out: Profiles = new Map();
  for (const y of years) {
    const window = mode === "smooth" ? [y - 1, y, y + 1] : [y];
    const profs: Prof[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const avg = (dir: "wb" | "eb") => {
        const acc = new Array(24).fill(0);
        let n = 0;
        for (const wy of window) {
          if (dir === "wb" && drift(wy)) continue;
          const s = sums.get(wy)?.[dow];
          if (!s || !s.n) continue;
          for (let h = 0; h < 24; h++) acc[h] += s[dir][h];
          n += s.n;
        }
        return n ? { vals: acc.map((v) => v / n), n } : null;
      };
      // The current season itself must be clean for WB to show, even when smoothing.
      const wb = drift(y) ? null : avg("wb");
      const eb = avg("eb");
      profs.push({ wb: wb?.vals ?? null, eb: eb?.vals ?? null, n: eb?.n ?? 0 });
    }
    out.set(y, profs);
  }
  return out;
};

/** The span's hours laid end to end, or null where a day has no usable profile. */
const spanSeries = (p: Prof[] | undefined, dows: number[], dir: "wb" | "eb") => {
  if (!p) return null;
  const out: number[] = [];
  for (const dow of dows) {
    const v = p[dow][dir];
    if (!v) return null;
    out.push(...v);
  }
  return out;
};
const sum = (a: number[] | null) => (a ? a.reduce((s, v) => s + v, 0) : null);
const fmtPct = (v: number) => {
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
};

export default function HeroCurve() {
  const { data, error } = useData();
  const [span, setSpan] = useState<Span>("sat");
  const [mode, setMode] = useState<Mode>("smooth");
  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pins, setPins] = useState<number[]>(DEFAULT_PINS);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();

  const ds = data?.find((d) => d.days.id === "tunnel") ?? null;
  const profiles = useMemo(() => (ds ? buildProfiles(ds, mode) : null), [ds, mode]);
  const years = useMemo(() => (profiles ? [...profiles.keys()] : []), [profiles]);
  const first = years[0] ?? 1996;
  const last = years[years.length - 1] ?? 2026;
  const cur = year ?? last;

  // Playback: one season per step; stops at the end.
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = window.setInterval(() => {
      setYear((y) => {
        const next = (y ?? first) + 1;
        if (next >= last) setPlaying(false);
        return Math.min(next, last);
      });
    }, STEP_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, first, last]);
  const play = () => {
    if (playing) return setPlaying(false);
    if (cur >= last) setYear(first);
    setPlaying(true);
  };

  const dows = SPANS[span].dows;
  const nHours = dows.length * 24;
  const series = (y: number, dir: "wb" | "eb") => spanSeries(profiles?.get(y), dows, dir);

  const compact = width < 560;
  const height = compact ? 380 : 480;
  const m = { top: 30, right: compact ? 12 : 64, bottom: 30, left: compact ? 44 : 56 };
  const yMax = useMemo(() => {
    let mx = 1;
    for (const y of years)
      for (const dir of ["wb", "eb"] as const) for (const v of series(y, dir) ?? []) mx = Math.max(mx, v);
    return mx * 1.08;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, span]);
  const x = scaleLinear([0, nHours], [m.left, width - m.right]);
  const y = scaleLinear([-yMax, yMax], [height - m.bottom, m.top]).nice();
  // Points sit at the middle of their hour.
  const path = (vals: number[] | null, sign: 1 | -1) =>
    vals ? (line<number>((_, i) => x(i + 0.5), (v) => y(sign * v))(vals) ?? "") : "";

  const curWb = series(cur, "wb");
  const curEb = series(cur, "eb");
  const baseYear = first;
  const total = (yr: number) => {
    const w = sum(series(yr, "wb"));
    const e = sum(series(yr, "eb"));
    return { w, e, both: w != null && e != null ? w + e : null };
  };
  const tCur = total(cur);
  const tBase = total(baseYear);
  const curDays = profiles?.get(cur)?.[dows[0]]?.n ?? 0;
  const seasonLabel = (yr: number) => {
    if (mode === "raw") return String(yr);
    const lo = Math.max(first, yr - 1);
    const hi = Math.min(last, yr + 1);
    return `${lo}–${String(hi).slice(2)}`;
  };
  const drifting = cur >= DRIFT_WB.from && cur <= DRIFT_WB.to;

  // Pinned-season labels at each WB peak (EB trough when WB is hidden), stacked so they don't overlap.
  const pinLabels = (() => {
    const ls = pins
      .filter((yr) => yr !== cur && profiles?.has(yr))
      .map((yr) => {
        const wb = series(yr, "wb");
        const vals = wb ?? series(yr, "eb") ?? [0];
        const pk = vals.indexOf(Math.max(...vals));
        return wb
          ? { yr, x: x(pk + 0.5), y: y(vals[pk]) - 6 }
          : { yr, x: x(pk + 0.5), y: y(-vals[pk]) + 14 };
      })
      .sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++)
      for (let j = 0; j < i; j++)
        if (Math.abs(ls[i].x - ls[j].x) < 34 && Math.abs(ls[i].y - ls[j].y) < 12) ls[i].y = ls[j].y - 12;
    return ls;
  })();

  const togglePin = (yr: number) =>
    setPins((p) => (p.includes(yr) ? p.filter((v) => v !== yr) : [...p, yr].sort((a, b) => a - b)));

  const hourTicks = (() => {
    const per = dows.length === 1 ? [0, 3, 6, 9, 12, 15, 18, 21] : dows.length <= 3 ? [0, 6, 12, 18] : compact ? [12] : [0, 12];
    return dows.flatMap((_, d) => per.map((h) => d * 24 + h));
  })();
  const hoverI = hoverX == null ? null : Math.max(0, Math.min(nHours - 1, Math.floor(hoverX)));
  const hourName = (i: number) => `${dows.length > 1 ? `${DOW_SHORT[dows[Math.floor(i / 24)]]} ` : ""}${hourLabel(i % 24)}–${hourLabel((i % 24) + 1)}`;

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>The winter weekend, season by season</h1>
      <p className="i70w-intro">
        The average January–March day at the Eisenhower Tunnel, hour by hour. Above the line: cars heading west,
        up to the mountains. Below: cars heading east, home to Denver. Press play to run it from 1996 to today.
        Earlier seasons stay behind as a faint trail; pinned seasons stay labeled.
      </p>

      <div className="i70w-controls">
        <button className="i70w-btn" onClick={play} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <label className="i70w-flow">
          Season
          <input
            type="range"
            min={first}
            max={last}
            value={cur}
            aria-label="Season"
            onChange={(e) => {
              setPlaying(false);
              setYear(Number(e.target.value));
            }}
          />
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>{cur}</strong>
        </label>
        <button className="i70w-btn" onClick={() => togglePin(cur)}>
          {pins.includes(cur) ? `Unpin ${cur}` : `Pin ${cur}`}
        </button>
      </div>
      <div className="i70w-controls">
        <div className="i70w-seg" role="group" aria-label="Days shown">
          {(Object.keys(SPANS) as Span[]).map((s) => (
            <button key={s} aria-pressed={span === s} onClick={() => setSpan(s)}>
              {SPANS[s].label}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Smoothing">
          <button aria-pressed={mode === "smooth"} onClick={() => setMode("smooth")}>
            3-season average
          </button>
          <button aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>
            Single season
          </button>
        </div>
      </div>

      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}

      <p className="i70w-readout" style={{ fontVariantNumeric: "tabular-nums", margin: "0.25rem 0 0.5rem" }}>
        <strong>
          {SPANS[span].label}, {seasonLabel(cur)}:
        </strong>{" "}
        {tCur.both != null ? (
          <>
            {fmtInt(tCur.both)} vehicles both ways
            {tBase.both != null && cur !== baseYear && ` (${fmtPct((tCur.both / tBase.both - 1) * 100)} vs ${baseYear})`}
          </>
        ) : (
          <>
            {tCur.e != null && `${fmtInt(tCur.e)} eastbound; `}westbound not shown (recorder clock off)
          </>
        )}
        <span style={{ color: "var(--muted)" }}>
          {" "}
          · {curDays} {dows.length > 1 ? "days per weekday" : `${DOW_SHORT[dows[0]]}s`} averaged
        </span>
      </p>

      <div className="i70w-canvas-wrap i70w-scatter" ref={wrapRef}>
        {profiles && width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Average ${SPANS[span].label} by hour at the Eisenhower Tunnel, ${cur}`}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const v = x.invert(e.clientX - r.left);
              setHoverX(v >= 0 && v <= nHours ? v : null);
            }}
            onPointerLeave={() => setHoverX(null)}
          >
            {y.ticks(compact ? 6 : 8).map((t) => (
              <g key={t}>
                <line
                  className="i70w-grid"
                  style={t === 0 ? { stroke: "var(--text-secondary)" } : undefined}
                  x1={m.left}
                  x2={width - m.right}
                  y1={y(t)}
                  y2={y(t)}
                />
                <text className="i70w-tick" x={m.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {fmtInt(Math.abs(t))}
                </text>
              </g>
            ))}
            {dows.map((dow, d) => (
              <g key={d}>
                {d > 0 && (
                  <line x1={x(d * 24)} x2={x(d * 24)} y1={m.top} y2={height - m.bottom} stroke="var(--baseline)" />
                )}
                {dows.length > 1 && (
                  <text className="i70w-direct" x={x(d * 24 + 12)} y={m.top - 10} textAnchor="middle">
                    {DOW_SHORT[dow]}
                  </text>
                )}
              </g>
            ))}
            {hourTicks.map((i) => (
              <text key={i} className="i70w-tick" x={x(i)} y={height - 10} textAnchor="middle">
                {hourLabel(i % 24)}
              </text>
            ))}
            <text className="i70w-direct" x={m.left + 6} y={m.top + 14}>
              ↑ Westbound, to the mountains
            </text>
            <text className="i70w-direct" x={m.left + 6} y={height - m.bottom - 8}>
              ↓ Eastbound, home
            </text>

            {/* trail: every earlier season, fading out with age */}
            {years
              .filter((yr) => yr < cur && !pins.includes(yr))
              .map((yr) => {
                const op = 0.12 + 0.3 * ((yr - first) / Math.max(1, cur - first));
                return (
                  <g key={yr} opacity={op}>
                    <path d={path(series(yr, "wb"), 1)} fill="none" stroke="var(--muted)" strokeWidth={1} />
                    <path d={path(series(yr, "eb"), -1)} fill="none" stroke="var(--muted)" strokeWidth={1} />
                  </g>
                );
              })}

            {/* pinned seasons */}
            {pins
              .filter((yr) => yr !== cur && profiles.has(yr))
              .map((yr) => (
                <g key={yr}>
                  <path d={path(series(yr, "wb"), 1)} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />
                  <path d={path(series(yr, "eb"), -1)} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />
                </g>
              ))}
            {pinLabels.map((l) => (
              <text key={l.yr} className="i70w-tick" x={l.x} y={l.y} textAnchor="middle" style={{ fill: "var(--text-secondary)" }}>
                {l.yr}
              </text>
            ))}

            {/* current season */}
            <path d={path(curWb, 1)} fill="none" stroke="var(--car)" strokeWidth={2.5} strokeLinejoin="round" />
            <path d={path(curEb, -1)} fill="none" stroke="var(--car)" strokeWidth={2.5} strokeLinejoin="round" />
            {drifting && (
              <text className="i70w-direct" x={(m.left + width - m.right) / 2} y={y(yMax * 0.45)} textAnchor="middle" style={{ fill: "var(--muted)" }}>
                Westbound {DRIFT_WB.from}–{DRIFT_WB.to} not shown: the recorder's clock ran early
              </text>
            )}

            {hoverI != null && (
              <g>
                <line x1={x(hoverI + 0.5)} x2={x(hoverI + 0.5)} y1={m.top} y2={height - m.bottom} stroke="var(--baseline)" />
                {curWb && <circle cx={x(hoverI + 0.5)} cy={y(curWb[hoverI])} r={4} fill="var(--car)" stroke="var(--surface-1)" strokeWidth={2} />}
                {curEb && <circle cx={x(hoverI + 0.5)} cy={y(-curEb[hoverI])} r={4} fill="var(--car)" stroke="var(--surface-1)" strokeWidth={2} />}
              </g>
            )}
          </svg>
        )}
        {hoverI != null && profiles && (
          <div className="i70w-tip" style={{ left: Math.min(x(hoverI + 0.5) + 12, width - 190), top: m.top + 20 }}>
            <strong>{hourName(hoverI)}</strong>
            {[cur, ...pins.filter((p) => p !== cur)].map((yr) => {
              const w = series(yr, "wb")?.[hoverI];
              const e = series(yr, "eb")?.[hoverI];
              return (
                <span key={yr} style={yr === cur ? { color: "var(--text-primary)" } : undefined}>
                  {yr}: {w != null ? fmtInt(w) : "–"} west · {e != null ? fmtInt(e) : "–"} east
                </span>
              );
            })}
          </div>
        )}
      </div>

      <div className="i70w-legend" style={{ marginTop: "0.5rem" }}>
        <span>
          <i style={{ background: "var(--car)" }} />
          {cur}
        </span>
        <span>
          <i style={{ background: "var(--text-secondary)" }} />
          Pinned: {pins.join(", ") || "none"}
        </span>
        <span>
          <i style={{ background: "var(--off)" }} />
          Earlier seasons
        </span>
      </div>

      <p className="i70w-note">
        Eisenhower Tunnel, cars per hour averaged over usable January–March days of each weekday: days missing any
        hour, flagged closures, MLK and Presidents' Day weekends and Jan 1–2 are left out. With the 3-season average
        on, each season blends with the one before and after, weighted by days. Multi-day spans lay each weekday's
        average end to end, so they show a typical week, not a real one. Westbound isn't drawn for {DRIFT_WB.from}–
        {DRIFT_WB.to} because the recorder's clock ran up to 1¼ hours early until the counter was serviced in May
        2010.
      </p>
    </div>
  );
}
