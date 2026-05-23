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

const EXPENSE_X = BAR_RIGHT + 36;
const EXPENSE_W = BAR_W;
const EXPENSE_RIGHT = EXPENSE_X + EXPENSE_W;
const LABEL_X = EXPENSE_RIGHT + 10;
const TRANSLATE_X = EXPENSE_X - BAR_X;

const MIN_LABEL_H = 18;

// ── Colors / labels ───────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  taxes:         '#b5372d',
  fixed:         '#1e3a5f',
  variable:      '#426a8c',
  discretionary: '#7aa3c5',
  net:           '#2d6a4f',
};

const SCATTER_GRAY = '#b8b8b8';

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

export type VizPhase = 'items' | 'grouped' | 'gap' | 'month2' | 'month3' | 'scatter' | 'categorizing';

const fmt$ = d3.format('$,.0f');

const shortLabel = (label: string) => label.replace(/\s*[,(+].*/, '').trim();

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ── Scatter positions for student stage (8 items) ─────────────────────────────
// Hand-placed so items spread across the SVG, visually far from their stacked positions.
const STUDENT_SCATTER: { x: number; y: number; rot: number }[] = [
  { x: 330, y: 88,  rot: -5 }, // 0: taxes       stacked→(152, 72)
  { x: 165, y: 228, rot:  3 }, // 1: rent        stacked→(152, 106)
  { x: 415, y: 148, rot: -8 }, // 2: phone       stacked→(152, 254)
  { x: 385, y: 75,  rot:  6 }, // 3: subscriptions stacked→(152, 264)
  { x: 278, y: 382, rot: -4 }, // 4: groceries   stacked→(152, 270)
  { x: 415, y: 298, rot:  7 }, // 5: bus pass    stacked→(152, 331)
  { x: 155, y: 92,  rot: -6 }, // 6: dining+social stacked→(152, 349)
  { x: 338, y: 188, rot:  4 }, // 7: clothing+misc stacked→(152, 419)
];

// Category timing within the normalized categorizeProgress (0–1).
// Each category starts at `start` and completes within `window`.
const CAT_TIMING: Record<string, { start: number; window: number }> = {
  taxes:         { start: 0.00, window: 0.26 },
  fixed:         { start: 0.20, window: 0.26 },
  variable:      { start: 0.44, window: 0.26 },
  discretionary: { start: 0.66, window: 0.26 },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function FlowViz({
  archetype,
  visibleItems,
  phase,
  stage,
  stepProgress,
}: {
  archetype: Archetype;
  visibleItems: number;
  phase: VizPhase;
  stage?: number;
  stepProgress: number;
}) {
  const items = buildDisplayItems(archetype);
  const n = items.length;
  const gross = archetype.grossMonthly;
  const scale = BAR_H / gross;
  const net = netMonthly(archetype);

  const [cycleProgress, setCycleProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef(phase);

  // month2 / month3 cycle animation
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
  const isScatter = phase === 'scatter';
  const isCategorizing = phase === 'categorizing';
  const showGrouped = phase === 'grouped' || phase === 'gap';
  const showGap = phase === 'gap' || (isCycling && cycleProgress >= 1);
  const monthLabel = phase === 'month2' ? 'Month 2' : phase === 'month3' ? 'Month 3' : null;

  const itemScale = (i: number): number => {
    if (i === visibleItems - 1) return d3.easeCubicOut(stepProgress);
    return i < visibleItems - 1 ? 1 : 0;
  };

  // ── Chunk geometry ────────────────────────────────────────────────────────
  let cumulativeH = 0;
  const chunks = items.map((item, i) => {
    const h = item.amount * scale;
    const stackedY = BAR_Y + cumulativeH;
    cumulativeH += h;

    // Per-category progress for categorizing animation
    const timing = CAT_TIMING[item.category];
    const rawCatT = timing ? (stepProgress - timing.start) / timing.window : 0;
    const catProgress = d3.easeCubicInOut(Math.max(0, Math.min(1, rawCatT)));

    let flyProgress: number;
    if (isCycling) {
      flyProgress = d3.easeCubicInOut(Math.max(0, Math.min(1, (cycleProgress * n - i) / 0.7)));
    } else if (isScatter || isCategorizing) {
      flyProgress = 1;
    } else {
      flyProgress = i < visibleItems ? 1 : 0;
    }

    const scatter = STUDENT_SCATTER[i] ?? { x: EXPENSE_X, y: stackedY, rot: 0 };

    return { ...item, h, stackedY, flyProgress, isLanded: flyProgress > 0, catProgress, scatter };
  });

  const netY = BAR_Y + cumulativeH;
  const netH = Math.max(0, net * scale);
  const lastFlyProgress = chunks[n - 1]?.flyProgress ?? 0;
  const netOpacity = isCycling ? lastFlyProgress : visibleItems >= n ? 1 : 0;

  // Category summary segments (grouped / gap / categorizing)
  const catSegs: { category: string; y: number; h: number; amount: number }[] = [];
  if (showGrouped || isCategorizing) {
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

      {/* Income bar outline */}
      <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H}
        fill="none" stroke="#ccc" strokeWidth={1.5} rx={3} />

      {/* Subtle fill during scatter so the bar reads as "your money" */}
      {isScatter && (
        <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H}
          fill="#f5f5f5" rx={3} />
      )}

      {/* Net segment — hidden during scatter / categorizing */}
      {!isScatter && !isCategorizing && netH > 1 && (
        <rect
          x={BAR_X} y={netY} width={BAR_W} height={netH}
          fill={CAT_COLOR.net} rx={2}
          opacity={netOpacity}
          style={{ transition: isCycling ? 'none' : 'opacity 450ms ease' }}
        />
      )}

      {/* ── Scatter phase: items scrub in at jittered positions, all gray ─── */}
      {isScatter && chunks.map((chunk, i) => {
        const sc = itemScale(i);
        if (sc === 0) return null;
        const s = chunk.scatter;
        const cx = s.x + BAR_W / 2;
        const cy = s.y + chunk.h / 2;
        return (
          <g key={chunk.id} transform={`translate(${cx},${cy}) rotate(${s.rot})`}>
            <g transform={`scale(${sc})`}>
              <rect
                x={-BAR_W / 2} y={-Math.max(chunk.h, 8) / 2}
                width={BAR_W} height={Math.max(chunk.h, 8)}
                fill={SCATTER_GRAY} rx={2}
              />
              <text
                x={0} y={-Math.max(chunk.h, 8) / 2 - 14}
                textAnchor="middle"
                fontSize={8} fill="#555" fontFamily="inherit"
                style={{ pointerEvents: 'none' }}
              >
                {shortLabel(chunk.label)}
              </text>
              <text
                x={0} y={-Math.max(chunk.h, 8) / 2 - 3}
                textAnchor="middle"
                fontSize={10} fontWeight={700}
                fill="#b5372d" fontFamily="inherit"
                style={{ pointerEvents: 'none' }}
              >
                -{fmt$(chunk.amount)}
              </text>
            </g>
          </g>
        );
      })}

      {/* ── Categorizing phase: RAF-driven slide from scatter → stack ──── */}
      {isCategorizing && chunks.map(chunk => {
        const s = chunk.scatter;
        const cp = chunk.catProgress;

        // Interpolate center position
        const fromCx = s.x + BAR_W / 2;
        const fromCy = s.y + chunk.h / 2;
        const toCx = EXPENSE_X + BAR_W / 2;
        const toCy = chunk.stackedY + chunk.h / 2;
        const cx = lerp(fromCx, toCx, cp);
        const cy = lerp(fromCy, toCy, cp);
        const rot = lerp(s.rot, 0, cp);

        const fill = d3.interpolateRgb(SCATTER_GRAY, CAT_COLOR[chunk.category])(cp);

        return (
          <g key={chunk.id}>
            <g transform={`translate(${cx},${cy}) rotate(${rot})`}>
              <rect
                x={-BAR_W / 2} y={-chunk.h / 2}
                width={BAR_W} height={Math.max(chunk.h, 4)}
                fill={fill} rx={2}
              />
            </g>

          </g>
        );
      })}

      {/* Category bracket labels during categorizing — fade in after each group lands */}
      {isCategorizing && catSegs.map(seg => {
        const timing = CAT_TIMING[seg.category];
        const landedAt = timing.start + timing.window * 0.85;
        const bracketOpacity = Math.max(0, Math.min(1, (stepProgress - landedAt) / 0.08));
        if (bracketOpacity <= 0) return null;

        const midY = seg.y + seg.h / 2;
        const labelY = Math.min(Math.max(midY, BAR_Y + 12), BAR_BOTTOM - 16);
        return (
          <g key={`cat-${seg.category}`} opacity={bracketOpacity}>
            <line
              x1={EXPENSE_RIGHT + 5} y1={seg.y + 2}
              x2={EXPENSE_RIGHT + 5} y2={seg.y + seg.h - 2}
              stroke={CAT_COLOR[seg.category]} strokeWidth={2} strokeLinecap="round"
            />
            <text x={LABEL_X} y={labelY - 3}
              fontSize={10} fontWeight={700}
              fill={CAT_COLOR[seg.category]} fontFamily="inherit"
            >
              {CAT_LABEL[seg.category]}
            </text>
            <text x={LABEL_X} y={labelY + 11}
              fontSize={12} fontWeight={600} fill="#333" fontFamily="inherit"
            >
              {fmt$(seg.amount)}
            </text>
          </g>
        );
      })}

      {/* ── Normal items / grouped / gap / cycling phases ─────────────── */}
      {!isScatter && !isCategorizing && chunks.map(chunk => {
        const tx = chunk.flyProgress * TRANSLATE_X;
        const expenseOpacity = chunk.isLanded ? (showGrouped ? 0.25 : 0.55) : 0;
        const chunkOpacity = showGap ? 0.3 : 1;
        const showLabel = !showGrouped && chunk.h >= MIN_LABEL_H;

        return (
          <g key={chunk.id}>
            <rect
              x={EXPENSE_X} y={chunk.stackedY}
              width={EXPENSE_W} height={Math.max(chunk.h, 0)}
              fill="none"
              stroke={CAT_COLOR[chunk.category]}
              strokeWidth={1}
              opacity={expenseOpacity}
              style={{
                transition: isCycling ? 'none' : 'opacity 250ms ease',
              }}
            />
            <rect
              x={BAR_X} y={chunk.stackedY}
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
                  : 'transform 480ms cubic-bezier(0.4, 0, 0.2, 1), fill 400ms ease, opacity 450ms ease',
              }}
            />
            {showLabel && (
              <g
                opacity={chunk.isLanded ? 1 : 0}
                style={{
                  transition: isCycling ? 'none' : 'opacity 280ms ease',
                }}
              >
                <text x={LABEL_X} y={chunk.stackedY + chunk.h / 2 - 2}
                  fontSize={9} fill="#888" fontFamily="inherit"
                >
                  {chunk.label}
                </text>
                <text x={LABEL_X} y={chunk.stackedY + chunk.h / 2 + 10}
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
            <text x={LABEL_X} y={labelY - 3}
              fontSize={10} fontWeight={700}
              fill={CAT_COLOR[seg.category]} fontFamily="inherit"
            >
              {CAT_LABEL[seg.category]}
            </text>
            <text x={LABEL_X} y={labelY + 11}
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

      {/* Life stage avatar */}
      {stage !== undefined && (
        <g style={{ transition: 'opacity 400ms ease' }}>
          <AlexAvatarSvg stage={stage} />
        </g>
      )}
    </svg>
  );
}
