import { useMemo, useState } from "react";
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

function toPx(x: number, y: number) {
  return { x: x * SCALE, y: y * SCALE };
}

interface Props {
  triangles: TriangleRecord[];
}

interface HoverInfo {
  x: number;
  y: number;
  lines: string[];
}

export default function PitchChart({ triangles }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const fillOpacity = Math.max(0.04, Math.min(0.3, 8 / Math.max(triangles.length, 1)));

  const elements = useMemo(() => {
    return triangles.map((t, i) => {
      const pivot = toPx(t.pivotX, t.pivotY);
      const a = toPx(t.pivotX - t.v1.dx, t.pivotY - t.v1.dy);
      const b = toPx(t.pivotX + t.v2.dx, t.pivotY + t.v2.dy);
      const color = OUTCOME_COLOR_VAR[t.outcome];
      return (
        <polygon
          key={i}
          className="pc-mark"
          points={`${a.x},${a.y} ${pivot.x},${pivot.y} ${b.x},${b.y}`}
          fill={color}
          fillOpacity={fillOpacity}
          stroke="none"
          onMouseEnter={() =>
            setHover({
              x: pivot.x,
              y: pivot.y,
              lines: [
                `${t.passer} → ${t.pivot} → ${t.recipient ?? "?"}`,
                `${t.outcome} · min ${t.minute}`,
              ],
            })
          }
          onMouseLeave={() => setHover(null)}
        />
      );
    });
  }, [triangles, fillOpacity]);

  return (
    <div className="pc-chart-wrap pc-pitch-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="pc-pitch" role="img" aria-label="Passing triangles plotted on the pitch">
        <rect x={1} y={1} width={W - 2} height={H - 2} fill="none" stroke="var(--baseline)" />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="var(--baseline)" />
        <circle cx={W / 2} cy={H / 2} r={10 * SCALE} fill="none" stroke="var(--baseline)" />
        <circle cx={W / 2} cy={H / 2} r={2} fill="var(--baseline)" />

        <rect x={0} y={18 * SCALE} width={18 * SCALE} height={44 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={(PITCH_W - 18) * SCALE} y={18 * SCALE} width={18 * SCALE} height={44 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={0} y={30 * SCALE} width={6 * SCALE} height={20 * SCALE} fill="none" stroke="var(--baseline)" />
        <rect x={(PITCH_W - 6) * SCALE} y={30 * SCALE} width={6 * SCALE} height={20 * SCALE} fill="none" stroke="var(--baseline)" />

        {elements}
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
