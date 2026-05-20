import { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import { computeTax, BRACKETS, MAX_STORY_INCOME } from './data';

interface Props {
  income: number;
}

const VW = 520;
const VH = 340;
const ML = 28;
const MR = 28;
const BW = VW - ML - MR; // 464

const BILL_Y = 52;
const BILL_H = 72;
const KNIFE_H = 26;

const BAR_Y = 200;
const BAR_H = 42;

const COLOR_KEPT = '#1a7a4a';
const COLOR_TAX = '#74c69d';
const COLOR_EMPTY = '#dff0e8';

const fmt$ = d3.format('$,.0f');
const fmtPct = d3.format('.1%');

export default function TaxViz({ income }: Props) {
  const knifeGroupRef = useRef<SVGGElement>(null);
  const keptBillRef = useRef<SVGRectElement>(null);

  const { taxesPaid, marginalRate, bracketIndex, effectiveRate, kept } = computeTax(income);
  const bracket = BRACKETS[bracketIndex];

  const cutX = ML + BW * (1 - marginalRate);

  // D3 transition the knife + kept-rect only when bracket changes
  const prevBracketRef = useRef<number>(-1);
  useEffect(() => {
    if (prevBracketRef.current === bracketIndex) return;
    prevBracketRef.current = bracketIndex;

    const newCutX = ML + BW * (1 - bracket.rate);

    if (knifeGroupRef.current) {
      d3.select(knifeGroupRef.current)
        .interrupt()
        .transition().duration(500).ease(d3.easeCubicInOut)
        .attr('transform', `translate(${newCutX}, 0)`);
    }
    if (keptBillRef.current) {
      d3.select(keptBillRef.current)
        .interrupt()
        .transition().duration(500).ease(d3.easeCubicInOut)
        .attr('width', newCutX - ML);
    }
  }, [bracketIndex, bracket.rate]);

  // Sync initial position without transition on first render
  useEffect(() => {
    const initX = ML + BW * (1 - BRACKETS[0].rate);
    if (knifeGroupRef.current) {
      d3.select(knifeGroupRef.current).attr('transform', `translate(${initX}, 0)`);
    }
    if (keptBillRef.current) {
      d3.select(keptBillRef.current).attr('width', initX - ML);
    }
    prevBracketRef.current = 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barTotalW = BW * (income / MAX_STORY_INCOME);
  const keptBarW = income > 0 ? barTotalW * (kept / income) : 0;

  const knifeStartX = ML + BW * (1 - BRACKETS[0].rate); // initial position for SSR

  const keptLabelWidth = cutX - ML;
  const taxLabelWidth = ML + BW - cutX;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>

      {/* === SECTION 1: THE BILL + KNIFE === */}

      {/* Marginal rate label */}
      <text
        x={VW / 2} y={BILL_Y - 14}
        textAnchor="middle" fontSize={12} fill="#555" fontWeight={600}
        fontFamily="inherit"
      >
        Marginal rate: {bracket.label}
      </text>

      {/* Bill background (full = tax color) */}
      <rect x={ML} y={BILL_Y} width={BW} height={BILL_H} fill={COLOR_TAX} rx={3} />

      {/* Kept portion — D3 animates width */}
      <rect
        ref={keptBillRef}
        x={ML} y={BILL_Y}
        width={knifeStartX - ML}
        height={BILL_H}
        fill={COLOR_KEPT}
        rx={3}
      />

      {/* Labels inside bill */}
      {keptLabelWidth > 72 && (
        <text
          x={ML + keptLabelWidth / 2} y={BILL_Y + BILL_H / 2 + 5}
          textAnchor="middle" fontSize={11} fill="white" fontWeight={700}
          fontFamily="inherit" pointerEvents="none"
        >
          You keep
        </text>
      )}
      {taxLabelWidth > 50 && (
        <text
          x={cutX + taxLabelWidth / 2} y={BILL_Y + BILL_H / 2 + 5}
          textAnchor="middle" fontSize={11} fill="#1a4a2a" fontWeight={700}
          fontFamily="inherit" pointerEvents="none"
        >
          Tax
        </text>
      )}

      {/* Knife group — D3 animates transform */}
      <g ref={knifeGroupRef} transform={`translate(${knifeStartX}, 0)`}>
        {/* Cut line */}
        <line
          x1={0} y1={BILL_Y}
          x2={0} y2={BILL_Y + BILL_H}
          stroke="#111" strokeWidth={2}
        />
        {/* Triangle pointing up: tip at bottom of bill */}
        <polygon
          points={`0,${BILL_Y + BILL_H} -11,${BILL_Y + BILL_H + KNIFE_H} 11,${BILL_Y + BILL_H + KNIFE_H}`}
          fill="#111"
        />
        {/* Rate annotation */}
        <text
          y={BILL_Y + BILL_H + KNIFE_H + 16}
          textAnchor="middle" fontSize={10} fill="#333"
          fontFamily="inherit"
        >
          {bracket.label} bracket
        </text>
        {/* Bracket range */}
        <text
          y={BILL_Y + BILL_H + KNIFE_H + 30}
          textAnchor="middle" fontSize={9} fill="#888"
          fontFamily="inherit"
        >
          {fmt$(bracket.min)}
          {bracket.max != null ? ` – ${fmt$(bracket.max)}` : '+'}
        </text>
      </g>

      {/* === SECTION 2: CUMULATIVE BAR === */}

      <text
        x={ML} y={BAR_Y - 12}
        fontSize={11} fill="#555"
        fontFamily="inherit"
      >
        Cumulative income: <tspan fontWeight={700} fill="#222">{fmt$(income)}</tspan>
      </text>

      {/* Empty bar track */}
      <rect x={ML} y={BAR_Y} width={BW} height={BAR_H} fill={COLOR_EMPTY} rx={3} />

      {/* Kept portion */}
      <rect x={ML} y={BAR_Y} width={keptBarW} height={BAR_H} fill={COLOR_KEPT} rx={3} />
      {/* Tax portion (no rounded left corners) */}
      {taxesPaid > 0 && (
        <rect
          x={ML + keptBarW} y={BAR_Y}
          width={barTotalW - keptBarW} height={BAR_H}
          fill={COLOR_TAX}
        />
      )}

      {/* === SECTION 3: STATS === */}

      <text x={ML} y={BAR_Y + BAR_H + 22} fontFamily="inherit">
        <tspan fontSize={13} fontWeight={700} fill={COLOR_KEPT}>{fmt$(kept)}</tspan>
        <tspan fontSize={10} fill="#888"> kept</tspan>
      </text>

      <text x={VW / 2} y={BAR_Y + BAR_H + 22} textAnchor="middle" fontFamily="inherit">
        <tspan fontSize={13} fontWeight={700} fill="#1a5e38">{fmt$(taxesPaid)}</tspan>
        <tspan fontSize={10} fill="#888"> tax paid</tspan>
      </text>

      <text x={ML + BW} y={BAR_Y + BAR_H + 22} textAnchor="end" fontFamily="inherit">
        <tspan fontSize={15} fontWeight={800} fill="#222">{fmtPct(effectiveRate)}</tspan>
        <tspan fontSize={10} fill="#888"> effective rate</tspan>
      </text>

      {/* Marginal vs effective note */}
      <text
        x={VW / 2} y={BAR_Y + BAR_H + 42}
        textAnchor="middle" fontSize={10} fill="#aaa"
        fontFamily="inherit"
      >
        marginal {bracket.label} · effective {fmtPct(effectiveRate)}
      </text>

    </svg>
  );
}
