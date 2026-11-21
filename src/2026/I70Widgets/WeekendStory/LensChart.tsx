import { area, curveStepAfter, easeCubicInOut, line, scaleLinear } from "d3";
import { useEffect, useId, useMemo, useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { DOW_SHORT, DRIFT_WB, fmtPct, isDrift, type Dir, type Profiles } from "../HeroCurve/heroData";
import { CHARTS, clockHour, dayName, lensSeries, netAt, netSegments, netSeries, season as seasonOf, topPeak, type ChartId, type Highlight, type Peak } from "./lensData";

// The story's chart: 3am to 3am, westbound above the axis and eastbound
// below, today as light green bars under a green step, 1996 as a dark dashed
// step. A highlight adds one gold layer: the busiest hour's whole bar, today's
// bars over the step's hours turned gold (over a shaded window when it has
// one, optionally with westbound's change per day above the chart and
// eastbound's below it), or the net up the hill on its own right-hand scale:
// running from the chart's start, or starting over each day where the chart
// resets daily, with the step's days drawn strong. While zooming, the
// view widens from one chart's days (Saturday) out to this chart's, the
// hour and vehicle scales easing between the two.
//
// `flow` breaks the net into its two steps, played by the scroll: 0 → 1,
// each hour's westbound and eastbound bars shrink by the smaller of the two
// and what's left darkens (that hour's net, on the vehicle scale); 1 → 2,
// the flows fade out, the scale turns over to the running net and, left to
// right, each hour's bar lifts onto the one before it (a waterfall, starting
// over at 3am where the chart resets daily), then the bars settle into
// today's green step; 2 → 3, 1996's running net draws in as a dashed step.
// 1996's flows leave as the cancel starts, so the subtraction is only ever
// today's up minus today's home. Green and dashed still mean today and 1996,
// the signed axis says it's the net, and gold stays for the step's days.

interface Props {
  profiles: Profiles;
  chart: ChartId;
  season: number;
  /** Dashed reference season, usually 1996. */
  pin: number | null;
  showTrail: boolean;
  hl: Highlight | null;
  height: number;
  /** Mid-zoom: t = 0 frames just `from`'s days (a run within this chart's), t = 1 the whole chart. */
  zoom?: { from: ChartId; t: number } | null;
  /** 0 plain, 1 hourly net bars, 2 stacked into the running net, 3 with 1996's net drawn in (see above). */
  flow?: number;
}

const fmtK = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toFixed(1)}k` : fmtInt(a);
  return `${v > 0.5 ? "+" : v < -0.5 ? "−" : ""}${s}`;
};

const signed = (v: number) => `${v > 0.5 ? "+" : v < -0.5 ? "−" : ""}${fmtInt(Math.abs(v))}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (t: number) => t * t * (3 - 2 * t);
/** Hours a bar takes to lift onto the stack as the sweep passes it. */
const LIFT = 4;

export default function LensChart({ profiles, chart, season: cur, pin, showTrail, hl, height, zoom = null, flow = 0 }: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const clipId = `i70s-clip-${useId().replace(/:/g, "")}`;
  const years = useMemo(() => [...profiles.keys()], [profiles]);
  const first = years[0] ?? 1996;

  const { dows, dailyNet } = CHARTS[chart];
  const nDays = dows.length;
  const nHours = nDays * 24;
  const multi = nDays > 1;
  const series = (yr: number, dir: Dir) => lensSeries(profiles, yr, dows, dir);

  const compact = width < 560;

  // A `top` peak highlight slides the gold bar from 1996's busiest hour over
  // to today's, leaving 1996's pale bar behind: a beat at 1996, then the move.
  const slideKey = hl?.kind === "peak" && hl.top ? `${chart}:${hl.dirs.join()}` : null;
  const [slide, setSlide] = useState(1);
  useEffect(() => {
    if (!slideKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSlide(1);
      return;
    }
    const HOLD = 450;
    const MOVE = 1100;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const u = clamp01((t - t0 - HOLD) / MOVE);
      setSlide(easeCubicInOut(u));
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    setSlide(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [slideKey]);
  // The net line is the plain view's; with flow on, the green net carries it.
  const showNet = hl?.kind === "net" && flow === 0;
  const cancel = clamp01(flow);
  const stack = clamp01(flow - 1);
  // Stacking: the flows fade and the scale turns over, the bars sweep left to right, then settle into a line.
  const rescale = ease(clamp01(stack / 0.2));
  const sweep = clamp01((stack - 0.2) / 0.6);
  const settle = ease(clamp01((stack - 0.8) / 0.2));
  // 1996: its flows fade out early in the cancel, its net draws in after today's has settled.
  const thenFlowOp = 1 - ease(clamp01(flow / 0.3));
  const thenReveal = clamp01(flow - 2);
  const thenAt = thenReveal * nHours;
  const sweepAt = sweep * (nHours + LIFT);
  const lift = (i: number) => ease(clamp01((sweepAt - i) / LIFT));
  const gap = hl?.kind === "gap" ? hl : null;
  const gapRanges: [number, number][] = gap?.ranges ?? [[0, nHours]];
  const rows = !!gap?.rows;
  // Net days drawn strong (all of them unless the step names some).
  const strong = (k: number) => hl?.kind !== "net" || !hl.days || !dailyNet || hl.days.includes(k);
  // Room up top for day names and the highlight's per-day row, and below the hour ticks for eastbound's row.
  const topFor = (n: number) => (n > 1 ? 46 : 30);
  const zt = zoom?.t ?? 1;
  const fromDows = zoom ? CHARTS[zoom.from].dows : dows;
  const m = {
    top: lerp(topFor(fromDows.length), topFor(nDays), zt),
    right: compact ? (showNet ? 34 : 10) : 56,
    bottom: 42,
    left: compact ? 54 : 68,
  };

  // Hourly scale fixed per chart over every season, so it holds still during the scrub.
  const yMaxOf = useMemo(() => {
    const out = {} as Record<ChartId, number>;
    for (const id of Object.keys(CHARTS) as ChartId[]) {
      let mx = 1;
      for (const yr of years)
        for (const dir of ["wb", "eb"] as const)
          for (const v of lensSeries(profiles, yr, CHARTS[id].dows, dir) ?? []) mx = Math.max(mx, v);
      out[id] = mx * 1.08;
    }
    return out;
  }, [profiles, years]);
  const niceTop = (id: ChartId) => scaleLinear([-yMaxOf[id], yMaxOf[id]], [1, 0]).nice().domain()[1];

  // The hours in view: all of them, or mid-zoom, `from`'s days widening out to the chart's.
  const off = zoom ? dows.indexOf(fromDows[0]) * 24 : 0;
  const lo = lerp(off, 0, zt);
  const hi = lerp(off + fromDows.length * 24, nHours, zt);
  const x = scaleLinear([lo, hi], [m.left, width - m.right]);
  const now = seasonOf(profiles, cur, chart);
  const pinYr = pin != null && pin !== cur && profiles.has(pin) ? pin : null;
  const then = pinYr != null ? seasonOf(profiles, pinYr, chart) : null;
  const inFlow = flow > 0 && !!now;
  // The running net's scale: every hour's bar, top and bottom, today and the pin.
  const flowTop = (() => {
    let mx = 1;
    for (const s of [now, then])
      if (s)
        for (let i = 0; i < nHours; i++) {
          const cum = netAt(s.net, chart, i);
          mx = Math.max(mx, Math.abs(cum), Math.abs(cum - (s.wb[i] - s.eb[i])));
        }
    return scaleLinear([-mx * 1.1, mx * 1.1], [1, 0]).nice().domain()[1];
  })();
  const y = zoom
    ? scaleLinear([-1, 1].map((k) => k * lerp(niceTop(zoom.from), niceTop(chart), zt)), [height - m.bottom, m.top])
    : rescale > 0
      ? scaleLinear([-1, 1].map((k) => k * lerp(niceTop(chart), flowTop, rescale)), [height - m.bottom, m.top])
      : scaleLinear([-yMaxOf[chart], yMaxOf[chart]], [height - m.bottom, m.top]).nice();
  const netAxis = rescale >= 0.5;
  // The flows leave as the scale turns over to the net: one measure on screen at a time.
  const greenOp = 1 - rescale;
  // Gold: the days the step names.
  const goldDay = (d: number) => hl?.kind === "net" && !!hl.days?.includes(d);
  const yTop = y.domain()[1];
  // Each hour's count is drawn flat across its hour, since that's what it counts: a step per hour,
  // the last value repeated at the end so the final hour gets its full width.
  const path = (vals: number[] | null, sign: 1 | -1) =>
    vals
      ? (line<number>((_, i) => x(i), (v) => y(sign * v)).curve(curveStepAfter)([...vals, vals[vals.length - 1]]) ?? "")
      : "";

  const curWb = series(cur, "wb");
  const curEb = series(cur, "eb");
  const nowSegs = now ? netSegments(now.net, chart) : [];
  const thenSegs = then ? netSegments(then.net, chart) : [];
  // Net scale fits just the seasons shown (the net never plays back), so 2017's westbound over-read doesn't flatten it.
  const netMax = Math.max(1, ...[...nowSegs, ...thenSegs].flat().map(Math.abs)) * 1.1;
  const yNet = scaleLinear([-netMax, netMax], [y(-yTop), y(yTop)]).nice();
  // Segment k starts at hour k × 24 (there's only one segment on a running line).
  const netPath = (vals: number[], k: number) => line<number>((_, i) => x(k * 24 + i), (v) => yNet(v))(vals) ?? "";

  // Today's bars, axis to count, over hours [from, to): stepped like the lines, so each hour is one
  // rectangle and a range's area is its summed counts. Green by default, gold where a step points.
  const bars = (dir: Dir, [from, to]: [number, number]) => {
    const raw = series(cur, dir);
    if (!raw) return "";
    // Mid-flow, each hour gives up the part the other direction cancels.
    const other = series(cur, dir === "wb" ? "eb" : "wb");
    const v = inFlow && other ? raw.map((w, i) => w - cancel * Math.min(w, other[i])) : raw;
    const ts: number[] = [];
    for (let t = Math.max(from, 0); t <= Math.min(to, v.length); t++) ts.push(t);
    // The closing point repeats the range's last hour.
    const hr = (t: number) => Math.min(t, to - 1, v.length - 1);
    const sign = dir === "wb" ? 1 : -1;
    return (
      area<number>()
        .curve(curveStepAfter)
        .x((t) => x(t))
        .y0(y(0))
        .y1((t) => y(sign * v[hr(t)]))(ts) ?? ""
    );
  };

  // Peak: today's bars all labeled (just each direction's top on phones and on 1996).
  const peakDots = (() => {
    if (hl?.kind !== "peak" || !now) return [];
    const out: { p: Peak; then: boolean; label: boolean; moving?: boolean }[] = [];
    for (const dir of hl.dirs) {
      if (hl.top && then && slide < 1) {
        // Mid-slide: today's bar on its way from 1996's top hour (rounded hour for the label).
        const [a, b] = [topPeak(then, dir), topPeak(now, dir)];
        const moving = { ...b, i: a.i + (b.i - a.i) * slide, v: a.v + (b.v - a.v) * slide };
        // 1996's own label comes in once the gold one has left it.
        out.push({ p: moving, then: false, label: true, moving: true }, { p: a, then: true, label: slide > 0.3 });
        continue;
      }
      const topNow = topPeak(now, dir);
      for (const p of now.peaks.filter((q) => q.dir === dir))
        if (!hl.top || p === topNow) out.push({ p, then: false, label: !multi || !compact || p === topNow });
      if (then) {
        const topThen = topPeak(then, dir);
        for (const p of then.peaks.filter((q) => q.dir === dir))
          if (!hl.top || p === topThen) out.push({ p, then: true, label: p === topThen });
      }
    }
    return out;
  })();
  // Pull a direction's two top labels apart when they'd collide.
  // A sliding label takes today's anchor from the start, so it doesn't jump when it lands.
  const peakAnchor = (d: { p: Peak; then: boolean; moving?: boolean }) => {
    if (!now || !then) return "middle";
    const a = topPeak(then, d.p.dir);
    const b = topPeak(now, d.p.dir);
    const mine = d.then ? a : b;
    if ((mine !== d.p && !d.moving) || Math.abs(x(a.i) - x(b.i)) > 80) return "middle";
    const left = d.then ? a.i <= b.i : b.i < a.i;
    return left ? "end" : "start";
  };

  // Gap rows: one direction's cars that day, as a change on 1996.
  const totalText = (dir: Dir, d: number) => {
    if (!now) return "";
    const [a, b] = [then?.dayDir[dir][d], now.dayDir[dir][d]];
    const t = a ? fmtPct((b / a - 1) * 100) : fmtInt(b);
    return multi ? t : `${dir === "wb" ? "↑" : "↓"} ${a ? `${fmtInt(a)} → ` : ""}${fmtInt(b)} cars (${t})`;
  };
  const ebRow = rows && now ? dows.map((_, d) => totalText("eb", d)) : [];

  // The highlight's per-day row under the day names.
  const dayRow = (() => {
    if (!now || (!rows && !showNet && flow < 2)) return [];
    return dows.map((_, d) => {
      if (rows) return totalText("wb", d);
      if (!strong(d)) return null;
      const n = fmtK(now.dayNet[d]);
      // While today's net is built on its own, so are its numbers.
      if (!then || (inFlow && thenReveal < 1)) return n;
      if (multi) return compact || nDays > 3 ? n : `${fmtK(then.dayNet[d])} → ${n}`;
      return `Net, 3am to 3am: ${signed(then.dayNet[d])} → ${signed(now.dayNet[d])}`;
    });
  })();

  const hourTicks = (() => {
    const shown = (hi - lo) / 24;
    const every = shown <= 1.5 ? 3 : shown <= 3 ? 6 : compact ? 24 : 12;
    const out: number[] = [];
    for (let i = Math.ceil(lo - 1e-6); i <= hi + 1e-6; i++) if (clockHour(i) % every === (every === 24 ? 12 : 0)) out.push(i);
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
          data-hl={hl?.kind ?? ""}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const v = x.invert(e.clientX - r.left);
            setHoverX(v >= 0 && v <= nHours ? v : null);
          }}
          onPointerLeave={() => setHoverX(null)}
        >
          {/* mid-zoom, the days outside the view run off the plot's sides */}
          <clipPath id={clipId}>
            {/* a little past the plot's sides, so the edge hours' step lines keep their full stroke */}
            <rect x={m.left - 2} y={0} width={Math.max(0, width - m.right - m.left + 4)} height={height} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            {/* gap: shaded window when it has one, under everything */}
            {gap?.shade !== false &&
              gap?.ranges?.map(([from, to]) => (
                <rect key={from} className="i70s-window" x={x(from)} width={x(to) - x(from)} y={m.top} height={height - m.bottom - m.top} />
              ))}

            {/* today's bars: light green, gold over the hours the step is about */}
            {/* once stacking starts, the flow layer's bars below take over */}
            <g className="i70s-bars" opacity={inFlow && stack > 0 ? 0 : 1}>
              {(["wb", "eb"] as const).map((dir) => (
                <path key={dir} d={bars(dir, [0, nHours])} />
              ))}
            </g>
            {gap && (
              <g className="i70s-gap">
                {gap.dirs.map((dir) => gapRanges.map((r) => <path key={`${dir}${r[0]}`} d={bars(dir, r)} />))}
              </g>
            )}

            {/* peak: the busiest hour's whole bar, axis to count; pale and dashed on 1996 */}
            {peakDots.map(({ p, then: isThen }, k) => {
              const top = y((p.dir === "wb" ? 1 : -1) * p.v);
              return (
                <rect
                  key={k}
                  className={`i70s-peak-bar${isThen ? " is-then" : ""}`}
                  x={x(p.i)}
                  width={x(p.i + 1) - x(p.i)}
                  y={Math.min(top, y(0))}
                  height={Math.abs(y(0) - top)}
                />
              );
            })}
          </g>

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
                  {netAxis ? (t === 0 ? "0" : fmtK(t)) : fmtInt(Math.abs(t))}
              </text>
            </g>
          ))}
          <text
            className="i70w-tick"
            style={netAxis ? { fill: "var(--text-primary)", fontWeight: 600 } : undefined}
            transform={`translate(${compact ? 10 : 14},${y(0)}) rotate(-90)`}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {netAxis ? "Net vehicles up the hill" : "Avg. vehicles per hour"}
          </text>
          {/* day dividers and names; mid-zoom the names fade in as the other days arrive */}
          <g clipPath={`url(#${clipId})`} opacity={zoom ? zt : 1}>
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
                  style={inFlow && !goldDay(d) ? { fill: "var(--text-primary)" } : undefined}
                  x={x(d * 24 + 12)}
                  y={m.top - (multi ? 12 : 10)}
                  textAnchor="middle"
                >
                  {dayRow[d]}
                </text>
              )}
              {ebRow[d] != null && (
                <text className="i70s-dayrow" x={x(d * 24 + 12)} y={height - 6} textAnchor="middle">
                  {ebRow[d]}
                </text>
              )}
            </g>
          ))}
          </g>
          {/* which row is which, where the days share one */}
          {multi && ebRow.length > 0 && (
            <g className="i70s-dayrow">
              <text x={m.left - 6} y={m.top - 12} textAnchor="end">
                ↑
              </text>
              <text x={m.left - 6} y={height - 6} textAnchor="end">
                ↓
              </text>
            </g>
          )}
          {hourTicks.map((i) => (
            <text key={i} className="i70w-tick" x={x(i)} y={height - m.bottom + 18} textAnchor="middle">
              {hourLabel(clockHour(i))}
            </text>
          ))}
          <text className="i70w-direct" x={m.left + 6} y={m.top + 14} opacity={1 - rescale}>
            ↑ Westbound, to the mountains{isDrift(cur) && "*"}
          </text>
          {isDrift(cur) && (
            <text className="i70w-direct" x={m.left + 6} y={m.top + 30} style={{ fill: "var(--muted)" }}>
              {compact
                ? `*${DRIFT_WB.from}–${DRIFT_WB.to}: clock likely ran early`
                : `*${DRIFT_WB.from}–${DRIFT_WB.to}: the recorder's clock likely ran up to 1¼ hours early`}
            </text>
          )}
          <text className="i70w-direct" x={m.left + 6} y={height - m.bottom - 8} opacity={1 - rescale}>
            ↓ Eastbound, home
          </text>

          <g clipPath={`url(#${clipId})`} opacity={greenOp}>
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
            <g className="i70s-then" opacity={thenFlowOp}>
              <path d={path(series(pinYr, "wb"), 1)} fill="none" stroke="var(--then)" strokeWidth={1.75} strokeDasharray="4 3" />
              <path d={path(series(pinYr, "eb"), -1)} fill="none" stroke="var(--then)" strokeWidth={1.75} strokeDasharray="4 3" />
            </g>
          )}
          <path d={path(curWb, 1)} fill="none" stroke="var(--now)" strokeWidth={2.5} strokeLinejoin="round" />
          <path d={path(curEb, -1)} fill="none" stroke="var(--now)" strokeWidth={2.5} strokeLinejoin="round" />
          </g>

          {/* flow: each hour's net as a darker green bar, lifting onto the stack as the sweep passes */}
          {inFlow && now && (() => {
            // Running net as a step, hour by hour, over one day (or the whole chain where it doesn't reset).
            const stepPath = (net: number[], d: number) => {
              const at = (i: number) => netAt(net, chart, i);
              const start = CHARTS[chart].dailyNet || d === 0 ? 0 : at(d * 24 - 1);
              let dd = `M${x(d * 24)},${y(start)}`;
              for (let h = 0; h < 24; h++) dd += `V${y(at(d * 24 + h))}H${x(d * 24 + h + 1)}`;
              return dd;
            };
            return (
              <g className="i70s-flow">
                <clipPath id={`${clipId}-sweep`}>
                  <rect x={m.left - 2} y={0} width={Math.max(0, x(thenAt) - m.left + 2)} height={height} />
                </clipPath>
                {/* 1996's running net, dark dashed like its flows, drawn in left to right once today's has settled */}
                {then && thenReveal > 0 && (
                  <g clipPath={`url(#${clipId}-sweep)`}>
                    {dows.map((_, d) => (
                      <path key={d} d={stepPath(then.net, d)} fill="none" stroke="var(--then)" strokeWidth={1.75} strokeDasharray="4 3" />
                    ))}
                  </g>
                )}
                <g opacity={1 - settle}>
                  {now.wb.map((w, i) => {
                    const n = w - now.eb[i];
                    const base = (netAt(now.net, chart, i) - n) * lift(i);
                    const x0 = x(i);
                    const bw = x(i + 1) - x0;
                    // Before stacking, the leftover sits over the flow bars and darkens in; then it's the bar.
                    const pad = stack > 0 && bw > 4 ? 0.5 : 0;
                    return (
                      <rect
                        key={i}
                        x={x0 + pad}
                        width={Math.max(0, bw - 2 * pad)}
                        y={Math.min(y(base), y(base + n))}
                        height={Math.abs(y(base) - y(base + n))}
                        fill="var(--now)"
                        opacity={0.55 * cancel}
                      />
                    );
                  })}
                </g>
                {/* today's running net: green, gold over the step's days */}
                {settle > 0 &&
                  dows.map((_, d) => (
                    <path
                      key={d}
                      d={stepPath(now.net, d)}
                      fill="none"
                      stroke={goldDay(d) ? "var(--gold)" : "var(--now)"}
                      strokeWidth={goldDay(d) ? 3 : 2.5}
                      strokeLinejoin="round"
                      opacity={settle}
                    />
                  ))}
                {/* where each day lands, once its last hour is stacked */}
                {dows.map((_, d) => {
                  const end = (d + 1) * 24 - 1;
                  if (lift(end) < 1) return null;
                  return (
                    <g key={d}>
                      {then && thenAt >= end + 1 && (
                        <circle cx={x(end + 1)} cy={y(netAt(then.net, chart, end))} r={3} fill="var(--surface-1)" stroke="var(--then)" strokeWidth={1.5} />
                      )}
                      <circle
                        cx={x(end + 1)}
                        cy={y(netAt(now.net, chart, end))}
                        r={4}
                        fill={goldDay(d) ? "var(--gold)" : "var(--now)"}
                        stroke="var(--surface-1)"
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                })}
                <text className="i70w-direct" x={width - m.right - 6} y={compact ? height - m.bottom - 8 : m.top + 14} textAnchor="end">
                  {stack > 0
                    ? compact
                      ? "Net up the hill"
                      : `Net up the hill${CHARTS[chart].dailyNet ? ", each day from 3am" : `, since ${dayName(chart, 0)} 3am`}`
                    : compact
                      ? "Each hour: up − home"
                      : "Each hour's net: cars up minus cars home"}
                </text>
              </g>
            );
          })()}

          {/* net: running westbound − eastbound from 3am, on the right-hand scale */}
          {showNet && now && (
            <g className="i70s-net">
              {yNet.ticks(compact ? 4 : 6).map((t) => (
                <text key={t} className="i70w-tick i70s-net-tick" x={width - m.right + 5} y={yNet(t)} dominantBaseline="middle">
                  {t === 0 ? "0" : fmtK(t)}
                </text>
              ))}
              {thenSegs.map((seg, k) => (
                <path key={`t${k}`} d={netPath(seg, k)} fill="none" stroke="var(--gold)" strokeWidth={1.75} strokeDasharray="4 3" opacity={strong(k) ? 0.7 : 0.2} />
              ))}
              {nowSegs.map((seg, k) => (
                <path key={`n${k}`} d={netPath(seg, k)} fill="none" stroke="var(--gold)" strokeWidth={3} strokeLinejoin="round" opacity={strong(k) ? 1 : 0.25} />
              ))}
              {/* where each day lands, so the restart at 3am doesn't read as a drop */}
              {dailyNet &&
                [...thenSegs.map((seg, k) => ({ seg, k, isThen: true })), ...nowSegs.map((seg, k) => ({ seg, k, isThen: false }))].map(
                  ({ seg, k, isThen }) => (
                    <circle
                      key={`${isThen}${k}`}
                      cx={x((k + 1) * 24)}
                      cy={yNet(seg[seg.length - 1])}
                      r={isThen ? 3 : 4}
                      opacity={strong(k) ? 1 : 0.25}
                      fill={isThen ? "var(--surface-1)" : "var(--gold)"}
                      stroke={isThen ? "var(--gold-ink)" : "var(--surface-1)"}
                      strokeWidth={1.5}
                    />
                  ),
                )}
              <text className="i70w-direct i70s-net-label" x={width - m.right - 6} y={compact ? height - m.bottom - 8 : m.top + 14} textAnchor="end">
                {dailyNet
                  ? compact
                    ? "Net up the hill, per day"
                    : "Net up the hill, each day from 3am (right scale)"
                  : compact
                    ? "Net up the hill"
                    : "Net up the hill since 3am (right scale)"}
              </text>
            </g>
          )}

          {/* peak labels, over the lines */}
          {peakDots.map(({ p, then: isThen, label, moving }, k) => {
            if (!label) return null;
            const cx = x(p.i + 0.5);
            const cy = y((p.dir === "wb" ? 1 : -1) * p.v);
            // A westbound top that would run into the direction label goes beside the bar instead.
            const beside = p.dir === "wb" && cy - 7 < m.top + 24;
            // The hour where there's room for it (the step's sentence names it anyway).
            const withHour = !multi || (hl?.kind === "peak" && !!hl.top && !compact);
            const text = `${fmtInt(p.v)}${withHour ? ` · ${hourLabel(clockHour(Math.round(p.i)))}` : ""}`;
            // Labels near the chart's ends read inward rather than run off it (~6.5px a character).
            const w = text.length * 6.5;
            const pref = peakAnchor({ p, then: isThen, moving });
            const [l, r] = pref === "start" ? [cx, cx + w] : pref === "end" ? [cx - w, cx] : [cx - w / 2, cx + w / 2];
            const anchor = beside ? "start" : r > width - 2 ? "end" : l < m.left ? "start" : pref;
            const lx = beside ? x(p.i + 1) + 4 : anchor === "end" ? cx - 4 : anchor === "start" ? cx + 4 : cx;
            const ly = beside ? cy + 12 : p.dir === "wb" ? cy - 7 : cy + 16;
            return (
              <g key={k} className={`i70s-peak${isThen ? " is-then" : ""}`}>
                <text x={lx} y={ly} textAnchor={anchor}>
                  {text}
                </text>
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
            const net = showNet || inFlow ? netSeries(series(yr, "wb"), series(yr, "eb")) : null;
            const n = net ? netAt(net, chart, hoverI) : undefined;
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
