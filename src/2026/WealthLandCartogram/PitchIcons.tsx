// Little football-pitch (soccer) diagrams used to visualize per-person land
// area — the same reference object the "X football pitches" text comparison
// in App.tsx uses, so the visual and the copy always agree. Everything here
// is drawn in a viewBox "0 0 105 68": 1 SVG unit = 1 real meter, using FIFA-
// recommended dimensions, so the line markings are geometrically accurate,
// not just decorative.
export const PITCH_LENGTH_M = 105;
export const PITCH_WIDTH_M = 68;
export const FOOTBALL_PITCH_M2 = PITCH_LENGTH_M * PITCH_WIDTH_M; // 7140

const PENALTY_DEPTH_M = 16.5;
const PENALTY_WIDTH_M = 40.32;
const PENALTY_Y_M = (PITCH_WIDTH_M - PENALTY_WIDTH_M) / 2; // 13.84
export const PENALTY_BOX_M2 = PENALTY_DEPTH_M * PENALTY_WIDTH_M; // 665.28

const SIX_YARD_DEPTH_M = 5.5;
const SIX_YARD_WIDTH_M = 18.32;
const SIX_YARD_Y_M = (PITCH_WIDTH_M - SIX_YARD_WIDTH_M) / 2; // 24.84

const CENTER_X = PITCH_LENGTH_M / 2;
const CENTER_Y = PITCH_WIDTH_M / 2;
const CENTER_R = 9.15;
const SPOT_R = 0.35;
const PENALTY_SPOT_X = 11;

// Where the penalty arc (the bit of the center-circle-radius arc that pokes
// out past the box line) crosses the box edge — basic circle/line
// intersection, radius CENTER_R centered on the penalty spot.
const ARC_DY = Math.sqrt(CENTER_R ** 2 - (PENALTY_DEPTH_M - PENALTY_SPOT_X) ** 2);
const ARC_TOP_Y = CENTER_Y - ARC_DY;
const ARC_BOTTOM_Y = CENTER_Y + ARC_DY;
const RIGHT_BOX_X = PITCH_LENGTH_M - PENALTY_DEPTH_M;
const RIGHT_SIX_YARD_X = PITCH_LENGTH_M - SIX_YARD_DEPTH_M;
const RIGHT_SPOT_X = PITCH_LENGTH_M - PENALTY_SPOT_X;

const ASPECT = PITCH_WIDTH_M / PITCH_LENGTH_M;

export interface PitchIconSpec {
  /** 0..1 — how much of this icon's reference area is filled in. */
  fraction: number;
  /** true: the reference area is just one penalty box, not the whole pitch
   *  (used when the land amount doesn't even fill a single pitch). */
  boxOnly: boolean;
}

// Turns a raw land-per-person area into the list of pitch icons that should
// render for it: whole filled pitches, plus one trailing partially-filled
// pitch for the remainder — except areas under one penalty box, which get a
// single boxOnly icon instead of an (almost entirely empty) full pitch.
export function buildPitchIcons(m2: number): PitchIconSpec[] {
  if (m2 < PENALTY_BOX_M2) {
    return [{ fraction: m2 / PENALTY_BOX_M2, boxOnly: true }];
  }
  const whole = Math.floor(m2 / FOOTBALL_PITCH_M2);
  const remainder = m2 - whole * FOOTBALL_PITCH_M2;
  const icons: PitchIconSpec[] = Array.from({ length: whole }, () => ({
    fraction: 1,
    boxOnly: false,
  }));
  const remainderFraction = remainder / FOOTBALL_PITCH_M2;
  if (remainderFraction > 0.01) icons.push({ fraction: remainderFraction, boxOnly: false });
  return icons;
}

// Icons are tiny once a group needs dozens of them (the $1M+ band needs
// ~153) — full line markings turn to mush at that size, so those render as
// plain outlined rectangles instead. Below that, real markings hold up fine
// and are worth showing (especially the partially-filled box/pitch, which is
// most of the point).
export function pitchIconSize(count: number): { size: number; detailed: boolean } {
  if (count <= 1) return { size: 150, detailed: true };
  if (count <= 3) return { size: 92, detailed: true };
  if (count <= 20) return { size: 42, detailed: true };
  return { size: 12, detailed: false };
}

// Rendered once, referenced everywhere via <use> — same pattern as the
// person-icon symbol elsewhere in this app.
export function PitchSymbolDefs() {
  return (
    <>
      <symbol id="wlc-pitch-lines" viewBox={`0 0 ${PITCH_LENGTH_M} ${PITCH_WIDTH_M}`}>
        <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={0.7} strokeLinecap="round">
          <rect x={0} y={0} width={PITCH_LENGTH_M} height={PITCH_WIDTH_M} />
          <line x1={CENTER_X} y1={0} x2={CENTER_X} y2={PITCH_WIDTH_M} />
          <circle cx={CENTER_X} cy={CENTER_Y} r={CENTER_R} />
          <rect x={0} y={PENALTY_Y_M} width={PENALTY_DEPTH_M} height={PENALTY_WIDTH_M} />
          <rect x={0} y={SIX_YARD_Y_M} width={SIX_YARD_DEPTH_M} height={SIX_YARD_WIDTH_M} />
          <path
            d={`M ${PENALTY_DEPTH_M} ${ARC_TOP_Y} A ${CENTER_R} ${CENTER_R} 0 0 1 ${PENALTY_DEPTH_M} ${ARC_BOTTOM_Y}`}
          />
          <rect x={RIGHT_BOX_X} y={PENALTY_Y_M} width={PENALTY_DEPTH_M} height={PENALTY_WIDTH_M} />
          <rect x={RIGHT_SIX_YARD_X} y={SIX_YARD_Y_M} width={SIX_YARD_DEPTH_M} height={SIX_YARD_WIDTH_M} />
          <path
            d={`M ${RIGHT_BOX_X} ${ARC_TOP_Y} A ${CENTER_R} ${CENTER_R} 0 0 0 ${RIGHT_BOX_X} ${ARC_BOTTOM_Y}`}
          />
        </g>
        <g fill="rgba(255,255,255,0.85)" stroke="none">
          <circle cx={CENTER_X} cy={CENTER_Y} r={SPOT_R} />
          <circle cx={PENALTY_SPOT_X} cy={CENTER_Y} r={SPOT_R} />
          <circle cx={RIGHT_SPOT_X} cy={CENTER_Y} r={SPOT_R} />
        </g>
      </symbol>
      <symbol id="wlc-pitch-simple" viewBox={`0 0 ${PITCH_LENGTH_M} ${PITCH_WIDTH_M}`}>
        <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.4}>
          <rect x={0} y={0} width={PITCH_LENGTH_M} height={PITCH_WIDTH_M} />
          <line x1={CENTER_X} y1={0} x2={CENTER_X} y2={PITCH_WIDTH_M} />
        </g>
      </symbol>
    </>
  );
}

interface PitchIconProps {
  icon: PitchIconSpec;
  color: string;
  size: number;
  detailed: boolean;
}

export function PitchIcon({ icon, color, size, detailed }: PitchIconProps) {
  const clamped = Math.max(0, Math.min(1, icon.fraction));
  const fillWidth = (icon.boxOnly ? PENALTY_DEPTH_M : PITCH_LENGTH_M) * clamped;
  const fillHeight = icon.boxOnly ? PENALTY_WIDTH_M : PITCH_WIDTH_M;
  const fillY = icon.boxOnly ? PENALTY_Y_M : 0;

  return (
    <svg
      className="wlc-pitch-icon"
      width={size}
      height={size * ASPECT}
      viewBox={`0 0 ${PITCH_LENGTH_M} ${PITCH_WIDTH_M}`}
    >
      <rect
        className="wlc-pitch-icon-bg"
        x={0}
        y={0}
        width={PITCH_LENGTH_M}
        height={PITCH_WIDTH_M}
      />
      <rect x={0} y={fillY} width={fillWidth} height={fillHeight} fill={color} />
      <use href={detailed ? "#wlc-pitch-lines" : "#wlc-pitch-simple"} />
    </svg>
  );
}
