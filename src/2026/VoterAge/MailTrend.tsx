import { useEffect, useRef, useState } from "react";
import { select, scaleLinear, scalePoint, line as d3line, axisLeft, curveMonotoneX } from "d3";

export interface TrendSeries {
  key: string;
  label: string;
  color: string; // CSS var, e.g. "var(--series-1)"
  values: { year: number; gap: number }[];
}

interface Props {
  series: TrendSeries[];
  visibleKeys: Set<string>;
  years: number[];
}

const MARGIN = { top: 16, right: 108, bottom: 30, left: 44 };
const LABEL_MIN_GAP = 14; // px, minimum vertical spacing between end-of-line labels

export default function MailTrend({ series, visibleKeys, years }: Props) {
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

  const height = Math.max(280, Math.min(width * 0.62, 380));

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const x = scalePoint<number>().domain(years).range([0, innerW]).padding(0.5);
    const allGaps = series.flatMap((s) => s.values.map((v) => v.gap));
    const yMin = Math.min(...allGaps, 0);
    const yMax = Math.max(...allGaps, 0);
    const pad = (yMax - yMin) * 0.15 || 1;
    const y = scaleLinear().domain([yMin - pad, yMax + pad]).range([innerH, 0]);

    let root = svg.select<SVGGElement>("g.voa-trend-root");
    if (root.empty()) {
      root = svg.append("g").attr("class", "voa-trend-root");
      root.append("g").attr("class", "voa-axis voa-axis-y");
      root.append("g").attr("class", "voa-axis voa-axis-x");
      root.append("line").attr("class", "voa-zero-line");
      root.append("g").attr("class", "voa-lines");
    }
    root.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const t = svg.transition().duration(500);

    root
      .select<SVGGElement>("g.voa-axis-y")
      .transition(t as any)
      .call(axisLeft(y).ticks(5).tickFormat((d) => `${d}pp`) as any);

    root
      .select<SVGGElement>("g.voa-axis-x")
      .attr("transform", `translate(0,${innerH})`)
      .selectAll("text")
      .data(years)
      .join("text")
      .attr("class", "voa-axis-label")
      .attr("text-anchor", "middle")
      .attr("x", (d) => x(d) ?? 0)
      .attr("y", 20)
      .text((d) => String(d));

    root
      .select("line.voa-zero-line")
      .attr("class", "voa-diagonal voa-zero-line")
      .attr("x1", 0)
      .attr("x2", innerW)
      .attr("y1", y(0))
      .attr("y2", y(0));

    const lineGen = d3line<{ year: number; gap: number }>()
      .x((d) => x(d.year) ?? 0)
      .y((d) => y(d.gap))
      .curve(curveMonotoneX);

    const linesLayer = root.select<SVGGElement>("g.voa-lines");
    const visible = series.filter((s) => visibleKeys.has(s.key));

    const paths = linesLayer
      .selectAll<SVGPathElement, TrendSeries>("path.voa-trend-line")
      .data(visible, (d) => d.key);
    paths.exit().remove();
    paths
      .enter()
      .append("path")
      .attr("class", "voa-trend-line")
      .merge(paths)
      .attr("stroke", (d) => d.color)
      .transition(t as any)
      .attr("d", (d) => lineGen(d.values));

    const dotGroups = linesLayer
      .selectAll<SVGGElement, TrendSeries>("g.voa-trend-dots")
      .data(visible, (d) => d.key);
    dotGroups.exit().remove();
    const dotEnter = dotGroups.enter().append("g").attr("class", "voa-trend-dots");
    const dotMerged = dotEnter.merge(dotGroups);

    dotMerged.each(function (s) {
      const g = select(this);
      const dots = g.selectAll<SVGCircleElement, { year: number; gap: number }>("circle").data(s.values);
      dots
        .enter()
        .append("circle")
        .attr("class", "voa-trend-dot")
        .merge(dots)
        .attr("fill", s.color)
        .transition(t as any)
        .attr("cx", (d) => x(d.year) ?? 0)
        .attr("cy", (d) => y(d.gap))
        .attr("r", 4);
    });

    // Direct labels at the last visible point of each series. When two
    // series end close together (e.g. never-mail/NJ/Montana all land
    // within a couple pp of each other by 2024), their natural y positions
    // collide - separate them with a minimum vertical gap rather than
    // letting the text overlap.
    const naturalY = new Map(visible.map((d) => [d.key, y(d.values[d.values.length - 1].gap)]));
    const order = [...visible].sort((a, b) => naturalY.get(a.key)! - naturalY.get(b.key)!);
    const labelY = new Map<string, number>();
    let prevY = -Infinity;
    for (const d of order) {
      const target = naturalY.get(d.key)!;
      const placed = Math.max(target, prevY + LABEL_MIN_GAP);
      labelY.set(d.key, placed);
      prevY = placed;
    }

    const labels = linesLayer
      .selectAll<SVGTextElement, TrendSeries>("text.voa-trend-label")
      .data(visible, (d) => d.key);
    labels.exit().remove();
    labels
      .enter()
      .append("text")
      .attr("class", "voa-trend-label")
      .merge(labels)
      .attr("fill", (d) => d.color)
      .transition(t as any)
      .attr("x", (d) => (x(d.values[d.values.length - 1].year) ?? 0) + 8)
      .attr("y", (d) => (labelY.get(d.key) ?? 0) + 4)
      .text((d) => d.label);
  }, [series, visibleKeys, width, height, years]);

  return (
    <div className="voa-chart-surface" ref={wrapRef}>
      <svg ref={svgRef} width="100%" style={{ display: "block" }} />
    </div>
  );
}
