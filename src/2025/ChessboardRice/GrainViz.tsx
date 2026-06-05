import { formatWeight } from './data';
import type { SquareData, EquivalentIcon } from './data';

const ICON_MAP: Record<EquivalentIcon, string> = {
  grain:    '🌾',
  egg:      '🥚',
  soda:     '🥤',
  pineapple:'🍍',
  baby:     '👶',
  dog:      '🐕',
  horse:    '🐎',
  hippo:    '🦛',
  elephant: '🐘',
  bus:      '🚌',
  whale:    '🐋',
  liberty:  '🗽',
  plane:    '✈️',
  tower:    '🗼',
  pyramid:  '🔺',
  carrier:  '🚢',
};

interface Props {
  sq: SquareData;
}

// For squares 1–8, render individual grain dots
function GrainDots({ count }: { count: number }) {
  const dots = Math.min(count, 128); // cap at 128 for rendering
  const cols = Math.ceil(Math.sqrt(dots * 1.6));
  return (
    <div className="grain-dots-wrap">
      <svg
        viewBox={`0 0 ${cols * 10} ${Math.ceil(dots / cols) * 10}`}
        className="grain-dots-svg"
        aria-label={`${count} grains of rice`}
      >
        {Array.from({ length: dots }, (_, i) => {
          const x = (i % cols) * 10 + 5;
          const y = Math.floor(i / cols) * 10 + 5;
          return (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx={3}
              ry={2}
              fill="#c8a84b"
              opacity={0.85}
            />
          );
        })}
      </svg>
      {count > 128 && (
        <div className="grain-dots-overflow">+ {(count - 128).toLocaleString()} more</div>
      )}
    </div>
  );
}

export default function GrainViz({ sq }: Props) {
  const { square, weightKg, equivalent } = sq;
  const isEarlySquare = square <= 9;
  const grainCount = Number(sq.grainsOnSquare);

  return (
    <div className="grain-viz">
      {isEarlySquare ? (
        // Show actual rice grain dots for first 9 squares
        <div className="early-grain-section">
          <GrainDots count={grainCount} />
          <div className="early-grain-weight">{formatWeight(weightKg)}</div>
        </div>
      ) : equivalent ? (
        // Show weight equivalent comparison
        <div className="equivalent-section">
          <div className="equivalent-icon">{ICON_MAP[equivalent.icon]}</div>
          <div className="equivalent-details">
            <div className="equivalent-label">{equivalent.label}</div>
            <div className="equivalent-weight-row">
              <div className="equivalent-this">
                <span className="ew-tag">this square</span>
                <span className="ew-val">{formatWeight(weightKg)}</span>
              </div>
              <div className="equivalent-divider">≈</div>
              <div className="equivalent-ref">
                <span className="ew-tag">{equivalent.label}</span>
                <span className="ew-val">{formatWeight(equivalent.actualWeightKg)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // No equivalent defined — just show weight large
        <div className="weight-only-section">
          <div className="weight-only-value">{formatWeight(weightKg)}</div>
          <div className="weight-only-label">weight of this square's rice</div>
        </div>
      )}
    </div>
  );
}
