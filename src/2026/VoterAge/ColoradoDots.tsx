import { useEffect, useRef, useState } from "react";
import { select, scaleLinear, scaleBand, axisBottom, axisLeft, easeCubicOut } from "d3";
import Tooltip from "./Tooltip";

export interface DotRow {
  group: string;
  effectPp: number;
  sePp: number;
}

interface Props {
  rows: DotRow[];
  overallEffectPp: number;
  emphasizeGroup?: string; // bolds one dot in the series color, e.g. the largest effect
}

const MARGIN = { top: 10, right: 46, bottom: 30, left: 118 };

export default function ColoradoDots({ rows, overallEffectPp, emphasizeGroup }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(520);
  const [hover, setHover] = useState<{ row: DotRow; clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.min(w, 640));
    });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  const height = Math.max(36 * rows.length + MARGIN.top + MARGIN.bottom, 140);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    const innerW = width - MARGIN.left - MARGIN.right;
    const innerH = height - MARGIN.top - MARGIN.bottom;
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const xMax = Math.max(...rows.map((r) => r.effectPp + r.sePp), overallEffectPp) * 1.15;
    const xScale = scaleLinear().domain([0, xMax]).range([0, innerW]);
    const yScale = scaleBand<string>()
      .domain(rows.map((r) => r.group))
      .range([0, innerH])
      .padding(0.35);

    let root = svg.select<SVGGElement>("g.cd-root");
    if (root.empty()) {
      root = svg.append("g").attr("class", "cd-root");
      root.append("g").attr("class", "voa-axis cd-axis-x");
      root.append("g").attr("class", "voa-axis cd-axis-y");
      root.append("line").attr("class", "cd-axis-zero");
      root.append("line").attr("class", "cd-overall-line");
      root.append("text").attr("class", "cd-overall-label");
      root.append("g").attr("class", "cd-stems");
      root.append("g").attr("class", "cd-errs");
      root.append("g").attr("class", "cd-dots-layer");
      root.append("g").attr("class", "cd-values");
      root.append("g").attr("class", "cd-hits");
    }
    root.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const t = svg.transition().duration(600).ease(easeCubicOut);

    root.select<SVGGElement>("g.cd-axis-x").attr("transform", `translate(0,${innerH})`).transition(t as any).call(axisBottom(xScale).ticks(4).tickFormat((d) => `+${d}pp`) as any);
    root.select<SVGGElement>("g.cd-axis-y").transition(t as any).call(axisLeft(yScale).tickSize(0) as any);
    root.select("g.cd-axis-y").select(".domain").remove();

    root
      .select("line.cd-axis-zero")
      .attr("x1", xScale(0))
      .attr("x2", xScale(0))
      .attr("y1", 0)
      .attr("y2", innerH);

    root
      .select<SVGLineElement>("line.cd-overall-line")
      .transition(t as any)
      .attr("x1", xScale(overallEffectPp))
      .attr("x2", xScale(overallEffectPp))
      .attr("y1", -2)
      .attr("y2", innerH + 2);

    root
      .select<SVGTextElement>("text.cd-overall-label")
      .attr("text-anchor", "middle")
      .transition(t as any)
      .attr("x", xScale(overallEffectPp))
      .attr("y", -2);

    const stems = root.select<SVGGElement>("g.cd-stems").selectAll<SVGLineElement, DotRow>("line.cd-stem").data(rows, (d) => d.group);
    stems.exit().remove();
    stems
      .enter()
      .append("line")
      .attr("class", "cd-stem")
      .merge(stems as any)
      .transition(t as any)
      .attr("x1", xScale(0))
      .attr("x2", (d) => xScale(d.effectPp))
      .attr("y1", (d) => (yScale(d.group) ?? 0) + yScale.bandwidth() / 2)
      .attr("y2", (d) => (yScale(d.group) ?? 0) + yScale.bandwidth() / 2);

    const errs = root.select<SVGGElement>("g.cd-errs").selectAll<SVGLineElement, DotRow>("line.cd-err").data(rows, (d) => d.group);
    errs.exit().remove();
    errs
      .enter()
      .append("line")
      .attr("class", "cd-err")
      .merge(errs as any)
      .transition(t as any)
      .attr("x1", (d) => xScale(d.effectPp - d.sePp))
      .attr("x2", (d) => xScale(d.effectPp + d.sePp))
      .attr("y1", (d) => (yScale(d.group) ?? 0) + yScale.bandwidth() / 2)
      .attr("y2", (d) => (yScale(d.group) ?? 0) + yScale.bandwidth() / 2);

    const dots = root.select<SVGGElement>("g.cd-dots-layer").selectAll<SVGCircleElement, DotRow>("circle.cd-dot").data(rows, (d) => d.group);
    dots.exit().remove();
    dots
      .enter()
      .append("circle")
      .attr("class", (d) => `cd-dot${d.group === emphasizeGroup ? " cd-dot-emph" : ""}`)
      .attr("r", 5.5)
      .merge(dots as any)
      .attr("class", (d) => `cd-dot${d.group === emphasizeGroup ? " cd-dot-emph" : ""}`)
      .transition(t as any)
      .attr("cx", (d) => xScale(d.effectPp))
      .attr("cy", (d) => (yScale(d.group) ?? 0) + yScale.bandwidth() / 2);

    const values = root.select<SVGGElement>("g.cd-values").selectAll<SVGTextElement, DotRow>("text.cd-value").data(rows, (d) => d.group);
    values.exit().remove();
    values
      .enter()
      .append("text")
      .attr("class", "cd-value")
      .attr("dominant-baseline", "middle")
      .merge(values as any)
      .transition(t as any)
      .attr("x", (d) => xScale(d.effectPp + d.sePp) + 8)
      .attr("y", (d) => (yScale(d.group) ?? 0) + yScale.bandwidth() / 2)
      .text((d) => `+${d.effectPp.toFixed(1)}pp`);

    // Full-row hit targets - hover works across the whole row, not just the small dot.
    const hits = root.select<SVGGElement>("g.cd-hits").selectAll<SVGRectElement, DotRow>("rect.cd-hit").data(rows, (d) => d.group);
    hits.exit().remove();
    hits
      .enter()
      .append("rect")
      .attr("class", "cd-hit")
      .merge(hits as any)
      .attr("x", 0)
      .attr("width", innerW)
      .attr("y", (d) => yScale(d.group) ?? 0)
      .attr("height", yScale.bandwidth())
      .on("mouseenter touchstart", function (event: any, d: DotRow) {
        const p = event.touches ? event.touches[0] : event;
        setHover({ row: d, clientX: p.clientX, clientY: p.clientY });
      })
      .on("mousemove", function (event: any, d: DotRow) {
        setHover({ row: d, clientX: event.clientX, clientY: event.clientY });
      })
      .on("mouseleave touchend", function () {
        setHover(null);
      });
  }, [rows, overallEffectPp, emphasizeGroup, width, height]);

  return (
    <div ref={wrapRef} className="voa-chart-surface">
      <svg ref={svgRef} role="img" aria-label="Colorado all-mail voting effect by group" />
      {hover && (
        <Tooltip
          content={
            <>
              <div className="voa-tooltip__head">{hover.row.group}</div>
              +{hover.row.effectPp.toFixed(2)}pp turnout (±{hover.row.sePp.toFixed(2)}pp standard error)
              <div className="voa-tooltip__note">
                vs. overall +{overallEffectPp.toFixed(2)}pp
              </div>
            </>
          }
          clientX={hover.clientX}
          clientY={hover.clientY}
        />
      )}
    </div>
  );
}
