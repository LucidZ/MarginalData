import { useEffect, useRef, useState } from "react";
import { select, scaleLinear, axisBottom, axisLeft, easeCubicOut } from "d3";
import { seqBucketClass } from "./colorScales";

export interface ScatterPoint {
  key: string;
  x: number;
  y: number;
  seqT: number; // 0..1, position in the sequential color ramp (e.g. normalized age)
  r?: number; // marker radius override, px
  /** Overrides the seqT-derived bucket class - for categorical/emphasis
   * uses (e.g. beat 2's presidential-vs-midterm coloring) where the color
   * job isn't "magnitude" but "identity". */
  colorClass?: string;
}

export interface ScatterAnnotation {
  x: number;
  y: number;
  text: string;
  dx?: number;
  dy?: number;
}

/**
 * A vertical bracket from a point straight down/up to the diagonal
 * (proportional layout only, where the diagonal is y=x, so "the diagonal
 * value at this point's x" is just x itself) - visualizes the same
 * quantity the gap layout later promotes to the y-axis directly, so the
 * mode transform reads as "this distance becomes the new y-value".
 */
export interface GapBracket {
  x: number;
  y: number; // the point's y; diagonal reference is (x, x)
  label: string;
  labelSide?: "left" | "right";
}

interface Props {
  points: ScatterPoint[];
  annotation?: ScatterAnnotation | null;
  gapBrackets?: GapBracket[];
  xLabel?: string;
  yLabel?: string;
  defaultRadius?: number;
  /** Domain is computed from the data by default; pass a fixed one to keep
   * the axes stable across a mode change (e.g. bins -> single years) so
   * the transition reads as points splitting apart, not the whole plot
   * rescaling under them. Ignored if xDomain/yDomain are given. */
  fixedDomain?: [number, number];
  /** Independent x/y domains - use for the "gap" layout (age vs pp),
   * where the two axes are different units and must NOT share a scale.
   * When given, referenceLine defaults to "horizontal-zero". */
  xDomain?: [number, number];
  yDomain?: [number, number];
  referenceLine?: "diagonal" | "horizontal-zero" | "none";
  xTickFormat?: (d: number) => string;
  yTickFormat?: (d: number) => string;
}

const MARGIN = { top: 16, right: 20, bottom: 40, left: 58 };
const pct = (d: number) => `${d}%`;

export default function AgeScatter({
  points,
  annotation,
  gapBrackets,
  xLabel = "Share of eligible citizens",
  yLabel = "Share of votes cast",
  defaultRadius = 7,
  fixedDomain,
  xDomain: xDomainProp,
  yDomain: yDomainProp,
  referenceLine,
  xTickFormat = pct,
  yTickFormat = pct,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.min(w, 640));
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const height = Math.max(320, Math.min(width * 0.9, 520));
  const independent = !!(xDomainProp && yDomainProp);
  const refLine = referenceLine ?? (independent ? "horizontal-zero" : "diagonal");

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    let xDomain: [number, number];
    let yDomain: [number, number];
    if (independent) {
      xDomain = xDomainProp!;
      yDomain = yDomainProp!;
    } else if (fixedDomain) {
      xDomain = yDomain = fixedDomain;
    } else if (points.length === 0) {
      xDomain = yDomain = [0, 35]; // sensible default for an empty/intro frame
    } else {
      // Shared domain so the diagonal always means true proportionality -
      // independently padded x/y domains would let the "45-degree line"
      // silently lie about what's proportional.
      const values = points.flatMap((p) => [p.x, p.y]);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const pad = (hi - lo) * 0.15 || hi * 0.15 || 1;
      xDomain = yDomain = [Math.max(0, lo - pad), hi + pad];
    }

    const scaleX = scaleLinear().domain(xDomain).range([0, innerW]);
    const scaleY = scaleLinear().domain(yDomain).range([innerH, 0]);

    let root = svg.select<SVGGElement>("g.voa-scatter-root");
    if (root.empty()) {
      root = svg.append("g").attr("class", "voa-scatter-root");
      root.append("g").attr("class", "voa-axis voa-axis-x");
      root.append("g").attr("class", "voa-axis voa-axis-y");
      root.append("line").attr("class", "voa-diagonal");
      root.append("text").attr("class", "voa-axis-label voa-axis-label-x").attr("text-anchor", "middle");
      root
        .append("text")
        .attr("class", "voa-axis-label voa-axis-label-y")
        .attr("text-anchor", "middle");
      root.append("g").attr("class", "voa-brackets");
      root.append("g").attr("class", "voa-dots");
      root.append("g").attr("class", "voa-annotation-layer");
    }
    root.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const t = svg.transition().duration(800).ease(easeCubicOut);

    root
      .select<SVGGElement>("g.voa-axis-x")
      .attr("transform", `translate(0,${innerH})`)
      .transition(t as any)
      .call(axisBottom(scaleX).ticks(5).tickFormat(xTickFormat as any) as any);

    root
      .select<SVGGElement>("g.voa-axis-y")
      .transition(t as any)
      .call(axisLeft(scaleY).ticks(5).tickFormat(yTickFormat as any) as any);

    const line = root.select<SVGLineElement>("line.voa-diagonal");
    if (refLine === "none") {
      line.transition(t as any).style("opacity", 0);
    } else if (refLine === "horizontal-zero") {
      line
        .style("opacity", 1)
        .transition(t as any)
        .attr("x1", scaleX(xDomain[0]))
        .attr("y1", scaleY(0))
        .attr("x2", scaleX(xDomain[1]))
        .attr("y2", scaleY(0));
    } else {
      line
        .style("opacity", 1)
        .transition(t as any)
        .attr("x1", scaleX(xDomain[0]))
        .attr("y1", scaleY(xDomain[0]))
        .attr("x2", scaleX(xDomain[1]))
        .attr("y2", scaleY(xDomain[1]));
    }

    root
      .select("text.voa-axis-label-x")
      .attr("x", innerW / 2)
      .attr("y", innerH + 34)
      .text(xLabel);

    root
      .select("text.voa-axis-label-y")
      .attr("transform", `translate(${-MARGIN.left + 14},${innerH / 2}) rotate(-90)`)
      .text(yLabel);

    const dots = root
      .select<SVGGElement>("g.voa-dots")
      .selectAll<SVGCircleElement, ScatterPoint>("circle")
      .data(points, (d) => d.key);

    dots
      .exit()
      .transition(t as any)
      .attr("r", 0)
      .remove();

    const entered = dots
      .enter()
      .append("circle")
      .attr("class", (d) => `voa-dot ${d.colorClass ?? seqBucketClass(d.seqT)}`)
      .attr("cx", (d) => scaleX(d.x))
      .attr("cy", (d) => scaleY(d.y))
      .attr("r", 0);

    entered
      .merge(dots)
      .attr("class", (d) => `voa-dot ${d.colorClass ?? seqBucketClass(d.seqT)}`)
      .transition(t as any)
      .attr("cx", (d) => scaleX(d.x))
      .attr("cy", (d) => scaleY(d.y))
      .attr("r", (d) => d.r ?? defaultRadius);

    // Gap brackets: a vertical segment from the point down/up to the
    // diagonal (proportional layout: diagonal value at x is x itself),
    // with a label. Only meaningful pre-transform, so callers pass
    // gapBrackets=[] once the layout switches to "gap".
    const bracketLayer = root.select<SVGGElement>("g.voa-brackets");
    const brackets = bracketLayer
      .selectAll<SVGGElement, GapBracket>("g.voa-bracket")
      .data(gapBrackets ?? [], (d) => d.label);
    brackets.exit().remove();
    const bracketEnter = brackets.enter().append("g").attr("class", "voa-bracket");
    bracketEnter.append("line").attr("class", "voa-bracket-line");
    bracketEnter.append("text").attr("class", "voa-bracket-label");
    const bracketMerged = bracketEnter.merge(brackets);
    bracketMerged.each(function (d) {
      const g = select(this);
      const px = scaleX(d.x);
      const py = scaleY(d.y);
      const diagY = scaleY(d.x); // diagonal's y at this x, since diagonal is y=x
      const side = d.labelSide ?? (px > innerW / 2 ? "left" : "right");
      const labelX = side === "right" ? px + 10 : px - 10;
      g.select("line.voa-bracket-line")
        .transition(t as any)
        .attr("x1", px)
        .attr("y1", py)
        .attr("x2", px)
        .attr("y2", diagY);
      g.select("text.voa-bracket-label")
        .attr("text-anchor", side === "right" ? "start" : "end")
        .transition(t as any)
        .attr("x", labelX)
        .attr("y", (py + diagY) / 2)
        .text(d.label);
    });

    const annLayer = root.select<SVGGElement>("g.voa-annotation-layer");
    annLayer.selectAll("*").remove();
    if (annotation) {
      const ax = scaleX(annotation.x);
      const ay = scaleY(annotation.y);
      const dx = annotation.dx ?? 12;
      const dy = annotation.dy ?? -14;
      annLayer
        .append("line")
        .attr("class", "voa-annotation-line")
        .attr("x1", ax)
        .attr("y1", ay)
        .attr("x2", ax + dx)
        .attr("y2", ay + dy);
      annLayer
        .append("text")
        .attr("class", "voa-annotation")
        .attr("x", ax + dx + (dx >= 0 ? 4 : -4))
        .attr("y", ay + dy)
        .attr("text-anchor", dx >= 0 ? "start" : "end")
        .text(annotation.text);
    }
  }, [
    points,
    width,
    height,
    annotation,
    gapBrackets,
    xLabel,
    yLabel,
    defaultRadius,
    fixedDomain,
    xDomainProp,
    yDomainProp,
    independent,
    refLine,
    xTickFormat,
    yTickFormat,
  ]);

  return (
    <div className="voa-chart-surface" ref={wrapRef}>
      <svg ref={svgRef} width="100%" style={{ display: "block" }} />
    </div>
  );
}
