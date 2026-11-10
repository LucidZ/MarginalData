import { line, mean, scaleLinear } from "d3";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { dirLabel, fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { MISSING, type CounterId, type Dataset } from "../../I70Crossfilter/types";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { useData } from "../../I70Crossfilter/useData";
import "../widgets.css";

type Dir = "wb" | "eb" | "both";
type View = "raw" | "pct";
type Profile = "satWb" | "sunEb";

const COUNTERS: { id: CounterId; label: string }[] = [
  { id: "tunnel", label: "Eisenhower Tunnel" },
  { id: "twin", label: "Twin Tunnels" },
];

// Day groups, by getUTCDay(). Sunday is left out: it tracks Saturday.
// Tue–Thu is the midweek reference, drawn gray.
const GROUPS = [
  { id: "sat", label: "Saturday", dows: [6], color: "var(--car)" },
  { id: "fri", label: "Friday", dows: [5], color: "var(--counter)" },
  { id: "mon", label: "Monday", dows: [1], color: "var(--cat-1)" },
  { id: "mid", label: "Tue–Thu", dows: [2, 3, 4], color: "var(--muted)" },
] as const;
type GroupId = (typeof GROUPS)[number]["id"];

// Three five-season eras for the hourly profiles, light to dark. 2006–2010
// is skipped on purpose: the Tunnel's westbound clock drifted early then,
// which fakes exactly the early-morning growth this chart is about.
const ERAS = [
  { from: 1996, to: 2000, color: "#86b6ef" },
  { from: 2011, to: 2015, color: "#2a78d6" },
  { from: 2022, to: 2026, color: "#104281" },
];

const PROFILES: Record<Profile, { label: string; dow: number; dir: "wb" | "eb"; blurb: string }> = {
  satWb: { label: "Saturday westbound", dow: 6, dir: "wb", blurb: "Saturday, heading up" },
  sunEb: { label: "Sunday eastbound", dow: 0, dir: "eb", blurb: "Sunday, heading home" },
};

const SKIP_HOLIDAYS = ["mlk", "presidents", "xmas_ny"];
const BASE_YEARS = 3; // % change is against the mean of the first three seasons

/** Jan–Mar, complete, closure-free, not a holiday weekend or the New Year spillover. */
const usable = (ds: Dataset, i: number) => {
  const { days, dates } = ds;
  if (dates[i].getUTCMonth() > 2) return false;
  if (SKIP_HOLIDAYS.includes(days.holidays[days.holiday[i]])) return false;
  return !!days.complete[i] && !days.closure[i];
};

interface YearRow {
  year: number;
  avg: Partial<Record<GroupId, number>>;
  n: Partial<Record<GroupId, number>>;
}

const buildYears = (ds: Dataset, dir: Dir): YearRow[] => {
  const acc = new Map<number, Map<GroupId, number[]>>();
  for (let i = 0; i < ds.n; i++) {
    if (!usable(ds, i)) continue;
    const w = ds.days.wbTotal[i];
    const e = ds.days.ebTotal[i];
    const v = dir === "wb" ? w : dir === "eb" ? e : w == null || e == null ? null : w + e;
    if (v == null) continue;
    const dow = ds.dates[i].getUTCDay();
    const g = GROUPS.find((g) => (g.dows as readonly number[]).includes(dow));
    if (!g) continue;
    const year = ds.dates[i].getUTCFullYear();
    let y = acc.get(year);
    if (!y) acc.set(year, (y = new Map()));
    let vals = y.get(g.id);
    if (!vals) y.set(g.id, (vals = []));
    vals.push(v);
  }
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, m]) => {
      const row: YearRow = { year, avg: {}, n: {} };
      for (const [g, vals] of m) {
        row.avg[g] = mean(vals);
        row.n[g] = vals.length;
      }
      return row;
    });
};

/** Mean cars per hour on the chosen day and direction, per era. */
const buildProfiles = (ds: Dataset, p: Profile) => {
  const { dow, dir } = PROFILES[p];
  const arr = ds[dir];
  return ERAS.map((era) => {
    const sums = new Array(24).fill(0);
    let nDays = 0;
    for (let i = 0; i < ds.n; i++) {
      const d = ds.dates[i];
      const y = d.getUTCFullYear();
      if (y < era.from || y > era.to || d.getUTCDay() !== dow || !usable(ds, i)) continue;
      let ok = true;
      for (let h = 0; h < 24; h++) if (arr[i * 24 + h] === MISSING) ok = false;
      if (!ok) continue;
      for (let h = 0; h < 24; h++) sums[h] += arr[i * 24 + h];
      nDays++;
    }
    return { ...era, nDays, hours: sums.map((s) => (nDays ? s / nDays : 0)) };
  });
};

const fmtPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}%`;
const fmtK = (v: number) => (v === 0 ? "0" : `${(v / 1000).toFixed(v >= 10000 || v % 1000 === 0 ? 0 : 1)}K`);

export default function WeekendSpread() {
  const { data, error } = useData();
  const [counter, setCounter] = useState<CounterId>("tunnel");
  const [dir, setDir] = useState<Dir>("both");
  const [view, setView] = useState<View>("raw");
  const [profile, setProfile] = useState<Profile>("satWb");
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [hoverHour, setHoverHour] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();

  const ds = data?.find((d) => d.days.id === counter) ?? null;
  const rows = useMemo(() => (ds ? buildYears(ds, dir) : []), [ds, dir]);
  const eras = useMemo(() => (ds ? buildProfiles(ds, profile) : []), [ds, profile]);

  const base = useMemo(() => {
    const b: Partial<Record<GroupId, number>> = {};
    for (const g of GROUPS) {
      const vals = rows.slice(0, BASE_YEARS).map((r) => r.avg[g.id]).filter((v): v is number => v != null);
      b[g.id] = mean(vals);
    }
    return b;
  }, [rows]);
  const baseLabel = rows.length ? `${rows[0].year}–${String(rows[Math.min(BASE_YEARS, rows.length) - 1].year).slice(2)}` : "";
  const val = (r: YearRow, g: GroupId) => {
    const v = r.avg[g];
    if (v == null) return null;
    if (view === "raw") return v;
    const b = base[g];
    return b ? (v / b - 1) * 100 : null;
  };

  const compact = width < 560;

  // ---- chart 1: day groups by year
  const h1 = compact ? 340 : 420;
  const m1 = { top: 24, right: compact ? 16 : 92, bottom: 32, left: compact ? 44 : 56 };
  const first = rows[0]?.year ?? 1996;
  const last = rows[rows.length - 1]?.year ?? 2026;
  const x1 = scaleLinear([first, last], [m1.left, width - m1.right]);
  const y1 = useMemo(() => {
    const vals = rows.flatMap((r) => GROUPS.map((g) => val(r, g.id))).filter((v): v is number => v != null);
    const lo = view === "raw" ? 0 : Math.min(0, ...vals);
    const hi = Math.max(...vals, 1);
    return scaleLinear([lo, hi * 1.05], [h1 - m1.bottom, m1.top]).nice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, view, base, h1]);

  const linePath = (g: GroupId) =>
    line<YearRow>()
      .defined((r) => val(r, g) != null)
      .x((r) => x1(r.year))
      .y((r) => y1(val(r, g) ?? 0))(rows) ?? "";

  // End labels, nudged apart so they don't collide.
  const endLabels = useMemo(() => {
    const lastRow = rows[rows.length - 1];
    if (!lastRow) return [];
    const ls = GROUPS.map((g) => ({ g, y: y1(val(lastRow, g.id) ?? 0) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 13) ls[i].y = ls[i - 1].y + 13;
    return ls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, y1, view]);

  const hoverRow = rows.find((r) => r.year === hoverYear) ?? null;

  // ---- chart 2: hourly profiles by era
  const h2 = compact ? 300 : 360;
  const m2 = { top: 24, right: compact ? 16 : 92, bottom: 32, left: compact ? 44 : 56 };
  const x2 = scaleLinear([0, 23], [m2.left, width - m2.right]);
  const y2 = useMemo(() => {
    const hi = Math.max(1, ...eras.flatMap((e) => e.hours));
    return scaleLinear([0, hi * 1.05], [h2 - m2.bottom, m2.top]).nice();
  }, [eras, h2, m2.bottom, m2.top]);
  const profPath = (hours: number[]) =>
    line<number>()
      .x((_, h) => x2(h))
      .y((v) => y2(v))(hours) ?? "";

  const counterLabel = COUNTERS.find((c) => c.id === counter)?.label;
  const dirName = dir === "both" ? "both directions" : dirLabel(counter, dir).toLowerCase();
  const recent = eras[eras.length - 1];
  const oldest = eras[0];
  const peakOf = (e: (typeof eras)[number] | undefined) => (e ? Math.max(...e.hours) : 0);
  const prof = PROFILES[profile];

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← All widgets
      </Link>
      <h1>The weekend got bigger, and longer</h1>
      <p className="i70w-intro">
        The average January–March day at one counter, by day of the week, every season since 1996. Saturdays
        grew. Fridays and Mondays grew faster. Below, Saturday's busiest hour barely moved, so the growth spread
        into the hours around it: an earlier start and a fuller midday.
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
              {d === "both" ? "Both ways" : dirLabel(counter, d)}
            </button>
          ))}
        </div>
        <div className="i70w-seg" role="group" aria-label="Axes">
          <button aria-pressed={view === "raw"} onClick={() => setView("raw")}>
            Vehicles a day
          </button>
          <button aria-pressed={view === "pct"} onClick={() => setView("pct")}>
            % change
          </button>
        </div>
      </div>

      {error && <p className="i70w-note">Couldn't load data: {error.message}</p>}

      <div className="i70w-legend">
        {GROUPS.map((g) => (
          <span key={g.id}>
            <i style={{ background: g.color }} />
            {g.label}
          </span>
        ))}
      </div>
      <div className="i70w-canvas-wrap i70w-scatter" ref={wrapRef}>
        {rows.length > 0 && (
          <svg
            width={width}
            height={h1}
            role="img"
            aria-label={`Average January to March day by day of week, ${first} to ${last}`}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const yr = Math.round(x1.invert(e.clientX - rect.left));
              setHoverYear(yr >= first && yr <= last ? yr : null);
            }}
            onPointerLeave={() => setHoverYear(null)}
          >
            {y1.ticks(5).map((t) => (
              <g key={`y${t}`}>
                <line
                  className="i70w-grid"
                  style={t === 0 ? { stroke: "var(--baseline)" } : undefined}
                  x1={m1.left}
                  x2={width - m1.right}
                  y1={y1(t)}
                  y2={y1(t)}
                />
                <text className="i70w-tick" x={m1.left - 8} y={y1(t)} textAnchor="end" dominantBaseline="middle">
                  {view === "raw" ? fmtK(t) : fmtPct(t)}
                </text>
              </g>
            ))}
            {x1.ticks(compact ? 4 : 7).map((t) => (
              <text key={`x${t}`} className="i70w-tick" x={x1(t)} y={h1 - 10} textAnchor="middle">
                {t}
              </text>
            ))}
            <text className="i70w-direct" x={0} y={12}>
              {view === "raw" ? "↑ Vehicles a day" : `↑ Change vs ${baseLabel} average`}
            </text>
            {hoverRow && (
              <line
                x1={x1(hoverRow.year)}
                x2={x1(hoverRow.year)}
                y1={m1.top}
                y2={h1 - m1.bottom}
                stroke="var(--baseline)"
              />
            )}
            {GROUPS.map((g) => (
              <path
                key={g.id}
                d={linePath(g.id)}
                fill="none"
                stroke={g.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeDasharray={g.id === "mid" ? "5 3" : undefined}
              />
            ))}
            {hoverRow &&
              GROUPS.map((g) => {
                const v = val(hoverRow, g.id);
                return v == null ? null : (
                  <circle
                    key={g.id}
                    cx={x1(hoverRow.year)}
                    cy={y1(v)}
                    r={4}
                    fill={g.color}
                    stroke="var(--surface-1)"
                    strokeWidth={2}
                  />
                );
              })}
            {!compact &&
              endLabels.map(({ g, y }) => (
                <text key={g.id} className="i70w-direct" x={width - m1.right + 8} y={y} dominantBaseline="middle">
                  {g.label}
                </text>
              ))}
          </svg>
        )}
        {hoverRow && (
          <div
            className="i70w-tip"
            style={{ left: Math.min(x1(hoverRow.year) + 12, width - 190), top: m1.top }}
          >
            <strong>Jan–Mar {hoverRow.year}</strong>
            {GROUPS.map((g) => {
              const v = hoverRow.avg[g.id];
              const b = base[g.id];
              return (
                <span key={g.id}>
                  {g.label}: {v == null ? "n/a" : fmtInt(v)}
                  {v != null && b && ` (${fmtPct((v / b - 1) * 100)})`}
                  <span style={{ color: "var(--muted)" }}> · {hoverRow.n[g.id] ?? 0}d</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="i70w-h2">{prof.blurb}: the busiest hour hit its ceiling</h2>
      <p className="i70w-note">
        Average cars per hour at the {counterLabel}, {prof.label}, five seasons at a time.
        {oldest && recent && (
          <>
            {" "}
            The busiest hour went from {fmtInt(peakOf(oldest))} to {fmtInt(peakOf(recent))} cars
            {profile === "satWb" && <>; the 6a–7a hour went from {fmtInt(oldest.hours[6])} to {fmtInt(recent.hours[6])}</>}.
          </>
        )}
      </p>
      <div className="i70w-controls">
        <div className="i70w-seg" role="group" aria-label="Profile">
          {(Object.keys(PROFILES) as Profile[]).map((p) => (
            <button key={p} aria-pressed={profile === p} onClick={() => setProfile(p)}>
              {PROFILES[p].label}
            </button>
          ))}
        </div>
      </div>
      <div className="i70w-legend">
        {eras.map((e) => (
          <span key={e.from}>
            <i style={{ background: e.color }} />
            {e.from}–{e.to} ({e.nDays} days)
          </span>
        ))}
      </div>
      <div className="i70w-canvas-wrap i70w-scatter">
        {eras.length > 0 && width > 0 && (
          <svg
            width={width}
            height={h2}
            role="img"
            aria-label={`Average cars per hour, ${prof.label}, three eras`}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const h = Math.round(x2.invert(e.clientX - rect.left));
              setHoverHour(h >= 0 && h <= 23 ? h : null);
            }}
            onPointerLeave={() => setHoverHour(null)}
          >
            {y2.ticks(5).map((t) => (
              <g key={`y${t}`}>
                <line
                  className="i70w-grid"
                  style={t === 0 ? { stroke: "var(--baseline)" } : undefined}
                  x1={m2.left}
                  x2={width - m2.right}
                  y1={y2(t)}
                  y2={y2(t)}
                />
                <text className="i70w-tick" x={m2.left - 8} y={y2(t)} textAnchor="end" dominantBaseline="middle">
                  {fmtInt(t)}
                </text>
              </g>
            ))}
            {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => (
              <text key={h} className="i70w-tick" x={x2(h)} y={h2 - 10} textAnchor="middle">
                {hourLabel(h)}
              </text>
            ))}
            <text className="i70w-direct" x={0} y={12}>
              ↑ Cars per hour
            </text>
            {hoverHour != null && (
              <line x1={x2(hoverHour)} x2={x2(hoverHour)} y1={m2.top} y2={h2 - m2.bottom} stroke="var(--baseline)" />
            )}
            {eras.map((e) => (
              <path key={e.from} d={profPath(e.hours)} fill="none" stroke={e.color} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {hoverHour != null &&
              eras.map((e) => (
                <circle
                  key={e.from}
                  cx={x2(hoverHour)}
                  cy={y2(e.hours[hoverHour])}
                  r={4}
                  fill={e.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ))}
          </svg>
        )}
        {hoverHour != null && (
          <div className="i70w-tip" style={{ left: Math.min(x2(hoverHour) + 12, width - 190), top: m2.top }}>
            <strong>
              {hourLabel(hoverHour)}–{hourLabel(hoverHour + 1)}
            </strong>
            {eras.map((e) => (
              <span key={e.from}>
                {e.from}–{e.to}: {fmtInt(e.hours[hoverHour])}
              </span>
            ))}
          </div>
        )}
      </div>

      <p className="i70w-note">
        {counterLabel}, {dirName}, {first}–{last}. January–March only; MLK and Presidents' Day weekends and the
        New Year spillover (Jan 1–2) are left out, as are days missing any hour or flagged as a closure. The
        tooltip shows how many days went into each average. % change is against each day type's own{" "}
        {baseLabel} average. Sunday is left off the top chart because it tracks Saturday. Dips: 2020 lost the
        second half of March to COVID closures, 2021 was a COVID season, and 2026 was a thin snow year. The hourly profiles skip 2006–2010, when the Tunnel's westbound recorder clock
        drifted up to an hour and a quarter early and inflated the early-morning hours. Hourly counts can't
        show demand above what the road carries: a flat top means a queue, not a quiet road.
      </p>
    </div>
  );
}
