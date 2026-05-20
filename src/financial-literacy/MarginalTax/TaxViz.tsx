import { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { computeTax, BRACKETS, MAX_STORY_INCOME } from './data';

interface Props {
  income: number;
}

// ── Layout ───────────────────────────────────────────────────────────────────
const VW = 520;
const VH = 440;

const BILL_W = 172;
const BILL_H = 46;
const BILL_LX = VW / 2 - BILL_W / 2; // 174

const TOP_Y = 18;
const KNIFE_TIP_Y = 172;
const KNIFE_BLADE_Y = 204;

// Two piles flanking the knife
const PILE_W = 106;
const PILE_MAX_H = 90;
const PILE_BOTTOM_Y = 348;
const LEFT_PILE_CX = VW * 0.21; // 109
const RIGHT_PILE_CX = VW * 0.79; // 411

const STATS_Y = 405;

// One bill in flight at a time, $100 per cycle — landing syncs exactly with stat increment
const N_STREAM = 1;
const INCOME_PER_BILL = 100;

// Phase threshold at which bill starts splitting (0–1)
const CUT_THRESH = 0.70;

// ── Colors ───────────────────────────────────────────────────────────────────
const COLOR_BILL = '#2da065';
const COLOR_KEPT = '#1a7a4a';
const COLOR_TAX = '#74c69d';
const COLOR_KNIFE = '#1a1a1a';

const fmt$ = d3.format('$,.0f');
const fmtPct = d3.format('.1%');

// ── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function billYForPhase(phase: number): number {
  if (phase >= CUT_THRESH) return KNIFE_TIP_Y;
  return TOP_Y + (phase / CUT_THRESH) * (KNIFE_TIP_Y - TOP_Y);
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TaxViz({ income }: Props) {
  const knifeRef = useRef<SVGGElement>(null);
  const prevBracketRef = useRef<number>(-1);

  // Knife position and bracket label driven by continuous income (scroll-driven)
  const { marginalRate, bracketIndex } = useMemo(() => computeTax(income), [income]);

  // Stats and pile heights driven by discrete income: update only when a bill lands
  const billCycles = income / INCOME_PER_BILL;
  const discreteIncome = Math.floor(billCycles) * INCOME_PER_BILL;
  const { taxesPaid, effectiveRate, kept } = useMemo(
    () => computeTax(discreteIncome),
    [discreteIncome],
  );

  const bracket = BRACKETS[bracketIndex];
  // Where the knife tip sits along the bill width
  const cutOffset = BILL_W * (1 - marginalRate); // px from BILL_LX

  // D3 transitions knife position when bracket changes
  useEffect(() => {
    if (!knifeRef.current) return;
    const newOffset = BILL_W * (1 - bracket.rate);
    if (prevBracketRef.current === bracketIndex) return;
    prevBracketRef.current = bracketIndex;

    d3.select(knifeRef.current)
      .interrupt()
      .transition().duration(600).ease(d3.easeCubicInOut)
      .attr('transform', `translate(${BILL_LX + newOffset}, 0)`);
  }, [bracketIndex, bracket.rate]);

  // Set initial knife position without transition
  useEffect(() => {
    if (!knifeRef.current) return;
    const init = BILL_W * (1 - BRACKETS[0].rate);
    d3.select(knifeRef.current).attr('transform', `translate(${BILL_LX + init}, 0)`);
    prevBracketRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stream bills ────────────────────────────────────────────────────────────
  const currentPhase = billCycles % 1;

  const streamBills: { slot: number; phase: number }[] = [];
  for (let slot = 0; slot < N_STREAM; slot++) {
    const minIncome = slot * (INCOME_PER_BILL / N_STREAM);
    if (income < minIncome) continue;
    const phase = (currentPhase + slot * (1 / N_STREAM)) % 1;
    streamBills.push({ slot, phase });
  }

  // ── Pile sizes ──────────────────────────────────────────────────────────────
  const pileH = PILE_MAX_H * Math.min(1, discreteIncome / (MAX_STORY_INCOME * 0.5));
  const leftPileX = LEFT_PILE_CX - PILE_W / 2;
  const rightPileX = RIGHT_PILE_CX - PILE_W / 2;

  // Half widths (for a single bill cut at current marginal rate)
  const leftHalfW = cutOffset;
  const rightHalfW = BILL_W - cutOffset;

  // Target landing positions for halves
  const leftLandX = LEFT_PILE_CX - leftHalfW / 2;
  const rightLandX = RIGHT_PILE_CX - rightHalfW / 2;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>

      {/* ── Bracket label ── */}
      <text x={VW / 2} y={12} textAnchor="middle" fontSize={11} fill="#888" fontFamily="inherit">
        {bracket.label} bracket · {fmt$(bracket.min)}
        {bracket.max != null ? ` – ${fmt$(bracket.max)}` : '+'}
      </text>

      {/* ── BILLS ── */}
      {streamBills.map(({ slot, phase }) => {
        const billY = billYForPhase(phase);
        const isCutting = phase >= CUT_THRESH;
        const splitT = isCutting ? (phase - CUT_THRESH) / (1 - CUT_THRESH) : 0;
        const opacity = isCutting ? Math.max(0, 1 - splitT) : 1;

        if (!isCutting) {
          return (
            <g key={slot} opacity={opacity}>
              <rect
                x={BILL_LX} y={billY}
                width={BILL_W} height={BILL_H}
                fill={COLOR_BILL} rx={4}
              />
              {/* Faint cut preview line */}
              <line
                x1={BILL_LX + cutOffset} y1={billY + 6}
                x2={BILL_LX + cutOffset} y2={billY + BILL_H - 6}
                stroke="rgba(0,0,0,0.18)" strokeWidth={1.5}
              />
              <text
                x={BILL_LX + BILL_W / 2} y={billY + BILL_H / 2 + 5}
                textAnchor="middle" fontSize={13} fill="white" fontWeight={700}
                fontFamily="inherit"
              >
                $100
              </text>
            </g>
          );
        }

        // Splitting halves
        const leftX = lerp(BILL_LX, leftLandX, splitT);
        const leftY = lerp(KNIFE_TIP_Y, PILE_BOTTOM_Y - BILL_H / 2, splitT);
        const rightX = lerp(BILL_LX + cutOffset, rightLandX, splitT);
        const rightY = leftY;

        return (
          <g key={slot} opacity={opacity}>
            {/* Left (kept) half */}
            <rect
              x={leftX} y={leftY}
              width={leftHalfW} height={BILL_H}
              fill={COLOR_KEPT} rx={3}
            />
            {/* Right (tax) half */}
            <rect
              x={rightX} y={rightY}
              width={rightHalfW} height={BILL_H}
              fill={COLOR_TAX} rx={3}
            />
          </g>
        );
      })}

      {/* ── KNIFE ── */}
      {/* Horizontal blade */}
      <line
        x1={LEFT_PILE_CX + PILE_W / 2 + 8} y1={KNIFE_BLADE_Y}
        x2={RIGHT_PILE_CX - PILE_W / 2 - 8} y2={KNIFE_BLADE_Y}
        stroke={COLOR_KNIFE} strokeWidth={1.5}
      />

      {/* Knife group: D3 animates transform */}
      <g ref={knifeRef}>
        {/* Isosceles triangle pointing up: tip at top, base on blade */}
        <polygon
          points={`0,${KNIFE_TIP_Y} -11,${KNIFE_BLADE_Y} 11,${KNIFE_BLADE_Y}`}
          fill={COLOR_KNIFE}
        />
      </g>

      {/* ── LEFT PILE (kept) ── */}
      <rect
        x={leftPileX} y={PILE_BOTTOM_Y - pileH}
        width={PILE_W} height={Math.max(0, pileH)}
        fill={COLOR_KEPT} rx={3}
      />
      <text
        x={LEFT_PILE_CX} y={PILE_BOTTOM_Y + 16}
        textAnchor="middle" fontSize={11} fill="#555" fontFamily="inherit"
      >
        kept
      </text>

      {/* ── RIGHT PILE (tax) ── */}
      <rect
        x={rightPileX} y={PILE_BOTTOM_Y - pileH}
        width={PILE_W} height={Math.max(0, pileH)}
        fill={COLOR_TAX} rx={3}
      />
      <text
        x={RIGHT_PILE_CX} y={PILE_BOTTOM_Y + 16}
        textAnchor="middle" fontSize={11} fill="#555" fontFamily="inherit"
      >
        taxes
      </text>

      {/* ── STATS ── */}
      <text x={leftPileX} y={STATS_Y} fontFamily="inherit">
        <tspan fontSize={14} fontWeight={700} fill={COLOR_KEPT}>{fmt$(kept)}</tspan>
        <tspan fontSize={10} fill="#888"> kept</tspan>
      </text>

      <text x={VW / 2} y={STATS_Y} textAnchor="middle" fontFamily="inherit">
        <tspan fontSize={14} fontWeight={700} fill="#1a5e38">{fmt$(taxesPaid)}</tspan>
        <tspan fontSize={10} fill="#888"> tax paid</tspan>
      </text>

      <text x={rightPileX + PILE_W} y={STATS_Y} textAnchor="end" fontFamily="inherit">
        <tspan fontSize={16} fontWeight={800} fill="#111">{fmtPct(effectiveRate)}</tspan>
        <tspan fontSize={10} fill="#888"> effective rate</tspan>
      </text>

      <text
        x={VW / 2} y={STATS_Y + 18}
        textAnchor="middle" fontSize={9} fill="#ccc" fontFamily="inherit"
      >
        marginal {bracket.label} · effective {fmtPct(effectiveRate)}
      </text>

    </svg>
  );
}
