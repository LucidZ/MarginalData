import { curveStepAfter, line, scaleLinear } from "d3";
import { useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import type { Dir, Profiles } from "../HeroCurve/heroData";
import { clockHour, lensSeries, OFFSET } from "./lensData";

// One leg of the sandbox's two trips on a shared clock: trip A's day and trip
// B's day one way, 3am to 3am, laid over each other as steps (A gold, B blue)
// with each trip's hour as a whole bar. Same clock, same scale, so the gap
// between the two lines is the comparison, and the hours either side of a pick
// show what leaving a little earlier or later would do.

export interface Leg {
  /** getUTCDay() of the day. */
  dow: number;
  /** Clock hour reaching the tunnel. */
  hour: number;
  /** Short day name for the key. */
  day: string;
}

interface Props {
  profiles: Profiles;
  season: number;
  dir: Dir;
  title: string;
  a: Leg;
  b: Leg;
  /** Vehicle scale shared with the other leg. */
  yMax: number;
  height: number;
}

/** Series index (0 = 3am) of a clock hour. */
const idx = (h: number) => (h - OFFSET + 24) % 24;

export default function ClockPanel({ profiles, season, dir, title, a, b, yMax, height }: Props) {
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const [hoverI, setHoverI] = useState<number | null>(null);
  const compact = width < 340;
  const m = { top: 24, right: 10, bottom: 24, left: compact ? 38 : 44 };

  const legs = [
    { k: "a" as const, leg: a, vals: lensSeries(profiles, season, [a.dow], dir) },
    { k: "b" as const, leg: b, vals: lensSeries(profiles, season, [b.dow], dir) },
  ];
  const x = scaleLinear([0, 24], [m.left, width - m.right]);
  const y = scaleLinear([0, yMax], [height - m.bottom, m.top]).nice();
  const path = (vals: number[]) =>
    line<number>((_, i) => x(i), (v) => y(v)).curve(curveStepAfter)([...vals, vals[vals.length - 1]]) ?? "";

  const picks = legs.flatMap(({ k, leg, vals }) => {
    const i = idx(leg.hour);
    const v = vals?.[i];
    return v == null ? [] : [{ k, i, v }];
  });
  const sameHour = picks.length === 2 && picks[0].i === picks[1].i;
  // Labels close together one above the other, the lower count's nearer its bar.
  const close = picks.length === 2 && Math.abs(x(picks[0].i) - x(picks[1].i)) < 46;
  const sameDay = a.dow === b.dow;

  return (
    <div className="i70s-clock">
      <div className="i70s-clock-head">
        <strong>{title}</strong>
        <span className="i70s-clock-key">
          {sameDay ? (
            <span className="is-both">A & B {a.day}</span>
          ) : (
            <>
              <span className="is-a">A {a.day}</span>
              <span className="is-b">B {b.day}</span>
            </>
          )}
        </span>
      </div>
      <div className="i70w-canvas-wrap" ref={wrapRef}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}: cars an hour through the tunnel, trip A ${a.day} against trip B ${b.day}, 3am to 3am`}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const v = x.invert(e.clientX - r.left);
              setHoverI(v >= 0 && v < 24 ? Math.floor(v) : null);
            }}
            onPointerLeave={() => setHoverI(null)}
          >
            {y.ticks(4).map((t) => (
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
                  {fmtInt(t)}
                </text>
              </g>
            ))}
            {Array.from({ length: 9 }, (_, k) => k * 3)
              .filter((i) => !compact || i % 6 === 0)
              .map((i) => (
                <text key={i} className="i70w-tick" x={x(i)} y={height - m.bottom + 16} textAnchor="middle">
                  {hourLabel(clockHour(i))}
                </text>
              ))}

            {/* each trip's hour, axis to count; two on one hour split it */}
            {picks.map((p, n) => {
              const w = x(1) - x(0);
              const bw = sameHour ? w / 2 : w;
              return (
                <rect
                  key={p.k}
                  className={`i70s-peak-bar${p.k === "b" ? " is-b" : ""}`}
                  x={x(p.i) + (sameHour ? bw * n : 0)}
                  width={bw}
                  y={y(p.v)}
                  height={y(0) - y(p.v)}
                />
              );
            })}

            {/* A under B: on one day they're the same line */}
            {legs.map(({ k, vals }) =>
              vals && !(sameDay && k === "a") ? (
                <path key={k} className={`i70s-clock-line is-${sameDay ? "both" : k}`} d={path(vals)} />
              ) : null,
            )}

            {picks.map((p, n) => {
              // Close together, both labels sit over the taller bar, the higher count on top (A on a tie).
              const other = close ? picks[1 - n] : null;
              const higher = other ? Math.max(p.v, other.v) : p.v;
              const onTop = other != null && (p.v > other.v || (p.v === other.v && n === 0));
              const ly = y(higher) - 6 - (onTop ? 14 : 0);
              const cx = x(p.i + 0.5);
              const anchor = cx > width - 40 ? "end" : cx < m.left + 30 ? "start" : "middle";
              return (
                <text key={p.k} className={`i70s-clock-label is-${p.k}`} x={cx} y={Math.max(11, ly)} textAnchor={anchor}>
                  {p.k.toUpperCase()} {fmtInt(p.v)}
                </text>
              );
            })}

            {hoverI != null && (
              <line x1={x(hoverI + 0.5)} x2={x(hoverI + 0.5)} y1={m.top} y2={height - m.bottom} stroke="var(--baseline)" />
            )}
          </svg>
        )}
        {hoverI != null && (
          <div className="i70w-tip" style={{ left: Math.min(x(hoverI + 0.5) + 12, width - 180), top: m.top + 6 }}>
            <strong>
              {hourLabel(clockHour(hoverI))}–{hourLabel(clockHour(hoverI) + 1)}
            </strong>
            {legs.map(({ k, leg, vals }) => (
              <span key={k} className={`i70s-tag-${k}`}>
                {k.toUpperCase()} {leg.day}: {vals ? fmtInt(vals[hoverI]) : "–"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
