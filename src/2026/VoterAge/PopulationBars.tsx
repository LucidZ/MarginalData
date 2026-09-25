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
  /** Registration layer, "age" variant only (VoterAge beat 1). Thousands. */
  registered?: number;
  /** cvap x the 65+ registration rate - the registration standard's line. */
  expectedRegistered?: number;
  /** registered x the 65+ show-up rate - the show-up standard's line. */
  expectedFromRegistered?: number;
}

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
  /** Legend copy for the expected line, e.g. "expected at 65+ turnout". */
  expectedLineLabel?: string;
  /** Draws the gold shortfall layer: for each bar that falls under the
   * expected marker, a block spanning the votes bar up to that marker.
   * Bars that clear the marker get nothing - the story is about who
   * isn't voting, and shading a "surplus" would imply some groups should
   * participate less. */
  showGap?: boolean;
  /** Opacity 0-1 of the registered bar, drawn between the eligible track
   * and the votes bar. Omit on charts whose rows carry no `registered`. */
  registeredOpacity?: number;
  /** Two more 65+ standards, one per hurdle ("age" variant only). Each is
   * a dotted line plus a gold gap measured against the bar it sits on:
   *   registration - line at expectedRegistered, gap down to registered
   *   showUp       - line at expectedFromRegistered, gap down to votes
   * `line`/`gap` are opacities, so a caller can dim a previous step's
   * standard rather than drop it. */
  registrationStandard?: { line: number; gap: number };
  showUpStandard?: { line: number; gap: number };
  /** Legend copy for the gold swatch. The dotted-line label is
   * `expectedLineLabel`. Both are one entry each, relabelled by the caller
   * as the active standard changes, so the legend never reflows. */
  gapLegendLabel?: string;
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
  heroGap?: { figure: string; label: string; delta: string; opacity?: number; deltaOpacity: number };
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
}

const MARGIN_AGE = { top: 16, right: 16, bottom: 34, left: 58 };
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
  expectedLineLabel = "expected at average turnout",
  showGap = false,
  registeredOpacity = 0,
  registrationStandard,
  showUpStandard,
  gapLegendLabel = "Shortfall",
  yDomain: yDomainProp,
  directLabelMissing = false,
  heroGap,
  plotOverlay,
  plotHaze = 0,
  transitionMs = 700,
  tooltipFor,
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

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.min(w, 640));
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const margin = xKind === "age" ? MARGIN_AGE : MARGIN_CATEGORY;
  const height = xKind === "age" ? Math.max(300, Math.min(width * 0.72, 420)) : Math.max(340, Math.min(width * 0.85, 460));

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

    const domainKeys = rows.map((r) => r.key);
    const xScale = scaleBand<string>()
      .domain(domainKeys)
      .range([0, innerW])
      .padding(xKind === "age" ? 0.15 : 0.35);

    // Uniform band geometry: with a contiguous domain, slot i sits at
    // x0 + i*step, so a fractional age lands exactly between two slots and
    // an integer age lands exactly on xScale(key). Lets a bar animate
    // *between* slots without leaving the scale.
    const x0 = xScale(domainKeys[0]) ?? 0;
    const ageLo = xKind === "age" ? Math.min(...rows.map((r) => Number(r.x))) : 0;
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

    let root = svg.select<SVGGElement>("g.pb-root");
    if (root.empty()) {
      root = svg.append("g").attr("class", "pb-root");
      root.append("g").attr("class", "voa-axis pb-axis-x");
      root.append("g").attr("class", "voa-axis pb-axis-y");
      root.append("text").attr("class", "voa-axis-label pb-axis-label-y").attr("text-anchor", "middle");
      root.append("clipPath").attr("id", clipId).append("rect").attr("class", "pb-clip-rect");
      // Bars sliding past x=0 (cohort morph) must be cut at the y-axis, not
      // drawn over it. Axes, ticks and labels stay outside so a clipped tick
      // label never gets chopped.
      const clipped = root.append("g").attr("class", "pb-clipped").attr("clip-path", `url(#${clipId})`);
      clipped.append("g").attr("class", "pb-tracks");
      clipped.append("g").attr("class", "pb-registered");
      clipped.append("g").attr("class", "pb-votes");
      clipped.append("g").attr("class", "pb-gaps");
      clipped.append("g").attr("class", "pb-gaps-reg");
      clipped.append("g").attr("class", "pb-gaps-showup");
      clipped.append("path").attr("class", "pb-expected-line");
      clipped.append("path").attr("class", "pb-expected-line pb-line-reg");
      clipped.append("path").attr("class", "pb-expected-line pb-line-showup");
      root.append("g").attr("class", "pb-expected-ticks");
      root.append("g").attr("class", "pb-missing-labels");
      clipped.append("g").attr("class", "pb-hits");
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
      const lo = Math.min(...rows.map((r) => Number(r.x)));
      const hi = Math.max(...rows.map((r) => Number(r.x)));
      const tickAges = rows.filter((r) => Number(r.x) % 10 === 0).map((r) => Number(r.x));
      if (lo % 10 !== 0 && Math.min(...tickAges.map((a) => Math.abs(a - lo))) >= 5) tickAges.unshift(lo);
      if (hi % 10 !== 0 && !tickAges.includes(hi)) tickAges.push(hi);
      const ageToKey = new Map(rows.map((r) => [Number(r.x), r.key]));
      const keyToAge = new Map(rows.map((r) => [r.key, r.label ?? String(r.x)]));
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
      .attr("transform", `translate(${-margin.left + 16},${innerH / 2}) rotate(-90)`)
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
      .style("opacity", (d: PopulationBarRow) => (showTrack ? 1 : 0) * (d.opacity ?? 1));
    anim(tracksMerged)
      .attr("x", (d: PopulationBarRow) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.cvap))
      .attr("height", (d: PopulationBarRow) => innerH - yScale(d.cvap));

    // Registered bars - between the track and the votes bar, so the three
    // read as one funnel: eligible, registered, voted.
    const registeredRows = rows.filter((r) => r.registered !== undefined);
    const regBars = root
      .select<SVGGElement>("g.pb-registered")
      .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-registered")
      .data(registeredRows, (d) => d.key);
    regBars.exit().remove();
    const regClass = (d: PopulationBarRow) => `pb-registered${d.ratesPooled ? " pb-pooled" : ""}`;
    const regMerged = regBars
      .enter()
      .append("rect")
      .attr("class", regClass)
      .attr("x", (d) => xOf(d))
      .attr("width", xScale.bandwidth())
      .attr("y", innerH)
      .attr("height", 0)
      .merge(regBars as any)
      .attr("class", regClass)
      .style("opacity", (d: PopulationBarRow) => registeredOpacity * (d.opacity ?? 1));
    anim(regMerged)
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
      opacity: number
    ) => {
      const data = rows.filter((d) => {
        const b = bottom(d), t = top(d);
        return b !== undefined && t !== undefined && b < t;
      });
      const gapClass = (d: PopulationBarRow) => `pb-gap${d.ratesPooled ? " pb-pooled" : ""}`;
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
    drawGapLayer("pb-gaps", (d) => d.votes, (d) => d.expected, showGap ? 1 : 0);
    drawGapLayer(
      "pb-gaps-reg",
      (d) => d.registered,
      (d) => (registrationStandard ? d.expectedRegistered : undefined),
      registrationStandard?.gap ?? 0
    );
    drawGapLayer(
      "pb-gaps-showup",
      (d) => d.votes,
      (d) => (showUpStandard ? d.expectedFromRegistered : undefined),
      showUpStandard?.gap ?? 0
    );

    // The two hurdle standards' dotted lines - same style as the expected
    // line, age variant only.
    const drawStandardLine = (cls: string, value: (d: PopulationBarRow) => number | undefined, opacity: number) => {
      const path = root.select<SVGPathElement>(`path.${cls}`);
      const lineRows = rows.filter((d) => value(d) !== undefined);
      if (xKind !== "age" || !lineRows.length) {
        path.style("opacity", 0).attr("d", null);
        return;
      }
      const gen = d3line<PopulationBarRow>()
        .x((d) => xOf(d) + xScale.bandwidth() / 2)
        .y((d) => yScale(value(d)!))
        .curve(curveLinear);
      anim(path.datum(lineRows).style("opacity", opacity)).attr("d", gen);
    };
    drawStandardLine("pb-line-reg", (d) => d.expectedRegistered, registrationStandard?.line ?? 0);
    drawStandardLine("pb-line-showup", (d) => d.expectedFromRegistered, showUpStandard?.line ?? 0);

    // Expected-turnout marker. Age variant: one dotted path through every
    // bar's expected value - since cvap varies smoothly by age, this
    // traces a scaled silhouette of the population curve itself.
    // Category variant: categories aren't ordered, so a connecting line
    // would imply a false adjacency - draw a short dashed tick per bar
    // instead (a bullet-chart target marker).
    const expectedLine = root.select<SVGPathElement>("path.pb-expected-line:not(.pb-line-reg):not(.pb-line-showup)");
    const expectedTicks = root.select<SVGGElement>("g.pb-expected-ticks");
    if (xKind === "age") {
      expectedTicks.selectAll("*").remove();
      const lineGen = d3line<PopulationBarRow>()
        .x((d) => xOf(d) + xScale.bandwidth() / 2)
        .y((d) => yScale(d.expected))
        .curve(curveLinear);
      anim(expectedLine.datum(rows).style("opacity", showExpected ? 1 : 0)).attr("d", lineGen);
    } else {
      expectedLine.style("opacity", 0);
      const ticks = expectedTicks.selectAll<SVGLineElement, PopulationBarRow>("line.pb-expected-tick").data(rows, (d) => d.key);
      ticks.exit().remove();
      const ticksMerged = ticks
        .enter()
        .append("line")
        .attr("class", "pb-expected-tick")
        .merge(ticks as any)
        .style("opacity", showExpected ? 1 : 0);
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
  }, [
    rows,
    xKind,
    width,
    height,
    showTrack,
    showVotes,
    showExpected,
    showGap,
    registeredOpacity,
    registrationStandard?.line,
    registrationStandard?.gap,
    showUpStandard?.line,
    showUpStandard?.gap,
    shortRows,
    yDomainProp,
    directLabelMissing,
    tooltipFor,
    yLabel,
    transitionMs,
  ]);

  // One dotted entry and one gold entry, shared by whichever standard is
  // active (the caller relabels them), so the legend never reflows.
  const lineLegendOn = showExpected || (registrationStandard?.line ?? 0) > 0.5 || (showUpStandard?.line ?? 0) > 0.5;
  const gapLegendOn = showGap || (registrationStandard?.gap ?? 0) > 0.5 || (showUpStandard?.gap ?? 0) > 0.5;
  const hasRegistered = rows.some((r) => r.registered !== undefined);

  return (
    <div ref={wrapRef} className="voa-chart-surface pb-surface">
      <div className="voa-legend">
        <span className="pb-legend-entry">
          <span className="voa-legend-swatch pb-legend-track" /> Eligible citizens
        </span>
        <span
          className="pb-legend-entry"
          style={{ marginLeft: "0.9rem", opacity: showVotes ? 1 : 0 }}
          aria-hidden={!showVotes || undefined}
        >
          <span className="voa-legend-swatch pb-legend-votes" /> Votes cast
        </span>
        {/* After votes, not between eligible and votes: it drops out again at
            the total step, and a hole at the end of the row goes unnoticed. */}
        {hasRegistered && (
          <span
            className="pb-legend-entry"
            style={{ marginLeft: "0.9rem", opacity: registeredOpacity > 0.5 ? 1 : 0 }}
            aria-hidden={registeredOpacity <= 0.5 || undefined}
          >
            <span className="voa-legend-swatch pb-legend-registered" /> Registered
          </span>
        )}
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
        <span
          className="pb-legend-entry"
          style={{ marginLeft: "0.9rem", opacity: gapLegendOn ? 1 : 0 }}
          aria-hidden={!gapLegendOn || undefined}
        >
          <span className="voa-legend-swatch pb-legend-gap" /> {gapLegendLabel}
        </span>
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
          <span className="pb-gap-marker" aria-hidden="true" />
          <div className="pb-gap-hero">
            <div className="pb-gap-hero-figure">{heroGap.figure}</div>
            <div className="pb-gap-hero-label">{heroGap.label}</div>
            {/* Always mounted so its arrival can't nudge the figure/label
                above it - only opacity fades in near the end of the morph. */}
            <div
              className="pb-gap-hero-delta"
              style={{ opacity: heroGap.deltaOpacity }}
              aria-hidden={heroGap.deltaOpacity < 0.01 || undefined}
            >
              {heroGap.delta}
            </div>
          </div>
        </div>
      )}
      {(() => {
        if (!hover || !tooltipFor) return null;
        const content = tooltipFor(hover.row);
        return content ? <Tooltip content={content} clientX={hover.clientX} clientY={hover.clientY} /> : null;
      })()}
    </div>
  );
}
