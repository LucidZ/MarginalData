import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Archetype,
  HighlightType,
  SegKey,
  subtotalByType,
  netMonthly,
} from './data';

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 520;
const VH = 460;
const CHART_TOP = 76;
const CHART_BOTTOM = 410;
const CHART_H = CHART_BOTTOM - CHART_TOP; // 334px
const BAR_X = 148;
const BAR_W = 148;
const BAR_RIGHT = BAR_X + BAR_W;
const LABEL_X = BAR_RIGHT + 14;

// ── Colors ────────────────────────────────────────────────────────────────────
const COLOR: Record<SegKey | 'net_neg', string> = {
  taxes:         '#b5372d',
  fixed:         '#1e3a5f',
  variable:      '#426a8c',
  discretionary: '#7aa3c5',
  net:           '#2d6a4f',
  net_neg:       '#b5372d',
};

const LABELS: Record<SegKey, string> = {
  taxes:         'Taxes',
  fixed:         'Fixed',
  variable:      'Variable',
  discretionary: 'Discretionary',
  net:           'Net',
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface DisplaySeg {
  key: SegKey;
  y: number;
  h: number;
  amount: number;
  color: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildSegs(a: Archetype): DisplaySeg[] {
  const scale = CHART_H / a.grossMonthly;
  const net = netMonthly(a);

  const raw: [SegKey, number, string][] = [
    ['taxes',         a.taxesMonthly,                    COLOR.taxes],
    ['fixed',         subtotalByType(a, 'fixed'),         COLOR.fixed],
    ['variable',      subtotalByType(a, 'variable'),      COLOR.variable],
    ['discretionary', subtotalByType(a, 'discretionary'), COLOR.discretionary],
    ['net',           Math.abs(net),                      net >= 0 ? COLOR.net : COLOR.net_neg],
  ];

  let y = CHART_TOP;
  return raw.map(([key, amount, color]) => {
    const h = Math.max(amount * scale, 0);
    const seg: DisplaySeg = { key, y, h, amount, color };
    y += h;
    return seg;
  });
}

function segOpacity(key: SegKey, highlight: HighlightType): number {
  if (highlight === 'all') return 1;
  if (highlight === key) return 1;
  if (highlight === 'net') return 0.3;
  return 0.12;
}

const fmt$ = d3.format('$,.0f');

// ── Component ─────────────────────────────────────────────────────────────────
export default function WaterfallViz({
  archetype,
  highlight,
}: {
  archetype: Archetype;
  highlight: HighlightType;
}) {
  const [segs, setSegs] = useState<DisplaySeg[]>(() => buildSegs(archetype));
  const prevSegsRef = useRef<DisplaySeg[]>(segs);
  const rafRef = useRef<number>(0);

  // Animate segment heights when archetype changes
  useEffect(() => {
    const target = buildSegs(archetype);
    const start = prevSegsRef.current;
    const duration = 600;
    const ease = d3.easeCubicInOut;
    const t0 = performance.now();

    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = ease(Math.min((now - t0) / duration, 1));
      const next = target.map((tSeg, i) => ({
        ...tSeg,
        y: start[i].y + (tSeg.y - start[i].y) * t,
        h: start[i].h + (tSeg.h - start[i].h) * t,
      }));
      prevSegsRef.current = next;
      setSegs(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [archetype]);

  const net = netMonthly(archetype);
  const isNegNet = net < 0;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
    >
      {/* Gross income label */}
      <text
        x={BAR_X + BAR_W / 2}
        y={44}
        textAnchor="middle"
        fontSize={14}
        fontWeight={700}
        fill="#333"
        fontFamily="inherit"
      >
        {fmt$(archetype.grossMonthly)}/mo gross
      </text>
      <text
        x={BAR_X + BAR_W / 2}
        y={62}
        textAnchor="middle"
        fontSize={10}
        fill="#aaa"
        fontFamily="inherit"
      >
        {archetype.description}
      </text>

      {/* Background track */}
      <rect
        x={BAR_X}
        y={CHART_TOP}
        width={BAR_W}
        height={CHART_H}
        fill="#f4f4f4"
        rx={3}
      />

      {/* Category segments */}
      {segs.map(seg => (
        <rect
          key={seg.key}
          x={BAR_X}
          y={seg.y}
          width={BAR_W}
          height={Math.max(seg.h, 0)}
          fill={seg.color}
          opacity={segOpacity(seg.key, highlight)}
          rx={seg.key === 'net' ? 3 : 0}
          style={{ transition: 'opacity 350ms ease' }}
        />
      ))}

      {/* Right-side labels — skip 'net' since the bottom annotation covers it */}
      {segs.filter(seg => seg.key !== 'net').map(seg => {
        const midY = seg.y + seg.h / 2;
        const op = segOpacity(seg.key, highlight);
        const isActive = op >= 0.8;
        return (
          <g
            key={`lbl-${seg.key}`}
            opacity={op >= 0.5 ? 1 : 0.35}
            style={{ transition: 'opacity 350ms ease' }}
          >
            <line
              x1={BAR_RIGHT}
              y1={midY}
              x2={LABEL_X - 2}
              y2={midY}
              stroke="#e0e0e0"
              strokeWidth={1}
            />
            <text
              x={LABEL_X}
              y={midY - 5}
              fontSize={10}
              fill={isActive ? '#888' : '#ccc'}
              fontFamily="inherit"
            >
              {LABELS[seg.key]}
            </text>
            <text
              x={LABEL_X}
              y={midY + 9}
              fontSize={12}
              fontWeight={600}
              fill={isActive ? '#333' : '#ccc'}
              fontFamily="inherit"
            >
              {fmt$(seg.amount)}
            </text>
          </g>
        );
      })}

      {/* Net annotation */}
      <text
        x={BAR_X + BAR_W / 2}
        y={CHART_BOTTOM + 24}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fill={isNegNet ? COLOR.net_neg : COLOR.net}
        fontFamily="inherit"
        opacity={highlight === 'net' || highlight === 'all' ? 1 : 0}
        style={{ transition: 'opacity 350ms ease' }}
      >
        Net: {isNegNet ? '' : '+'}{fmt$(net)}/mo
      </text>

      {/* Segment dividers (thin rules between adjacent bars) */}
      {segs.slice(0, -1).map((seg, i) => (
        <line
          key={`div-${i}`}
          x1={BAR_X}
          y1={seg.y + seg.h}
          x2={BAR_RIGHT}
          y2={seg.y + seg.h}
          stroke="white"
          strokeWidth={1.5}
          opacity={0.6}
        />
      ))}
    </svg>
  );
}
