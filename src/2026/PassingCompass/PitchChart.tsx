import { useCallback, useMemo, useState } from "react";
import type { TriangleRecord, PassOutcome } from "./types";

const OUTCOME_COLOR_VAR: Record<PassOutcome, string> = {
  Complete: "var(--status-good)",
  Incomplete: "var(--status-critical)",
  Out: "var(--status-serious)",
  "Pass Offside": "var(--status-warning)",
  Unknown: "var(--muted)",
};

// StatsBomb pitch is 120 (length, x) by 80 (width, y) units; SCALE just
// controls SVG precision. `toPx`/W/H depend on orientation (see the
// `orientation` prop) so they're computed per-instance inside the component,
// not as module constants — two PitchChart instances on different pages
// (portrait vs. landscape) would otherwise stomp on each other.
const PITCH_LENGTH = 120;
const PITCH_WIDTH = 80;
const SCALE = 6;

// Trapezoid taper widths for the two real passes — both taper thin-to-thick
// in their direction of travel (a point at the ball's origin, widest at
// where it ends up), same convention for pass in and pass out, so the taper
// itself reads as direction instead of needing a separate arrowhead marker.
const WIDE_W = 4.2;
const NARROW_W = 0;

export type Pt = { x: number; y: number };

/** Points for a quadrilateral from p1 (width w1) to p2 (width w2), centered on the p1-p2 line. */
export function trapezoid(p1: Pt, p2: Pt, w1: number, w2: number): string {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts = [
    { x: p1.x + (nx * w1) / 2, y: p1.y + (ny * w1) / 2 },
    { x: p2.x + (nx * w2) / 2, y: p2.y + (ny * w2) / 2 },
    { x: p2.x - (nx * w2) / 2, y: p2.y - (ny * w2) / 2 },
    { x: p1.x - (nx * w1) / 2, y: p1.y - (ny * w1) / 2 },
  ];
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

/** Convex hull (monotone chain) of the pass-in/receive/pivot/pass-out points — the ground this one sequence covered. */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export type PitchSlotState = "empty" | "assigned" | "active" | "correct" | "wrong" | "revealed" | "offense" | "defense";

export interface PitchSlot {
  id: string;
  /** Pitch-space coordinates (StatsBomb x/y units), same system as TriangleRecord.pivotX/Y. */
  x: number;
  y: number;
  /** Short text drawn inside the circle when no photo is set — must not reveal the correct player's identity while unresolved. */
  label: string;
  /** Assigned player's photo — when set, fills the circle instead of drawing `label`. */
  photo?: string;
  state: PitchSlotState;
  /** Hover/tap tooltip lines — opt-in, only wired up when a caller sets it. Also enables tap-to-toggle on touch devices when `onSlotClick` isn't set. */
  tooltip?: string[];
  /** Photo that swaps in to fill the circle (replacing the solid `fill` + `label`) while this slot is hovered/tapped. Independent of `photo`, which is always-on. */
  hoverPhoto?: string;
  /** Overrides the state-derived ring/stroke color — e.g. a fixed per-team color instead of a phase color. */
  color?: string;
  /** Overrides the circle's base fill (default a near-transparent `--surface-1`) — e.g. a solid team color instead of a photo. */
  fill?: string;
  /** Overrides the fallback label text color (default follows `color`) — needed when `fill` is dark/light enough that the ring color no longer reads against it. */
  textColor?: string;
}

const SLOT_STATE_COLOR: Record<PitchSlotState, string> = {
  empty: "var(--baseline)",
  assigned: "var(--text-primary)",
  active: "var(--status-warning)",
  correct: "var(--status-good)",
  wrong: "var(--status-critical)",
  // Same blue as an earned "correct" (it *is* the right answer) — dashed
  // stroke (see the circle draws below) is what marks it as given away
  // rather than earned.
  revealed: "var(--status-good)",
  offense: "var(--status-good)",
  defense: "var(--status-serious)",
};

interface Props {
  triangles: TriangleRecord[];
  /** When false, hides hover tooltips (which name the pivot player) and pointer affordance — for the matching game before answers are checked. */
  interactive?: boolean;
  /** Lineup-slot circles drawn on top of the pitch (matching game's single-pitch mode). */
  slots?: PitchSlot[];
  onSlotClick?: (id: string) => void;
  /** Fires on pointerdown over a slot circle — lets the caller start a drag (picking the placed avatar up off the pitch) without waiting for click/pointerup. */
  onSlotPointerDown?: (id: string, e: React.PointerEvent<SVGGElement>) => void;
  /** Slot currently hovered by an in-flight drag — drawn with an extra ring; `blocked` swaps it to a "not allowed" color (e.g. hovering a locked slot). */
  dropTarget?: { id: string; blocked: boolean } | null;
  /**
   * "both" (default) draws the incoming and outgoing pass as bold marks — the
   * full pivot triangle. "out" draws only the outgoing pass (the pivot's own
   * pass), so the bold marks read as that player's personal passing chart;
   * the faint coverage hull still spans all four points, so the triangle
   * they're part of remains visible underneath, just not double-highlighted.
   */
  legs?: "both" | "out";
  /** Overrides the default "Attacking"/"Defending" end captions — e.g. for a shared two-team pitch where a plain "Attacking" is ambiguous about whose. */
  endLabels?: [string, string];
  /** Overrides the default slot circle radius (3.6 pitch units) — smaller when both teams' XIs share one pitch at once. */
  slotRadius?: number;
  /** "portrait" (default, attacking direction up) or "landscape" (attacking direction right) — everything (markings, slots, tooltip anchor) is derived from this, not hardcoded per orientation. */
  orientation?: "portrait" | "landscape";
}

interface HoverInfo {
  x: number;
  y: number;
  lines: string[];
}

export default function PitchChart({ triangles, interactive = true, slots, onSlotClick, onSlotPointerDown, dropTarget, legs = "both", endLabels = ["Attacking", "Defending"], slotRadius, orientation = "portrait" }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  // Which slot (if any) is showing its `hoverPhoto` in place of its solid
  // fill — separate from `hover` (the tooltip) since a slot can have a
  // tooltip without a hoverPhoto, and this drives the circle's own render.
  const [hoveredSlotId, setHoveredSlotId] = useState<string | null>(null);

  const isLandscape = orientation === "landscape";
  const W = isLandscape ? PITCH_LENGTH * SCALE : PITCH_WIDTH * SCALE;
  const H = isLandscape ? PITCH_WIDTH * SCALE : PITCH_LENGTH * SCALE;
  // Portrait: screen x = pitch width (y), screen y = pitch length (x)
  // inverted, so higher x (forward) lands closer to the top. Landscape:
  // screen x = pitch length (x) directly, screen y = pitch width (y)
  // directly, so higher x lands further right — attacking direction rotates
  // from "up" to "right" with nothing else (markings, slots, tooltip) needing
  // its own orientation branch, since they're all built from this.
  const toPx = useCallback(
    (x: number, y: number): Pt =>
      isLandscape ? { x: x * SCALE, y: y * SCALE } : { x: y * SCALE, y: (PITCH_LENGTH - x) * SCALE },
    [isLandscape]
  );
  // Axis-aligned pitch-space rect (opposite corners in StatsBomb x/y units)
  // to a screen-space {x,y,width,height} — works for either orientation
  // since toPx never rotates by anything other than a multiple of 90°, so a
  // pitch rectangle always maps to a screen rectangle.
  const pitchRect = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const a = toPx(x1, y1);
      const b = toPx(x2, y2);
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
    },
    [toPx]
  );

  // Inverse-sqrt (not inverse-linear) decay: linear decay pinned low-volume players at the
  // 0.35 cap (making a few triangles look like a solid, "important" blob) while high-volume
  // pivots faded almost to the floor. sqrt decays slower, so the two ends land closer together;
  // 0.875 is picked so an n≈47 pivot still renders at ~0.128, same as before this change.
  const fillOpacity = Math.max(0.06, Math.min(0.3, 0.875 / Math.sqrt(Math.max(triangles.length, 1))));

  // Invisible oversized hit target for each slot circle: the drawn circle
  // alone is well under the ~44px mobile tap-target minimum. Capped by the
  // closest pair of slots (two players' average pivot positions can land
  // close together) so enlarged hit areas never overlap and cause mistaps.
  const slotHitR = useMemo(() => {
    const baseR = (slotRadius ?? 3.6) * SCALE;
    const desired = baseR + 14;
    if (!slots || slots.length < 2) return desired;
    const pts = slots.map((s) => toPx(s.x, s.y));
    let minDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < minDist) minDist = d;
      }
    }
    return Math.min(desired, minDist / 2 - 2);
  }, [slots, slotRadius, toPx]);

  // SVG paints in document order, so a neighbor listed later in `slots` can
  // sit on top of (and clip the visible edge of) whichever circle is
  // currently revealing its hoverPhoto. Render order only, doesn't touch
  // the original array anyone else relies on — the hovered slot just moves
  // to the end so it paints last, on top of everything else.
  const orderedSlots = useMemo(() => {
    if (!slots || !hoveredSlotId) return slots;
    const hovered = slots.find((s) => s.id === hoveredSlotId);
    if (!hovered) return slots;
    return [...slots.filter((s) => s.id !== hoveredSlotId), hovered];
  }, [slots, hoveredSlotId]);

  const { coverage, marks, dots } = useMemo(() => {
    const coverage: React.ReactNode[] = [];
    const marks: React.ReactNode[] = [];
    const dots: React.ReactNode[] = [];

    triangles.forEach((t, i) => {
      const passStart = toPx(t.receiveX - t.v1.dx, t.receiveY - t.v1.dy);
      const receive = toPx(t.receiveX, t.receiveY);
      const pivot = toPx(t.pivotX, t.pivotY);
      const passEnd = toPx(t.pivotX + t.v2.dx, t.pivotY + t.v2.dy);
      const color = OUTCOME_COLOR_VAR[t.outcome];

      const hull = convexHull([passStart, receive, pivot, passEnd]);
      coverage.push(
        <polygon
          key={`cov-${i}`}
          points={hull.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={color}
          fillOpacity={fillOpacity * 0.35}
          stroke="none"
        />
      );

      const hoverHandlers = interactive
        ? {
            onMouseEnter: () =>
              setHover({
                x: pivot.x,
                y: pivot.y,
                lines: [
                  `${t.passer} → ${t.pivot} → ${t.recipient ?? "?"}`,
                  `${t.outcome} · min ${t.minute}`,
                ],
              }),
            onMouseLeave: () => setHover(null),
          }
        : {};

      marks.push(
        <g key={i} className="pc-mark" style={interactive ? undefined : { cursor: "default" }}>
          {/* pass in: narrow at its real origin, widening toward the pivot */}
          {legs === "both" && (
            <polygon points={trapezoid(passStart, receive, NARROW_W, WIDE_W)} fill={color} fillOpacity={fillOpacity} stroke="none" />
          )}
          {/* carry / dribble between receiving and releasing (zero-length and invisible if the pivot one-touched it) */}
          <line
            x1={receive.x}
            y1={receive.y}
            x2={pivot.x}
            y2={pivot.y}
            stroke={color}
            strokeOpacity={fillOpacity * 2}
            strokeWidth={1}
            strokeDasharray="3 2.5"
          />
          {/* pass out: same thin-to-thick convention as pass in, read in the direction of travel */}
          <polygon points={trapezoid(pivot, passEnd, NARROW_W, WIDE_W)} fill={color} fillOpacity={fillOpacity} stroke="none" />
          {/* wide invisible hit area, since the visible marks are thin */}
          <polyline
            points={`${passStart.x},${passStart.y} ${receive.x},${receive.y} ${pivot.x},${pivot.y} ${passEnd.x},${passEnd.y}`}
            fill="none"
            stroke="transparent"
            strokeWidth={9}
            {...hoverHandlers}
          />
        </g>
      );

      dots.push(
        <circle key={`dot-${i}`} cx={pivot.x} cy={pivot.y} r={1.6} fill={color} fillOpacity={0.55} />
      );
    });

    return { coverage, marks, dots };
  }, [triangles, fillOpacity, interactive, toPx]);

  return (
    <div className={`pc-chart-wrap pc-pitch-wrap${isLandscape ? " pc-pitch-wrap--landscape" : ""}`}>
      {/* labelled at each goal directly, rather than one arrowed label that
          could be misread as describing whichever end it sits closest to */}
      <div className="pc-pitch-end-label pc-pitch-end-label--top">{endLabels[0]}</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="pc-pitch"
        role="img"
        aria-label="Passing triangles plotted on the pitch"
        // Tapping/clicking anywhere that isn't a slot (which stops
        // propagation below) clears whatever's currently revealed — mobile
        // has no hover-away to fall back on, so without this a tapped
        // circle had no way to deselect except tapping that same circle
        // again.
        onClick={() => {
          if (hoveredSlotId) setHoveredSlotId(null);
          setHover(null);
        }}
      >
        <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="var(--baseline)" />
        {(() => {
          const a = toPx(60, 0);
          const b = toPx(60, 80);
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--baseline)" />;
        })()}
        {(() => {
          const c = toPx(60, 40);
          return (
            <>
              <circle cx={c.x} cy={c.y} r={10 * SCALE} fill="none" stroke="var(--baseline)" />
              <circle cx={c.x} cy={c.y} r={2} fill="var(--baseline)" />
            </>
          );
        })()}

        {/* penalty boxes: own goal at pitch-x 0, attacking goal at pitch-x 120 */}
        <rect {...pitchRect(0, 18, 18, 62)} fill="none" stroke="var(--baseline)" />
        <rect {...pitchRect(102, 18, 120, 62)} fill="none" stroke="var(--baseline)" />
        <rect {...pitchRect(0, 30, 6, 50)} fill="none" stroke="var(--baseline)" />
        <rect {...pitchRect(114, 30, 120, 50)} fill="none" stroke="var(--baseline)" />

        {coverage}
        {marks}
        {dots}

        {orderedSlots?.map((slot, i) => {
          const p = toPx(slot.x, slot.y);
          const color = slot.color ?? SLOT_STATE_COLOR[slot.state];
          const r = (slotRadius ?? 3.6) * SCALE;
          const clipId = `ptmg-slot-clip-${i}`;
          const isDropTarget = dropTarget?.id === slot.id;
          const isHovered = hoveredSlotId === slot.id;
          const displayPhoto = slot.photo ?? (isHovered ? slot.hoverPhoto : undefined);
          const showHoverAffordance = !onSlotClick && !!slot.tooltip;
          const enterHover = () => {
            setHover({ x: p.x, y: p.y, lines: slot.tooltip! });
            setHoveredSlotId(slot.id);
          };
          const leaveHover = () => {
            setHover(null);
            setHoveredSlotId(null);
          };
          return (
            // Outer <g> carries only the animated position — a plain CSS
            // transition on `transform` (universally animatable, unlike
            // trying to transition `cx`/`cy` directly across browsers) so
            // slots glide between their offense/defense coordinates whenever
            // a caller re-passes `slots` with new x/y for the same id
            // (React keeps the same DOM node since the key is unchanged).
            // Inert wherever x/y never changes (Passing Compass, Matching
            // Game), since a CSS transition only fires on an actual change.
            <g key={slot.id} style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: "transform 0.7s ease-in-out" }}>
              <g
                data-slot-id={slot.id}
                onClick={
                  onSlotClick
                    ? (e) => {
                        e.stopPropagation();
                        onSlotClick(slot.id);
                      }
                    : showHoverAffordance
                    ? (e) => {
                        e.stopPropagation();
                        isHovered ? leaveHover() : enterHover();
                      }
                    : undefined
                }
                onPointerDown={onSlotPointerDown ? (e) => onSlotPointerDown(slot.id, e) : undefined}
                onMouseEnter={showHoverAffordance ? enterHover : undefined}
                onMouseLeave={showHoverAffordance ? leaveHover : undefined}
                style={{
                  ...(onSlotClick ? { cursor: "pointer", touchAction: "none" } : undefined),
                  ...(showHoverAffordance ? { cursor: "pointer" } : undefined),
                  // Grows the whole circle toward a dragged avatar hovering it —
                  // only when the drop would actually be accepted; a blocked
                  // (locked) target relies on the red ring alone, not growth,
                  // since it isn't somewhere the drag should feel invited to land.
                  // Also grows whichever slot is revealing its hoverPhoto, so it
                  // reads as brought-forward rather than just reordered underneath.
                  transform: (isDropTarget && !dropTarget?.blocked) || (isHovered && displayPhoto) ? "scale(1.14)" : undefined,
                  transformOrigin: "0 0",
                  transition: "transform 0.15s ease",
                }}
                role={onSlotClick || showHoverAffordance ? "button" : undefined}
                aria-label={onSlotClick ? `Lineup slot, ${slot.state}` : slot.tooltip?.join(", ")}
              >
                {(onSlotClick || showHoverAffordance) && <circle cx={0} cy={0} r={slotHitR} fill="transparent" />}
                {isDropTarget && (
                  <circle
                    cx={0}
                    cy={0}
                    r={r + 6}
                    fill="none"
                    stroke={dropTarget?.blocked ? "var(--status-critical)" : "var(--status-warning)"}
                    strokeWidth={2.5}
                    strokeDasharray={dropTarget?.blocked ? "3 3" : undefined}
                  />
                )}
                <circle cx={0} cy={0} r={r} fill={displayPhoto ? "var(--surface-1)" : slot.fill ?? "var(--surface-1)"} fillOpacity={displayPhoto || slot.fill ? 1 : 0.92} stroke={color} strokeWidth={2} strokeDasharray={slot.state === "revealed" ? "3 2.5" : undefined} />
                {displayPhoto ? (
                  <>
                    <clipPath id={clipId}>
                      <circle cx={0} cy={0} r={r - 1.5} />
                    </clipPath>
                    <image
                      href={displayPhoto}
                      x={-r}
                      y={-r}
                      width={r * 2}
                      height={r * 2}
                      clipPath={`url(#${clipId})`}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    <circle cx={0} cy={0} r={r - 1} fill="none" stroke={color} strokeWidth={2} strokeDasharray={slot.state === "revealed" ? "3 2.5" : undefined} />
                    {/* jersey-number badge, offset outside the photo circle so it isn't clipped */}
                    <circle cx={r * 0.75} cy={r * 0.75} r={r * 0.4} fill="#0b3866" stroke="var(--surface-1)" strokeWidth={1.5} />
                    <text
                      x={r * 0.75}
                      y={r * 0.75}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={9}
                      fontWeight={700}
                      fill="#fff"
                    >
                      {slot.label}
                    </text>
                  </>
                ) : (
                  <text x={0} y={0} textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700} fill={slot.textColor ?? color}>
                    {slot.label}
                  </text>
                )}
              </g>
            </g>
          );
        })}
      </svg>

      <div className="pc-pitch-end-label pc-pitch-end-label--bottom">{endLabels[1]}</div>

      {hover && (
        <div
          className="pc-tooltip"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
        >
          {hover.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
