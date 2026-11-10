import { line, scaleLinear } from "d3";
import { useMemo, useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { DOW_SHORT, DRIFT_WB, isDrift, SPANS, spanSeries, type Dir, type Profiles, type Span } from "./heroData";

// The hero chart: hours across, westbound above the axis and eastbound below,
// one bold current season over a faint trail of earlier ones and dashed pins.

/** One hour called out on one direction: a tinted column plus its values, earliest pin → current. */
export interface Mark {
  dir: Dir;
  /** Hour index within the span (0–23 for Saturday). */
  hour: number;
  /** Which side of the column the label sits on. */
  anchor?: "start" | "end";
}

interface Props {
  profiles: Profiles;
  span: Span;
  season: number;
  pins: number[];
  showTrail: boolean;
  marks?: Mark[];
  /** Overrides the default height (380 compact, 480 wide). */
  height?: number;
  /** Red running total of westbound minus eastbound from the span's start, on its own right-hand scale. */
  showNet?: boolean;
}

/** Cumulative WB − EB, starting at 0 at the span's start: one more point than hours. */
const netSeries = (wb: number[] | null, eb: number[] | null) => {
  if (!wb || !eb) return null;
  const out = [0];
  for (let i = 0; i < wb.length; i++) out.push(out[i] + wb[i] - eb[i]);
  return out;
};

export default function HeroChart({ profiles, span, season: cur, pins, showTrail, marks = [], height: heightProp, showNet = false }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const years = useMemo(() => [...profiles.keys()], [profiles]);
  const first = years[0] ?? 1996;

  const dows = SPANS[span].dows;
  const nHours = dows.length * 24;
  const series = (y: number, dir: Dir) => spanSeries(profiles.get(y), dows, dir);

  const compact = width < 560;
  const height = heightProp ?? (compact ? 380 : 480);
  const m = { top: 30, right: compact ? (showNet ? 34 : 12) : 64, bottom: 30, left: compact ? 44 : 56 };
  const yMax = useMemo(() => {
    let mx = 1;
    for (const y of years)
      for (const dir of ["wb", "eb"] as const) for (const v of series(y, dir) ?? []) mx = Math.max(mx, v);
    return mx * 1.08;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, span]);
  // Net scale fixed per span over every season, so it holds still during playback.
  const netMax = useMemo(() => {
    let mx = 1;
    for (const yr of years) for (const v of netSeries(series(yr, "wb"), series(yr, "eb")) ?? []) mx = Math.max(mx, Math.abs(v));
    return mx * 1.08;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, span]);
  const x = scaleLinear([0, nHours], [m.left, width - m.right]);
  const y = scaleLinear([-yMax, yMax], [height - m.bottom, m.top]).nice();
  // Shares the hourly axis's zero line.
  const yTop = y.domain()[1];
  const yNet = scaleLinear([-netMax, netMax], [y(-yTop), y(yTop)]).nice();
  const netPath = (vals: number[] | null) => (vals ? (line<number>((_, i) => x(i), (v) => yNet(v))(vals) ?? "") : "");
  // Points sit at the middle of their hour.
  const path = (vals: number[] | null, sign: 1 | -1) =>
    vals ? (line<number>((_, i) => x(i + 0.5), (v) => y(sign * v))(vals) ?? "") : "";

  const curWb = series(cur, "wb");
  const curEb = series(cur, "eb");
  const shownPins = pins.filter((yr) => yr !== cur && profiles.has(yr));
  const curNet = showNet ? netSeries(curWb, curEb) : null;
  const curNetPeak = curNet ? curNet.indexOf(Math.max(...curNet)) : -1;

  // Pinned-season labels at each WB peak (EB trough when WB is hidden), stacked so they don't overlap.
  // Hidden while highlights show: their hollow dots mark the pin, and the labels would collide.
  const pinLabels = (() => {
    if (marks.length) return [];
    const ls = shownPins
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

  const hourTicks = (() => {
    const per = dows.length === 1 ? [0, 3, 6, 9, 12, 15, 18, 21] : dows.length <= 3 ? [0, 6, 12, 18] : compact ? [12] : [0, 12];
    return dows.flatMap((_, d) => per.map((h) => d * 24 + h));
  })();
  const hoverI = hoverX == null ? null : Math.max(0, Math.min(nHours - 1, Math.floor(hoverX)));
  const hourName = (i: number) => `${dows.length > 1 ? `${DOW_SHORT[dows[Math.floor(i / 24)]]} ` : ""}${hourLabel(i % 24)}–${hourLabel((i % 24) + 1)}`;

  return (
    <div className="i70w-canvas-wrap i70w-scatter" ref={wrapRef}>
      {width > 0 && (
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
          {/* highlight columns sit under everything */}
          {marks.map((mk, k) => (
            <rect
              key={`band-${k}`}
              className="i70w-mark-band"
              x={x(mk.hour)}
              width={Math.max(1, x(mk.hour + 1) - x(mk.hour))}
              y={mk.dir === "wb" ? m.top : y(0)}
              height={mk.dir === "wb" ? y(0) - m.top : height - m.bottom - y(0)}
            />
          ))}

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
              {d > 0 && <line x1={x(d * 24)} x2={x(d * 24)} y1={m.top} y2={height - m.bottom} stroke="var(--baseline)" />}
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
          {showNet && (
            <g className="i70w-net-axis">
              {yNet.ticks(compact ? 4 : 6).map((t) => (
                <text key={t} className="i70w-tick" x={width - m.right + 6} y={yNet(t)} dominantBaseline="middle">
                  {t === 0 ? "0" : `${t > 0 ? "+" : "−"}${Math.abs(t) >= 1000 ? `${Math.abs(t) / 1000}k` : Math.abs(t)}`}
                </text>
              ))}
              {/* Phones: bottom right, clear of the westbound label. */}
              <text className="i70w-direct" x={width - m.right - 6} y={compact ? height - m.bottom - 8 : m.top + 14} textAnchor="end">
                {compact ? "Net up the hill" : `Net up the hill since ${dows.length > 1 ? `${DOW_SHORT[dows[0]]} ` : ""}midnight`}
              </text>
            </g>
          )}

          {/* trail: every earlier season, fading out with age */}
          {showTrail &&
            years
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
          {shownPins.map((yr) => (
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

          {/* net vehicles west of the tunnel since the span's start: pins dashed, current solid */}
          {showNet &&
            shownPins.map((yr) => (
              <path
                key={`net-${yr}`}
                d={netPath(netSeries(series(yr, "wb"), series(yr, "eb")))}
                fill="none"
                stroke="var(--net)"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.6}
              />
            ))}
          {curNet && <path d={netPath(curNet)} fill="none" stroke="var(--net)" strokeWidth={2.5} strokeLinejoin="round" />}

          {/* current season */}
          <path d={path(curWb, 1)} fill="none" stroke="var(--car)" strokeWidth={2.5} strokeLinejoin="round" />
          <path d={path(curEb, -1)} fill="none" stroke="var(--car)" strokeWidth={2.5} strokeLinejoin="round" />

          {/* highlight values: dots on the earliest pin and the current season, label "from → to" */}
          {marks.map((mk, k) => {
            const sign = mk.dir === "wb" ? 1 : -1;
            const cx = x(mk.hour + 0.5);
            const from = shownPins[0] != null ? series(shownPins[0], mk.dir)?.[mk.hour] : undefined;
            const to = series(cur, mk.dir)?.[mk.hour];
            if (to == null) return null;
            const anchor = mk.anchor ?? (mk.hour % 24 < 12 ? "start" : "end");
            const lx = anchor === "start" ? x(mk.hour + 1) + 4 : x(mk.hour) - 4;
            // WB above its peaks; EB just under the axis, clear of its afternoon trough.
            const ly = mk.dir === "wb" ? m.top + 32 : y(0) + 16;
            return (
              <g key={`mark-${k}`} className="i70w-mark">
                {from != null && <circle cx={cx} cy={y(sign * from)} r={3.5} fill="var(--surface-1)" stroke="var(--text-secondary)" strokeWidth={1.5} />}
                <circle cx={cx} cy={y(sign * to)} r={4} fill="var(--car)" stroke="var(--surface-1)" strokeWidth={1.5} />
                <text x={lx} y={ly} textAnchor={anchor}>
                  <tspan x={lx} className="i70w-mark-hour">
                    {hourName(mk.hour)}
                  </tspan>
                  <tspan x={lx} dy="1.2em">
                    {from != null ? `${fmtInt(from)} → ${fmtInt(to)}` : fmtInt(to)}
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* net peak: dot everywhere, value up and to the right (off the pin label) where there's room */}
          {curNet && curNetPeak > 0 && !marks.length && (
            <g className="i70w-mark">
              <circle cx={x(curNetPeak)} cy={yNet(curNet[curNetPeak])} r={4} fill="var(--net)" stroke="var(--surface-1)" strokeWidth={1.5} />
              {!compact && (
                <text x={x(curNetPeak) + 7} y={yNet(curNet[curNetPeak]) - 7} style={{ fill: "var(--net)" }}>
                  +{fmtInt(curNet[curNetPeak])}
                </text>
              )}
            </g>
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
      {hoverI != null && (
        <div className="i70w-tip" style={{ left: Math.min(x(hoverI + 0.5) + 12, width - 190), top: m.top + 20 }}>
          <strong>{hourName(hoverI)}</strong>
          {[cur, ...shownPins].map((yr) => {
            const w = series(yr, "wb")?.[hoverI];
            const e = series(yr, "eb")?.[hoverI];
            return (
              <span key={yr} style={yr === cur ? { color: "var(--text-primary)" } : undefined}>
                {yr}: {w != null ? fmtInt(w) : "–"} west · {e != null ? fmtInt(e) : "–"} east
              </span>
            );
          })}
          {showNet &&
            [cur, ...shownPins].map((yr) => {
              const v = netSeries(series(yr, "wb"), series(yr, "eb"))?.[hoverI + 1];
              return v == null ? null : (
                <span key={`net-${yr}`} style={{ color: "var(--net)" }}>
                  {yr}: net {v >= 0 ? "+" : "−"}{fmtInt(Math.abs(v))} up the hill
                </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
