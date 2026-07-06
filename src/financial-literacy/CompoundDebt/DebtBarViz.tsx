import type { JSX } from 'react';
import * as d3 from 'd3';

const MONTHLY_RATE = 0.24 / 12;
const INITIAL_DEBT = 1000;
const CYCLE1_MAX = 84;
const CYCLE2_MAX = 84;

const VW = 520;
const VH = 440;
const MARGIN = { top: 30, right: 16, bottom: 56, left: 64 };
const W = VW - MARGIN.left - MARGIN.right;
const H = VH - MARGIN.top - MARGIN.bottom;

const DARK_RED = '#8b1a1a';
const RED = '#d44040';
const GREEN = '#1a7a4a';
const MUTED = '#999';

const fmt$ = d3.format('$,.0f');

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface MonthData {
  month: number;
  noPayBalance: number;
  noPayInterest: number;
  payBalance: number;
  totalPaid: number;
  totalInterest: number;
}

function minPayment(balance: number): number {
  if (balance <= 0) return 0;
  const interest = balance * MONTHLY_RATE;
  const calculated = 0.01 * balance + interest;
  return Math.min(Math.max(calculated, 25), balance + interest);
}

function buildData(): MonthData[] {
  const result: MonthData[] = [];
  let noPay = INITIAL_DEBT;
  let pay = INITIAL_DEBT;
  let totalPaid = 0;
  let totalInterest = 0;

  result.push({
    month: 0,
    noPayBalance: INITIAL_DEBT,
    noPayInterest: 0,
    payBalance: INITIAL_DEBT,
    totalPaid: 0,
    totalInterest: 0,
  });

  for (let m = 1; m <= CYCLE1_MAX; m++) {
    noPay *= 1 + MONTHLY_RATE;

    const pmt = minPayment(pay);
    if (pay > 0) {
      const interest = pay * MONTHLY_RATE;
      totalPaid += pmt;
      totalInterest += Math.min(interest, pmt);
      pay = pay + interest - pmt;
      if (pay < 0.5) pay = 0;
    }

    result.push({
      month: m,
      noPayBalance: noPay,
      noPayInterest: noPay - INITIAL_DEBT,
      payBalance: Math.max(0, pay),
      totalPaid,
      totalInterest,
    });
  }
  return result;
}

const ALL_DATA = buildData();

const xScale1 = d3
  .scaleBand<number>()
  .domain(Array.from({ length: CYCLE1_MAX + 1 }, (_, i) => i))
  .range([0, W])
  .padding(0.08);

const xScale2 = d3
  .scaleBand<number>()
  .domain(Array.from({ length: CYCLE2_MAX + 1 }, (_, i) => i))
  .range([0, W])
  .padding(0.08);

const yScale1 = d3.scaleLinear().domain([-5500, 600]).range([H, 0]);
const yScale2 = d3.scaleLinear().domain([-1200, 2100]).range([H, 0]);

const GATHER_X = W * 0.28;
const REF_X = W * 0.58;
const COL_W = 50;

export default function DebtBarViz({
  currentMonth,
  cycle,
  gatherProgress = 0,
}: {
  currentMonth: number;
  cycle: 1 | 2;
  gatherProgress?: number;
}) {
  const maxMonth = cycle === 1 ? CYCLE1_MAX : CYCLE2_MAX;
  const xScale = cycle === 1 ? xScale1 : xScale2;
  const yScale = cycle === 1 ? yScale1 : yScale2;
  const barWidth = xScale.bandwidth();
  const debtTicks = cycle === 1 ? [0, 2000, 4000] : [0, 500, 1000];
  const xLabelMonths =
    cycle === 1
      ? [0, 12, 24, 36, 48, 60, 72, 84]
      : [0, 12, 24, 36, 48, 60, 72, 84];

  const floored = Math.floor(Math.max(0, Math.min(currentMonth, maxMonth)));
  const bars: JSX.Element[] = [];
  const greenSlices: JSX.Element[] = [];

  const currentData = ALL_DATA[floored];
  const gp = Math.max(0, Math.min(1, gatherProgress));

  if (cycle === 1) {
    for (let month = 0; month <= floored; month++) {
      const d = ALL_DATA[month];
      const x = xScale(month)!;

      bars.push(
        <rect
          key={`p${month}`}
          x={x}
          y={yScale(0)}
          width={barWidth}
          height={yScale(-INITIAL_DEBT) - yScale(0)}
          fill={DARK_RED}
        />,
      );

      if (d.noPayInterest > 0.5) {
        bars.push(
          <rect
            key={`i${month}`}
            x={x}
            y={yScale(-INITIAL_DEBT)}
            width={barWidth}
            height={yScale(-d.noPayBalance) - yScale(-INITIAL_DEBT)}
            fill={RED}
          />,
        );
      }
    }
  } else {
    const barFade = 1 - gp * 0.85;

    for (let month = 0; month <= CYCLE2_MAX; month++) {
      const d = ALL_DATA[month];
      const x = xScale(month)!;
      const reached = month <= floored;
      const payment =
        month > 0 ? ALL_DATA[month].totalPaid - ALL_DATA[month - 1].totalPaid : 0;

      if (d.payBalance > 0.5 && reached) {
        bars.push(
          <rect
            key={`mp${month}`}
            x={x}
            y={yScale(0)}
            width={barWidth}
            height={yScale(-d.payBalance) - yScale(0)}
            fill={DARK_RED}
            opacity={barFade}
          />,
        );
      }

      if (month > 0 && reached && payment > 0.5) {
        const sliceH = yScale(0) - yScale(payment);
        const delay = (month / CYCLE2_MAX) * 0.4;
        const t =
          gp > 0
            ? Math.max(0, Math.min(1, (gp - delay) / (1 - delay + 0.01)))
            : 0;

        const sx = lerp(x, GATHER_X, t);
        const sy = lerp(yScale(payment), yScale(ALL_DATA[month].totalPaid), t);
        const sw = lerp(barWidth, COL_W, t);

        greenSlices.push(
          <rect
            key={`tp${month}`}
            x={sx}
            y={sy}
            width={sw}
            height={sliceH}
            fill={GREEN}
            stroke={t > 0.5 ? '#fff' : 'none'}
            strokeWidth={t > 0.5 ? 0.3 : 0}
          />,
        );
      }
    }
  }

  const currentBalance =
    cycle === 1 ? currentData.noPayBalance : currentData.payBalance;

  const axisFade = 1 - gp * 0.7;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block' }}
      aria-label="Bar chart showing credit card debt over months"
    >
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        {/* Y-axis grid + labels */}
        {debtTicks.map((tick) => (
          <g key={`y${tick}`} opacity={tick === 0 ? 1 : axisFade}>
            <line
              x1={0}
              y1={yScale(-tick)}
              x2={W}
              y2={yScale(-tick)}
              stroke={tick === 0 ? '#555' : '#eee'}
              strokeWidth={tick === 0 ? 1.5 : 1}
            />
            <text
              x={-10}
              y={yScale(-tick)}
              dy="0.35em"
              textAnchor="end"
              fontSize={10}
              fill={MUTED}
              fontFamily="inherit"
            >
              {fmt$(tick)}
            </text>
          </g>
        ))}

        {bars}
        {greenSlices}

        {/* Reference bar: original debt (appears during gather) */}
        {gp > 0.3 && (
          <g opacity={Math.min(1, (gp - 0.3) / 0.3)}>
            <rect
              x={REF_X}
              y={yScale(INITIAL_DEBT)}
              width={COL_W}
              height={yScale(0) - yScale(INITIAL_DEBT)}
              fill={DARK_RED}
              opacity={0.5}
              rx={2}
            />
            <text
              x={REF_X + COL_W / 2}
              y={yScale(INITIAL_DEBT) - 8}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={DARK_RED}
              fontFamily="inherit"
            >
              {fmt$(INITIAL_DEBT)}
            </text>
            <text
              x={REF_X + COL_W / 2}
              y={yScale(INITIAL_DEBT) - 22}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
              fontFamily="inherit"
            >
              Original debt
            </text>
          </g>
        )}

        {/* Total paid label */}
        {gp > 0.6 && (
          <g opacity={Math.min(1, (gp - 0.6) / 0.3)}>
            <text
              x={GATHER_X + COL_W / 2}
              y={Math.max(yScale(currentData.totalPaid) - 8, 4)}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={GREEN}
              fontFamily="inherit"
            >
              {fmt$(currentData.totalPaid)}
            </text>
            <text
              x={GATHER_X + COL_W / 2}
              y={Math.max(yScale(currentData.totalPaid) - 22, -10)}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
              fontFamily="inherit"
            >
              Total paid
            </text>
          </g>
        )}

        {/* Interest cost callout */}
        {gp > 0.8 && (
          <g opacity={Math.min(1, (gp - 0.8) / 0.2)}>
            <text
              x={(GATHER_X + COL_W + REF_X) / 2}
              y={yScale(INITIAL_DEBT) + (yScale(0) - yScale(INITIAL_DEBT)) / 2}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
              fontFamily="inherit"
            >
              +{fmt$(currentData.totalInterest)}
            </text>
            <text
              x={(GATHER_X + COL_W + REF_X) / 2}
              y={
                yScale(INITIAL_DEBT) +
                (yScale(0) - yScale(INITIAL_DEBT)) / 2 +
                13
              }
              textAnchor="middle"
              fontSize={9}
              fill={MUTED}
              fontFamily="inherit"
            >
              interest
            </text>
          </g>
        )}

        {/* Remaining balance during gather */}
        {gp > 0.8 && currentData.payBalance > 0.5 && (
          <g opacity={Math.min(1, (gp - 0.8) / 0.2)}>
            <rect
              x={REF_X}
              y={yScale(0)}
              width={COL_W}
              height={yScale(-currentData.payBalance) - yScale(0)}
              fill={DARK_RED}
              opacity={0.7}
              rx={2}
            />
            <text
              x={REF_X + COL_W / 2}
              y={yScale(-currentData.payBalance) + 14}
              textAnchor="middle"
              fontSize={10}
              fontWeight={600}
              fill={DARK_RED}
              fontFamily="inherit"
            >
              Still owe {fmt$(currentData.payBalance)}
            </text>
          </g>
        )}

        {/* X-axis ticks + labels */}
        <g opacity={axisFade}>
          {xLabelMonths.map((month) => (
            <line
              key={`xtick${month}`}
              x1={(xScale(month) ?? 0) + barWidth / 2}
              y1={yScale(0)}
              x2={(xScale(month) ?? 0) + barWidth / 2}
              y2={yScale(0) - 4}
              stroke="#aaa"
            />
          ))}
          {xLabelMonths.map((month) => (
            <text
              key={`xl${month}`}
              x={(xScale(month) ?? 0) + barWidth / 2}
              y={yScale(0) - 8}
              textAnchor="middle"
              fontSize={10}
              fill={MUTED}
              fontFamily="inherit"
            >
              {month / 12}
            </text>
          ))}
          <text
            x={W / 2}
            y={yScale(0) - 20}
            textAnchor="middle"
            fontSize={11}
            fill={MUTED}
            fontFamily="inherit"
          >
            Year
          </text>
        </g>

        {/* Current balance label */}
        {gp < 0.3 && currentBalance > 0 && (
          <text
            x={(xScale(floored) ?? 0) + barWidth / 2}
            y={Math.min(yScale(-currentBalance) + 14, H - 4)}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill="#333"
            fontFamily="inherit"
            opacity={1 - gp / 0.3}
          >
            {fmt$(currentBalance)}
          </text>
        )}
        {gp < 0.3 &&
          cycle === 2 &&
          currentBalance === 0 &&
          floored > 0 && (
            <text
              x={(xScale(floored) ?? 0) + barWidth / 2}
              y={yScale(0) + 16}
              textAnchor="middle"
              fontSize={11}
              fontWeight={700}
              fill={GREEN}
              fontFamily="inherit"
              opacity={1 - gp / 0.3}
            >
              $0
            </text>
          )}

        {/* Month counter */}
        <text
          x={W}
          y={H + 16}
          textAnchor="end"
          fontSize={11}
          fontWeight={600}
          fill={MUTED}
          fontFamily="inherit"
          letterSpacing="0.06em"
          opacity={axisFade}
        >
          {floored === 0 ? 'DAY 1' : `MONTH ${floored}`}
        </text>

        {/* Legend */}
        {gp < 0.5 &&
          (cycle === 1
            ? [
                { color: DARK_RED, label: 'Original debt ($1,000)', op: 1 },
                { color: RED, label: 'Accumulated interest', op: 1 },
              ]
            : [
                { color: DARK_RED, label: 'Remaining balance', op: 1 },
                { color: GREEN, label: 'Payment (this month)', op: 1 },
              ]
          ).map((item, i) => (
            <g
              key={i}
              transform={`translate(${i * 148}, ${H + 30})`}
              opacity={1 - gp * 2}
            >
              <rect
                x={0}
                y={-8}
                width={10}
                height={8}
                fill={item.color}
                rx={1}
                opacity={item.op}
              />
              <text
                x={14}
                y={0}
                fontSize={10}
                fill={MUTED}
                fontFamily="inherit"
              >
                {item.label}
              </text>
            </g>
          ))}
      </g>
    </svg>
  );
}
