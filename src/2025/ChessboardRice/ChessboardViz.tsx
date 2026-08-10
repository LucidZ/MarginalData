import { SQUARES, formatGrains, formatWeight, logFraction } from './data';

interface Props {
  currentSquare: number; // 1–64
}

const BOARD_PX = 280;
const SQ = BOARD_PX / 8;

// Light / dark chess square colors, visited tint, active highlight
const COLOR_LIGHT = '#f0d9b5';
const COLOR_DARK  = '#b58863';
const COLOR_LIGHT_PAST = '#c8dea0';
const COLOR_DARK_PAST  = '#6e9e42';
const COLOR_ACTIVE = '#f6f669';

// Scale-bar equivalents (label + icon + weightKg) for tick marks
const SCALE_TICKS: { label: string; icon: string; kg: number }[] = [
  { label: 'grain',    icon: '🌾', kg: 0.000025  },
  { label: 'egg',      icon: '🥚', kg: 0.055     },
  { label: 'baby',     icon: '👶', kg: 3.3       },
  { label: 'horse',    icon: '🐎', kg: 500       },
  { label: 'elephant', icon: '🐘', kg: 6000      },
  { label: 'whale',    icon: '🐋', kg: 120000    },
  { label: '747',      icon: '✈️', kg: 412775    },
  { label: 'Eiffel',   icon: '🗼', kg: 7300000   },
  { label: 'carrier',  icon: '🚢', kg: 102000000 },
  { label: 'pyramid',  icon: '🔺', kg: 5900000000},
];

export default function ChessboardViz({ currentSquare }: Props) {
  const sq = SQUARES[currentSquare - 1];

  // Active square grid position
  const activeRow = Math.ceil(currentSquare / 8);
  const activeCol = ((currentSquare - 1) % 8) + 1;
  const ax = (activeCol - 1) * SQ;
  const ay = (activeRow - 1) * SQ;

  return (
    <div className="chessboard-panel">
      {/* ── Board ──────────────────────────────────────────────────── */}
      <svg
        width={BOARD_PX}
        height={BOARD_PX}
        viewBox={`0 0 ${BOARD_PX} ${BOARD_PX}`}
        className="chessboard-svg"
      >
        {/* Border */}
        <rect x={0} y={0} width={BOARD_PX} height={BOARD_PX} fill="#8b6914" />
        <rect x={4} y={4} width={BOARD_PX - 8} height={BOARD_PX - 8} fill="#6b4e12" />

        {/* Squares */}
        {Array.from({ length: 64 }, (_, i) => {
          const s = i + 1;
          const r = Math.ceil(s / 8);
          const c = ((s - 1) % 8) + 1;
          const x = (c - 1) * SQ + 4;
          const y = (r - 1) * SQ + 4;
          const w = SQ - 1;
          const isLight = (r + c) % 2 === 0;
          const isCurrent = s === currentSquare;
          const isPast = s < currentSquare;

          let fill: string;
          if (isCurrent) fill = COLOR_ACTIVE;
          else if (isPast) fill = isLight ? COLOR_LIGHT_PAST : COLOR_DARK_PAST;
          else fill = isLight ? COLOR_LIGHT : COLOR_DARK;

          return <rect key={s} x={x} y={y} width={w} height={w} fill={fill} />;
        })}

        {/* Active square outline pulse */}
        <rect
          x={ax + 5}
          y={ay + 5}
          width={SQ - 3}
          height={SQ - 3}
          fill="none"
          stroke="#c8822a"
          strokeWidth={2.5}
          opacity={0.9}
        />

        {/* Row numbers (1–8) on left edge */}
        {Array.from({ length: 8 }, (_, r) => (
          <text
            key={r}
            x={2}
            y={(r * SQ) + SQ / 2 + 4 + 4}
            fontSize={7}
            fill="#e8d5a3"
            textAnchor="middle"
            fontFamily="monospace"
          >
            {r + 1}
          </text>
        ))}
      </svg>

      {/* ── Square stats ───────────────────────────────────────────── */}
      <div className="board-stats">
        <div className="board-square-label">
          Square <span className="board-sq-num">{currentSquare}</span>
          <span className="board-sq-of"> of 64</span>
        </div>

        <div className="board-stat-row">
          <div className="board-stat">
            <div className="board-stat-label">Grains on this square</div>
            <div className="board-stat-value">{formatGrains(sq.grainsOnSquare)}</div>
          </div>
          <div className="board-stat">
            <div className="board-stat-label">Weight</div>
            <div className="board-stat-value">{formatWeight(sq.weightKg)}</div>
          </div>
        </div>

        <div className="board-stat-row">
          <div className="board-stat full-width">
            <div className="board-stat-label">Total grains (all squares so far)</div>
            <div className="board-stat-value">{formatGrains(sq.cumulativeGrains)}</div>
          </div>
        </div>
      </div>

      {/* ── Logarithmic scale bar ──────────────────────────────────── */}
      <div className="scale-bar-section">
        <div className="scale-bar-label">Weight scale (log)</div>
        <div className="scale-bar-track">
          {/* Filled portion */}
          <div
            className="scale-bar-fill"
            style={{ width: `${logFraction(sq.weightKg) * 100}%` }}
          />
          {/* Tick marks for equivalents */}
          {SCALE_TICKS.map(t => {
            const pct = logFraction(t.kg) * 100;
            return (
              <div
                key={t.label}
                className="scale-bar-tick"
                style={{ left: `${pct}%` }}
                title={t.label}
              >
                <span className="scale-tick-icon">{t.icon}</span>
              </div>
            );
          })}
          {/* Current position dot */}
          <div
            className="scale-bar-cursor"
            style={{ left: `${logFraction(sq.weightKg) * 100}%` }}
          />
        </div>
        <div className="scale-bar-ends">
          <span>1 grain</span>
          <span>sq. 64</span>
        </div>
      </div>
    </div>
  );
}
