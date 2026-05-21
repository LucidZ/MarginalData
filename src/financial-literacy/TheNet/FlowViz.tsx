import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Archetype, CategoryType, netMonthly } from './data';
import { AlexAvatarSvg } from './AlexAvatar';

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 520;
const VH = 490;
const BAR_X = 28;
const BAR_W = 88;
const BAR_RIGHT = BAR_X + BAR_W;
const BAR_Y = 72;
const BAR_H = 340;
const BAR_BOTTOM = BAR_Y + BAR_H;

const EXPENSE_X = BAR_RIGHT + 36;          // 152
const EXPENSE_W = BAR_W;                   // same width — chunks fit flush
const EXPENSE_RIGHT = EXPENSE_X + EXPENSE_W; // 240
const LABEL_X = EXPENSE_RIGHT + 10;        // 250
const TRANSLATE_X = EXPENSE_X - BAR_X;    // 124 — pure horizontal slide

const MIN_LABEL_H = 18; // px — skip inline label if chunk is shorter than this

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

// ── Types ─────────────────────────────────────────────────────────────────────
interface DisplayItem {
  id: string;
  label: string;
  amount: number;
  category: string;
}

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

export type VizPhase = 'items' | 'grouped' | 'gap' | 'month2' | 'month3';

const fmt$ = d3.format('$,.0f');

// ── Component ─────────────────────────────────────────────────────────────────
export default function FlowViz({
  archetype,
  visibleItems,
  phase,
  stage,
}: {
  archetype: Archetype;
  visibleItems: number;
  phase: VizPhase;
  stage?: number;
}) {
  const items = buildDisplayItems(archetype);
  const n = items.length;
  const gross = archetype.grossMonthly;
  const scale = BAR_H / gross;
  const net = netMonthly(archetype);

  // Track previous visibleItems to compute stagger delay for newly-arrived items
  const prevVisibleRef = useRef(visibleItems);

  const [cycleProgress, setCycleProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(phase);

  // Auto-animate chunks flying out for month2 / month3
  useEffect(() => {
    phaseRef.current = phase;
    if (phase !== 'month2' && phase !== 'month3') return;

    const duration = phase === 'month2' ? 1800 : 1200;
    setCycleProgress(0); // snaps chunks back to income bar, then animates out
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

  // Capture prev before effect updates it
  const prevVisible = prevVisibleRef.current;
  useEffect(() => {
    prevVisibleRef.current = visibleItems;
  });

  const isCycling = phase === 'month2' || phase === 'month3';
  const showGrouped = phase === 'grouped' || phase === 'gap';
  const showGap = phase === 'gap' || (isCycling && cycleProgress >= 1);
  const monthLabel = phase === 'month2' ? 'Month 2' : phase === 'month3' ? 'Month 3' : null;

  // ── Compute chunk geometry ──────────────────────────────────────────────────
  let cumulativeH = 0;
  const chunks = items.map((item, i) => {
    const h = item.amount * scale;
    const y = BAR_Y + cumulativeH;
    cumulativeH += h;

    // flyProgress: 0 = chunk is in income bar, 1 = chunk is in expense box
    let flyProgress: number;
    if (isCycling) {
      // Stagger: chunk i starts flying when cycleProgress passes i/n.
      // 0.7 spread per item creates a smooth cascade.
      flyProgress = d3.easeCubicInOut(Math.max(0, Math.min(1, (cycleProgress * n - i) / 0.7)));
    } else {
      flyProgress = i < visibleItems ? 1 : 0;
    }

    // CSS transition stagger only for the items phase
    const isNewlyVisible = !isCycling && i >= prevVisible && i < visibleItems;
    const delay = isNewlyVisible ? `${(i - prevVisible) * 110}ms` : '0ms';

    return { ...item, h, y, flyProgress, delay, isLanded: flyProgress > 0 };
  });

  // Net segment: stays in income bar; appears after the last chunk flies out
  const netY = BAR_Y + cumulativeH;
  const netH = Math.max(0, net * scale);
  const lastFlyProgress = chunks[n - 1]?.flyProgress ?? 0;
  const netOpacity = isCycling ? lastFlyProgress : visibleItems >= n ? 1 : 0;

  // Category summary segments for grouped phase (bracket labels)
  const catSegs: { category: string; y: number; h: number; amount: number }[] = [];
  if (showGrouped) {
    let y = BAR_Y;
    const catAmts: Record<string, number> = {};
    chunks.forEach(c => { catAmts[c.category] = (catAmts[c.category] ?? 0) + c.amount; });
    for (const cat of CAT_ORDER) {
      const amount = catAmts[cat] ?? 0;
      if (amount < 1) continue;
      const h = amount * scale;
      catSegs.push({ category: cat, y, h, amount });
      y += h;
    }
  }

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
        {fmt$(gross)}/mo gross
      </text>

      <text
        x={BAR_X + BAR_W / 2} y={64}
        textAnchor="middle" fontSize={9} fill="#aaa" fontFamily="inherit"
      >
        {monthLabel ?? archetype.description}
      </text>

      {/* Income bar outline — always full height, the "container" */}
      <rect
        x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H}
        fill="none" stroke="#ccc" strokeWidth={1.5} rx={3}
      />

      {/* Net segment — stays inside income bar after everything else drains */}
      {netH > 1 && (
        <rect
          x={BAR_X} y={netY} width={BAR_W} height={netH}
          fill={CAT_COLOR.net} rx={2}
          opacity={netOpacity}
          style={{ transition: isCycling ? 'none' : 'opacity 450ms ease' }}
        />
      )}

      {/* ── Chunks + expense boxes ─────────────────────────────────── */}
      {chunks.map(chunk => {
        const tx = chunk.flyProgress * TRANSLATE_X;
        const expenseOpacity = chunk.isLanded ? (showGrouped ? 0.25 : 0.55) : 0;
        const chunkOpacity = showGap ? 0.3 : 1;
        const showLabel = !showGrouped && chunk.h >= MIN_LABEL_H;

        return (
          <g key={chunk.id}>
            {/* Expense box outline — appears when chunk arrives */}
            <rect
              x={EXPENSE_X} y={chunk.y}
              width={EXPENSE_W} height={Math.max(chunk.h, 0)}
              fill="none"
              stroke={CAT_COLOR[chunk.category]}
              strokeWidth={1}
              opacity={expenseOpacity}
              style={{
                transition: isCycling
                  ? 'none'
                  : `opacity 250ms ease ${chunk.delay}`,
              }}
            />

            {/* The flying chunk — slides from income bar to expense box */}
            <rect
              x={BAR_X} y={chunk.y}
              width={BAR_W} height={Math.max(chunk.h, 0)}
              fill={isCycling
                ? d3.interpolateRgb(CAT_COLOR.net, CAT_COLOR[chunk.category])(chunk.flyProgress)
                : chunk.isLanded ? CAT_COLOR[chunk.category] : CAT_COLOR.net
              }
              opacity={chunkOpacity}
              style={{
                transform: `translateX(${tx}px)`,
                transition: isCycling
                  ? 'opacity 450ms ease'
                  : `transform 480ms cubic-bezier(0.4, 0, 0.2, 1) ${chunk.delay}, fill 400ms ease ${chunk.delay}, opacity 450ms ease`,
              }}
            />

            {/* Item label — only when chunk is tall enough */}
            {showLabel && (
              <g
                opacity={chunk.isLanded ? 1 : 0}
                style={{
                  transition: isCycling
                    ? 'none'
                    : `opacity 280ms ease ${chunk.delay}`,
                }}
              >
                <text
                  x={LABEL_X} y={chunk.y + chunk.h / 2 - 2}
                  fontSize={9} fill="#888" fontFamily="inherit"
                >
                  {chunk.label}
                </text>
                <text
                  x={LABEL_X} y={chunk.y + chunk.h / 2 + 10}
                  fontSize={11} fontWeight={600} fill="#222" fontFamily="inherit"
                >
                  {fmt$(chunk.amount)}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Category bracket labels — grouped / gap phases */}
      {showGrouped && catSegs.map(seg => {
        const midY = seg.y + seg.h / 2;
        const labelY = Math.min(Math.max(midY, BAR_Y + 12), BAR_BOTTOM - 16);
        return (
          <g key={`grp-${seg.category}`}>
            <line
              x1={EXPENSE_RIGHT + 5} y1={seg.y + 2}
              x2={EXPENSE_RIGHT + 5} y2={seg.y + seg.h - 2}
              stroke={CAT_COLOR[seg.category]} strokeWidth={2} strokeLinecap="round"
            />
            <text
              x={LABEL_X} y={labelY - 3}
              fontSize={10} fontWeight={700}
              fill={CAT_COLOR[seg.category]} fontFamily="inherit"
            >
              {CAT_LABEL[seg.category]}
            </text>
            <text
              x={LABEL_X} y={labelY + 11}
              fontSize={12} fontWeight={600} fill="#333" fontFamily="inherit"
            >
              {fmt$(seg.amount)}
            </text>
          </g>
        );
      })}

      {/* Net annotation below income bar */}
      <text
        x={BAR_X + BAR_W / 2} y={BAR_BOTTOM + 28}
        textAnchor="middle" fontSize={14} fontWeight={700}
        fill={net >= 0 ? CAT_COLOR.net : '#b5372d'} fontFamily="inherit"
        opacity={showGap ? 1 : 0}
        style={{ transition: 'opacity 450ms ease' }}
      >
        Net: {net >= 0 ? '+' : ''}{fmt$(net)}/mo
      </text>

      {/* Life stage avatar — upper-right clear zone, placeholder for commissioned art */}
      {stage !== undefined && (
        <g style={{ transition: 'opacity 400ms ease' }}>
          <AlexAvatarSvg stage={stage} />
        </g>
      )}
    </svg>
  );
}
