import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { CATEGORIES, DECILE_LABELS, INCOME, TOTAL_SPENDING, SPENDING } from './data';

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 720, VH = 420;
const ML = 64, MR = 20, MT = 16, MB = 56;
const W = VW - ML - MR, H = VH - MT - MB;

const T = 600;
const ease = d3.easeCubicInOut;

const fmt$k = (v: number) => `$${(v / 1000).toFixed(0)}K`;
const fmtFull = d3.format('$,.0f');
const fmtPct = d3.format('.1%');

// ── Precomputed stack data ────────────────────────────────────────────────────
const CAT_KEYS = CATEGORIES.map(c => c.key);
type RowDatum = { di: number } & Record<string, number>;

const STACK_INPUT: RowDatum[] = d3.range(10).map(di => {
  const row: RowDatum = { di };
  CAT_KEYS.forEach(k => { row[k] = SPENDING[k][di]; });
  return row;
});

const STACKED_ABS = d3.stack<RowDatum>()
  .keys(CAT_KEYS)
  .offset(d3.stackOffsetNone)(STACK_INPUT);

const STACKED_SHARE = d3.stack<RowDatum>()
  .keys(CAT_KEYS)
  .offset(d3.stackOffsetExpand)(STACK_INPUT);

const COLOR_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));

// ── Types ─────────────────────────────────────────────────────────────────────
export interface HoverInfo {
  di: number;
  catKey: string;
  svgX: number;
  svgY: number;
}

interface Props {
  mode: 'absolute' | 'share';
  highlightKey: string | null;
  onHover?: (info: HoverInfo | null) => void;
}

export default function DecileViz({ mode, highlightKey, onHover }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const root = svg.select<SVGGElement>('g.root');

    const stacked = mode === 'absolute' ? STACKED_ABS : STACKED_SHARE;

    // ── Scales ──────────────────────────────────────────────────────────────
    const x = d3.scaleBand()
      .domain(d3.range(10).map(String))
      .range([0, W])
      .padding(0.28);

    const yDomain: [number, number] = mode === 'absolute'
      ? [0, d3.max(TOTAL_SPENDING)! * 1.02]
      : [0, 1];
    const y = d3.scaleLinear().domain(yDomain).range([H, 0]).nice();

    const t = d3.transition<null>().duration(T).ease(ease);

    // ── Grid lines ───────────────────────────────────────────────────────────
    const grid = root.select<SVGGElement>('g.grid');
    grid.transition(t).call(
      d3.axisLeft(y)
        .ticks(5)
        .tickSize(-W)
        .tickFormat(() => '')
    );
    grid.selectAll('.domain').remove();
    grid.selectAll('.tick line').attr('stroke', '#ebebeb').attr('stroke-dasharray', '');

    // ── Stacked bars ─────────────────────────────────────────────────────────
    const barsGroup = root.select<SVGGElement>('g.bars');

    barsGroup.selectAll<SVGGElement, d3.Series<RowDatum, string>>('g.layer')
      .data(stacked, d => d.key)
      .join('g')
      .attr('class', 'layer')
      .each(function(series) {
        const color = COLOR_MAP[series.key];
        const isHighlighted = highlightKey === null || highlightKey === series.key;

        d3.select(this)
          .selectAll<SVGRectElement, d3.SeriesPoint<RowDatum>>('rect')
          .data(series, (_, i) => i.toString())
          .join(
            enter => enter.append('rect')
              .attr('x', (_, i) => x(i.toString())!)
              .attr('width', x.bandwidth())
              .attr('y', H)
              .attr('height', 0)
              .attr('fill', color)
              .attr('opacity', isHighlighted ? 1 : 0.1)
              .attr('rx', 1),
          )
          .on('mouseenter', function(event, d) {
            if (!svgRef.current || !onHoverRef.current) return;
            const box = svgRef.current.getBoundingClientRect();
            onHoverRef.current({
              di: d.data.di,
              catKey: series.key,
              svgX: event.clientX - box.left,
              svgY: event.clientY - box.top,
            });
          })
          .on('mouseleave', () => onHoverRef.current?.(null))
          .interrupt()
          .transition(t)
          .attr('x', (_, i) => x(i.toString())!)
          .attr('width', x.bandwidth())
          .attr('y', d => y(d[1]))
          .attr('height', d => Math.max(0, y(d[0]) - y(d[1])))
          .attr('fill', color)
          .attr('opacity', isHighlighted ? 1 : 0.1);
      });

    // ── X axis ───────────────────────────────────────────────────────────────
    const axesGroup = root.select<SVGGElement>('g.axes');

    axesGroup.select<SVGGElement>('g.x-axis')
      .attr('transform', `translate(0,${H})`)
      .call(
        d3.axisBottom(x)
          .tickFormat((_d, i) => DECILE_LABELS[i])
          .tickSize(0)
      )
      .call(g => {
        g.select('.domain').attr('stroke', '#ccc');
        g.selectAll('text').attr('dy', '1.3em').style('font-size', '12px').style('fill', '#444');
      });

    // Mean income sub-labels below X axis
    axesGroup.select<SVGGElement>('g.income-labels')
      .selectAll<SVGTextElement, number>('text')
      .data(INCOME)
      .join('text')
      .attr('x', (_, i) => x(i.toString())! + x.bandwidth() / 2)
      .attr('y', H + 42)
      .attr('text-anchor', 'middle')
      .style('font-size', '9.5px')
      .style('fill', '#999')
      .text(v => fmt$k(v));

    // ── Y axis ───────────────────────────────────────────────────────────────
    const yAxisFn = mode === 'absolute'
      ? d3.axisLeft(y).ticks(5).tickFormat(v => fmt$k(Number(v)))
      : d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%'));

    axesGroup.select<SVGGElement>('g.y-axis')
      .transition(t)
      .call(yAxisFn)
      .call(g => {
        g.select('.domain').remove();
        g.selectAll('text').style('font-size', '11px').style('fill', '#666');
      });

  }, [mode, highlightKey]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: '100%', height: 'auto', overflow: 'visible' }}
      aria-label="Stacked bar chart of annual spending by income decile"
    >
      <g className="root" transform={`translate(${ML},${MT})`}>
        <g className="grid" />
        <g className="bars" />
        <g className="axes">
          <g className="y-axis" />
          <g className="x-axis" />
          <g className="income-labels" />
        </g>
      </g>
    </svg>
  );
}

// ── Tooltip helper ────────────────────────────────────────────────────────────
export function DecileTooltip({ info }: { info: HoverInfo }) {
  const cat = CATEGORIES.find(c => c.key === info.catKey)!;
  const spend = SPENDING[info.catKey][info.di];
  const total = TOTAL_SPENDING[info.di];
  const income = INCOME[info.di];

  return (
    <div
      className="decile-tooltip"
      style={{ left: info.svgX + 12, top: info.svgY - 8 }}
    >
      <div className="dt-decile">
        {DECILE_LABELS[info.di]} decile · avg income {fmtFull(income)}/yr
      </div>
      <div className="dt-cat" style={{ color: cat.color }}>
        {cat.label}
      </div>
      <div className="dt-value">{fmtFull(spend)}/yr</div>
      <div className="dt-share">{fmtPct(spend / total)} of spending</div>
    </div>
  );
}
