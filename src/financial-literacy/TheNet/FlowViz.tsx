import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Archetype, CategoryType, netMonthly } from './data';

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 520;
const VH = 490;
const BAR_X = 28;
const BAR_W = 88;
const BAR_RIGHT = BAR_X + BAR_W;
const BAR_Y = 72;
const BAR_H = 340;
const BAR_BOTTOM = BAR_Y + BAR_H;
const CHIP_X = 200;

// ── Colors / labels ───────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  taxes:         '#b5372d',
  fixed:         '#1e3a5f',
  variable:      '#426a8c',
  discretionary: '#7aa3c5',
  net:           '#2d6a4f',
};

const CAT_LABEL: Record<string, string> = {
  taxes:         'Taxes',
  fixed:         'Fixed',
  variable:      'Variable',
  discretionary: 'Discretionary',
};

const CAT_ORDER = ['taxes', 'fixed', 'variable', 'discretionary'] as const;

// ── Display items ─────────────────────────────────────────────────────────────
interface DisplayItem {
  id: string;
  label: string;
  amount: number;
  category: string;
}

// Taxes first (withheld), then archetype items already ordered fixed→variable→disc
function buildDisplayItems(a: Archetype): DisplayItem[] {
  return [
    { id: 'taxes', label: 'Federal, state & FICA taxes', amount: a.taxesMonthly, category: 'taxes' },
    ...a.items.map((item, i) => ({
      id: `item-${i}`,
      label: item.label,
      amount: item.amount,
      category: item.type as CategoryType,
    })),
  ];
}

// ── Bar segments ──────────────────────────────────────────────────────────────
interface BarSeg {
  category: string;
  amount: number;
  y: number;
  h: number;
  color: string;
  midY: number;
}

// paidFraction 0→1: each item fills in sequentially as the fraction climbs.
function buildBarSegs(items: DisplayItem[], paidFraction: number, gross: number): BarSeg[] {
  const scale = BAR_H / gross;
  const catAmounts: Record<string, number> = {};

  for (let i = 0; i < items.length; i++) {
    const progress = Math.max(0, Math.min(1, paidFraction * items.length - i));
    catAmounts[items[i].category] = (catAmounts[items[i].category] ?? 0) + items[i].amount * progress;
  }

  const segs: BarSeg[] = [];
  let y = BAR_Y;
  let totalPaid = 0;

  for (const cat of CAT_ORDER) {
    const amount = catAmounts[cat] ?? 0;
    if (amount < 0.5) continue;
    const h = amount * scale;
    segs.push({ category: cat, amount, y, h, color: CAT_COLOR[cat], midY: y + h / 2 });
    y += h;
    totalPaid += amount;
  }

  const remaining = gross - totalPaid;
  if (remaining > 0.5) {
    const h = remaining * scale;
    segs.push({ category: 'net', amount: remaining, y, h, color: CAT_COLOR.net, midY: y + h / 2 });
  }

  return segs;
}

// ── Phase ─────────────────────────────────────────────────────────────────────
export type VizPhase = 'items' | 'grouped' | 'gap' | 'month2' | 'month3';

const fmt$ = d3.format('$,.0f');

// ── Component ─────────────────────────────────────────────────────────────────
export default function FlowViz({
  archetype,
  visibleItems,
  phase,
}: {
  archetype: Archetype;
  visibleItems: number;
  phase: VizPhase;
}) {
  const displayItems = buildDisplayItems(archetype);
  const [cycleProgress, setCycleProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(phase);

  // Auto-animate bar fill for month2 / month3
  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== 'month2' && phase !== 'month3') return;

    const duration = phase === 'month2' ? 1800 : 1200;
    setCycleProgress(0);
    const t0 = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      if (phaseRef.current !== phase) return;
      const t = d3.easeCubicInOut(Math.min((now - t0) / duration, 1));
      setCycleProgress(t);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  const isCycling = phase === 'month2' || phase === 'month3';
  const paidFraction = isCycling ? cycleProgress : visibleItems / displayItems.length;
  const barSegs = buildBarSegs(displayItems, paidFraction, archetype.grossMonthly);

  const showGrouped = phase === 'grouped' || phase === 'gap';
  const showGap = phase === 'gap' || (isCycling && cycleProgress >= 1);
  const net = netMonthly(archetype);
  const chipH = BAR_H / displayItems.length;

  const monthLabel = phase === 'month2' ? 'Month 2' : phase === 'month3' ? 'Month 3' : null;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Gross label */}
      <text
        x={BAR_X + BAR_W / 2} y={48}
        textAnchor="middle" fontSize={13} fontWeight={700} fill="#333" fontFamily="inherit"
      >
        {fmt$(archetype.grossMonthly)}/mo gross
      </text>

      {monthLabel && (
        <text
          x={BAR_X + BAR_W / 2} y={64}
          textAnchor="middle" fontSize={9} fill="#aaa" fontFamily="inherit"
        >
          {monthLabel}
        </text>
      )}

      {/* Bar background track */}
      <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} fill="#eeeeee" rx={3} />

      {/* Bar segments — fill from top as expenses accumulate */}
      {barSegs.map(seg => (
        <rect
          key={seg.category}
          x={BAR_X}
          y={seg.y}
          width={BAR_W}
          height={Math.max(seg.h, 0)}
          fill={seg.color}
          opacity={showGap && seg.category !== 'net' ? 0.35 : 1}
          rx={seg.category === 'net' ? 2 : 0}
          style={{ transition: 'opacity 450ms ease' }}
        />
      ))}

      {/* Thin white dividers between segments */}
      {barSegs.slice(0, -1).map((seg, i) => (
        <line
          key={`div-${i}`}
          x1={BAR_X} y1={seg.y + seg.h}
          x2={BAR_RIGHT} y2={seg.y + seg.h}
          stroke="white" strokeWidth={1.5} opacity={0.5}
        />
      ))}

      {/* Individual expense chips — slide in from the right */}
      {displayItems.map((item, i) => {
        const cy = BAR_Y + i * chipH + chipH / 2;
        const isVisible = i < visibleItems || isCycling;
        const opacity =
          showGrouped ? 0.1
          : isCycling  ? 0.3
          : isVisible  ? 1
          : 0;
        const tx = isVisible || showGrouped || isCycling
          ? 'translateX(0)'
          : 'translateX(30px)';

        return (
          <g
            key={item.id}
            style={{
              opacity,
              transform: tx,
              transition: 'opacity 350ms ease, transform 350ms ease',
            }}
          >
            <rect
              x={CHIP_X} y={cy - 9}
              width={5} height={18}
              fill={CAT_COLOR[item.category]} rx={1.5}
            />
            <text x={CHIP_X + 11} y={cy - 1} fontSize={9} fill="#666" fontFamily="inherit">
              {item.label}
            </text>
            <text x={CHIP_X + 11} y={cy + 11} fontSize={11} fontWeight={600} fill="#222" fontFamily="inherit">
              {fmt$(item.amount)}
            </text>
          </g>
        );
      })}

      {/* Summary chips — grouped/gap phases, aligned to their bar segment */}
      {showGrouped && barSegs
        .filter(seg => seg.category !== 'net')
        .map(seg => {
          // Clamp label so tiny segments (discretionary ~20px) stay readable
          const labelY = Math.min(Math.max(seg.midY, BAR_Y + 12), BAR_BOTTOM - 16);
          return (
            <g key={`grp-${seg.category}`}>
              <line
                x1={BAR_RIGHT + 6} y1={seg.midY}
                x2={CHIP_X - 8}    y2={seg.midY}
                stroke="#ccc" strokeWidth={1}
              />
              <text
                x={CHIP_X} y={labelY - 3}
                fontSize={10} fontWeight={700}
                fill={CAT_COLOR[seg.category]} fontFamily="inherit"
              >
                {CAT_LABEL[seg.category]}
              </text>
              <text
                x={CHIP_X} y={labelY + 11}
                fontSize={12} fontWeight={600} fill="#333" fontFamily="inherit"
              >
                {fmt$(seg.amount)}
              </text>
            </g>
          );
        })
      }

      {/* Net annotation below bar */}
      <text
        x={BAR_X + BAR_W / 2}
        y={BAR_BOTTOM + 28}
        textAnchor="middle"
        fontSize={14} fontWeight={700}
        fill={net >= 0 ? CAT_COLOR.net : '#b5372d'}
        fontFamily="inherit"
        opacity={showGap ? 1 : 0}
        style={{ transition: 'opacity 450ms ease' }}
      >
        Net: {net >= 0 ? '+' : ''}{fmt$(net)}/mo
      </text>
    </svg>
  );
}
