import { useEffect, useRef, useState } from "react";
import { select, scaleLinear, axisBottom, axisLeft, easeCubicOut } from "d3";
import { seqBucketClass } from "./colorScales";

export interface ScatterPoint {
  key: string;
  x: number; // share of eligible citizens, %
  y: number; // share of votes cast, %
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

interface Props {
  points: ScatterPoint[];
  annotation?: ScatterAnnotation | null;
  xLabel?: string;
  yLabel?: string;
  defaultRadius?: number;
  /** Domain is computed from the data by default; pass a fixed one to keep
   * the axes stable across a mode change (e.g. bins -> single years) so
   * the transition reads as points splitting apart, not the whole plot
   * rescaling under them. */
  fixedDomain?: [number, number];
}

const MARGIN = { top: 16, right: 20, bottom: 40, left: 48 };

export default function AgeScatter({
  points,
  annotation,
  xLabel = "Share of eligible citizens",
  yLabel = "Share of votes cast",
  defaultRadius = 7,
  fixedDomain,
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

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    // Shared domain for both axes so the diagonal always means true
    // proportionality - independently padded x/y domains would let the
    // "45-degree line" silently lie about what's proportional.
    let domain: [number, number];
    if (fixedDomain) {
      domain = fixedDomain;
    } else if (points.length === 0) {
      domain = [0, 35]; // sensible default for an empty/intro frame (roughly the bins-mode range)
    } else {
      const values = points.flatMap((p) => [p.x, p.y]);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const pad = (hi - lo) * 0.15 || hi * 0.15 || 1;
      domain = [Math.max(0, lo - pad), hi + pad];
    }

    const scale = scaleLinear().domain(domain).range([0, innerW]);
    const scaleY = scaleLinear().domain(domain).range([innerH, 0]);

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
      root.append("g").attr("class", "voa-dots");
      root.append("g").attr("class", "voa-annotation-layer");
    }
    root.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const t = svg.transition().duration(700).ease(easeCubicOut);

    root
      .select<SVGGElement>("g.voa-axis-x")
      .attr("transform", `translate(0,${innerH})`)
      .transition(t as any)
      .call(axisBottom(scale).ticks(5).tickFormat((d) => `${d}%`) as any);

    root
      .select<SVGGElement>("g.voa-axis-y")
      .transition(t as any)
      .call(axisLeft(scaleY).ticks(5).tickFormat((d) => `${d}%`) as any);

    root
      .select("line.voa-diagonal")
      .transition(t as any)
      .attr("x1", scale(domain[0]))
      .attr("y1", scaleY(domain[0]))
      .attr("x2", scale(domain[1]))
      .attr("y2", scaleY(domain[1]));

    root
      .select("text.voa-axis-label-x")
      .attr("x", innerW / 2)
      .attr("y", innerH + 34)
      .text(xLabel);

    root
      .select("text.voa-axis-label-y")
      .attr(
        "transform",
        `translate(${-MARGIN.left + 14},${innerH / 2}) rotate(-90)`
      )
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
      .attr("cx", (d) => scale(d.x))
      .attr("cy", (d) => scaleY(d.y))
      .attr("r", 0);

    entered
      .merge(dots)
      .attr("class", (d) => `voa-dot ${d.colorClass ?? seqBucketClass(d.seqT)}`)
      .transition(t as any)
      .attr("cx", (d) => scale(d.x))
      .attr("cy", (d) => scaleY(d.y))
      .attr("r", (d) => d.r ?? defaultRadius);

    const annLayer = root.select<SVGGElement>("g.voa-annotation-layer");
    annLayer.selectAll("*").remove();
    if (annotation) {
      const ax = scale(annotation.x);
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
  }, [points, width, height, annotation, xLabel, yLabel, defaultRadius, fixedDomain]);

  return (
    <div className="voa-chart-surface" ref={wrapRef}>
      <svg ref={svgRef} width="100%" style={{ display: "block" }} />
    </div>
  );
}
