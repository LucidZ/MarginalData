import { area, curveStepAfter, easeCubicInOut, line, scaleLinear } from "d3";
import { useEffect, useId, useMemo, useState } from "react";
import { fmtInt, hourLabel } from "../../I70Crossfilter/format";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { DOW_SHORT, DRIFT_WB, fmtPct, isDrift, type Dir, type Profiles } from "../HeroCurve/heroData";
import { CHARTS, clockHour, dayName, lensSeries, season as seasonOf, topPeak, type ChartId, type Highlight, type Peak } from "./lensData";

// The story's chart: 3am to 3am, westbound above the axis and eastbound
// below, today as light green bars under a green step, 1996 as a dark dashed
// step. A highlight adds one gold layer: the busiest hour's whole bar, today's
// bars over the step's hours turned gold (over a shaded window when it has
// one), or picked hours' whole bars (a departure), with 1996's pale bar at
// the same hour and the holiday weekend's gold line where the step asks. While
// zooming, the view widens from one chart's days out to this chart's, the
// hour and vehicle scales easing between the two.

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
  /** Holiday-weekend profiles, keyed like `profiles`, for holiday picks and the holiday line. */
  holiday?: Profiles | null;
  /** Names a season in the tooltip ("2024–26" for a pooled one). */
  seasonName?: (yr: number) => string;
  /** The holiday line's name in the tooltip (the page's key names it on the chart). */
  holidayName?: string;
  /** Fixes this chart's vehicle scale (per direction), so switching profiles doesn't rescale it. */
  yMax?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function LensChart({
  profiles,
  chart,
  season: cur,
  pin,
  showTrail,
  hl,
  height,
  zoom = null,
  holiday = null,
  seasonName = String,
  holidayName = "Holiday weekends",
  yMax,
}: Props) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const clipId = `i70s-clip-${useId().replace(/:/g, "")}`;
  const years = useMemo(() => [...profiles.keys()], [profiles]);
  const first = years[0] ?? 1996;

  const { dows } = CHARTS[chart];
  const nDays = dows.length;
  const nHours = nDays * 24;
  const multi = nDays > 1;
  const series = (yr: number, dir: Dir) => lensSeries(profiles, yr, dows, dir);
  const holSeries = (dir: Dir) => (holiday ? lensSeries(holiday, cur, dows, dir) : null);

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
  const gap = hl?.kind === "gap" ? hl : null;
  const gapRanges: [number, number][] = gap?.ranges ?? [[0, nHours]];
  const pick = hl?.kind === "pick" ? hl : null;
  // Room up top for day names and the labels of picks that reach high.
  const topFor = (n: number) => (n > 1 ? 46 : 30);
  const zt = zoom?.t ?? 1;
  const fromDows = zoom ? CHARTS[zoom.from].dows : dows;
  const m = {
    top: lerp(topFor(fromDows.length), topFor(nDays), zt),
    right: compact ? 10 : 24,
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
  const yMaxFor = (id: ChartId) => (id === chart && yMax ? yMax : yMaxOf[id]);
  const niceTop = (id: ChartId) => scaleLinear([-yMaxFor(id), yMaxFor(id)], [1, 0]).nice().domain()[1];

  // The hours in view: all of them, or mid-zoom, `from`'s days widening out to the chart's.
  const off = zoom ? dows.indexOf(fromDows[0]) * 24 : 0;
  const lo = lerp(off, 0, zt);
  const hi = lerp(off + fromDows.length * 24, nHours, zt);
  const x = scaleLinear([lo, hi], [m.left, width - m.right]);
  const now = seasonOf(profiles, cur, chart);
  const pinYr = pin != null && pin !== cur && profiles.has(pin) ? pin : null;
  const then = pinYr != null ? seasonOf(profiles, pinYr, chart) : null;
  const y = zoom
    ? scaleLinear([-1, 1].map((k) => k * lerp(niceTop(zoom.from), niceTop(chart), zt)), [height - m.bottom, m.top])
    : scaleLinear([-yMaxFor(chart), yMaxFor(chart)], [height - m.bottom, m.top]).nice();
  // Each hour's count is drawn flat across its hour, since that's what it counts: a step per hour,
  // the last value repeated at the end so the final hour gets its full width.
  const path = (vals: number[] | null, sign: 1 | -1) =>
    vals
      ? (line<number>((_, i) => x(i), (v) => y(sign * v)).curve(curveStepAfter)([...vals, vals[vals.length - 1]]) ?? "")
      : "";

  const curWb = series(cur, "wb");
  const curEb = series(cur, "eb");

  // Today's bars, axis to count, over hours [from, to): stepped like the lines, so each hour is one
  // rectangle and a range's area is its summed counts. Green by default, gold where a step points.
  const bars = (dir: Dir, [from, to]: [number, number]) => {
    const v = series(cur, dir);
    if (!v) return "";
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

  // Picks: each departure's bar and its two-line label (day and hour, then the count).
  const picked = (pick?.picks ?? []).flatMap((p) => {
    const v = (p.holiday ? holSeries(p.dir) : p.dir === "wb" ? curWb : curEb)?.[p.i];
    if (v == null) return [];
    const was = pick?.then ? series(pinYr ?? first, p.dir)?.[p.i] : undefined;
    const h = clockHour(p.i);
    const cal = (dows[Math.floor(p.i / 24)] + (h < 3 ? 1 : 0)) % 7;
    const when = `${p.holiday ? (compact ? "Hol. " : "Holiday ") : ""}${DOW_SHORT[cal]} ${hourLabel(h)}`;
    const count = was != null ? (compact ? fmtPct((v / was - 1) * 100) : `${fmtInt(was)} → ${fmtInt(v)}`) : fmtInt(v);
    return [{ ...p, v, was, head: p.tag ? `${p.tag} · ${when}` : when, count }];
  });
  // Two picks one way on the same hour share it, half the bar each.
  const share = (k: number) => {
    const p = picked[k];
    const same = picked.filter((q) => q.dir === p.dir && q.i === p.i);
    return same.length > 1 ? { n: same.length, at: same.indexOf(p) } : { n: 1, at: 0 };
  };
  // Labels that would overlap one way stack outward, in pick order.
  const pickLift = picked.map((p, k) => {
    let lift = 0;
    for (let j = 0; j < k; j++) if (picked[j].dir === p.dir && Math.abs(x(picked[j].i) - x(p.i)) < (compact ? 56 : 84)) lift++;
    return lift;
  });

  const holLine = pick?.holidayLine ?? null;
  const holVals = holLine ? holSeries(holLine.dir) : null;
  const holFrom = holLine ? Math.min(...holLine.days) * 24 : 0;
  const holTo = holLine ? (Math.max(...holLine.days) + 1) * 24 : 0;

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
          aria-label={`Average ${CHARTS[chart].label} by hour at the Eisenhower Tunnel, ${seasonName(cur)}${pinYr ? ` against ${seasonName(pinYr)}` : ""}`}
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
            <g className="i70s-bars">
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

            {/* picks: each departure's whole bar, a little wider than the hour so a thin one still reads */}
            {picked.map((p, k) => {
              const sign = p.dir === "wb" ? 1 : -1;
              const { n, at } = share(k);
              const w = Math.max(3, x(p.i + 1) - x(p.i));
              const x0 = x(p.i + 0.5) - w / 2 + (w / n) * at;
              const bar = (v: number, cls: string) => {
                const top = y(sign * v);
                return <rect className={cls} x={x0} width={w / n} y={Math.min(top, y(0))} height={Math.abs(y(0) - top)} />;
              };
              return (
                <g key={k} className="i70s-pick">
                  {bar(p.v, `i70s-peak-bar${p.tone === "b" ? " is-b" : ""}`)}
                  {p.was != null && bar(p.was, "i70s-peak-bar is-then")}
                </g>
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
                {fmtInt(Math.abs(t))}
              </text>
            </g>
          ))}
          <text
            className="i70w-tick"
            transform={`translate(${compact ? 10 : 14},${y(0)}) rotate(-90)`}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            Avg. vehicles per hour
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
              </g>
            ))}
          </g>
          {hourTicks.map((i) => (
            <text key={i} className="i70w-tick" x={x(i)} y={height - m.bottom + 18} textAnchor="middle">
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

          <g clipPath={`url(#${clipId})`}>
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

            {/* the holiday weekend over its days, gold, on top of today's line */}
            {holLine && holVals && (
              <path
                className="i70s-holiday"
                d={
                  line<number>((i) => x(i), (i) => y((holLine.dir === "wb" ? 1 : -1) * holVals[Math.min(i, holTo - 1)])).curve(curveStepAfter)(
                    Array.from({ length: holTo - holFrom + 1 }, (_, k) => holFrom + k),
                  ) ?? ""
                }
              />
            )}
          </g>

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

          {/* pick labels: day and hour, then the count, out past the bar's end */}
          {picked.map((p, k) => {
            const cx = x(p.i + 0.5);
            const end = y((p.dir === "wb" ? 1 : -1) * Math.max(p.v, p.was ?? 0));
            // On phones a tagged pick (the sandbox's) is one line, "A 1,892": the readout below names the hour.
            const oneLine = compact && !!p.tag;
            const step = oneLine ? 16 : 30;
            // Westbound reads upward from the bar, eastbound downward; stacked labels move further out.
            const [l1, l2] =
              p.dir === "wb" ? [end - 20 - pickLift[k] * step, end - 6 - pickLift[k] * step] : [end + 14 + pickLift[k] * step, end + 28 + pickLift[k] * step];
            const w = (oneLine ? p.tag!.length + p.count.length + 1 : Math.max(p.head.length, p.count.length)) * 6.5;
            // A westbound label that would run into the direction label (~6.2px a character) goes beside the bar instead.
            const dirRight = m.left + 6 + 30 * 6.2;
            if (p.dir === "wb" && (oneLine ? l2 : l1) - 12 < m.top + 18 && cx - w / 2 < dirRight) {
              const bx = x(p.i + 1) + 4;
              return (
                <g key={k} className={`i70s-peak i70s-pick-label${p.tone === "b" ? " is-b" : ""}`}>
                  {oneLine ? (
                    <text x={bx} y={end + 12}>
                      {p.tag} {p.count}
                    </text>
                  ) : (
                    <>
                      <text x={bx} y={end + 12} className="i70s-pick-when">
                        {p.head}
                      </text>
                      <text x={bx} y={end + 26}>
                        {p.count}
                      </text>
                    </>
                  )}
                </g>
              );
            }
            const anchor = cx + w / 2 > width - 2 ? "end" : cx - w / 2 < m.left ? "start" : "middle";
            return (
              <g key={k} className={`i70s-peak i70s-pick-label${p.tone === "b" ? " is-b" : ""}`}>
                {oneLine ? (
                  <text x={cx} y={p.dir === "wb" ? l2 : l1} textAnchor={anchor}>
                    {p.tag} {p.count}
                  </text>
                ) : (
                  <>
                    <text x={cx} y={l1} textAnchor={anchor} className="i70s-pick-when">
                      {p.head}
                    </text>
                    <text x={cx} y={l2} textAnchor={anchor}>
                      {p.count}
                    </text>
                  </>
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
            return (
              <span key={yr} style={yr === cur ? { color: "var(--text-primary)" } : undefined}>
                {seasonName(yr)}: {w != null ? fmtInt(w) : "–"} west · {e != null ? fmtInt(e) : "–"} east
              </span>
            );
          })}
          {holLine && holiday && (
            <span style={{ color: "var(--gold-ink)" }}>
              {holidayName}: {fmtInt(holSeries("wb")?.[hoverI] ?? 0)} west · {fmtInt(holSeries("eb")?.[hoverI] ?? 0)} east
            </span>
          )}
        </div>
      )}
    </div>
  );
}
