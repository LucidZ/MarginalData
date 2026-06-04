import { useEffect, useState } from 'react';
import * as d3 from 'd3';
import { SNOWBALL_DATA, SNOWBALL_DOUBLE_YEAR } from './data';

// ── Layout ────────────────────────────────────────────────────────────────────
const VW = 580;
const VH = 380;
const M  = { top: 36, right: 50, bottom: 52, left: 60 };
const IW = VW - M.left - M.right;
const IH = VH - M.top - M.bottom;

const N = 40;
const P = 100;

// ── Colors ────────────────────────────────────────────────────────────────────
const GREEN       = '#1a7a4a';
const LIGHT_GREEN = '#7abf8e';
const GOLD        = '#c9a227';
const MUTED       = '#999';

// ── Dynamic scale helpers ─────────────────────────────────────────────────────

// Nice rounded y-ceiling with ~35% headroom above the tallest visible bar.
function niceYMax(yearsToShow: number): number {
  const maxTotal = SNOWBALL_DATA[Math.min(yearsToShow, N) - 1].total;
  const padded   = maxTotal * 1.35;
  for (const step of [150, 200, 300, 400, 500, 600, 750, 900, 1100, 1300, 1600]) {
    if (padded <= step) return step;
  }
  return 1600;
}

// How many x-slots to allocate (visible bars + lookahead ghost bars).
function niceXMax(yearsToShow: number): number {
  if (yearsToShow <= 5) return yearsToShow + 5;
  return Math.min(yearsToShow + Math.round(yearsToShow * 0.5), N);
}

function gridLineValues(yMax: number): number[] {
  if (yMax <= 200)  return [0, 100, 200];
  if (yMax <= 400)  return [0, 200, 400];
  if (yMax <= 600)  return [0, 300, 600];
  if (yMax <= 900)  return [0, 500, 900];
  if (yMax <= 1100) return [0, 500, 1000];
  return [0, 500, 1000, 1500];
}

function formatY(v: number): string {
  if (v === 0) return '$0';
  return v >= 1000 ? `$${v / 1000}K` : `$${v}`;
}

// ── Stagger helper ────────────────────────────────────────────────────────────
function staggerMs(prevY: number, barYear: number, totalAdding: number): number {
  if (totalAdding <= 0) return 0;
  const idx = barYear - prevY - 1;
  if (totalAdding <= 3)  return idx * 220;
  if (totalAdding <= 11) return idx * 65;
  return idx * 35;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SnowballViz({ yearsToShow }: { yearsToShow: number }) {
  const [prev, setPrev] = useState(0);
  const [curr, setCurr] = useState(0);

  useEffect(() => {
    setPrev(curr);
    setCurr(yearsToShow);
  }, [yearsToShow]); // eslint-disable-line react-hooks/exhaustive-deps

  const safeYears = Math.max(curr, 1);
  const yMax = niceYMax(safeYears);
  const xMax = niceXMax(safeYears);

  // Scales are recomputed each render; CSS transitions on bar x-positions
  // make the zoom-out feel smooth even though geometry values jump.
  const yScale = d3.scaleLinear().domain([0, yMax]).range([IH, 0]);
  const xScale = d3.scaleBand<number>()
    .domain(Array.from({ length: xMax }, (_, i) => i + 1))
    .range([0, IW])
    .padding(0.22);
  const BW = xScale.bandwidth();

  const showDoubleLine      = curr >= SNOWBALL_DOUBLE_YEAR;
  const showFinalAnnotation = curr >= N;
  const year40              = SNOWBALL_DATA[N - 1];
  const annualInterest40    = Math.round(year40.annualInterest);
  const gridVals            = gridLineValues(yMax);

  // Only show milestone labels for years within the current x-domain.
  const xMilestones = [1, 5, 10, 20, 30, 40].filter(yr => yr <= xMax);

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      style={{ display: 'block', overflow: 'visible' }}
      aria-label="Snowball compounding visualization"
    >
      <g transform={`translate(${M.left},${M.top})`}>

        {/* Y-axis gridlines + labels — update instantly on scale change */}
        {gridVals.map(v => (
          <g key={v}>
            <line
              x1={0} x2={IW}
              y1={yScale(v)} y2={yScale(v)}
              stroke={v === 0 ? '#ccc' : '#f0f0f0'}
              strokeWidth={1}
            />
            <text
              x={-8} y={yScale(v)}
              textAnchor="end" dominantBaseline="middle"
              fontSize={10} fill={MUTED} fontFamily="inherit"
            >
              {formatY(v)}
            </text>
          </g>
        ))}

        {/* X-axis tick marks — translate with CSS so they slide on zoom-out */}
        {xMilestones.map(yr => {
          const x = (xScale(yr) ?? 0) + BW / 2;
          return (
            <g
              key={yr}
              style={{ transform: `translate(${x}px, 0)`, transition: 'transform 600ms ease' }}
            >
              <line x1={0} x2={0} y1={IH} y2={IH + 4} stroke="#ccc" strokeWidth={1} />
              <text
                x={0} y={IH + 16}
                textAnchor="middle"
                fontSize={10} fill={MUTED} fontFamily="inherit"
              >
                yr {yr}
              </text>
            </g>
          );
        })}

        {/* Doubling reference line at $200 */}
        <line
          x1={0} x2={IW}
          y1={yScale(200)} y2={yScale(200)}
          stroke={GREEN} strokeWidth={1.5} strokeDasharray="5,3"
          opacity={showDoubleLine ? 0.55 : 0}
          style={{ transition: 'opacity 500ms ease' }}
        />
        <text
          x={IW + 5} y={yScale(200)}
          dominantBaseline="middle"
          fontSize={10} fontWeight={700}
          fill={GREEN} fontFamily="inherit"
          opacity={showDoubleLine ? 1 : 0}
          style={{ transition: 'opacity 500ms ease 200ms' }}
        >
          2×
        </text>

        {/* Bars */}
        {SNOWBALL_DATA.slice(0, xMax).map(d => {
          const yr = d.year;
          const x  = xScale(yr) ?? 0;

          const isVisible   = yr <= curr;
          const totalAdding = curr - prev;
          const isNewBar    = yr > prev && yr <= curr;
          const delay       = isNewBar ? staggerMs(prev, yr, totalAdding) : 0;

          const barEnterTransition = isVisible
            ? `transform 400ms ease-out ${delay}ms, opacity 300ms ease ${delay}ms`
            : 'transform 200ms ease-in, opacity 200ms ease-in';

          const yTop  = yScale(d.total);
          const yMid1 = yScale(P + d.simpleInterest);
          const yMid2 = yScale(P);
          const hBonus  = yMid1 - yTop;
          const hSimple = yMid2 - yMid1;
          const hPrin   = IH - yMid2;

          return (
            // CSS translate so x-position animates smoothly when xMax expands.
            <g
              key={yr}
              style={{
                transform: `translate(${x}px, 0px)`,
                transition: 'transform 600ms ease',
              }}
            >
              <g
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: '50% 100%',
                  transform: isVisible ? 'scaleY(1)' : 'scaleY(0)',
                  opacity: isVisible ? 1 : 0,
                  transition: barEnterTransition,
                }}
              >
                {/* Full-height invisible rect anchors fill-box to the x-axis baseline */}
                <rect x={0} y={0} width={BW} height={IH} fill="none" pointerEvents="none" />

                {hBonus > 0.5 && (
                  <rect x={0} y={yTop} width={BW} height={hBonus} fill={GOLD} />
                )}
                {hSimple > 0.5 && (
                  <rect x={0} y={yMid1} width={BW} height={hSimple} fill={LIGHT_GREEN} />
                )}
                <rect x={0} y={yMid2} width={BW} height={hPrin} fill={GREEN} />
              </g>
            </g>
          );
        })}

        {/* Year-40 annual interest callout */}
        {showFinalAnnotation && (
          <g>
            <line
              x1={(xScale(N) ?? 0) + BW / 2} x2={(xScale(N) ?? 0) + BW / 2}
              y1={yScale(year40.total) - 6} y2={yScale(year40.total) - 26}
              stroke={GOLD} strokeWidth={1.5}
            />
            <text
              x={(xScale(N) ?? 0) + BW / 2}
              y={yScale(year40.total) - 32}
              textAnchor="middle"
              fontSize={10} fontWeight={700}
              fill={GOLD} fontFamily="inherit"
            >
              ${annualInterest40}/yr
            </text>
          </g>
        )}

      </g>

      {/* Legend */}
      <g transform={`translate(${M.left}, ${VH - 18})`}>
        {([
          { color: GREEN,       label: 'Principal ($100)' },
          { color: LIGHT_GREEN, label: 'Interest' },
          { color: GOLD,        label: 'Interest on interest' },
        ] as const).map((item, i) => (
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
