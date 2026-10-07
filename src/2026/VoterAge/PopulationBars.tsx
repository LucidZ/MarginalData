import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { select, scaleBand, scaleLinear, axisBottom, axisLeft, easeCubicOut, line as d3line, curveLinear } from "d3";
import Tooltip from "./Tooltip";

export interface PopulationBarRow {
  key: string;
  x: number | string; // age (number, "age" variant) or category (string, "category" variant)
  /** Short axis label, if different from String(x) - e.g. "HS grad" vs the
   * full "High school graduate" used in the tooltip. */
  label?: string;
  cvap: number; // eligible citizens, thousands
  votes: number; // thousands
  expected: number; // cvap x this chart's benchmark turnout, thousands
  missing: number; // votes - expected, thousands (negative = underrepresented)
  turnout: number; // percent
  /** "age" variant only - true for ages 80+, where Census only reports a
   * turnout/citizen-share rate pooled across the whole 80-84 or 85+
   * bucket. Rendered at reduced opacity so the flatter, less-certain
   * region reads as visually distinct from single-year data. */
  ratesPooled?: boolean;
  /** "age" variant only - continuous position on the age axis, for a bar
   * that is mid-slide between two age slots (VoterAge's cohort morph).
   * Defaults to the row's own `x`, which is what every static chart wants.
   * `x`/`label` still name the row's slot - the x-axis ticks are built from
   * them - so a morph should move `xPos` and leave those alone. */
  xPos?: number;
  /** Per-row opacity multiplier, 0-1. Defaults to 1. Used by the cohort
   * morph to fade out bars that have no counterpart in the target year. */
  opacity?: number;
  /** "age" variant only - drawn (at `xPos`) but not one of the axis slots:
   * left out of the band domain, the ticks and the age range. For a cohort
   * sliding in from past the right edge mid-morph, which has no slot in the
   * year being morphed from. The plot's clip hides it until it's in range. */
  offAxis?: boolean;
  /** Registration layer, "age" variant only (VoterAge beat 1). Thousands. */
  registered?: number;
  /** The gold wedge's two parts, thousands of votes ("age" variant only):
   * votes lost because registrants here show up less often than the
   * benchmark group's, and votes lost to people not registered. They sum to
   * expected - votes where that's positive, else both are 0. */
  turnShort?: number;
  regShort?: number;
}

/** One election as a single stacked bar: every age's three segments
 * summed. Thousands. */
export interface SummaryBar {
  key: string; // election year
  kind: "presidential" | "midterm";
  /** Bottom-up - see stackSegments. */
  segments: [number, number, number];
}

/** The three nested counts one age column splits into, bottom-up: votes,
 * registered people who didn't vote, and eligible citizens who aren't
 * registered. So the stack's tops read as votes, registered and eligible.
 * Summing these over every age is what a SummaryBar is, so the merge can fly
 * each piece into its own slice of the total. No 65+ standard here - the
 * summary drops the shortfall framing for the plain counts. */
export function stackSegments(d: { cvap: number; votes: number; registered?: number }): [number, number, number] {
  const reg = d.registered ?? d.votes;
  return [d.votes, reg - d.votes, d.cvap - reg];
}

const SEGMENT_CLASS = ["pb-seg--votes", "pb-seg--registered", "pb-seg--track"];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/** Fraction of the merge spent recolouring the age columns in place, from
 * the shortfall view into the three plain counts, before anything moves. */
const RECOLOR = 0.25;
/** Fraction of the merge spent staggering: age i starts at i/n of this, so
 * the youngest columns lead and the bar fills like a pour. */
const MERGE_STAGGER = 0.45;
/** Same, for the other elections' bars fading in, fanning out from the merged one. */
const REVEAL_STAGGER = 0.55;

interface Props {
  rows: PopulationBarRow[];
  xKind: "age" | "category";
  xLabel: string;
  yLabel?: string;
  /** Layer toggles, for a sticky scrolly that accumulates the chart one
   * piece at a time without re-triggering an axis rescale between steps -
   * all default true (the finished chart). */
  showTrack?: boolean;
  showVotes?: boolean;
  showExpected?: boolean;
  /** Opacity 0-1 of the expected line, overriding showExpected - for a line
   * that fades out under a scroll-driven transition. */
  expectedOpacity?: number;
  /** Legend copy for the expected line, e.g. "expected at 65+ turnout". */
  expectedLineLabel?: string;
  /** Draws the gold shortfall layer: for each bar that falls under the
   * expected marker, a block spanning the votes bar up to that marker.
   * Bars that clear the marker get nothing - the story is about who
   * isn't voting, and shading a "surplus" would imply some groups should
   * participate less. */
  showGap?: boolean;
  /** Opacity 0-1 of the gold shortfall layer, overriding showGap - for a
   * layer that fades out under a scroll-driven transition. */
  gapOpacity?: number;
  /** Opacity 0-1 of the gold wedge split into its two parts ("age" variant
   * only, rows must carry turnShort/regShort): the turnout shade from the
   * votes bar up, the registration shade from there to the dotted line.
   * Drawn over the single wedge, so the two always fill exactly its shape. */
  gapSplit?: number;
  /** Legend copy for the gold swatch (the turnout shade once split - the
   * same colour as the single wedge). The dotted-line label is
   * `expectedLineLabel`. */
  gapLegendLabel?: string;
  /** Legend copy for the registration shade, shown once gapSplit > 0.5.
   * Always mounted, so its arrival doesn't reflow the legend. */
  gapRegLegendLabel?: string;
  /** Opacity 0-1 of the registered bar ("age" variant only, rows must carry
   * `registered`): drawn between the eligible track and the votes bar, so
   * the three nested counts read straight off the column - votes, then
   * registered but didn't vote, then eligible but not registered. */
  registeredOpacity?: number;
  /** Fixes the y-domain - pass the same domain across a dataset swap (e.g.
   * 2024 -> 2022) so the transition reads as "the bars dropped", not "the
   * axis rescaled under them". Computed from the data if omitted. */
  yDomain?: [number, number];
  /** category variant only - direct-labels each bar's missing figure above
   * its tip, per spec v2 S3.2 (small groups' bars are otherwise too small
   * to read a gap off directly). */
  directLabelMissing?: boolean;
  /** Large centered figure + delta line under the chart (VoterAge Beat 2's
   * pinned-benchmark morph). Omit to print nothing under the chart - the
   * gap total belongs in the scrolly copy, not a chart label that pops in
   * and jerks the layout. Pre-derived by the caller from whichever dataset
   * is currently "shown", never from a continuously-lerped `rows` - the
   * printed figure must never take a value that isn't a real election's.
   * Never mounts or unmounts once passed: `opacity` fades the whole block
   * in and `deltaOpacity` the third line, so both reserve their space from
   * first paint and neither arrival can nudge the chart above it. */
  heroGap?: {
    /** One figure, or two side by side. Keep labels short enough not to
     * wrap - the block's height must not change when the count does. */
    items: {
      figure: string;
      label: string;
      delta: string;
      swatch?: "gap" | "gap-turnout" | "gap-reg" | "registered" | "track";
      /** "gap" prints the figure in the shortfall's gold. */
      tone?: "gap";
    }[];
    opacity?: number;
    deltaOpacity: number;
  };
  /** Extra content layered over the plot (e.g. a scroll-position year
   * stamp) - absolutely positioned, doesn't affect layout. Pass a function
   * to pin something to a data value: `yPct(v)` is v's height on the y-axis
   * as a CSS top-% of the plot. */
  plotOverlay?: ReactNode | ((geom: { yPct: (v: number) => number }) => ReactNode);
  /** 0-1: dims and blurs the plot (not the overlay, legend or axes label
   * below) - for a chart that is mid-morph between two real states and
   * whose geometry shouldn't be read as data. Default 0. */
  plotHaze?: number;
  /** 0 disables d3's time-driven tween entirely, for a chart whose values
   * are driven continuously by scroll position - a tween there fights the
   * scroll instead of following it, and can't be stopped or reversed
   * mid-flight. Default 700 keeps the step-to-step animation everywhere else. */
  transitionMs?: number;
  tooltipFor?: (row: PopulationBarRow) => ReactNode;
  /** The age chart collapsing into one bar per election ("age" variant
   * only). `merge` 0-RECOLOR fades every column into its three segments
   * (stackSegments) where it stands; the rest of `merge` flies them into
   * their slices of the `from` election's bar, while the axes cross-fade
   * to the totals scale; `reveal` 0-1 then fades in the other elections' bars.
   * Both driven by scroll, so pass transitionMs 0 alongside. At merge 0 this
   * is the plain age chart. `rows` must be the `from` election at rest. */
  summary?: {
    bars: SummaryBar[];
    from: string;
    merge: number;
    reveal: number;
    /** Gold arrows between bar pairs, each at the top of one stacked layer:
     * `layer` counts segments from the bottom (1 = votes, 2 = registered,
     * 3 = eligible). Drawn bar centre to bar centre, labelled above. */
    arrows?: { layer: number; opacity: number; pairs: { from: string; to: string; label: string }[] }[];
  };
  summaryTooltip?: (bar: SummaryBar) => ReactNode;
}

const MARGIN_AGE = { top: 16, right: 16, bottom: 34, left: 58 };
/** Below this width (a phone, where the chart is pinned above the text and
 * every pixel of height it takes hides text) the age chart goes shorter and
 * trims its left margin. */
const COMPACT_W = 440;
const MARGIN_AGE_COMPACT = { top: 12, right: 10, bottom: 30, left: 54 };
const MARGIN_CATEGORY = { top: 28, right: 16, bottom: 60, left: 58 };

function fmtK(v: number): string {
  const m = v / 1000;
  return `${m.toFixed(m >= 10 ? 0 : 1)}M`;
}

export default function PopulationBars({
  rows,
  xKind,
  xLabel,
  yLabel = "People",
  showTrack = true,
  showVotes = true,
  showExpected = true,
  expectedOpacity,
  expectedLineLabel = "expected at average turnout",
  showGap = false,
  gapOpacity,
  gapSplit = 0,
  gapLegendLabel = "",
  gapRegLegendLabel = "",
  registeredOpacity = 0,
  yDomain: yDomainProp,
  directLabelMissing = false,
  heroGap,
  plotOverlay,
  plotHaze = 0,
  transitionMs = 700,
  tooltipFor,
  summary,
  summaryTooltip,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const clipId = useId();
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<{ row: PopulationBarRow; clientX: number; clientY: number } | null>(null);
  const shortRows = useMemo(() => rows.filter((r) => r.missing < 0), [rows]);
  // New data means whatever sits under the pointer may have changed (the
  // cohort morph slides bars two slots) - drop the stale tooltip rather
  // than keep describing the bar that used to be there. Next mousemove
  // re-targets it.
  useEffect(() => setHover(null), [rows]);
  const [sumHover, setSumHover] = useState<{ bar: SummaryBar; clientX: number; clientY: number } | null>(null);
  const summaryOn = (summary?.merge ?? 0) >= 1;
  useEffect(() => {
    if (!summaryOn) setSumHover(null);
  }, [summaryOn]);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.min(w, 640));
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const compact = xKind === "age" && width < COMPACT_W;
  const margin = xKind === "age" ? (compact ? MARGIN_AGE_COMPACT : MARGIN_AGE) : MARGIN_CATEGORY;
  const height =
    xKind === "age"
      ? compact
        ? Math.max(190, width * 0.62)
        : Math.max(300, Math.min(width * 0.72, 420))
      : Math.max(340, Math.min(width * 0.85, 460));

  // Same yDomain/range as the d3 effect below, for placing HTML overlays.
  // The svg scales uniformly via viewBox, so a %-of-height holds at any size.
  const yPct = (v: number) => {
    const [lo, hi] = yDomainProp ?? [0, Math.max(1, ...rows.map((r) => r.cvap)) * 1.08];
    const innerH = height - margin.top - margin.bottom;
    return ((margin.top + innerH * (1 - (v - lo) / (hi - lo))) / height) * 100;
  };

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Slots come from the on-axis rows only; an offAxis row is positioned
    // by xPos against those slots.
    const slotRows = rows.filter((r) => !r.offAxis);
    const domainKeys = slotRows.map((r) => r.key);
    const xScale = scaleBand<string>()
      .domain(domainKeys)
      .range([0, innerW])
      .padding(xKind === "age" ? 0.15 : 0.35);

    // Uniform band geometry: with a contiguous domain, slot i sits at
    // x0 + i*step, so a fractional age lands exactly between two slots and
    // an integer age lands exactly on xScale(key). Lets a bar animate
    // *between* slots without leaving the scale.
    const x0 = xScale(domainKeys[0]) ?? 0;
    const ageLo = xKind === "age" ? Math.min(...slotRows.map((r) => Number(r.x))) : 0;
    const xOf = (d: PopulationBarRow) =>
      xKind === "age" ? x0 + ((d.xPos ?? Number(d.x)) - ageLo) * xScale.step() : xScale(d.key) ?? 0;

    // xOf's arithmetic assumes slot i == ageLo + i. Single years of age are
    // contiguous today; if that ever stops being true this must become a
    // lookup, and failing loudly beats drawing a scrambled chart. Only
    // checked on the default (no xPos) path - the cohort morph deliberately
    // moves xPos away from ageLo+i while it's mid-slide, and that's the point.
    if (import.meta.env.DEV && xKind === "age" && rows.every((r) => r.xPos === undefined)) {
      console.assert(
        rows.every((r, i) => Number(r.x) === ageLo + i),
        "PopulationBars: age rows must be contiguous single years for xOf()"
      );
    }

    const yDomain: [number, number] =
      yDomainProp ?? [0, Math.max(1, ...rows.map((r) => r.cvap)) * 1.08];
    const yScale = scaleLinear().domain(yDomain).range([innerH, 0]);
    const lineOpacity = expectedOpacity ?? (showExpected ? 1 : 0);
    const gapOn = gapOpacity ?? (showGap ? 1 : 0);

    let root = svg.select<SVGGElement>("g.pb-root");
    if (root.empty()) {
      root = svg.append("g").attr("class", "pb-root");
      root.append("g").attr("class", "voa-axis pb-axis-x");
      root.append("g").attr("class", "voa-axis pb-axis-y");
      root.append("g").attr("class", "voa-axis pb-axis-x2");
      root.append("g").attr("class", "voa-axis pb-axis-y2");
      root.append("text").attr("class", "voa-axis-label pb-axis-label-y").attr("text-anchor", "middle");
      root.append("clipPath").attr("id", clipId).append("rect").attr("class", "pb-clip-rect");
      // Bars sliding past x=0 (cohort morph) must be cut at the y-axis, not
      // drawn over it. Axes, ticks and labels stay outside so a clipped tick
      // label never gets chopped.
      const clipped = root.append("g").attr("class", "pb-clipped").attr("clip-path", `url(#${clipId})`);
      // The age chart proper, in one group so the summary can hide it whole.
      const age = clipped.append("g").attr("class", "pb-age");
      age.append("g").attr("class", "pb-tracks");
      age.append("g").attr("class", "pb-registered");
      age.append("g").attr("class", "pb-votes");
      age.append("g").attr("class", "pb-gaps");
      age.append("g").attr("class", "pb-gaps-turnout");
      age.append("g").attr("class", "pb-gaps-reg");
      age.append("path").attr("class", "pb-expected-line");
      root.append("g").attr("class", "pb-expected-ticks");
      root.append("g").attr("class", "pb-missing-labels");
      age.append("g").attr("class", "pb-hits");
      clipped.append("g").attr("class", "pb-merge");
      clipped.append("g").attr("class", "pb-summary");
      clipped.append("g").attr("class", "pb-summary-hits");
      // Outside the clip, so a label riding above the tallest bar isn't cut.
      root.append("g").attr("class", "pb-summary-arrows");
    }
    root.attr("transform", `translate(${margin.left},${margin.top})`);
    root
      .select<SVGRectElement>("rect.pb-clip-rect")
      .attr("x", 0)
      .attr("y", -2)
      .attr("width", innerW)
      .attr("height", innerH + 2);

    const tr = transitionMs > 0 ? svg.transition().duration(transitionMs).ease(easeCubicOut) : null;
    const anim = (sel: any) => (tr ? sel.transition(tr) : sel);

    // X axis: age variant shows sparse ticks (every 10 years + first/last);
    // category variant shows every bar, with short labels.
    const xAxisSel = root.select<SVGGElement>("g.pb-axis-x").attr("transform", `translate(0,${innerH})`);
    if (xKind === "age") {
      // Every multiple of 10 in range, plus the low end only if it isn't
      // close enough to its neighboring multiple-of-10 tick to collide
      // with it (e.g. 18 sitting 2 years from 20 at ~7px/year bandwidth).
      // tickValues must be band-scale domain keys ("age-18"), not the
      // bare numbers used for the label - scaleBand(key) is undefined
      // for anything outside its exact domain, which silently produces
      // a NaN tick position rather than a visible error otherwise.
      const lo = Math.min(...slotRows.map((r) => Number(r.x)));
      const hi = Math.max(...slotRows.map((r) => Number(r.x)));
      const tickAges = slotRows.filter((r) => Number(r.x) % 10 === 0).map((r) => Number(r.x));
      if (lo % 10 !== 0 && Math.min(...tickAges.map((a) => Math.abs(a - lo))) >= 5) tickAges.unshift(lo);
      if (hi % 10 !== 0 && !tickAges.includes(hi)) tickAges.push(hi);
      const ageToKey = new Map(slotRows.map((r) => [Number(r.x), r.key]));
      const keyToAge = new Map(slotRows.map((r) => [r.key, r.label ?? String(r.x)]));
      anim(xAxisSel).call(
          axisBottom(xScale)
            .tickValues(tickAges.map((a) => ageToKey.get(a)!))
            .tickFormat((key) => keyToAge.get(key as string) ?? "") as any
        );
    } else {
      anim(xAxisSel).call(
        axisBottom(xScale).tickFormat((key) => {
          const row = rows.find((r) => r.key === key);
          return row?.label ?? (row ? String(row.x) : "");
        }) as any
      );
      // Rotate + right-align category labels so multi-word group names
      // (e.g. "Advanced degree") don't overlap their neighbors.
      xAxisSel
        .selectAll("text")
        .attr("transform", "rotate(-28)")
        .style("text-anchor", "end")
        .attr("dx", "-0.4em")
        .attr("dy", "0.15em");
    }

    anim(root.select<SVGGElement>("g.pb-axis-y")).call(axisLeft(yScale).ticks(5).tickFormat(fmtK as any) as any);

    root
      .select("text.pb-axis-label-y")
      // Compact: pushed further left so the rotated label clears "4.0M".
      .attr("transform", `translate(${-margin.left + (compact ? 9 : 16)},${innerH / 2}) rotate(-90)`)
      .text(yLabel);

    // Track bars (eligible citizens) - full bandwidth, light fill, always
    // drawn first so the accent votes bar can sit on top of it.
    const tracks = root
      .select<SVGGElement>("g.pb-tracks")
      .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-track")
      .data(rows, (d) => d.key);
    anim(tracks.exit()).attr("y", innerH).attr("height", 0).remove();
    const tracksMerged = tracks
      .enter()
      .append("rect")
      .attr("class", (d) => `pb-track${d.ratesPooled ? " pb-pooled" : ""}`)
      .attr("x", (d) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", innerH)
      .attr("height", 0)
      .merge(tracks as any)
      .attr("class", (d) => `pb-track${d.ratesPooled ? " pb-pooled" : ""}`)
      .attr("data-key", (d: PopulationBarRow) => d.key)
      .style("opacity", (d: PopulationBarRow) => (showTrack ? 1 : 0) * (d.opacity ?? 1));
    anim(tracksMerged)
      .attr("x", (d: PopulationBarRow) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.cvap))
      .attr("height", (d: PopulationBarRow) => innerH - yScale(d.cvap));

    // Registered bars - between the track and the votes bar, so the pale
    // band above the votes is registered people who didn't vote and the grey
    // above that is eligible citizens who aren't registered.
    const registered = root
      .select<SVGGElement>("g.pb-registered")
      .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-registered")
      .data(rows.filter((r) => r.registered !== undefined), (d) => d.key);
    anim(registered.exit()).attr("y", innerH).attr("height", 0).remove();
    const registeredClass = (d: PopulationBarRow) => `pb-registered${d.ratesPooled ? " pb-pooled" : ""}`;
    const registeredMerged = registered
      .enter()
      .append("rect")
      .attr("class", registeredClass)
      .attr("x", (d) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", (d) => yScale(d.votes))
      .attr("height", (d) => innerH - yScale(d.votes))
      .merge(registered as any)
      .attr("class", registeredClass)
      .style("opacity", (d: PopulationBarRow) => registeredOpacity * (d.opacity ?? 1));
    anim(registeredMerged)
      .attr("x", (d: PopulationBarRow) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.registered!))
      .attr("height", (d: PopulationBarRow) => innerH - yScale(d.registered!));

    // Votes bars - same x/width as the track, shorter height, drawn on
    // top so the visible remainder above it (up to the track's height)
    // reads directly as the gap between eligible and voted.
    const votes = root
      .select<SVGGElement>("g.pb-votes")
      .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-votes")
      .data(rows, (d) => d.key);
    anim(votes.exit()).attr("y", innerH).attr("height", 0).remove();
    const votesClass = (d: PopulationBarRow) => `pb-votes${d.ratesPooled ? " pb-pooled" : ""}`;
    const votesMerged = votes
      .enter()
      .append("rect")
      .attr("class", votesClass)
      .attr("x", (d) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", innerH)
      .attr("height", 0)
      .merge(votes as any)
      .attr("class", votesClass)
      .style("opacity", (d: PopulationBarRow) => (showVotes ? 1 : 0) * (d.opacity ?? 1));
    anim(votesMerged)
      .attr("x", (d: PopulationBarRow) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.votes))
      .attr("height", (d: PopulationBarRow) => innerH - yScale(d.votes));

    // Gold shortfall blocks - one per bar that falls under a standard,
    // sitting on the bar it's measured against and capped by that
    // standard's dotted line. Across the age chart they merge into one
    // wedge, so the gap reads as a single shape rather than 25 separate
    // pieces. Bars over the line get nothing.
    const drawGapLayer = (
      group: string,
      bottom: (d: PopulationBarRow) => number | undefined,
      top: (d: PopulationBarRow) => number | undefined,
      opacity: number,
      cls = "pb-gap"
    ) => {
      const data = rows.filter((d) => {
        const b = bottom(d), t = top(d);
        return b !== undefined && t !== undefined && b < t;
      });
      const gapClass = (d: PopulationBarRow) => `pb-gap ${cls}${d.ratesPooled ? " pb-pooled" : ""}`;
      const sel = root
        .select<SVGGElement>(`g.${group}`)
        .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-gap")
        .data(data, (d) => d.key);
      sel.exit().remove();
      const merged = sel
        .enter()
        .append("rect")
        .attr("class", gapClass)
        .attr("x", (d) => xOf(d))
        .attr("width", xScale.bandwidth())
        .attr("y", (d) => yScale(tr ? bottom(d)! : top(d)!))
        .attr("height", (d) => (tr ? 0 : yScale(bottom(d)!) - yScale(top(d)!)))
        .merge(sel as any)
        .attr("class", gapClass)
        .style("opacity", (d: PopulationBarRow) => opacity * (d.opacity ?? 1));
      anim(merged)
        .attr("x", (d: PopulationBarRow) => xOf(d))
        .attr("width", xScale.bandwidth())
        .attr("y", (d: PopulationBarRow) => yScale(top(d)!))
        .attr("height", (d: PopulationBarRow) => yScale(bottom(d)!) - yScale(top(d)!));
    };
    drawGapLayer("pb-gaps", (d) => d.votes, (d) => d.expected, gapOn);
    // The split, over the single wedge. The seam is capped at the dotted
    // line: mid-morph the lerped parts can overshoot a lerped gap that's
    // crossing zero, and the two shades must never spill past the wedge.
    const seam = (d: PopulationBarRow) =>
      d.turnShort === undefined ? undefined : Math.min(d.votes + d.turnShort, d.expected);
    drawGapLayer("pb-gaps-turnout", (d) => d.votes, seam, gapSplit, "pb-gap--turnout");
    drawGapLayer("pb-gaps-reg", seam, (d) => (d.regShort === undefined ? undefined : d.expected), gapSplit, "pb-gap--reg");

    // Expected-turnout marker. Age variant: one dotted path through every
    // bar's expected value - since cvap varies smoothly by age, this
    // traces a scaled silhouette of the population curve itself.
    // Category variant: categories aren't ordered, so a connecting line
    // would imply a false adjacency - draw a short dashed tick per bar
    // instead (a bullet-chart target marker).
    const expectedLine = root.select<SVGPathElement>("path.pb-expected-line");
    const expectedTicks = root.select<SVGGElement>("g.pb-expected-ticks");
    if (xKind === "age") {
      expectedTicks.selectAll("*").remove();
      const lineGen = d3line<PopulationBarRow>()
        .x((d) => xOf(d) + xScale.bandwidth() / 2)
        .y((d) => yScale(d.expected))
        .curve(curveLinear);
      anim(expectedLine.datum(rows).style("opacity", lineOpacity)).attr("d", lineGen);
    } else {
      expectedLine.style("opacity", 0);
      const ticks = expectedTicks.selectAll<SVGLineElement, PopulationBarRow>("line.pb-expected-tick").data(rows, (d) => d.key);
      ticks.exit().remove();
      const ticksMerged = ticks
        .enter()
        .append("line")
        .attr("class", "pb-expected-tick")
        .merge(ticks as any)
        .style("opacity", lineOpacity);
      anim(ticksMerged)
        .attr("x1", (d: PopulationBarRow) => xScale(d.key) ?? 0)
        .attr("x2", (d: PopulationBarRow) => (xScale(d.key) ?? 0) + xScale.bandwidth())
        .attr("y1", (d: PopulationBarRow) => yScale(d.expected))
        .attr("y2", (d: PopulationBarRow) => yScale(d.expected));
    }

    // Direct missing-value labels (category variant only) - above the
    // taller of votes/expected so the label never sits inside a fill.
    const missingLabels = root
      .select<SVGGElement>("g.pb-missing-labels")
      .selectAll<SVGTextElement, PopulationBarRow>("text.pb-missing-label")
      .data(xKind === "category" && directLabelMissing ? shortRows : [], (d) => d.key);
    missingLabels.exit().remove();
    const missingLabelsMerged = missingLabels
      .enter()
      .append("text")
      .attr("class", "pb-missing-label")
      .attr("text-anchor", "middle")
      .merge(missingLabels as any);
    anim(missingLabelsMerged)
      .attr("x", (d: PopulationBarRow) => (xScale(d.key) ?? 0) + xScale.bandwidth() / 2)
      .attr("y", (d: PopulationBarRow) => yScale(d.expected) - 8)
      .text((d: PopulationBarRow) => `${(d.missing / 1000).toFixed(1)}M`);

    // Invisible full-height hit targets - hover/tap works across the
    // whole bar column, not just the (sometimes very short) votes rect.
    const hits = root
      .select<SVGGElement>("g.pb-hits")
      .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-hit")
      .data(rows, (d) => d.key);
    hits.exit().remove();
    hits
      .enter()
      .append("rect")
      .attr("class", "pb-hit")
      .merge(hits as any)
      .attr("data-key", (d: PopulationBarRow) => d.key)
      .attr("x", (d) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", 0)
      .attr("height", innerH)
      .style("cursor", tooltipFor ? "pointer" : "default")
      .on("mouseenter touchstart", function (event: any, d: PopulationBarRow) {
        if (!tooltipFor) return;
        const p = event.touches ? event.touches[0] : event;
        setHover({ row: d, clientX: p.clientX, clientY: p.clientY });
      })
      .on("mousemove", function (event: any, d: PopulationBarRow) {
        if (!tooltipFor) return;
        setHover({ row: d, clientX: event.clientX, clientY: event.clientY });
      })
      .on("mouseleave touchend", function () {
        setHover(null);
      });

    // ---- Summary: the age columns merging into one bar per election ----
    const m = summary ? clamp01(summary.merge) : 0;
    // Recolour first (the new pieces fade in over the age chart, at the
    // columns' own heights), then fly.
    const recolor = clamp01(m / RECOLOR);
    const fly = clamp01((m - RECOLOR) / (1 - RECOLOR));
    root.select("g.pb-age").style("display", fly > 0 ? "none" : "");
    // Axes cross-fade with a dead zone in the middle, so the two scales
    // never sit on top of each other.
    const oldAxis = 1 - clamp01(fly / 0.4);
    const newAxis = clamp01((fly - 0.6) / 0.4);
    root.select("g.pb-axis-x").style("opacity", oldAxis);
    root.select("g.pb-axis-y").style("opacity", oldAxis);
    const xAxis2 = root.select<SVGGElement>("g.pb-axis-x2").attr("transform", `translate(0,${innerH})`);
    const yAxis2 = root.select<SVGGElement>("g.pb-axis-y2");
    const sumBars = summary?.bars ?? [];
    const xs = scaleBand<string>().domain(sumBars.map((b) => b.key)).range([0, innerW]).padding(0.3);
    const totalOf = (b: SummaryBar) => b.segments.reduce((a, v) => a + v, 0);
    const ys = scaleLinear()
      .domain([0, Math.max(1, ...sumBars.map(totalOf)) * 1.08])
      .range([innerH, 0]);
    const kindOf = new Map(sumBars.map((b) => [b.key, b.kind]));
    if (summary && m > 0) {
      xAxis2.style("opacity", newAxis).style("display", "").call(axisBottom(xs) as any);
      // Midterm years get a second line under the year. The axis call resets
      // each label's text (dropping any tspan), so this re-adds it every pass.
      xAxis2.selectAll<SVGGElement, string>("g.tick").each(function (key) {
        if (kindOf.get(key) !== "midterm") return;
        select(this)
          .select("text")
          .append("tspan")
          .attr("class", "pb-axis-sublabel")
          .attr("x", 0)
          .attr("dy", "1.15em")
          .text("midterm");
      });
      yAxis2.style("opacity", newAxis).style("display", "").call(axisLeft(ys).ticks(5).tickFormat(fmtK as any) as any);
    } else {
      xAxis2.style("display", "none");
      yAxis2.style("display", "none");
    }
    type Piece = { key: string; seg: number; x: number; y: number; w: number; h: number; o?: number };

    // Mid-merge: every column split into its three segments, each flying
    // (in pixel space, so the y-scale change is part of the flight) from
    // where the age chart draws it to its slice of the `from` bar. Slices
    // stack by age within each segment, youngest at the bottom.
    const pieces: Piece[] = [];
    if (summary && m > 0 && m < 1) {
      const cols = rows.filter((r) => !r.offAxis).sort((a, b) => Number(a.x) - Number(b.x));
      const segs = cols.map(stackSegments);
      const segTotals = [0, 1, 2].map((s) => segs.reduce((a, v) => a + v[s], 0));
      const segBase = segTotals.map((_, s) => segTotals.slice(0, s).reduce((a, v) => a + v, 0));
      const offset = [0, 0, 0];
      const toX = xs(summary.from) ?? 0;
      cols.forEach((d, i) => {
        const k = easeInOut(clamp01((fly - (i / cols.length) * MERGE_STAGGER) / (1 - MERGE_STAGGER)));
        let below = 0;
        segs[i].forEach((v, s) => {
          const fromTop = yScale(below + v), fromBot = yScale(below);
          const toTop = ys(segBase[s] + offset[s] + v), toBot = ys(segBase[s] + offset[s]);
          below += v;
          offset[s] += v;
          if (v <= 0) return;
          const top = lerp(fromTop, toTop, k);
          // A hair of overlap so neighbouring same-colour slices don't
          // show anti-aliased seams once they've packed together.
          const h = lerp(fromBot, toBot, k) - top + 0.6 * k;
          pieces.push({ key: `${d.key}-${s}`, seg: s, x: lerp(xOf(d), toX, k), w: lerp(xScale.bandwidth(), xs.bandwidth(), k), y: top, h, o: recolor });
        });
      });
    }
    const drawPieces = (group: string, data: Piece[]) => {
      const sel = root
        .select<SVGGElement>(`g.${group}`)
        .selectAll<SVGRectElement, Piece>("rect.pb-seg")
        .data(data, (d) => d.key);
      sel.exit().remove();
      sel
        .enter()
        .append("rect")
        .merge(sel as any)
        .attr("class", (d: Piece) => `pb-seg ${SEGMENT_CLASS[d.seg]}`)
        .attr("x", (d: Piece) => d.x)
        .attr("width", (d: Piece) => d.w)
        .attr("y", (d: Piece) => d.y)
        .attr("height", (d: Piece) => Math.max(0, d.h))
        .style("opacity", (d: Piece) => d.o ?? 1);
      // DOM order follows data order, so whatever is listed last paints on top.
      root.select(`g.${group}`).selectAll<SVGRectElement, Piece>("rect.pb-seg").order();
    };
    drawPieces("pb-merge", pieces);

    // Merged: one solid stack per election. `from` is already there; the
    // rest fade in at full height as `reveal` runs, fanning out from it -
    // its neighbours first, then theirs. Fading rather than growing means no
    // frame ever shows a bar at a false total.
    const fromIdx = sumBars.findIndex((b) => b.key === summary?.from);
    const maxRing = Math.max(1, fromIdx, sumBars.length - 1 - fromIdx);
    const appear = (b: SummaryBar) => {
      if (!summary || m < 1) return 0;
      if (b.key === summary.from) return 1;
      const ring = Math.abs(sumBars.indexOf(b) - fromIdx) - 1;
      return easeInOut(clamp01((summary.reveal - (ring / maxRing) * REVEAL_STAGGER) / (1 - REVEAL_STAGGER)));
    };
    const stacks: Piece[] = [];
    const shown = sumBars.map((b) => ({ b, f: appear(b) })).filter((d) => d.f > 0);
    for (const { b, f } of shown) {
      const x = xs(b.key) ?? 0;
      let below = 0;
      b.segments.forEach((v, s) => {
        if (v > 0) stacks.push({ key: `${b.key}-${s}`, seg: s, x, w: xs.bandwidth(), y: ys(below + v), h: ys(below) - ys(below + v), o: f });
        below += v;
      });
    }
    drawPieces("pb-summary", stacks);

    const sumHits = root
      .select<SVGGElement>("g.pb-summary-hits")
      .selectAll<SVGRectElement, { b: SummaryBar; f: number }>("rect")
      .data(shown.filter((d) => d.f >= 1), (d) => d.b.key);
    sumHits.exit().remove();
    sumHits
      .enter()
      .append("rect")
      .attr("class", "pb-hit")
      .merge(sumHits as any)
      .attr("x", (d: { b: SummaryBar }) => xs(d.b.key) ?? 0)
      .attr("width", xs.bandwidth())
      .attr("y", 0)
      .attr("height", innerH)
      .style("cursor", summaryTooltip ? "pointer" : "default")
      .on("mouseenter touchstart mousemove", function (event: any, d: { b: SummaryBar }) {
        if (!summaryTooltip) return;
        const p = event.touches ? event.touches[0] : event;
        setSumHover({ bar: d.b, clientX: p.clientX, clientY: p.clientY });
      })
      .on("mouseleave touchend", () => setSumHover(null));

    // Gold arrows: one group per beat, faded by its own opacity. Only once
    // every bar is in, so an arrow never points at a bar that isn't there.
    type Arrow = { key: string; x1: number; y1: number; x2: number; y2: number; label: string; o: number };
    const arrows: Arrow[] = [];
    if (summary && m >= 1 && summary.reveal >= 1) {
      const byKey = new Map(sumBars.map((b) => [b.key, b]));
      const topOf = (b: SummaryBar, layer: number) => b.segments.slice(0, layer).reduce((a, v) => a + v, 0);
      for (const a of summary.arrows ?? []) {
        if (a.opacity <= 0) continue;
        for (const p of a.pairs) {
          const f = byKey.get(p.from), t = byKey.get(p.to);
          if (!f || !t) continue;
          arrows.push({
            key: `${a.layer}-${p.from}`,
            x1: (xs(p.from) ?? 0) + xs.bandwidth() * 0.5,
            y1: ys(topOf(f, a.layer)),
            x2: (xs(p.to) ?? 0) + xs.bandwidth() * 0.5,
            y2: ys(topOf(t, a.layer)),
            label: p.label,
            o: a.opacity,
          });
        }
      }
    }
    const HEAD = 7;
    const ag = root
      .select<SVGGElement>("g.pb-summary-arrows")
      .selectAll<SVGGElement, Arrow>("g.pb-arrow")
      .data(arrows, (d) => d.key);
    ag.exit().remove();
    const agEnter = ag.enter().append("g").attr("class", "pb-arrow");
    agEnter.append("line").attr("class", "pb-arrow-line");
    agEnter.append("path").attr("class", "pb-arrow-head");
    agEnter.append("text").attr("class", "pb-arrow-label").attr("text-anchor", "middle");
    const agAll = agEnter.merge(ag as any).style("opacity", (d) => d.o);
    agAll.each(function (d) {
      const g = select(this);
      const ang = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
      // Stop the shaft short of the tip so its square end can't poke past the head.
      g.select("line")
        .attr("x1", d.x1)
        .attr("y1", d.y1)
        .attr("x2", d.x2 - Math.cos(ang) * HEAD * 0.8)
        .attr("y2", d.y2 - Math.sin(ang) * HEAD * 0.8);
      const bx = d.x2 - Math.cos(ang) * HEAD, by = d.y2 - Math.sin(ang) * HEAD;
      const nx = -Math.sin(ang) * HEAD * 0.6, ny = Math.cos(ang) * HEAD * 0.6;
      g.select("path").attr("d", `M${d.x2},${d.y2}L${bx + nx},${by + ny}L${bx - nx},${by - ny}Z`);
      g.select("text")
        .attr("x", (d.x1 + d.x2) / 2)
        .attr("y", Math.min(d.y1, d.y2) - 8)
        .text(d.label);
    });
  }, [
    summary,
    summaryTooltip,
    rows,
    xKind,
    compact,
    width,
    height,
    showTrack,
    showVotes,
    showExpected,
    expectedOpacity,
    showGap,
    gapOpacity,
    gapSplit,
    registeredOpacity,
    shortRows,
    yDomainProp,
    directLabelMissing,
    tooltipFor,
    yLabel,
    transitionMs,
  ]);

  // Entries arrive with their layer and are only faded, never mounted, so
  // the legend never reflows. Once the summary's recolour is half done the
  // registered entry is on whatever the step: the summary bars carry it.
  const sumLegend = (summary?.merge ?? 0) >= RECOLOR / 2;
  const lineLegendOn = !sumLegend && (expectedOpacity ?? (showExpected ? 1 : 0)) > 0.5;
  const registeredLegendOn = sumLegend || registeredOpacity > 0.5;
  const regLegendOn = !sumLegend && gapSplit > 0.5;
  const gapLegendOn = !sumLegend && (gapOpacity ?? (showGap ? 1 : 0)) > 0.5;
  const hasSplit = !!gapRegLegendLabel && rows.some((r) => r.regShort !== undefined);

  return (
    <div ref={wrapRef} className="voa-chart-surface pb-surface">
      <div className="voa-legend">
        <span className="pb-legend-entry">
          <span className="voa-legend-swatch pb-legend-track" /> Eligible citizens
        </span>
        {rows.some((r) => r.registered !== undefined) && (
          <span
            className="pb-legend-entry"
            style={{ marginLeft: "0.9rem", opacity: registeredLegendOn ? 1 : 0 }}
            aria-hidden={!registeredLegendOn || undefined}
          >
            <span className="voa-legend-swatch pb-legend-registered" /> Registered
          </span>
        )}
        <span
          className="pb-legend-entry"
          style={{ marginLeft: "0.9rem", opacity: showVotes ? 1 : 0 }}
          aria-hidden={!showVotes || undefined}
        >
          <span className="voa-legend-swatch pb-legend-votes" /> Votes cast
        </span>
        <span
          className="pb-legend-expected"
          style={{ marginLeft: "0.9rem", opacity: lineLegendOn ? 1 : 0 }}
          aria-hidden={!lineLegendOn || undefined}
        >
          <svg width="18" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="18" y2="5" className="pb-expected-line pb-legend-line" />
          </svg>{" "}
          {expectedLineLabel}
        </span>
        {gapLegendLabel && (
          <span
            className="pb-legend-entry"
            style={{ marginLeft: "0.9rem", opacity: gapLegendOn ? 1 : 0 }}
            aria-hidden={!gapLegendOn || undefined}
          >
            <span className="voa-legend-swatch pb-legend-gap" /> {gapLegendLabel}
          </span>
        )}
        {hasSplit && (
          <span
            className="pb-legend-entry"
            style={{ marginLeft: "0.9rem", opacity: regLegendOn ? 1 : 0 }}
            aria-hidden={!regLegendOn || undefined}
          >
            <span className="voa-legend-swatch pb-legend-gap-reg" /> {gapRegLegendLabel}
          </span>
        )}
      </div>
      <div className="pb-plot-wrap">
        <svg
          ref={svgRef}
          role="img"
          aria-label={xLabel}
          style={plotHaze > 0 ? { opacity: 1 - 0.3 * plotHaze, filter: `blur(${1.25 * plotHaze}px)` } : undefined}
        />
        {typeof plotOverlay === "function" ? plotOverlay({ yPct }) : plotOverlay}
      </div>
      <div className="voa-axis-label-x">{xLabel}</div>
      {heroGap && (
        <div className="pb-gap-summary pb-gap-summary--hero" style={{ opacity: heroGap.opacity ?? 1 }}>
          <div className="pb-gap-hero-row">
            {heroGap.items.map((item) => (
              <div className="pb-gap-hero" key={item.label}>
                <div className={`pb-gap-hero-figure${item.tone ? " voa-gap-text" : ""}`}>{item.figure}</div>
                <div className="pb-gap-hero-label">
                  {item.swatch && (
                    <span className={`voa-legend-swatch pb-legend-${item.swatch}`} aria-hidden="true" />
                  )}{" "}
                  {item.label}
                </div>
                {/* Always mounted so its arrival can't nudge the figure/label
                    above it - only opacity fades in near the end of the morph. */}
                <div
                  className="pb-gap-hero-delta"
                  style={{ opacity: heroGap.deltaOpacity }}
                  aria-hidden={heroGap.deltaOpacity < 0.01 || undefined}
                >
                  {/* A non-breaking space keeps an empty delta's line box, so
                      the block is the same height with or without one. */}
                  {item.delta || "\u00a0"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {sumHover && summaryTooltip && (
        <Tooltip content={summaryTooltip(sumHover.bar)} clientX={sumHover.clientX} clientY={sumHover.clientY} />
      )}
      {(() => {
        if (!hover || !tooltipFor) return null;
        const content = tooltipFor(hover.row);
        return content ? <Tooltip content={content} clientX={hover.clientX} clientY={hover.clientY} /> : null;
      })()}
    </div>
  );
}
