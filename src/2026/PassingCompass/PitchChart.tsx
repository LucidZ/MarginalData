import { useId, useMemo, useState } from "react";
import type { TriangleRecord, PassOutcome } from "./types";

const OUTCOME_COLOR_VAR: Record<PassOutcome, string> = {
  Complete: "var(--status-good)",
  Incomplete: "var(--status-critical)",
  Out: "var(--status-serious)",
  "Pass Offside": "var(--status-warning)",
  Unknown: "var(--muted)",
};

// StatsBomb pitch is 120 x 80 units; SCALE just controls SVG precision.
const PITCH_W = 120;
const PITCH_H = 80;
const SCALE = 6;
const W = PITCH_W * SCALE;
const H = PITCH_H * SCALE;

type Pt = { x: number; y: number };

function toPx(x: number, y: number): Pt {
  return { x: x * SCALE, y: y * SCALE };
}

function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

function normalize(a: Pt): Pt {
  const n = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / n, y: a.y / n };
}

/** Foot of the perpendicular from `point` onto the infinite line through `linePoint` in direction `dir` (unit vector). */
function footOfPerpendicular(point: Pt, linePoint: Pt, dir: Pt): Pt {
  const t = sub(point, linePoint).x * dir.x + sub(point, linePoint).y * dir.y;
  return { x: linePoint.x + dir.x * t, y: linePoint.y + dir.y * t };
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
  const uid = useId();

  const fillOpacity = Math.max(0.04, Math.min(0.3, 8 / Math.max(triangles.length, 1)));

  const { gradients, groups, dots } = useMemo(() => {
    const gradients: React.ReactNode[] = [];
    const groups: React.ReactNode[] = [];
    const dots: React.ReactNode[] = [];

    triangles.forEach((t, i) => {
      const pivot = toPx(t.pivotX, t.pivotY);
      const a = toPx(t.pivotX - t.v1.dx, t.pivotY - t.v1.dy);
      const b = toPx(t.pivotX + t.v2.dx, t.pivotY + t.v2.dy);
      const color = OUTCOME_COLOR_VAR[t.outcome];

      // Instead of filling the whole pivot-a-b triangle, carve a 4th point M
      // a short way from the pivot toward the midpoint of the far edge (a-b)
      // and split into two slim triangles, pivot-a-M and pivot-b-M. Each one
      // traces the *entire real length* of one pass line as its base edge,
      // gradient-dark right on that line and fading to light at M — so the
      // mark reads as two soft brushstrokes along the actual pass paths,
      // pulled back to a light concave notch near the pivot, rather than a
      // single flat triangular wedge.
      const NOTCH_T = 0.25;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const m = { x: pivot.x + NOTCH_T * (mid.x - pivot.x), y: pivot.y + NOTCH_T * (mid.y - pivot.y) };

      const dirPA = normalize(sub(a, pivot));
      const dirPB = normalize(sub(b, pivot));
      const footMOnPA = footOfPerpendicular(m, pivot, dirPA);
      const footMOnPB = footOfPerpendicular(m, pivot, dirPB);

      const gradIdA = `pc-gradA-${uid}-${i}`;
      const gradIdB = `pc-gradB-${uid}-${i}`;
      const peak = fillOpacity;
      const trough = fillOpacity * 0.08;

      gradients.push(
        <linearGradient key={gradIdA} id={gradIdA} x1={footMOnPA.x} y1={footMOnPA.y} x2={m.x} y2={m.y} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={peak} />
          <stop offset="100%" stopColor={color} stopOpacity={trough} />
        </linearGradient>,
        <linearGradient key={gradIdB} id={gradIdB} x1={footMOnPB.x} y1={footMOnPB.y} x2={m.x} y2={m.y} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={color} stopOpacity={peak} />
          <stop offset="100%" stopColor={color} stopOpacity={trough} />
        </linearGradient>
      );

      groups.push(
        <g
          key={i}
          className="pc-mark"
          style={interactive ? undefined : { cursor: "default" }}
          onMouseEnter={
            interactive
              ? () =>
                  setHover({
                    x: pivot.x,
                    y: pivot.y,
                    lines: [
                      `${t.passer} → ${t.pivot} → ${t.recipient ?? "?"}`,
                      `${t.outcome} · min ${t.minute}`,
                    ],
                  })
              : undefined
          }
          onMouseLeave={interactive ? () => setHover(null) : undefined}
        >
          <polygon points={`${pivot.x},${pivot.y} ${a.x},${a.y} ${m.x},${m.y}`} fill={`url(#${gradIdA})`} stroke="none" />
          <polygon points={`${pivot.x},${pivot.y} ${b.x},${b.y} ${m.x},${m.y}`} fill={`url(#${gradIdB})`} stroke="none" />
        </g>
      );

      dots.push(
        <circle key={`dot-${i}`} cx={pivot.x} cy={pivot.y} r={1.6} fill={color} fillOpacity={0.55} />
      );
    });

    return { gradients, groups, dots };
  }, [triangles, fillOpacity, uid, interactive]);

  return (
    <div className="pc-chart-wrap pc-pitch-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="pc-pitch" role="img" aria-label="Passing triangles plotted on the pitch">
        <defs>{gradients}</defs>
        <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="var(--baseline)" />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="var(--baseline)" />
        <circle cx={W / 2} cy={H / 2} r={10 * SCALE} fill="none" stroke="var(--baseline)" />
        <circle cx={W / 2} cy={H / 2} r={2} fill="var(--baseline)" />

        <rect x={0} y={18 * SCALE} width={18 * SCALE} height={44 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={(PITCH_W - 18) * SCALE} y={18 * SCALE} width={18 * SCALE} height={44 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={0} y={30 * SCALE} width={6 * SCALE} height={20 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={(PITCH_W - 6) * SCALE} y={30 * SCALE} width={6 * SCALE} height={20 * SCALE} fill="none" stroke="var(--baseline)" />

        {groups}
        {dots}
      </svg>

      <div className="pc-pitch-direction">Attacking →</div>

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
