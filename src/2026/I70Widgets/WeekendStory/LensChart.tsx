import { area, line, scaleLinear } from "d3";
import { useMemo, useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { DOW_SHORT, DRIFT_WB, fmtPct, isDrift, type Dir, type Profiles } from "../HeroCurve/heroData";
import { CHARTS, clockHour, dayName, lensSeries, netSeries, season as seasonOf, topPeak, type ChartId, type Lens, type Peak } from "./lensData";

// The story's chart: 3am to 3am, westbound above the axis and eastbound
// below, today in green over a dashed green 1996. A lens adds one gold layer:
// busiest-hour dots, the gap between the two seasons filled, or the running
// net up the hill on its own right-hand scale.

interface Props {
  profiles: Profiles;
  chart: ChartId;
  season: number;
  /** Dashed reference season, usually 1996. */
  pin: number | null;
  showTrail: boolean;
  lens: Lens | null;
  height: number;
}

const fmtK = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toFixed(1)}k` : fmtInt(a);
  return `${v > 0.5 ? "+" : v < -0.5 ? "−" : ""}${s}`;
};

const signed = (v: number) => `${v > 0.5 ? "+" : v < -0.5 ? "−" : ""}${fmtInt(Math.abs(v))}`;

export default function LensChart({ profiles, chart, season: cur, pin, showTrail, lens, height }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const years = useMemo(() => [...profiles.keys()], [profiles]);
  const first = years[0] ?? 1996;

  const { dows } = CHARTS[chart];
  const nDays = dows.length;
  const nHours = nDays * 24;
  const multi = nDays > 1;
  const series = (yr: number, dir: Dir) => lensSeries(profiles, yr, dows, dir);

  const compact = width < 560;
  const showNet = lens === "net";
  // Room up top for day names and the lens's per-day row.
  const m = { top: multi ? 46 : 30, right: compact ? (showNet ? 34 : 10) : 56, bottom: 26, left: compact ? 40 : 52 };

  // Hourly scale fixed per chart over every season, so it holds still during the scrub.
  const yMax = useMemo(() => {
    let mx = 1;
    for (const yr of years)
      for (const dir of ["wb", "eb"] as const) for (const v of lensSeries(profiles, yr, dows, dir) ?? []) mx = Math.max(mx, v);
    return mx * 1.08;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, chart]);

  const x = scaleLinear([0, nHours], [m.left, width - m.right]);
  const y = scaleLinear([-yMax, yMax], [height - m.bottom, m.top]).nice();
  const yTop = y.domain()[1];
  // Points sit at the middle of their hour.
  const path = (vals: number[] | null, sign: 1 | -1) =>
    vals ? (line<number>((_, i) => x(i + 0.5), (v) => y(sign * v))(vals) ?? "") : "";

  const now = seasonOf(profiles, cur, chart);
  const curWb = series(cur, "wb");
  const curEb = series(cur, "eb");
  const pinYr = pin != null && pin !== cur && profiles.has(pin) ? pin : null;
  const then = pinYr != null ? seasonOf(profiles, pinYr, chart) : null;
  // Net scale fits just the seasons shown (the net lens never plays back), so 2017's westbound over-read doesn't flatten it.
  const netMax = Math.max(1, ...[now, then].flatMap((s) => (s ? s.net.map(Math.abs) : []))) * 1.1;
  const yNet = scaleLinear([-netMax, netMax], [y(-yTop), y(yTop)]).nice();
  const netPath = (vals: number[] | null) => (vals ? (line<number>((_, i) => x(i), (v) => yNet(v))(vals) ?? "") : "");

  // Total lens: the gap between the pin and today, gold where today is higher, pale where lower.
  const gapArea = (dir: Dir, gain: boolean) => {
    const a = series(pinYr ?? cur, dir);
    const b = series(cur, dir);
    if (!a || !b) return "";
    const sign = dir === "wb" ? 1 : -1;
    const lo = (i: number) => (gain ? a[i] : Math.min(a[i], b[i]));
    const hi = (i: number) => (gain ? Math.max(a[i], b[i]) : a[i]);
    return (
      area<number>()
        .x((_, i) => x(i + 0.5))
        .y0((_, i) => y(sign * lo(i)))
        .y1((_, i) => y(sign * hi(i)))(a) ?? ""
    );
  };

  // Peak lens: today's dots all labeled (just each direction's top on phones and on 1996).
  const peakDots = (() => {
    if (lens !== "peak" || !now) return [];
    const out: { p: Peak; then: boolean; label: boolean }[] = [];
    for (const dir of ["wb", "eb"] as const) {
      const topNow = topPeak(now, dir);
      for (const p of now.peaks.filter((q) => q.dir === dir))
        out.push({ p, then: false, label: !multi || !compact || p === topNow });
      if (then) {
        const topThen = topPeak(then, dir);
        for (const p of then.peaks.filter((q) => q.dir === dir)) out.push({ p, then: true, label: p === topThen });
      }
    }
    return out;
  })();
  // Pull a direction's two top labels apart when they'd collide.
  const peakAnchor = (d: { p: Peak; then: boolean }) => {
    if (!now || !then) return "middle";
    const a = topPeak(then, d.p.dir);
    const b = topPeak(now, d.p.dir);
    const mine = d.then ? a : b;
    if (mine !== d.p || Math.abs(x(a.i) - x(b.i)) > 80) return "middle";
    const left = d.then ? a.i <= b.i : b.i < a.i;
    return left ? "end" : "start";
  };

  // The lens's per-day row under the day names.
  const dayRow = (() => {
    if (!now || (lens !== "total" && lens !== "net")) return [];
    return dows.map((_, d) => {
      if (lens === "total") {
        const t = then ? fmtPct((now.dayTotal[d] / then.dayTotal[d] - 1) * 100) : fmtInt(now.dayTotal[d]);
        return multi ? t : `${then ? `${fmtInt(then.dayTotal[d])} → ` : ""}${fmtInt(now.dayTotal[d])} cars (${t})`;
      }
      const n = fmtK(now.dayNet[d]);
      if (!then) return n;
      if (multi) return compact || nDays > 3 ? n : `${fmtK(then.dayNet[d])} → ${n}`;
      return `Net, 3am to 3am: ${signed(then.dayNet[d])} → ${signed(now.dayNet[d])}`;
    });
  })();

  const hourTicks = (() => {
    const every = nDays === 1 ? 3 : nDays <= 3 ? 6 : compact ? 24 : 12;
    const out: number[] = [];
    for (let i = 0; i <= nHours; i++) if (clockHour(i) % every === (every === 24 ? 12 : 0)) out.push(i);
    return out;
  })();
  const hoverI = hoverX == null ? null : Math.max(0, Math.min(nHours - 1, Math.floor(hoverX)));
  const dayOf = (i: number) => Math.floor(i / 24);
  // A series index past midnight belongs to the next calendar day.
  const hourName = (i: number) => {
    const h = clockHour(i);
    const cal = (dows[dayOf(i)] + (h < 3 ? 1 : 0)) % 7;
    return `${multi || h < 3 ? `${DOW_SHORT[cal]} ` : ""}${hourLabel(h)}–${hourLabel(h + 1)}`;
  };

  return (
    <div className="i70w-canvas-wrap i70w-scatter" ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Average ${CHARTS[chart].label} by hour at the Eisenhower Tunnel, ${cur}${pinYr ? ` against ${pinYr}` : ""}`}
          data-lens={lens ?? ""}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const v = x.invert(e.clientX - r.left);
            setHoverX(v >= 0 && v <= nHours ? v : null);
          }}
          onPointerLeave={() => setHoverX(null)}
        >
          {/* total lens: the added cars, under everything */}
          {lens === "total" && pinYr != null && (
            <g className="i70s-gap">
              {(["wb", "eb"] as const).map((dir) => (
                <g key={dir}>
                  <path d={gapArea(dir, true)} fill="var(--gold)" opacity={0.55} />
                  <path d={gapArea(dir, false)} fill="var(--gold)" opacity={0.18} />
                </g>
              ))}
            </g>
          )}

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
          {dows.map((_, d) => (
            <g key={d}>
              {d > 0 && <line x1={x(d * 24)} x2={x(d * 24)} y1={m.top} y2={height - m.bottom} stroke="var(--baseline)" />}
              {multi && (
                <text className="i70w-direct" x={x(d * 24 + 12)} y={m.top - 28} textAnchor="middle">
                  {dayName(chart, d)}
                </text>
              )}
              {dayRow[d] != null && (
                <text
                  className="i70s-dayrow"
                  x={x(d * 24 + 12)}
                  y={m.top - (multi ? 12 : 10)}
                  textAnchor="middle"
                >
                  {dayRow[d]}
                </text>
              )}
            </g>
          ))}
          {hourTicks.map((i) => (
            <text key={i} className="i70w-tick" x={x(i)} y={height - 8} textAnchor="middle">
              {hourLabel(clockHour(i))}
            </text>
          ))}
          <text className="i70w-direct" x={m.left + 6} y={m.top + 14}>
            ↑ Westbound, to the mountains{isDrift(cur) && "*"}
          </text>
          {isDrift(cur) && (
            <text className="i70w-direct" x={m.left + 6} y={m.top + 30} style={{ fill: "var(--muted)" }}>
              {compact
                ? `*${DRIFT_WB.from}–${DRIFT_WB.to}: clock likely ran early`
                : `*${DRIFT_WB.from}–${DRIFT_WB.to}: the recorder's clock likely ran up to 1¼ hours early`}
            </text>
          )}
          <text className="i70w-direct" x={m.left + 6} y={height - m.bottom - 8}>
            ↓ Eastbound, home
          </text>

          {/* trail: every earlier season, fading out with age */}
          {showTrail &&
            years
              .filter((yr) => yr < cur && yr !== pinYr)
              .map((yr) => {
                const op = 0.1 + 0.25 * ((yr - first) / Math.max(1, cur - first));
                return (
                  <g key={yr} opacity={op}>
                    <path d={path(series(yr, "wb"), 1)} fill="none" stroke="var(--muted)" strokeWidth={1} />
                    <path d={path(series(yr, "eb"), -1)} fill="none" stroke="var(--muted)" strokeWidth={1} />
                  </g>
                );
              })}

          {pinYr != null && (
            <g className="i70s-then">
              <path d={path(series(pinYr, "wb"), 1)} fill="none" stroke="var(--then)" strokeWidth={1.75} strokeDasharray="4 3" />
              <path d={path(series(pinYr, "eb"), -1)} fill="none" stroke="var(--then)" strokeWidth={1.75} strokeDasharray="4 3" />
            </g>
          )}
          <path d={path(curWb, 1)} fill="none" stroke="var(--now)" strokeWidth={2.5} strokeLinejoin="round" />
          <path d={path(curEb, -1)} fill="none" stroke="var(--now)" strokeWidth={2.5} strokeLinejoin="round" />

          {/* net lens: running westbound − eastbound from 3am, on the right-hand scale */}
          {showNet && now && (
            <g className="i70s-net">
              {yNet.ticks(compact ? 4 : 6).map((t) => (
                <text key={t} className="i70w-tick i70s-net-tick" x={width - m.right + 5} y={yNet(t)} dominantBaseline="middle">
                  {t === 0 ? "0" : fmtK(t)}
                </text>
              ))}
              {then && <path d={netPath(then.net)} fill="none" stroke="var(--gold)" strokeWidth={1.75} strokeDasharray="4 3" opacity={0.7} />}
              <path d={netPath(now.net)} fill="none" stroke="var(--gold)" strokeWidth={3} strokeLinejoin="round" />
              <text className="i70w-direct i70s-net-label" x={width - m.right - 6} y={compact ? height - m.bottom - 8 : m.top + 14} textAnchor="end">
                {compact ? "Net up the hill" : "Net up the hill since 3am (right scale)"}
              </text>
            </g>
          )}

          {/* peak lens: busiest hour per day and direction, hollow on 1996, filled today */}
          {peakDots.map(({ p, then: isThen, label }, k) => {
            const sign = p.dir === "wb" ? 1 : -1;
            const cx = x(p.i + 0.5);
            const cy = y(sign * p.v);
            const anchor = peakAnchor({ p, then: isThen });
            const lx = anchor === "end" ? cx - 4 : anchor === "start" ? cx + 4 : cx;
            const ly = p.dir === "wb" ? cy - 9 : cy + 18;
            return (
              <g key={k} className={`i70s-peak${isThen ? " is-then" : ""}`}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isThen ? 4 : 5}
                  fill={isThen ? "var(--surface-1)" : "var(--gold)"}
                  stroke={isThen ? "var(--gold-ink)" : "var(--surface-1)"}
                  strokeWidth={1.5}
                />
                {label && (
                  <text x={lx} y={ly} textAnchor={anchor}>
                    {fmtInt(p.v)}
                    {!multi && ` · ${hourLabel(clockHour(p.i))}`}
                  </text>
                )}
              </g>
            );
          })}

          {hoverI != null && (
            <g>
              <line x1={x(hoverI + 0.5)} x2={x(hoverI + 0.5)} y1={m.top} y2={height - m.bottom} stroke="var(--baseline)" />
              {curWb && <circle cx={x(hoverI + 0.5)} cy={y(curWb[hoverI])} r={4} fill="var(--now)" stroke="var(--surface-1)" strokeWidth={2} />}
              {curEb && <circle cx={x(hoverI + 0.5)} cy={y(-curEb[hoverI])} r={4} fill="var(--now)" stroke="var(--surface-1)" strokeWidth={2} />}
            </g>
          )}
        </svg>
      )}
      {hoverI != null && (
        <div className="i70w-tip" style={{ left: Math.min(x(hoverI + 0.5) + 12, width - 190), top: m.top + 20 }}>
          <strong>{hourName(hoverI)}</strong>
          {[cur, ...(pinYr != null ? [pinYr] : [])].map((yr) => {
            const w = series(yr, "wb")?.[hoverI];
            const e = series(yr, "eb")?.[hoverI];
            const n = showNet ? netSeries(series(yr, "wb"), series(yr, "eb"))?.[hoverI + 1] : undefined;
            return (
              <span key={yr} style={yr === cur ? { color: "var(--text-primary)" } : undefined}>
                {yr}: {w != null ? fmtInt(w) : "–"} west · {e != null ? fmtInt(e) : "–"} east
                {n != null && ` · net ${fmtK(n)}`}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
