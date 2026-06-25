import type { JSX } from 'react';
import * as d3 from 'd3';

const RATE = 0.07;
const PRINCIPAL = 100;
const MAX_YEAR = 40;
const YMAX = 1500;

const VW = 520;
const VH = 440;
const MARGIN = { top: 30, right: 16, bottom: 56, left: 56 };
const W = VW - MARGIN.left - MARGIN.right;
const H = VH - MARGIN.top - MARGIN.bottom;

const GREEN = '#1a7a4a';
const LIGHT_GREEN = '#7abf8e';
const GOLD = '#c9a227';
const MUTED = '#999';

const fmt$ = d3.format('$,.0f');

interface YearData {
  year: number;
  principal: number;
  simpleInterest: number;
  compoundBonus: number;
  total: number;
  simpleTotal: number;
}

const ALL_DATA: YearData[] = Array.from({ length: MAX_YEAR + 1 }, (_, year) => {
  const total = PRINCIPAL * Math.pow(1 + RATE, year);
  const simpleInterest = PRINCIPAL * RATE * year;
  const compoundBonus = total - PRINCIPAL - simpleInterest;
  return {
    year,
    principal: PRINCIPAL,
    simpleInterest,
    compoundBonus,
    total,
    simpleTotal: PRINCIPAL + simpleInterest,
  };
});

const X_DOMAIN = Array.from({ length: MAX_YEAR + 1 }, (_, i) => i);

const xScale = d3.scaleBand<number>()
  .domain(X_DOMAIN)
  .range([0, W])
  .padding(0.15);

const yScale = d3.scaleLinear()
  .domain([0, YMAX])
  .range([H, 0]);

const barWidth = xScale.bandwidth();
const yTicks = yScale.ticks(5);
const xLabels = X_DOMAIN.filter(y => y % 5 === 0);

export default function StackedBarViz({ currentYear, cycle }: { currentYear: number; cycle: 1 | 2 }) {
  const flooredYear = Math.floor(Math.max(0, Math.min(currentYear, MAX_YEAR)));
  const bars: JSX.Element[] = [];

  for (let year = 0; year <= MAX_YEAR; year++) {
    const d = ALL_DATA[year];
    const x = xScale(year)!;
    const reached = year <= flooredYear;

    if (cycle === 1 && !reached) continue;

    const baseOpacity = (cycle === 2 && !reached) ? 0.2 : 1;

    bars.push(
      <rect key={`p${year}`}
        x={x} y={yScale(d.principal)}
        width={barWidth} height={yScale(0) - yScale(d.principal)}
        fill={GREEN} opacity={baseOpacity} />
    );

    if (d.simpleInterest > 0.5) {
      bars.push(
        <rect key={`si${year}`}
          x={x} y={yScale(d.simpleTotal)}
          width={barWidth} height={yScale(d.principal) - yScale(d.simpleTotal)}
          fill={LIGHT_GREEN} opacity={baseOpacity} />
      );
    }

    if (cycle === 2 && reached && d.compoundBonus > 0.5) {
      bars.push(
        <rect key={`cb${year}`}
          x={x} y={yScale(d.total)}
          width={barWidth} height={yScale(d.simpleTotal) - yScale(d.total)}
          fill={GOLD} />
      );
    }
  }

  const currentData = ALL_DATA[flooredYear];
  const currentTotal = cycle === 1 ? currentData.simpleTotal : currentData.total;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block' }}
      aria-label="Stacked bar chart showing compound interest growth">
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        {yTicks.map(tick => (
          <g key={`y${tick}`}>
            <line x1={0} y1={yScale(tick)} x2={W} y2={yScale(tick)} stroke="#eee" strokeWidth={1} />
            <text x={-10} y={yScale(tick)} dy="0.35em" textAnchor="end"
              fontSize={10} fill={MUTED} fontFamily="inherit">
              {fmt$(tick)}
            </text>
          </g>
        ))}

        <line x1={0} y1={H} x2={W} y2={H} stroke="#ccc" />

        {bars}

        {X_DOMAIN.map(year => (
          <line key={`xtick${year}`}
            x1={(xScale(year) ?? 0) + barWidth / 2}
            y1={H}
            x2={(xScale(year) ?? 0) + barWidth / 2}
            y2={H + 4}
            stroke={cycle === 2 || year <= flooredYear ? '#aaa' : '#ddd'}
          />
        ))}

        {xLabels.map(year => (
          <text key={`xl${year}`}
            x={(xScale(year) ?? 0) + barWidth / 2}
            y={H + 18}
            textAnchor="middle" fontSize={10} fill={MUTED} fontFamily="inherit">
            {year}
          </text>
        ))}

        <text x={W / 2} y={H + 36} textAnchor="middle" fontSize={11} fill={MUTED} fontFamily="inherit">
          Year
        </text>

        <text
          x={(xScale(flooredYear) ?? 0) + barWidth / 2}
          y={Math.max(yScale(currentTotal) - 8, 4)}
          textAnchor="middle" fontSize={11} fontWeight={700} fill="#333" fontFamily="inherit">
          {fmt$(currentTotal)}
        </text>

        <text x={W} y={-10} textAnchor="end"
          fontSize={11} fontWeight={600} fill={MUTED} fontFamily="inherit" letterSpacing="0.06em">
          {flooredYear === 0 ? 'DAY 1' : `YEAR ${flooredYear}`}
        </text>

        {([
          { color: GREEN, label: 'Principal ($100)' },
          { color: LIGHT_GREEN, label: 'Simple interest' },
          ...(cycle === 2 ? [{ color: GOLD, label: 'Compound bonus' }] : []),
        ] as const).map((item, i) => (
          <g key={i} transform={`translate(${i * 148}, ${H + 46})`}>
            <rect x={0} y={-8} width={10} height={8} fill={item.color} rx={1} />
            <text x={14} y={0} fontSize={10} fill={MUTED} fontFamily="inherit">
              {item.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
