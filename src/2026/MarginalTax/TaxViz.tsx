import { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { computeTax, BRACKETS, MAX_STORY_INCOME } from './data';

interface Props {
  income: number;
}

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 520;
const VH = 400;

const BILL_W = 172;
const BILL_H = 46;
const BILL_LX = VW / 2 - BILL_W / 2; // 174

const TOP_Y = 18;
const KNIFE_TIP_Y = 172;
const KNIFE_BLADE_Y = 204;

// Stack sits directly below the knife, same width as the bill
const STACK_W    = BILL_W;
const STACK_LEFT = BILL_LX;
const STACK_BOTTOM_Y = 338;
const STACK_MAX_H    = 110; // at MAX_STORY_INCOME — leaves room for floating labels above

const STATS_Y = 355;

const CUT_THRESH     = 0.70;
const N_STREAM       = 1;
const INCOME_PER_BILL = 100;

// ── Colors ────────────────────────────────────────────────────────────────────
const COLOR_BILL  = '#2da065';
const COLOR_KEPT  = '#1a7a4a'; // dark green — kept
const COLOR_TAX   = '#74c69d'; // light green — taxed
const COLOR_KNIFE = '#1a1a1a';

const fmt$   = d3.format('$,.0f');
const fmtPct = d3.format('.1%');

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function billYForPhase(phase: number): number {
  if (phase >= CUT_THRESH) return KNIFE_TIP_Y;
  return TOP_Y + (phase / CUT_THRESH) * (KNIFE_TIP_Y - TOP_Y);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TaxViz({ income }: Props) {
  const knifeRef       = useRef<SVGGElement>(null);
  const prevBracketRef = useRef<number>(-1);

  const { marginalRate, bracketIndex } = useMemo(() => computeTax(income), [income]);

  const billCycles    = income / INCOME_PER_BILL;
  const discreteIncome = Math.floor(billCycles) * INCOME_PER_BILL;
  const { effectiveRate } = useMemo(() => computeTax(discreteIncome), [discreteIncome]);

  const bracket   = BRACKETS[bracketIndex];
  const cutOffset = BILL_W * (1 - marginalRate); // px from BILL_LX to the cut

  // D3 transitions knife when bracket changes
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

  // Initial knife position (no transition)
  useEffect(() => {
    if (!knifeRef.current) return;
    const init = BILL_W * (1 - BRACKETS[0].rate);
    d3.select(knifeRef.current).attr('transform', `translate(${BILL_LX + init}, 0)`);
    prevBracketRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Streaming bill ──────────────────────────────────────────────────────────
  const currentPhase = billCycles % 1;
  const streamBills: { slot: number; phase: number }[] = [];
  for (let slot = 0; slot < N_STREAM; slot++) {
    const minIncome = slot * (INCOME_PER_BILL / N_STREAM);
    if (income < minIncome) continue;
    const phase = (currentPhase + slot * (1 / N_STREAM)) % 1;
    streamBills.push({ slot, phase });
  }

  // ── Bracket stack segments ──────────────────────────────────────────────────
  // Each bracket's portion of earned income becomes a proportional-height strip.
  // Strip is split dark (kept) / light (taxed) at (1 - rate).
  const stackSegments = useMemo(() => {
    if (discreteIncome <= 0) return [];
    let y = STACK_BOTTOM_Y;
    return BRACKETS.flatMap((b) => {
      if (b.min >= discreteIncome) return [];
      const inBracket = Math.min(discreteIncome, b.max ?? Infinity) - b.min;
      const heightPx  = (inBracket / MAX_STORY_INCOME) * STACK_MAX_H;
      const keptW     = STACK_W * (1 - b.rate);
      y -= heightPx;
      return [{ y, heightPx, keptW }];
    });
  }, [discreteIncome]);

  return (
    <div>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>

      {/* Bracket label */}
      <text x={VW / 2} y={12} textAnchor="middle" fontSize={11} fill="#888" fontFamily="inherit">
        {bracket.label} bracket · {fmt$(bracket.min)}
        {bracket.max != null ? ` – ${fmt$(bracket.max)}` : '+'}
      </text>

      {/* ── BILLS ── */}
      {streamBills.map(({ slot, phase }) => {
        const billY    = billYForPhase(phase);
        const isCutting = phase >= CUT_THRESH;
        const splitT   = isCutting ? (phase - CUT_THRESH) / (1 - CUT_THRESH) : 0;
        const opacity  = isCutting ? Math.max(0, 1 - splitT) : 1;
        const leftHalfW  = cutOffset;
        const rightHalfW = BILL_W - cutOffset;

        if (!isCutting) {
          const clipId = `bill-clip-${slot}`;
          return (
            <g key={slot} opacity={opacity}>
              <defs>
                <clipPath id={clipId}>
                  <rect x={BILL_LX} y={billY} width={BILL_W} height={BILL_H} rx={4} />
                </clipPath>
              </defs>
              {/* Bill as two colors clipped to rounded rect */}
              <g clipPath={`url(#${clipId})`}>
                <rect x={BILL_LX}             y={billY} width={cutOffset}          height={BILL_H} fill={COLOR_KEPT} />
                <rect x={BILL_LX + cutOffset} y={billY} width={BILL_W - cutOffset} height={BILL_H} fill={COLOR_TAX}  />
              </g>
              <text
                x={BILL_LX + BILL_W / 2} y={billY + BILL_H / 2 + 5}
                textAnchor="middle" fontSize={13} fill="white" fontWeight={700} fontFamily="inherit"
              >
                $100
              </text>
            </g>
          );
        }

        // Halves stay side by side, fall straight down, and compress ("laying flat")
        const splitH = lerp(BILL_H, 2, splitT);
        const splitY = lerp(KNIFE_TIP_Y, STACK_BOTTOM_Y - 1, splitT);

        return (
          <g key={slot} opacity={opacity}>
            <rect x={BILL_LX}             y={splitY} width={leftHalfW}  height={splitH} fill={COLOR_KEPT} rx={1} />
            <rect x={BILL_LX + cutOffset} y={splitY} width={rightHalfW} height={splitH} fill={COLOR_TAX}  rx={1} />
          </g>
        );
      })}

      {/* ── KNIFE ── */}
      <line
        x1={BILL_LX - 12} y1={KNIFE_BLADE_Y}
        x2={BILL_LX + BILL_W + 12} y2={KNIFE_BLADE_Y}
        stroke={COLOR_KNIFE} strokeWidth={1.5}
      />
      <g ref={knifeRef}>
        <polygon
          points={`0,${KNIFE_TIP_Y} -5,${KNIFE_BLADE_Y} 5,${KNIFE_BLADE_Y}`}
          fill={COLOR_KNIFE}
        />
      </g>

      {/* Kept / tax labels below the knife blade */}
      <text x={STACK_LEFT + 6} y={KNIFE_BLADE_Y + 16}
        fontSize={10} fill={COLOR_KEPT} fontWeight={600} fontFamily="inherit">kept</text>
      <text x={STACK_LEFT + STACK_W - 6} y={KNIFE_BLADE_Y + 16}
        textAnchor="end" fontSize={10} fill={COLOR_TAX} fontWeight={600} fontFamily="inherit">tax</text>

      {/* Stack container — faint outline shows full potential height */}
      <rect
        x={STACK_LEFT} y={STACK_BOTTOM_Y - STACK_MAX_H}
        width={STACK_W} height={STACK_MAX_H}
        fill="none" stroke="#ebebeb" strokeWidth={1} rx={2}
      />

      {/* ── STACK ── bracket segments, lowest bracket anchored at bottom */}
      {stackSegments.map((seg, i) => (
        <g key={i}>
          <rect x={STACK_LEFT}            y={seg.y} width={seg.keptW}            height={seg.heightPx} fill={COLOR_KEPT} />
          <rect x={STACK_LEFT + seg.keptW} y={seg.y} width={STACK_W - seg.keptW} height={seg.heightPx} fill={COLOR_TAX}  />
        </g>
      ))}


      {/* ── INCOME COUNTER ── */}
      <text x={VW / 2} y={STATS_Y} textAnchor="middle" fontFamily="inherit">
        <tspan fontSize={13} fontWeight={600} fill="#555">{fmt$(discreteIncome)}</tspan>
        <tspan dx={4} fontSize={10} fill="#bbb">income</tspan>
      </text>

      </svg>
      <div className="tax-rate-legend">
        <div className="rate-chip rate-chip--marginal">
          <span className="rate-chip__value">{fmtPct(marginalRate)}</span>
          <span className="rate-chip__label">marginal rate</span>
        </div>
        {effectiveRate > 0 && (
          <div className="rate-chip rate-chip--effective">
            <span className="rate-chip__value">{fmtPct(effectiveRate)}</span>
            <span className="rate-chip__label">effective rate</span>
          </div>
        )}
      </div>
    </div>
  );
}
