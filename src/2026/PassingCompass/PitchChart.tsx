import { useMemo, useState } from "react";
import type { TriangleRecord, PassOutcome } from "./types";

const OUTCOME_COLOR_VAR: Record<PassOutcome, string> = {
  Complete: "var(--status-good)",
  Incomplete: "var(--status-critical)",
  Out: "var(--status-serious)",
  "Pass Offside": "var(--status-warning)",
  Unknown: "var(--muted)",
};

// StatsBomb pitch is 120 (length, x) x 80 (width, y) units; SCALE just
// controls SVG precision. Drawn portrait, attacking direction pointing up:
// screen x = pitch width (y), screen y = pitch length (x) inverted so
// higher x (forward) lands at a smaller screen y (closer to the top).
const PITCH_LENGTH = 120;
const PITCH_WIDTH = 80;
const SCALE = 6;
const W = PITCH_WIDTH * SCALE;
const H = PITCH_LENGTH * SCALE;

// Trapezoid taper widths for the two real passes — both taper thin-to-thick
// in their direction of travel (a point at the ball's origin, widest at
// where it ends up), same convention for pass in and pass out, so the taper
// itself reads as direction instead of needing a separate arrowhead marker.
const WIDE_W = 4.2;
const NARROW_W = 0;

type Pt = { x: number; y: number };

function toPx(x: number, y: number): Pt {
  return { x: y * SCALE, y: (PITCH_LENGTH - x) * SCALE };
}

/** Points for a quadrilateral from p1 (width w1) to p2 (width w2), centered on the p1-p2 line. */
function trapezoid(p1: Pt, p2: Pt, w1: number, w2: number): string {
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
function convexHull(points: Pt[]): Pt[] {
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

interface Props {
  triangles: TriangleRecord[];
  /** When false, hides hover tooltips (which name the pivot player) and pointer affordance — for the matching game before answers are checked. */
  interactive?: boolean;
}

interface HoverInfo {
  x: number;
  y: number;
  lines: string[];
}

export default function PitchChart({ triangles, interactive = true }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const fillOpacity = Math.max(0.06, Math.min(0.35, 6 / Math.max(triangles.length, 1)));

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
          <polygon points={trapezoid(passStart, receive, NARROW_W, WIDE_W)} fill={color} fillOpacity={fillOpacity} stroke="none" />
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
  }, [triangles, fillOpacity, interactive]);

  return (
    <div className="pc-chart-wrap pc-pitch-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="pc-pitch" role="img" aria-label="Passing triangles plotted on the pitch">
        <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="var(--baseline)" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--baseline)" />
        <circle cx={W / 2} cy={H / 2} r={10 * SCALE} fill="none" stroke="var(--baseline)" />
        <circle cx={W / 2} cy={H / 2} r={2} fill="var(--baseline)" />

        {/* penalty boxes: own goal at the bottom, attacking goal at the top */}
        <rect x={18 * SCALE} y={(PITCH_LENGTH - 18) * SCALE} width={44 * SCALE} height={18 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={18 * SCALE} y={0} width={44 * SCALE} height={18 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={30 * SCALE} y={(PITCH_LENGTH - 6) * SCALE} width={20 * SCALE} height={6 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={30 * SCALE} y={0} width={20 * SCALE} height={6 * SCALE} fill="none" stroke="var(--baseline)" />

        {coverage}
        {marks}
        {dots}
      </svg>

      <div className="pc-pitch-direction">Attacking ↑</div>

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
