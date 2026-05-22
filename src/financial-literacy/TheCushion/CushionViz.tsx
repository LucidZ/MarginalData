import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ALEX_YEAR, MonthData, SHED_THRESHOLD } from './data';

interface Props {
  revealedMonths: number;
  showThreshold: boolean;
}

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 540;
const VH = 360;
const M = { top: 28, right: 20, bottom: 40, left: 68 };
const IW = VW - M.left - M.right; // 452
const IH = VH - M.top - M.bottom; // 292

// ── Scales (static — data never changes) ─────────────────────────────────────
const xScale = d3.scaleBand()
  .domain(ALEX_YEAR.map(d => d.month))
  .range([0, IW])
  .paddingInner(0.18);

const yScale = d3.scaleLinear()
  .domain([-250, 1300])
  .range([IH, 0]);

const lineGen = d3.line<MonthData>()
  .x(d => xScale(d.month)! + xScale.bandwidth() / 2)
  .y(d => yScale(d.buffer));

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN = '#2d6a4f';
const RED = '#ae2012';
const THRESHOLD_COLOR = '#c77d2a';

const fmtBuffer = (v: number) =>
  (v < 0 ? '−$' : '+$') + Math.abs(v).toLocaleString();

export default function CushionViz({ revealedMonths, showThreshold }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Initialize SVG skeleton (once) ───────────────────────────────────────
  useEffect(() => {
    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${VW} ${VH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('class', 'root')
      .attr('transform', `translate(${M.left},${M.top})`);

    // x-axis — all 12 months always visible for temporal orientation
    g.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${IH})`)
      .call(
        d3.axisBottom(xScale)
          .tickSize(0)
          .tickPadding(8)
      )
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('text')
        .style('font-size', '11px')
        .style('fill', '#999'));

    // y-axis — horizontal grid lines, clean labels
    g.append('g')
      .attr('class', 'y-axis')
      .call(
        d3.axisLeft(yScale)
          .tickValues([0, 500, 1000])
          .tickFormat(v => `$${(v as number).toLocaleString()}`)
          .tickSize(-IW)
      )
      .call(ax => ax.select('.domain').remove())
      .call(ax => ax.selectAll('.tick line')
        .attr('stroke', '#f0f0f0')
        .attr('stroke-dasharray', '3,2'))
      .call(ax => ax.selectAll('text')
        .style('font-size', '11px')
        .style('fill', '#999'));

    // zero line — dashed reference
    g.append('line').attr('class', 'zero-line')
      .attr('x1', 0).attr('x2', IW)
      .attr('y1', yScale(0)).attr('y2', yScale(0))
      .attr('stroke', '#ccc')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '5,3');

    // threshold line (hidden until revealed)
    g.append('line').attr('class', 'threshold-line')
      .attr('x1', 0).attr('x2', IW)
      .attr('y1', yScale(SHED_THRESHOLD)).attr('y2', yScale(SHED_THRESHOLD))
      .attr('stroke', THRESHOLD_COLOR)
      .attr('stroke-width', 1.5)
      .attr('opacity', 0);

    // threshold label
    g.append('text').attr('class', 'threshold-label')
      .attr('x', IW)
      .attr('y', yScale(SHED_THRESHOLD) - 5)
      .attr('text-anchor', 'end')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', THRESHOLD_COLOR)
      .attr('letter-spacing', '0.02em')
      .attr('opacity', 0)
      .text('$400 — emergency threshold');

    // line path (starts empty, grows with data)
    g.append('path').attr('class', 'line-path')
      .attr('fill', 'none')
      .attr('stroke', '#d0d0d0')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'round');

    // dots group (past months)
    g.append('g').attr('class', 'dots-group');

    // current month bar
    g.append('rect').attr('class', 'current-bar')
      .attr('x', 0).attr('y', IH)
      .attr('width', 0).attr('height', 0)
      .attr('rx', 2);

    // current month buffer label (above/below bar)
    g.append('text').attr('class', 'bar-label')
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '700');

  }, []);

  // ── Update on each step ───────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || revealedMonths === 0) return;
    const g = d3.select(svgRef.current).select<SVGGElement>('g.root');

    const revealed = ALEX_YEAR.slice(0, revealedMonths);
    const current = revealed[revealed.length - 1];
    const past = revealed.slice(0, -1);

    const bw = xScale.bandwidth();
    const isNeg = current.buffer < 0;
    const barColor = isNeg ? RED : GREEN;
    const bx = xScale(current.month)!;
    const by = isNeg ? yScale(0) : yScale(current.buffer);
    const bh = Math.abs(yScale(current.buffer) - yScale(0));

    // ── Bar ──
    g.select('.current-bar')
      .interrupt()
      .transition().duration(600).ease(d3.easeCubicInOut)
      .attr('x', bx)
      .attr('y', by)
      .attr('width', bw)
      .attr('height', bh)
      .attr('fill', barColor)
      .attr('opacity', 0.85);

    // ── Bar label ──
    const labelY = isNeg
      ? yScale(current.buffer) + 14
      : yScale(current.buffer) - 6;

    g.select('.bar-label')
      .interrupt()
      .transition().duration(600).ease(d3.easeCubicInOut)
      .attr('x', bx + bw / 2)
      .attr('y', labelY)
      .attr('fill', barColor)
      .attr('opacity', 1)
      .text(fmtBuffer(current.buffer));

    // ── Past dots (enter only — dots never move once placed) ──
    g.select('.dots-group')
      .selectAll<SVGCircleElement, MonthData>('circle')
      .data(past, d => d.month)
      .enter()
      .append('circle')
      .attr('cx', d => xScale(d.month)! + bw / 2)
      .attr('cy', yScale(0))
      .attr('r', 4)
      .attr('fill', d => d.buffer >= 0 ? GREEN : RED)
      .attr('stroke', 'white')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0)
      .transition().duration(500).ease(d3.easeCubicInOut)
      .attr('cy', d => yScale(d.buffer))
      .attr('opacity', 1);

    // ── Line (connects all revealed months) ──
    if (revealed.length >= 2) {
      g.select<SVGPathElement>('.line-path')
        .datum(revealed)
        .interrupt()
        .transition().duration(600).ease(d3.easeCubicInOut)
        .attr('d', lineGen);
    }

    // ── Threshold ──
    g.select('.threshold-line')
      .interrupt()
      .transition().duration(500)
      .attr('opacity', showThreshold ? 1 : 0);

    g.select('.threshold-label')
      .interrupt()
      .transition().duration(500)
      .attr('opacity', showThreshold ? 1 : 0);

  }, [revealedMonths, showThreshold]);

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%' }}
      aria-label="Alex's cumulative savings buffer over twelve months"
    />
  );
}
