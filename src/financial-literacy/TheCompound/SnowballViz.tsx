import type { JSX } from 'react';
import * as d3 from 'd3';

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 520;
const VH = 460;

const BILL_COLS = 1;
const BILL_ROWS = 15;
const BILL_W    = 160;
const BILL_H    = 22;
const BILL_GAP  = 4;
const BILL_PAD  = 8;

const COL_X      = 20;
const COL_BOTTOM = 420;
const COL_W = BILL_COLS * BILL_W + (BILL_COLS - 1) * BILL_GAP + 2 * BILL_PAD; // 176
const COL_H = BILL_ROWS * BILL_H + (BILL_ROWS - 1) * BILL_GAP + 2 * BILL_PAD; // 402

const MAX_BILLS = BILL_COLS * BILL_ROWS; // 15

const LABEL_X = COL_X + COL_W + 24; // 220

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN       = '#1a7a4a';
const LIGHT_GREEN = '#7abf8e';
const GOLD        = '#c9a227';
const MUTED       = '#999';

// ── Math ──────────────────────────────────────────────────────────────────────
const RATE  = 0.07;
const DENOM = 100; // $100 per bill

const fmt$ = d3.format('$,.0f');

function billPos(b: number): { x: number; y: number } {
  const col = b % BILL_COLS;
  const row = Math.floor(b / BILL_COLS);
  return {
    x: COL_X + BILL_PAD + col * (BILL_W + BILL_GAP),
    y: COL_BOTTOM - BILL_PAD - (row + 1) * BILL_H - row * BILL_GAP,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SnowballViz({ fractionalYear }: { fractionalYear: number }) {
  const yr          = Math.max(0, fractionalYear);
  const totalValue  = DENOM * Math.pow(1 + RATE, yr);
  const principal   = DENOM;
  const simpleInt   = principal * RATE * yr;
  const compound    = totalValue - principal - simpleInt;

  // totalBills: how many $100 bills are filled (fractional)
  const totalBills = totalValue / DENOM;
  // lgBoundary: bill index at which LIGHT_GREEN ends and GOLD begins
  const lgBoundary = (principal + simpleInt) / DENOM;

  const displayYear = Math.min(40, Math.round(yr));

  const fills: JSX.Element[]    = [];
  const outlines: JSX.Element[] = [];

  for (let b = 0; b < MAX_BILLS; b++) {
    const { x, y } = billPos(b);
    const fillProgress = Math.min(Math.max(totalBills - b, 0), 1);

    outlines.push(
      <rect
        key={`o${b}`}
        x={x} y={y} width={BILL_W} height={BILL_H}
        fill="none"
        stroke={fillProgress > 0 ? 'rgba(0,0,0,0.1)' : '#e8e8e8'}
        strokeWidth={1} rx={2}
      />
    );

    if (fillProgress <= 0) continue;

    const billBottom = y + BILL_H;
    const fillPx     = fillProgress * BILL_H;

    if (b === 0) {
      // Principal — always GREEN
      fills.push(
        <rect key={`f${b}`}
          x={x} y={billBottom - fillPx} width={BILL_W} height={fillPx}
          fill={GREEN} rx={2} />
      );
    } else if (b + 1 <= lgBoundary) {
      // Entire bill is within the simple-interest zone
      fills.push(
        <rect key={`f${b}`}
          x={x} y={billBottom - fillPx} width={BILL_W} height={fillPx}
          fill={LIGHT_GREEN} rx={2} />
      );
    } else if (b >= lgBoundary) {
      // Entire bill is within the compound-bonus zone
      fills.push(
        <rect key={`f${b}`}
          x={x} y={billBottom - fillPx} width={BILL_W} height={fillPx}
          fill={GOLD} rx={2} />
      );
    } else {
      // Split bill: lgBoundary falls inside this bill
      // Bottom portion (from billBottom upward) is LIGHT_GREEN; top is GOLD
      const lgFrac   = lgBoundary - b;        // 0–1, fraction of bill that is LG
      const lgPx     = lgFrac * BILL_H;
      const lgFill   = Math.min(fillPx, lgPx);
      const goldFill = Math.max(0, fillPx - lgPx);

      if (lgFill > 0.2) {
        fills.push(
          <rect key={`flg${b}`}
            x={x} y={billBottom - lgFill} width={BILL_W} height={lgFill}
            fill={LIGHT_GREEN} rx={2} />
        );
      }
      if (goldFill > 0.2) {
        fills.push(
          <rect key={`fgold${b}`}
            x={x} y={billBottom - lgPx - goldFill} width={BILL_W} height={goldFill}
            fill={GOLD} rx={2} />
        );
      }
    }
  }

  const annualInterest = totalValue * RATE;
  const showFinalNote  = yr >= 39.5;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Snowball compounding visualization"
    >
      {/* Column background */}
      <rect
        x={COL_X} y={COL_BOTTOM - COL_H}
        width={COL_W} height={COL_H}
        fill="#fafafa" stroke="#ddd" strokeWidth={1} rx={3}
      />

      {fills}
      {outlines}

      {/* Right panel ── year + total */}
      <text
        x={LABEL_X} y={COL_BOTTOM - COL_H + 18}
        fontSize={11} fontWeight={600} fill={MUTED}
        fontFamily="inherit" letterSpacing="0.06em"
      >
        {displayYear === 0 ? 'DAY 1' : `YEAR ${displayYear}`}
      </text>
      <text
        x={LABEL_X} y={COL_BOTTOM - COL_H + 48}
        fontSize={26} fontWeight={700} fill="#222" fontFamily="inherit"
      >
        {fmt$(totalValue)}
      </text>

      {/* Breakdown rows */}
      {[
        { color: GREEN,       label: 'principal',      value: principal  },
        { color: LIGHT_GREEN, label: 'simple interest', value: simpleInt  },
        { color: GOLD,        label: 'compound bonus',  value: compound   },
      ].map((row, i) => (
        <g key={i} transform={`translate(${LABEL_X}, ${COL_BOTTOM - COL_H + 76 + i * 38})`}>
          <rect x={0} y={-11} width={8} height={10} fill={row.color} rx={1} />
          <text x={13} y={-2} fontSize={9} fill={MUTED} fontFamily="inherit">
            {row.label}
          </text>
          <text x={13} y={12} fontSize={12} fontWeight={600} fill="#333" fontFamily="inherit">
            {fmt$(row.value)}
          </text>
        </g>
      ))}

      {/* Year-40 annual interest note */}
      {showFinalNote && (
        <text
          x={LABEL_X} y={COL_BOTTOM - COL_H + 76 + 3 * 38 + 16}
          fontSize={10} fill={GOLD} fontFamily="inherit"
        >
          +{fmt$(annualInterest)}/yr this year
        </text>
      )}

      {/* Legend */}
      <g transform={`translate(${COL_X}, ${COL_BOTTOM + 30})`}>
        {[
          { color: GREEN,       label: 'Principal ($100)' },
          { color: LIGHT_GREEN, label: 'Simple interest' },
          { color: GOLD,        label: 'Interest on interest' },
        ].map((item, i) => (
          <g key={i} transform={`translate(${i * 148}, 0)`}>
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
