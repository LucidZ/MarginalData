import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import {
  ALEX_DATA, JORDAN_DATA, DEBT_DATA,
  CROSSOVER_YEAR, ALEX_FINAL, JORDAN_FINAL,
  DEBT_YEAR3, DEBT_YEAR6,
  CompoundPoint, DebtPoint,
} from './data';

export type VizMode = 'line' | 'areas' | 'crossover' | 'debt' | 'two-paths' | 'gap';

interface Props { mode: VizMode; }

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 540;
const VH = 370;
const M = { top: 32, right: 36, bottom: 48, left: 76 };
const IW = VW - M.left - M.right; // 428
const IH = VH - M.top - M.bottom; // 290

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN = '#1a7a4a'; // contributions (matches --color-kept)
const GOLD  = '#c9a227'; // compounding gains / interest added
const RED   = '#ae2012'; // debt principal
const NAVY  = '#1e3a5f'; // Jordan's comparison line
const MUTED = '#999';

// ── Scales (two modes — investment and debt) ──────────────────────────────────
const MAX_PORTFOLIO = 870_000;

// Investment: 40-year horizon, $0 to ~$870K
const xInvest = d3.scaleLinear().domain([0, 40]).range([0, IW]);
const yInvest = d3.scaleLinear().domain([0, MAX_PORTFOLIO]).range([IH, 0]);

// Debt: 8-year horizon, $0 down to ~-$36K
const xDebt = d3.scaleLinear().domain([0, 8]).range([0, IW]);
const yDebt  = d3.scaleLinear().domain([-36_000, 9_000]).range([IH, 0]);

// ── Generators — investment ───────────────────────────────────────────────────
const alexContribArea = d3.area<CompoundPoint>()
  .x(d => xInvest(d.year))
  .y0(yInvest(0))
  .y1(d => yInvest(d.contributions))
  .curve(d3.curveMonotoneX);

const alexGainsArea = d3.area<CompoundPoint>()
  .x(d => xInvest(d.year))
  .y0(d => yInvest(d.contributions))
  .y1(d => yInvest(d.portfolio))
  .curve(d3.curveMonotoneX);

const alexPortfolioLine = d3.line<CompoundPoint>()
  .x(d => xInvest(d.year))
  .y(d => yInvest(d.portfolio))
  .curve(d3.curveMonotoneX);

const jordanPortfolioLine = d3.line<CompoundPoint>()
  .x(d => xInvest(d.year))
  .y(d => yInvest(d.portfolio))
  .curve(d3.curveMonotoneX);

const gapArea = d3.area<CompoundPoint>()
  .x(d => xInvest(d.year))
  .y0((_, i) => yInvest(JORDAN_DATA[i].portfolio))
  .y1(d => yInvest(d.portfolio))
  .curve(d3.curveMonotoneX);

// ── Generators — debt ─────────────────────────────────────────────────────────
const debtPrincipalArea = d3.area<DebtPoint>()
  .x(d => xDebt(d.year))
  .y0(yDebt(0))
  .y1(yDebt(-5_000)) // flat band — what you originally borrowed
  .curve(d3.curveMonotoneX);

const debtInterestArea = d3.area<DebtPoint>()
  .x(d => xDebt(d.year))
  .y0(yDebt(-5_000))
  .y1(d => yDebt(d.totalOwed))
  .curve(d3.curveMonotoneX);

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtK = (v: number) =>
  Math.abs(v) >= 1_000 ? `$${Math.round(Math.abs(v) / 1_000)}K` : `$${Math.abs(Math.round(v))}`;

// ── Component ─────────────────────────────────────────────────────────────────
export default function CompoundViz({ mode }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  // ── Init skeleton (once) ──────────────────────────────────────────────────
  useEffect(() => {
    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${VW} ${VH}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g')
      .attr('class', 'root')
      .attr('transform', `translate(${M.left},${M.top})`);

    // ── Investment axes ──
    g.append('g').attr('class', 'x-invest')
      .attr('transform', `translate(0,${IH})`);
    g.append('g').attr('class', 'y-invest');
    g.append('g').attr('class', 'x-debt')
      .attr('transform', `translate(0,${IH})`)
      .attr('opacity', 0);
    g.append('g').attr('class', 'y-debt')
      .attr('opacity', 0);

    _callInvestAxes(g);
    _callDebtAxes(g);

    // ── Zero line (shared) ──
    g.append('line').attr('class', 'zero-line')
      .attr('x1', 0).attr('x2', IW)
      .attr('y1', yInvest(0)).attr('y2', yInvest(0))
      .attr('stroke', '#ccc').attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3');

    // ── Investment layers ──
    g.append('path').attr('class', 'alex-contrib-area').attr('opacity', 0).attr('fill', GREEN);
    g.append('path').attr('class', 'alex-gains-area').attr('opacity', 0).attr('fill', GOLD);
    g.append('path').attr('class', 'alex-line')
      .attr('fill', 'none').attr('stroke', GREEN)
      .attr('stroke-width', 2.5).attr('opacity', 0);

    // ── Crossover annotation ──
    const cx = g.append('g').attr('class', 'crossover-group').attr('opacity', 0);
    cx.append('line').attr('class', 'cx-line')
      .attr('x1', xInvest(CROSSOVER_YEAR)).attr('x2', xInvest(CROSSOVER_YEAR))
      .attr('y1', 0).attr('y2', IH)
      .attr('stroke', GOLD).attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,3');
    cx.append('text').attr('class', 'cx-label-top')
      .attr('x', xInvest(CROSSOVER_YEAR) + 6)
      .attr('y', 14)
      .attr('font-size', '10px').attr('font-weight', '700')
      .attr('fill', GOLD).attr('letter-spacing', '0.01em')
      .text(`yr ${CROSSOVER_YEAR}`);
    cx.append('text').attr('class', 'cx-label-sub')
      .attr('x', xInvest(CROSSOVER_YEAR) + 6)
      .attr('y', 26)
      .attr('font-size', '10px').attr('fill', GOLD)
      .text('gains > contributions');

    // ── Debt layers ──
    const dg = g.append('g').attr('class', 'debt-group').attr('opacity', 0);
    dg.append('path').attr('class', 'debt-principal-area').attr('fill', RED).attr('opacity', 0.85);
    dg.append('path').attr('class', 'debt-interest-area').attr('fill', GOLD).attr('opacity', 0.8);

    // Debt doubling markers
    const da = dg.append('g').attr('class', 'debt-annotations');
    _addDebtMarker(da, 3, DEBT_YEAR3);
    _addDebtMarker(da, 6, DEBT_YEAR6);

    // Debt axis label
    dg.append('text')
      .attr('x', IW / 2).attr('y', yDebt(0) - 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px').attr('fill', MUTED)
      .text('$0 — original balance: $5,000');

    // ── Two-path & gap layers ──
    g.append('path').attr('class', 'jordan-line')
      .attr('fill', 'none').attr('stroke', NAVY)
      .attr('stroke-width', 2.5).attr('opacity', 0);
    g.append('path').attr('class', 'gap-area')
      .attr('fill', GOLD).attr('opacity', 0);

    // ── End-of-chart labels ──
    g.append('g').attr('class', 'end-labels');

  }, []);

  // ── Update on mode change ─────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const g = d3.select(svgRef.current).select<SVGGElement>('g.root');
    const D = 600;
    const E = d3.easeCubicInOut;

    const isDebt     = mode === 'debt';
    const showAreas  = mode !== 'line';
    const showCross  = mode === 'crossover';
    const showJordan = mode === 'two-paths' || mode === 'gap';
    const showGap    = mode === 'gap';

    // ── Swap axis visibility ──
    g.select('.x-invest').interrupt().transition().duration(D).attr('opacity', isDebt ? 0 : 1);
    g.select('.y-invest').interrupt().transition().duration(D).attr('opacity', isDebt ? 0 : 1);
    g.select('.x-debt').interrupt().transition().duration(D).attr('opacity', isDebt ? 1 : 0);
    g.select('.y-debt').interrupt().transition().duration(D).attr('opacity', isDebt ? 1 : 0);

    // ── Zero line position ──
    g.select('.zero-line').interrupt()
      .transition().duration(D).ease(E)
      .attr('y1', isDebt ? yDebt(0) : yInvest(0))
      .attr('y2', isDebt ? yDebt(0) : yInvest(0));

    // ── Alex portfolio line (mode=line only) ──
    g.select<SVGPathElement>('.alex-line')
      .datum(ALEX_DATA)
      .interrupt()
      .transition().duration(D).ease(E)
      .attr('opacity', mode === 'line' ? 1 : 0)
      .attr('d', alexPortfolioLine);

    // ── Contribution area ──
    g.select<SVGPathElement>('.alex-contrib-area')
      .datum(ALEX_DATA)
      .interrupt()
      .transition().duration(D).ease(E)
      .attr('opacity', !isDebt && showAreas ? 0.85 : 0)
      .attr('d', alexContribArea);

    // ── Gains area ──
    g.select<SVGPathElement>('.alex-gains-area')
      .datum(ALEX_DATA)
      .interrupt()
      .transition().duration(D).ease(E)
      .attr('opacity', !isDebt && showAreas ? 0.75 : 0)
      .attr('d', alexGainsArea);

    // ── Crossover annotation ──
    g.select('.crossover-group').interrupt()
      .transition().duration(D)
      .attr('opacity', showCross ? 1 : 0);

    // ── Debt group ──
    g.select('.debt-group').interrupt()
      .transition().duration(D)
      .attr('opacity', isDebt ? 1 : 0);

    g.select<SVGPathElement>('.debt-principal-area')
      .datum(DEBT_DATA)
      .attr('d', debtPrincipalArea);

    g.select<SVGPathElement>('.debt-interest-area')
      .datum(DEBT_DATA)
      .attr('d', debtInterestArea);

    // ── Jordan line ──
    g.select<SVGPathElement>('.jordan-line')
      .datum(JORDAN_DATA)
      .interrupt()
      .transition().duration(D).ease(E)
      .attr('opacity', showJordan ? 0.9 : 0)
      .attr('d', jordanPortfolioLine);

    // ── Gap area ──
    g.select<SVGPathElement>('.gap-area')
      .datum(ALEX_DATA)
      .interrupt()
      .transition().duration(D).ease(E)
      .attr('opacity', showGap ? 0.2 : 0)
      .attr('d', gapArea);

    // ── End labels ──
    _updateEndLabels(g, mode, D, E);

  }, [mode]);

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%' }}
      aria-label="Compound interest visualization"
    />
  );
}

// ── Axis helpers ──────────────────────────────────────────────────────────────

function _callInvestAxes(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  g.select<SVGGElement>('.x-invest')
    .call(
      d3.axisBottom(xInvest)
        .tickValues([0, 10, 20, 30, 40])
        .tickFormat(v => `Yr ${v}`)
        .tickSize(0).tickPadding(10)
    )
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('text')
      .style('font-size', '11px').style('fill', MUTED));

  g.select<SVGGElement>('.y-invest')
    .call(
      d3.axisLeft(yInvest)
        .tickValues([0, 250_000, 500_000, 750_000])
        .tickFormat(v => fmtK(v as number))
        .tickSize(-IW)
    )
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('.tick line')
      .attr('stroke', '#f0f0f0').attr('stroke-dasharray', '3,2'))
    .call(ax => ax.selectAll('text')
      .style('font-size', '11px').style('fill', MUTED));
}

function _callDebtAxes(g: d3.Selection<SVGGElement, unknown, null, undefined>) {
  g.select<SVGGElement>('.x-debt')
    .call(
      d3.axisBottom(xDebt)
        .tickValues([0, 2, 4, 6, 8])
        .tickFormat(v => `Yr ${v}`)
        .tickSize(0).tickPadding(10)
    )
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('text')
      .style('font-size', '11px').style('fill', MUTED));

  g.select<SVGGElement>('.y-debt')
    .call(
      d3.axisLeft(yDebt)
        .tickValues([0, -10_000, -20_000, -30_000])
        .tickFormat(v => `−${fmtK(v as number)}`)
        .tickSize(-IW)
    )
    .call(ax => ax.select('.domain').remove())
    .call(ax => ax.selectAll('.tick line')
      .attr('stroke', '#f0f0f0').attr('stroke-dasharray', '3,2'))
    .call(ax => ax.selectAll('text')
      .style('font-size', '11px').style('fill', MUTED));
}

function _addDebtMarker(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  yr: number,
  amount: number,
) {
  const x = xDebt(yr);
  const y = yDebt(-amount);
  const mg = g.append('g').attr('class', `debt-marker-yr${yr}`);
  mg.append('line')
    .attr('x1', 0).attr('x2', IW)
    .attr('y1', y).attr('y2', y)
    .attr('stroke', GOLD).attr('stroke-width', 1)
    .attr('stroke-dasharray', '3,3').attr('opacity', 0.6);
  mg.append('circle')
    .attr('cx', x).attr('cy', y).attr('r', 3.5)
    .attr('fill', GOLD);
  mg.append('text')
    .attr('x', x + 7).attr('y', y - 5)
    .attr('font-size', '10px').attr('font-weight', '700')
    .attr('fill', GOLD)
    .text(`${fmtK(amount)} — doubled`);
}

function _updateEndLabels(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  mode: VizMode,
  dur: number,
  ease: (t: number) => number,
) {
  const el = g.select('.end-labels');
  el.selectAll('*').remove();

  if (mode === 'line' || mode === 'areas' || mode === 'crossover') {
    // Alex final value label
    el.append('text')
      .attr('x', xInvest(40) + 6)
      .attr('y', yInvest(ALEX_FINAL))
      .attr('font-size', '11px').attr('font-weight', '700')
      .attr('fill', GREEN).attr('dominant-baseline', 'middle')
      .attr('opacity', 0)
      .text(fmtK(ALEX_FINAL))
      .transition().duration(dur).ease(ease).attr('opacity', 1);
  }

  if (mode === 'two-paths' || mode === 'gap') {
    // Alex label
    el.append('text')
      .attr('x', xInvest(40) + 6)
      .attr('y', yInvest(ALEX_FINAL))
      .attr('font-size', '11px').attr('font-weight', '700')
      .attr('fill', GREEN).attr('dominant-baseline', 'middle')
      .attr('opacity', 0)
      .text(`Alex: ${fmtK(ALEX_FINAL)}`)
      .transition().duration(dur).ease(ease).attr('opacity', 1);

    // Jordan label
    el.append('text')
      .attr('x', xInvest(40) + 6)
      .attr('y', yInvest(JORDAN_FINAL))
      .attr('font-size', '11px').attr('font-weight', '700')
      .attr('fill', NAVY).attr('dominant-baseline', 'middle')
      .attr('opacity', 0)
      .text(`Jordan: ${fmtK(JORDAN_FINAL)}`)
      .transition().duration(dur).ease(ease).attr('opacity', 1);
  }
}
