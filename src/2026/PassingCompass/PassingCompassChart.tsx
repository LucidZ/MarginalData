import { useMemo, useState } from "react";
import { scaleLinear } from "d3";
import type { PassRecord, TriangleRecord, PassOutcome } from "./types";

const OUTCOME_COLOR_VAR: Record<PassOutcome, string> = {
  Complete: "var(--status-good)",
  Incomplete: "var(--status-critical)",
  Out: "var(--status-serious)",
  "Pass Offside": "var(--status-warning)",
  Unknown: "var(--muted)",
};

const SIZE = 560;
const CENTER = SIZE / 2;
const DOMAIN = 100;

// Forward (+x in StatsBomb coords) is drawn pointing up, so screenX comes
// from lateral spread (dy) and screenY comes from forward/back distance (dx).
const scale = scaleLinear().domain([-DOMAIN, DOMAIN]).range([-CENTER + 40, CENTER - 40]);

function toScreen(dx: number, dy: number) {
  return { x: CENTER + scale(dy), y: CENTER - scale(dx) };
}

interface Props {
  mode: "compass" | "chain" | "relative";
  passes: PassRecord[];
  triangles: TriangleRecord[];
}

interface HoverInfo {
  x: number;
  y: number;
  lines: string[];
}

export default function PassingCompassChart({ mode, passes, triangles }: Props) {
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const rings = [25, 50, 75, 100];

  const passElements = useMemo(() => {
    if (mode !== "compass") return null;
    return passes.map((p, i) => {
      const tip = toScreen(p.dx, p.dy);
      const color = OUTCOME_COLOR_VAR[p.outcome];
      return (
        <g
          key={i}
          className="pc-mark"
          onMouseEnter={() =>
            setHover({
              x: tip.x,
              y: tip.y,
              lines: [
                `${p.player}${p.recipient ? ` → ${p.recipient}` : ""}`,
                `${p.outcome} · min ${p.minute}`,
              ],
            })
          }
          onMouseLeave={() => setHover(null)}
        >
          <line x1={CENTER} y1={CENTER} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={2} opacity={0.55} />
          <circle cx={tip.x} cy={tip.y} r={4} fill={color} />
        </g>
      );
    });
  }, [mode, passes]);

  const chainElements = useMemo(() => {
    if (mode !== "chain") return null;
    return triangles.map((t, i) => {
      const p1 = toScreen(t.v1.dx, t.v1.dy);
      const p2 = toScreen(t.v1.dx + t.v2.dx, t.v1.dy + t.v2.dy);
      const color = OUTCOME_COLOR_VAR[t.outcome];
      return (
        <g
          key={i}
          className="pc-mark"
          onMouseEnter={() =>
            setHover({
              x: p2.x,
              y: p2.y,
              lines: [
                `${t.passer} → ${t.pivot}${t.recipient ? ` → ${t.recipient}` : ""}`,
                `${t.outcome} · min ${t.minute}`,
              ],
            })
          }
          onMouseLeave={() => setHover(null)}
        >
          <polyline
            points={`${CENTER},${CENTER} ${p1.x},${p1.y} ${p2.x},${p2.y}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={0.55}
          />
          <circle cx={p1.x} cy={p1.y} r={3} fill={color} opacity={0.7} />
          <circle cx={p2.x} cy={p2.y} r={4} fill={color} />
        </g>
      );
    });
  }, [mode, triangles]);

  // Centered on the pivot player (origin): point A is where the incoming pass
  // came from (-v1, since v1 runs A -> pivot), point B is where the outgoing
  // pass ends (+v2, since v2 runs pivot -> B). Fill-only, no stroke, so
  // hundreds of overlapping triangles build up density where they agree.
  const fillOpacity = Math.max(0.04, Math.min(0.25, 6 / Math.max(triangles.length, 1)));

  const relativeElements = useMemo(() => {
    if (mode !== "relative") return null;
    return triangles.map((t, i) => {
      const a = toScreen(-t.v1.dx, -t.v1.dy);
      const b = toScreen(t.v2.dx, t.v2.dy);
      const color = OUTCOME_COLOR_VAR[t.outcome];
      return (
        <polygon
          key={i}
          className="pc-mark"
          points={`${a.x},${a.y} ${CENTER},${CENTER} ${b.x},${b.y}`}
          fill={color}
          fillOpacity={fillOpacity}
          stroke="none"
          onMouseEnter={() =>
            setHover({
              x: CENTER,
              y: CENTER,
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
  }, [mode, triangles, fillOpacity]);

  return (
    <div className="pc-chart-wrap">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="pc-chart" role="img" aria-label="Passing compass chart">
        {rings.map((r) => (
          <circle key={r} cx={CENTER} cy={CENTER} r={Math.abs(scale(r) - scale(0))} fill="none" stroke="var(--gridline)" />
        ))}
        <line x1={40} y1={CENTER} x2={SIZE - 40} y2={CENTER} stroke="var(--baseline)" />
        <line x1={CENTER} y1={40} x2={CENTER} y2={SIZE - 40} stroke="var(--baseline)" />
        <text x={CENTER} y={28} textAnchor="middle" className="pc-axis-label">FORWARD</text>
        <text x={CENTER} y={SIZE - 14} textAnchor="middle" className="pc-axis-label">BACKWARD</text>

        {passElements}
        {chainElements}
        {relativeElements}

        <circle cx={CENTER} cy={CENTER} r={4} fill="var(--text-primary)" />
      </svg>

      {hover && (
        <div
          className="pc-tooltip"
          style={{ left: `${(hover.x / SIZE) * 100}%`, top: `${(hover.y / SIZE) * 100}%` }}
        >
          {hover.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
