import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
   * `deltaOpacity` fades the third line in without ever unmounting it, so
   * its arrival reserves space from first paint and can't nudge anything
   * else. */
  heroGap?: { figure: string; label: string; delta: string; deltaOpacity: number };
  /** Extra content layered over the plot's top-right corner (e.g. a
   * scroll-position year stamp) - absolutely positioned, doesn't affect
   * layout. */
  plotOverlay?: ReactNode;
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
  yDomain: yDomainProp,
  directLabelMissing = false,
  heroGap,
  plotOverlay,
  transitionMs = 700,
  tooltipFor,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<{ row: PopulationBarRow; clientX: number; clientY: number } | null>(null);
  const shortRows = useMemo(() => rows.filter((r) => r.missing < 0), [rows]);

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

    const yDomain: [number, number] =
      yDomainProp ?? [0, Math.max(1, ...rows.map((r) => r.cvap)) * 1.08];
    const yScale = scaleLinear().domain(yDomain).range([innerH, 0]);

    let root = svg.select<SVGGElement>("g.pb-root");
    if (root.empty()) {
      root = svg.append("g").attr("class", "pb-root");
      root.append("g").attr("class", "voa-axis pb-axis-x");
      root.append("g").attr("class", "voa-axis pb-axis-y");
      root.append("text").attr("class", "voa-axis-label pb-axis-label-y").attr("text-anchor", "middle");
      root.append("g").attr("class", "pb-tracks");
      root.append("g").attr("class", "pb-votes");
      root.append("g").attr("class", "pb-gaps");
      root.append("path").attr("class", "pb-expected-line");
      root.append("g").attr("class", "pb-expected-ticks");
      root.append("g").attr("class", "pb-missing-labels");
      root.append("g").attr("class", "pb-hits");
    }
    root.attr("transform", `translate(${margin.left},${margin.top})`);

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
      .attr("x", (d) => xScale(d.key) ?? 0)
      .attr("width", xScale.bandwidth())
      .attr("y", innerH)
      .attr("height", 0)
      .merge(tracks as any)
      .attr("class", (d) => `pb-track${d.ratesPooled ? " pb-pooled" : ""}`)
      .style("opacity", showTrack ? 1 : 0);
    anim(tracksMerged)
      .attr("x", (d: PopulationBarRow) => xScale(d.key) ?? 0)
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.cvap))
      .attr("height", (d: PopulationBarRow) => innerH - yScale(d.cvap));

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
      .attr("x", (d) => xScale(d.key) ?? 0)
      .attr("width", xScale.bandwidth())
      .attr("y", innerH)
      .attr("height", 0)
      .merge(votes as any)
      .attr("class", votesClass)
      .style("opacity", showVotes ? 1 : 0);
    anim(votesMerged)
      .attr("x", (d: PopulationBarRow) => xScale(d.key) ?? 0)
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.votes))
      .attr("height", (d: PopulationBarRow) => innerH - yScale(d.votes));

    // Gold shortfall blocks - one per under-voting bar, sitting on top of
    // the votes bar and capped by the dotted line. Across the age chart
    // they merge into one wedge, so the gap reads as a single shape
    // rather than 25 separate pieces. Bars over the line get nothing.
    const gapClass = (d: PopulationBarRow) => `pb-gap${d.ratesPooled ? " pb-pooled" : ""}`;
    const gaps = root
      .select<SVGGElement>("g.pb-gaps")
      .selectAll<SVGRectElement, PopulationBarRow>("rect.pb-gap")
      .data(shortRows, (d) => d.key);
    gaps.exit().remove();
    const gapsMerged = gaps
      .enter()
      .append("rect")
      .attr("class", gapClass)
      .attr("x", (d) => xScale(d.key) ?? 0)
      .attr("width", xScale.bandwidth())
      .attr("y", (d) => (tr ? yScale(d.votes) : yScale(d.expected)))
      .attr("height", (d) => (tr ? 0 : yScale(d.votes) - yScale(d.expected)))
      .merge(gaps as any)
      .attr("class", gapClass)
      .style("opacity", showGap ? 1 : 0);
    anim(gapsMerged)
      .attr("x", (d: PopulationBarRow) => xScale(d.key) ?? 0)
      .attr("width", xScale.bandwidth())
      .attr("y", (d: PopulationBarRow) => yScale(d.expected))
      .attr("height", (d: PopulationBarRow) => yScale(d.votes) - yScale(d.expected));

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
        .x((d) => (xScale(d.key) ?? 0) + xScale.bandwidth() / 2)
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
      .attr("x", (d) => xScale(d.key) ?? 0)
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
    shortRows,
    yDomainProp,
    directLabelMissing,
    tooltipFor,
    yLabel,
    transitionMs,
  ]);

  return (
    <div ref={wrapRef} className="voa-chart-surface pb-surface">
      <div className="voa-legend">
        <span className="pb-legend-entry">
          <span className="voa-legend-swatch pb-legend-track" /> Eligible citizens
        </span>
        <span className="pb-legend-entry" style={{ marginLeft: "0.9rem" }}>
          <span className="voa-legend-swatch pb-legend-votes" /> Votes cast
        </span>
        <span
          className="pb-legend-expected"
          style={{ marginLeft: "0.9rem", opacity: showExpected ? 1 : 0 }}
          aria-hidden={!showExpected || undefined}
        >
          <svg width="18" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="18" y2="5" className="pb-expected-line pb-legend-line" />
          </svg>{" "}
          {expectedLineLabel}
        </span>
        <span
          className="pb-legend-entry"
          style={{ marginLeft: "0.9rem", opacity: showGap ? 1 : 0 }}
          aria-hidden={!showGap || undefined}
        >
          <span className="voa-legend-swatch pb-legend-gap" /> Votes short of it
        </span>
      </div>
      <div className="pb-plot-wrap">
        <svg ref={svgRef} role="img" aria-label={xLabel} />
        {plotOverlay}
      </div>
      <div className="voa-axis-label-x">{xLabel}</div>
      {showGap && heroGap && (
        <div className="pb-gap-summary pb-gap-summary--hero">
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
      {hover && tooltipFor && <Tooltip content={tooltipFor(hover.row)} clientX={hover.clientX} clientY={hover.clientY} />}
    </div>
  );
}
