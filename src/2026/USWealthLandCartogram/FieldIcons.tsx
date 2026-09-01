// Little American-football-field diagrams used to visualize per-person land
// area — the same reference object the "X football fields" text comparison
// in App.tsx uses, so the visual and the copy always agree. Everything here
// is drawn in a viewBox "0 0 120 53.33" (yards): 1 SVG unit = 1 real yard,
// using official NFL dimensions (120-yard field including both end zones,
// 53 1/3-yard width, 70'9" hash-mark spacing), so the line markings are
// geometrically accurate, not just decorative.
//
// This is the US-cartogram's own copy — the global (non-US) version keeps
// the soccer-pitch icons in ../WealthLandCartogram/PitchIcons.tsx, since
// "football pitch" is the right unit there and "football field" is the
// right one here.
export const FIELD_LENGTH_YD = 120;
export const FIELD_WIDTH_YD = 160 / 3; // 53.33 — 160ft sideline-to-sideline
export const END_ZONE_DEPTH_YD = 10;

const YARD_M = 0.9144;
export const FOOTBALL_FIELD_M2 = FIELD_LENGTH_YD * YARD_M * (FIELD_WIDTH_YD * YARD_M); // ~5350.6
export const END_ZONE_M2 = END_ZONE_DEPTH_YD * YARD_M * (FIELD_WIDTH_YD * YARD_M); // ~445.9 — 1/12 of the field, same width

// NFL hash marks sit 70'9" apart, centered on the field.
const HASH_SEPARATION_YD = 70.75 / 3;
const HASH_INSET_YD = (FIELD_WIDTH_YD - HASH_SEPARATION_YD) / 2; // ~14.875
const HASH_TOP_Y = HASH_INSET_YD;
const HASH_BOTTOM_Y = FIELD_WIDTH_YD - HASH_INSET_YD;
const HASH_TICK_LEN = 1;

const GOAL_LINE_X = END_ZONE_DEPTH_YD;
const OTHER_GOAL_LINE_X = FIELD_LENGTH_YD - END_ZONE_DEPTH_YD;
const MIDFIELD_X = FIELD_LENGTH_YD / 2;

// Goalpost uprights are 18'6" apart, centered, sitting on each end line.
const GOALPOST_WIDTH_YD = 18.5 / 3;
const GOALPOST_TOP_Y = (FIELD_WIDTH_YD - GOALPOST_WIDTH_YD) / 2;
const GOALPOST_BOTTOM_Y = GOALPOST_TOP_Y + GOALPOST_WIDTH_YD;

const PYLON_R = 0.5;

const ASPECT = FIELD_WIDTH_YD / FIELD_LENGTH_YD;

export interface FieldIconSpec {
  /** 0..1 — how much of this icon's reference area is filled in. */
  fraction: number;
}

// Turns a raw land-per-person area into the list of field icons that should
// render for it: whole filled fields, plus one trailing partially-filled
// field for the remainder. A group whose land doesn't even fill one whole
// field just gets that single partial icon — filled from x=0, the very back
// of the near end zone, forward — which is also what makes the "back of the
// end zone to about the N-yard line" text comparison in App.tsx true of the
// icon itself, not just the words.
export function buildFieldIcons(m2: number): FieldIconSpec[] {
  const whole = Math.floor(m2 / FOOTBALL_FIELD_M2);
  const remainder = m2 - whole * FOOTBALL_FIELD_M2;
  const icons: FieldIconSpec[] = Array.from({ length: whole }, () => ({ fraction: 1 }));
  const remainderFraction = remainder / FOOTBALL_FIELD_M2;
  if (remainderFraction > 0.01 || icons.length === 0) icons.push({ fraction: remainderFraction });
  return icons;
}

// Every field renders at the same size regardless of how many a group needs
// — the smallest group's single icon sets the scale, and the largest
// group's many fields stay full-size too, so the sheer amount of repeated
// space they take up on the page *is* the comparison, rather than being
// scaled away to fit tidily.
export const FIELD_ICON_SIZE = 150;
export const FIELD_ICON_DETAILED = true;

// Rendered once, referenced everywhere via <use> — same pattern as the
// person-icon symbol elsewhere in this app.
export function FieldSymbolDefs() {
  const yardLines: number[] = [];
  for (let x = GOAL_LINE_X + 5; x < OTHER_GOAL_LINE_X; x += 5) yardLines.push(x);
  const hashXs: number[] = [];
  for (let x = GOAL_LINE_X; x <= OTHER_GOAL_LINE_X; x += 5) hashXs.push(x);

  return (
    <>
      <symbol id="wlc-field-lines" viewBox={`0 0 ${FIELD_LENGTH_YD} ${FIELD_WIDTH_YD}`}>
        <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={0.5} strokeLinecap="round">
          <rect x={0} y={0} width={FIELD_LENGTH_YD} height={FIELD_WIDTH_YD} />
          {yardLines.map((x) => (
            <line key={x} x1={x} y1={0} x2={x} y2={FIELD_WIDTH_YD} />
          ))}
          {hashXs.map((x) => (
            <g key={x}>
              <line
                x1={x}
                y1={HASH_TOP_Y - HASH_TICK_LEN / 2}
                x2={x}
                y2={HASH_TOP_Y + HASH_TICK_LEN / 2}
              />
              <line
                x1={x}
                y1={HASH_BOTTOM_Y - HASH_TICK_LEN / 2}
                x2={x}
                y2={HASH_BOTTOM_Y + HASH_TICK_LEN / 2}
              />
            </g>
          ))}
        </g>
        <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={0.9} strokeLinecap="round">
          <line x1={GOAL_LINE_X} y1={0} x2={GOAL_LINE_X} y2={FIELD_WIDTH_YD} />
          <line x1={OTHER_GOAL_LINE_X} y1={0} x2={OTHER_GOAL_LINE_X} y2={FIELD_WIDTH_YD} />
          <line x1={MIDFIELD_X} y1={0} x2={MIDFIELD_X} y2={FIELD_WIDTH_YD} />
        </g>
        <g stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} strokeLinecap="round">
          <line x1={0} y1={GOALPOST_TOP_Y} x2={0} y2={GOALPOST_BOTTOM_Y} />
          <line x1={FIELD_LENGTH_YD} y1={GOALPOST_TOP_Y} x2={FIELD_LENGTH_YD} y2={GOALPOST_BOTTOM_Y} />
        </g>
        <g fill="rgba(255,255,255,0.85)" stroke="none">
          {[0, FIELD_WIDTH_YD].map((y) =>
            [GOAL_LINE_X, OTHER_GOAL_LINE_X].map((x) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={PYLON_R} />
            )),
          )}
        </g>
      </symbol>
      <symbol id="wlc-field-simple" viewBox={`0 0 ${FIELD_LENGTH_YD} ${FIELD_WIDTH_YD}`}>
        <g fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.4}>
          <rect x={0} y={0} width={FIELD_LENGTH_YD} height={FIELD_WIDTH_YD} />
          <line x1={GOAL_LINE_X} y1={0} x2={GOAL_LINE_X} y2={FIELD_WIDTH_YD} />
          <line x1={OTHER_GOAL_LINE_X} y1={0} x2={OTHER_GOAL_LINE_X} y2={FIELD_WIDTH_YD} />
          <line x1={MIDFIELD_X} y1={0} x2={MIDFIELD_X} y2={FIELD_WIDTH_YD} />
        </g>
      </symbol>
    </>
  );
}

interface FieldIconProps {
  icon: FieldIconSpec;
  color: string;
  size: number;
  detailed: boolean;
}

export function FieldIcon({ icon, color, size, detailed }: FieldIconProps) {
  const clamped = Math.max(0, Math.min(1, icon.fraction));
  const fillWidth = FIELD_LENGTH_YD * clamped;
  const fillHeight = FIELD_WIDTH_YD;

  return (
    <svg
      className="wlc-field-icon"
      width={size}
      height={size * ASPECT}
      viewBox={`0 0 ${FIELD_LENGTH_YD} ${FIELD_WIDTH_YD}`}
    >
      <rect
        className="wlc-field-icon-bg"
        x={0}
        y={0}
        width={FIELD_LENGTH_YD}
        height={FIELD_WIDTH_YD}
      />
      <rect x={0} y={0} width={fillWidth} height={fillHeight} fill={color} />
      <use href={detailed ? "#wlc-field-lines" : "#wlc-field-simple"} />
    </svg>
  );
}
