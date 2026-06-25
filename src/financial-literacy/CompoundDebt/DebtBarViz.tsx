import type { JSX } from 'react';
import * as d3 from 'd3';

const MONTHLY_RATE = 0.24 / 12;
const INITIAL_DEBT = 1000;
const MAX_MONTH = 60;

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

  for (let m = 1; m <= MAX_MONTH; m++) {
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
const X_DOMAIN = Array.from({ length: MAX_MONTH + 1 }, (_, i) => i);

const xScale = d3
  .scaleBand<number>()
  .domain(X_DOMAIN)
  .range([0, W])
  .padding(0.08);

const yScale = d3.scaleLinear().domain([-3500, 2000]).range([H, 0]);

const barWidth = xScale.bandwidth();
const debtTicks = [0, 1000, 2000, 3000];
const xLabelMonths = [0, 12, 24, 36, 48, 60];

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
  const floored = Math.floor(Math.max(0, Math.min(currentMonth, MAX_MONTH)));
  const bars: JSX.Element[] = [];
  const greenSlices: JSX.Element[] = [];

  const currentData = ALL_DATA[floored];
  const gp = Math.max(0, Math.min(1, gatherProgress));

  if (cycle === 1) {
    for (let month = 0; month <= MAX_MONTH; month++) {
      const d = ALL_DATA[month];
      const x = xScale(month)!;
      if (month > floored) continue;

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

    for (let month = 0; month <= MAX_MONTH; month++) {
      const d = ALL_DATA[month];
      const x = xScale(month)!;
      const reached = month <= floored;
      const payment =
        month > 0 ? d.totalPaid - ALL_DATA[month - 1].totalPaid : 0;

      // Ghost no-payment bars
      bars.push(
        <rect
          key={`gp${month}`}
          x={x}
          y={yScale(0)}
          width={barWidth}
          height={yScale(-INITIAL_DEBT) - yScale(0)}
          fill={DARK_RED}
          opacity={0.12 * barFade}
        />,
      );
      if (d.noPayInterest > 0.5) {
        bars.push(
          <rect
            key={`gi${month}`}
            x={x}
            y={yScale(-INITIAL_DEBT)}
            width={barWidth}
            height={yScale(-d.noPayBalance) - yScale(-INITIAL_DEBT)}
            fill={RED}
            opacity={0.12 * barFade}
          />,
        );
      }

      // Red remaining balance (offset below payment slice)
      if (d.payBalance > 0.5) {
        const yTop = payment > 0.5 ? yScale(-payment) : yScale(0);
        const yBot = yScale(-(payment + d.payBalance));
        const opacity = (reached ? 1 : 0.2) * barFade;
        bars.push(
          <rect
            key={`mp${month}`}
            x={x}
            y={yTop}
            width={barWidth}
            height={yBot - yTop}
            fill={DARK_RED}
            opacity={opacity}
          />,
        );
      }

      // Green payment slice
      if (month > 0 && reached && payment > 0.5) {
        const sliceH = yScale(-payment) - yScale(0);
        // Stagger: earlier months move first
        const delay = (month / MAX_MONTH) * 0.4;
        const t = Math.max(0, Math.min(1, (gp - delay) / (1 - delay + 0.01)));

        const sx = lerp(x, GATHER_X, t);
        const sy = lerp(yScale(0), yScale(d.totalPaid), t);
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

  // Axis fade during gather
  const axisFade = 1 - gp * 0.7;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block' }}
      aria-label="Bar chart showing credit card debt growth over months"
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

        {/* Break-even line in cycle 2 */}
        {cycle === 2 && (
          <g opacity={axisFade}>
            <line
              x1={0}
              y1={yScale(-INITIAL_DEBT)}
              x2={W}
              y2={yScale(-INITIAL_DEBT)}
              stroke={MUTED}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={W}
              y={yScale(-INITIAL_DEBT) - 6}
              textAnchor="end"
              fontSize={9}
              fill={MUTED}
              fontFamily="inherit"
            >
              Break-even: $20/mo (interest only)
            </text>
          </g>
        )}

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

        {/* Total paid label (appears after gather mostly complete) */}
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

        {/* Current balance label (hidden during gather) */}
        {gp < 0.3 && currentBalance > 0 && (
          <text
            x={(xScale(floored) ?? 0) + barWidth / 2}
            y={Math.min(
              yScale(-(currentBalance + (floored > 0 ? ALL_DATA[floored].totalPaid - ALL_DATA[floored - 1].totalPaid : 0))) + 14,
              H - 4,
            )}
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
          ([
            {
              color: DARK_RED,
              label:
                cycle === 1
                  ? 'Original debt ($1,000)'
                  : 'Remaining balance',
              op: 1,
            },
            ...(cycle === 1
              ? [{ color: RED, label: 'Accumulated interest', op: 1 }]
              : [
                  { color: GREEN, label: 'Payment (this month)', op: 1 },
                  { color: RED, label: 'No payments (ghost)', op: 0.2 },
                ]),
          ] as const).map((item, i) => (
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
