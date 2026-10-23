import { useMemo } from "react";
import { scaleLinear } from "d3";
import type { Day, Direction, Station } from "./types";
import { LANDMARKS, MP_DOMAIN } from "./scales";
import { fmtCount } from "./format";
import { useTweened } from "./useTweened";

interface RoadStripProps {
  day: Day;
  stations: Station[];
  hour: number;
  yMax: number;
  width: number;
  tweenMs: number;
  showLandmarks: boolean;
}

const SHORT_NAMES: Record<string, string> = {
  "000119": "Copper",
  "000106": "Tunnel",
  "000120": "Twin T.",
  "000107": "Genesee",
};

const MOBILE_LEAN: Record<string, "start" | "end"> = {
  "000120": "end",
};

const NAME_ROW = 18;
const LABEL_ROOM = 16;
const ROAD_H = 28;
const LANDMARK_ROW = 42;
const MISSING_H = 10;

// A bar rooted on the road edge at y0, extending `len` px away from it
// (up when dir = -1, down when dir = 1), with only the far end rounded.
const barPath = (cx: number, y0: number, len: number, w: number, dir: -1 | 1) => {
  const r = Math.min(4, len, w / 2);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const yEnd = y0 + dir * len;
  const yArc = yEnd - dir * r;
  const sweep = dir === -1 ? 1 : 0;
  return [
    `M${x0},${y0}`,
    `V${yArc}`,
    `A${r},${r} 0 0 ${sweep} ${x0 + r},${yEnd}`,
    `H${x1 - r}`,
    `A${r},${r} 0 0 ${sweep} ${x1},${yArc}`,
    `V${y0}`,
    "Z",
  ].join("");
};

export default function RoadStrip({ day, stations, hour, yMax, width, tweenMs, showLandmarks }: RoadStripProps) {
  const isMobile = width < 600;
  const laneH = isMobile ? 64 : 84;
  const barW = isMobile ? 14 : 20;

  const roadTop = NAME_ROW + LABEL_ROOM + laneH;
  const roadBottom = roadTop + ROAD_H;
  const height = roadBottom + laneH + LABEL_ROOM + (showLandmarks ? LANDMARK_ROW : 4);

  const x = useMemo(() => scaleLinear().domain(MP_DOMAIN).range([0, width]), [width]);
  const len = useMemo(() => scaleLinear().domain([0, yMax]).range([0, laneH]), [yMax, laneH]);

  const value = (id: string, dir: Direction) => day.counts[id]?.[dir]?.[hour] ?? null;
  const targets = stations.flatMap((s) => [value(s.id, "wb") ?? 0, value(s.id, "eb") ?? 0]);
  const tweened = useTweened(targets, tweenMs);

  const landmarks = LANDMARKS.filter((l) => !isMobile || l.major);
  const laneMid = (top: boolean) => (top ? roadTop + ROAD_H / 4 : roadTop + (3 * ROAD_H) / 4);
  // The lane arrows sit in the widest gap between counters (Tunnel to Twin Tunnels).
  const arrowX = x(227.5);

  return (
    <svg width={width} height={height} className="i70-strip" role="img"
      aria-label={`${day.label}, ${day.date}: vehicles per hour at four I-70 counters`}>
      {/* road surface, edge lines, double-yellow centerline */}
      <rect x={0} y={roadTop} width={width} height={ROAD_H} className="i70-road" />
      <line x1={0} x2={width} y1={roadTop + 1} y2={roadTop + 1} className="i70-road-edge" />
      <line x1={0} x2={width} y1={roadBottom - 1} y2={roadBottom - 1} className="i70-road-edge" />
      <line x1={0} x2={width} y1={roadTop + ROAD_H / 2 - 1.5} y2={roadTop + ROAD_H / 2 - 1.5} className="i70-centerline" />
      <line x1={0} x2={width} y1={roadTop + ROAD_H / 2 + 1.5} y2={roadTop + ROAD_H / 2 + 1.5} className="i70-centerline" />

      <text x={arrowX} y={laneMid(true)} dy="0.35em" textAnchor="middle" className="i70-lane-text">
        <tspan className="i70-arrow-wb">◀</tspan> westbound, to the mountains
      </text>
      <text x={arrowX} y={laneMid(false)} dy="0.35em" textAnchor="middle" className="i70-lane-text">
        eastbound, to Denver <tspan className="i70-arrow-eb">▶</tspan>
      </text>
      {!isMobile && (
        <>
          <text x={6} y={laneMid(true)} dy="0.35em" className="i70-lane-text">◀ Vail</text>
          <text x={width - 6} y={laneMid(false)} dy="0.35em" textAnchor="end" className="i70-lane-text">Denver ▶</text>
        </>
      )}

      {stations.map((s, i) => {
        const cx = x(s.mp);
        // Phones: Twin Tunnels sits ~40px from Genesee (which already hugs
        // the right edge), so its name leans left.
        const lean = isMobile ? MOBILE_LEAN[s.id] : undefined;
        const anchor = lean ?? (cx < 40 ? "start" : cx > width - 40 ? "end" : "middle");
        const nameX = anchor === "start" ? cx - barW / 2 : anchor === "end" ? cx + barW / 2 : cx;
        return (
          <g key={s.id}>
            <text x={nameX} y={NAME_ROW - 5} textAnchor={anchor} className="i70-station-name">
              {isMobile ? SHORT_NAMES[s.id] : s.name}
            </text>
            {(["wb", "eb"] as Direction[]).map((dir, j) => {
              const v = value(s.id, dir);
              const up = dir === "wb";
              const y0 = up ? roadTop : roadBottom;
              const sign = up ? -1 : 1;
              if (v === null) {
                const yRect = up ? y0 - MISSING_H : y0;
                return (
                  <g key={dir}>
                    <rect x={cx - barW / 2} y={yRect} width={barW} height={MISSING_H} rx={2} className="i70-missing" />
                    <text x={cx} y={y0 + sign * (MISSING_H + 4)} dy={up ? 0 : "0.7em"} textAnchor="middle"
                      className="i70-bar-value i70-bar-missing-text">no data</text>
                  </g>
                );
              }
              const l = len(tweened[i * 2 + j]);
              return (
                <g key={dir}>
                  {l > 0.5 && <path d={barPath(cx, y0, l, barW, sign as -1 | 1)} className={`i70-bar i70-bar-${dir}`} />}
                  <text x={cx} y={y0 + sign * (len(v) + 4)} dy={up ? 0 : "0.7em"} textAnchor="middle" className="i70-bar-value">
                    {fmtCount(v)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}

      {showLandmarks &&
        landmarks.map((l) => (
          <g key={l.name}>
            <line x1={x(l.mp)} x2={x(l.mp)} y1={height - LANDMARK_ROW + 2} y2={height - LANDMARK_ROW + 8 + (l.row ? 13 : 0)} className="i70-landmark-tick" />
            <text x={x(l.mp)} y={height - LANDMARK_ROW + 20 + (l.row ? 13 : 0)} textAnchor="middle" className="i70-landmark">{l.name}</text>
          </g>
        ))}
    </svg>
  );
}
