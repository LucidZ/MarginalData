import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { CAR_M, M_PER_MI, MPS_PER_MPH, prefersReducedMotion } from "../lanes";
import "../widgets.css";
import {
  COUNTER_M,
  DEFAULT_LEVERS,
  DT,
  MAX_REACTION_S,
  VIEW_M,
  VIEW_START_M,
  averageSpeed,
  carsPerHour,
  createSim,
  hasContacts,
  nearestCar,
  slowest,
  step,
  tap,
} from "./sim";
import type { Levers, Sim } from "./sim";

// Seconds between arrivals, top to bottom. Bunched where the lanes reach capacity.
const SEC_PER_CAR = [5, 4, 3, 2.5, 2.25, 2, 1.75, 1.5, 1.25, 1];
const TIME_SCALES = [1, 2, 5];
const TICK_S = 8;
const TAP_SPOT_M = VIEW_START_M + VIEW_M * 0.8; // near the far end, so waves have road to run back along

const LEVERS: {
  key: keyof Levers;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint: string;
}[] = [
  {
    key: "reactionS",
    label: "Reaction time",
    min: 0,
    max: MAX_REACTION_S,
    step: 0.1,
    fmt: (v) => `${v.toFixed(1)} s`,
    hint: "Human Driver Model tests 0–2 s; drivers watching only the next car go unstable past 0.8 s.",
  },
  {
    key: "gapS",
    label: "Following gap",
    min: 0.8,
    max: 3,
    step: 0.1,
    fmt: (v) => `${v.toFixed(1)} s`,
    hint: "IDM default 1.5 s; realistic 0.8–2 s, and German driving schools teach 1.8 s.",
  },
  {
    key: "accel",
    label: "Acceleration",
    min: 0.3,
    max: 2.5,
    step: 0.1,
    fmt: (v) => `${v.toFixed(1)} m/s²`,
    hint: "Realistic 0.8–2.5 m/s². 1 m/s² is about 2.2 mph per second.",
  },
  {
    key: "decel",
    label: "Comfortable braking",
    min: 1,
    max: 4,
    step: 0.1,
    fmt: (v) => `${v.toFixed(1)} m/s²`,
    hint: "Realistic about 2 m/s². Not a limit: drivers brake harder when they have to.",
  },
  {
    key: "desiredMph",
    label: "Desired speed, average",
    min: 40,
    max: 75,
    step: 1,
    fmt: (v) => `${v} mph`,
    hint: "A property of the road. The IDM highway default is 75 mph.",
  },
  {
    key: "spreadMph",
    label: "Desired speed, spread",
    min: 0,
    max: 10,
    step: 1,
    fmt: (v) => `± ${v} mph`,
    hint: "How much drivers differ. With no passing, the slowest ones set the pace.",
  },
  {
    key: "tapsPerHour",
    label: "Random taps, per driver",
    min: 0,
    max: 30,
    step: 1,
    fmt: (v) => `${v} per hour`,
    hint: "A guess; no study pins this down. Models usually use steady noise rather than discrete taps.",
  },
  {
    key: "tapMph",
    label: "How hard each tap is",
    min: 0,
    max: 20,
    step: 1,
    fmt: (v) => `${v} mph off`,
    hint: "A guess. The speed one driver sheds in a one-second tap.",
  },
];

// Slowing down is one ramp, quiet at cruising speed and darker the slower a car goes.
const RAMP: [number, [number, number, number]][] = [
  [0, [122, 26, 16]],
  [0.53, [235, 104, 52]],
  [1, [150, 166, 184]],
];
const rampColor = (f: number) => {
  const m = Math.min(f, 1);
  const i = m < RAMP[1][0] ? 0 : 1;
  const [m0, c0] = RAMP[i];
  const [m1, c1] = RAMP[i + 1];
  const g = (m - m0) / (m1 - m0);
  return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * g)).join(",")})`;
};
const SPEED_COLORS = Array.from({ length: 51 }, (_, i) => rampColor(i / 50));
const RAMP_CSS = `linear-gradient(to right, ${RAMP.map(([f]) => rampColor(f)).join(", ")})`;

const toMph = (mps: number) => mps / MPS_PER_MPH;
// Cars read as "at speed" a little under the average desired speed.
const fullColorMph = (l: Levers) => Math.max(l.desiredMph - 8, 10);

type Row = { slowest: number; average: number; perHour: number };
const readRows = (sim: Sim): Row[] =>
  sim.lanes.map((lane) => ({
    slowest: toMph(slowest(lane)),
    average: toMph(averageSpeed(lane)),
    perHour: carsPerHour(lane),
  }));

export default function BrakeWave() {
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [levers, setLevers] = useState(DEFAULT_LEVERS);
  const simRef = useRef<Sim | null>(null);
  if (!simRef.current) simRef.current = createSim(SEC_PER_CAR, levers);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [timeScale, setTimeScale] = useState(2);
  const [rows, setRows] = useState<Row[]>(() => readRows(simRef.current!));
  const [contacts, setContacts] = useState(false);

  const compact = width < 560;
  const leftGutter = compact ? 44 : 60;
  const rightGutter = compact ? 52 : 72;
  const headerH = 28;
  const laneH = compact ? 18 : 24;
  const height = headerH + laneH * SEC_PER_CAR.length + 8;
  const roadW = width - leftGutter - rightGutter;

  useEffect(() => {
    simRef.current!.levers = levers;
  }, [levers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const pxPerM = roadW / VIEW_M;
    const xOf = (m: number) => leftGutter + (m - VIEW_START_M) * pxPerM;
    const carW = Math.max(CAR_M * pxPerM, compact ? 3 : 5);
    const carH = compact ? 5 : 6;

    const draw = () => {
      const sim = simRef.current!;
      const css = getComputedStyle(canvas);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const roadTop = headerH;
      const roadBottom = headerH + laneH * SEC_PER_CAR.length;
      const fontPx = compact ? 11 : 12;
      const fullMph = fullColorMph(sim.levers);

      ctx.clearRect(0, 0, width, height);

      // Headers
      ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = v("--muted");
      ctx.textAlign = "left";
      ctx.fillText("Arrivals", 0, headerH - 10);
      ctx.textAlign = "right";
      ctx.fillText("Slowest", width, headerH - 10);
      ctx.textAlign = "center";
      ctx.fillStyle = v("--text-secondary");
      ctx.fillText("Counter", xOf(COUNTER_M), headerH - 10);

      // Road
      ctx.fillStyle = v("--road");
      ctx.fillRect(leftGutter, roadTop, roadW, roadBottom - roadTop);
      ctx.strokeStyle = v("--baseline");
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      for (let i = 1; i < SEC_PER_CAR.length; i++) {
        const y = roadTop + i * laneH + 0.5;
        ctx.beginPath();
        ctx.moveTo(leftGutter, y);
        ctx.lineTo(leftGutter + roadW, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Cars, colored by speed
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftGutter, roadTop, roadW, roadBottom - roadTop);
      ctx.clip();
      sim.lanes.forEach((lane, i) => {
        const yMid = roadTop + i * laneH + laneH / 2;
        for (const car of lane.cars) {
          const x = xOf(car.x);
          if (x < leftGutter - carW || x > leftGutter + roadW + carW) continue;
          ctx.fillStyle = SPEED_COLORS[Math.min(50, Math.round((toMph(car.v) / fullMph) * 50))];
          ctx.fillRect(x - carW, yMid - carH / 2, carW, carH);
          // A tick stays over a driver for a few seconds after a tap, to show where waves begin.
          if (car.tapUntil >= 0 && sim.t < car.tapUntil + TICK_S) {
            ctx.fillStyle = v("--text-primary");
            ctx.fillRect(x - carW / 2 - 1, yMid - laneH / 2 + 1, 2, laneH - 2);
          }
        }
      });
      ctx.restore();

      // Counter
      ctx.strokeStyle = v("--text-secondary");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xOf(COUNTER_M), roadTop - 4);
      ctx.lineTo(xOf(COUNTER_M), roadBottom + 4);
      ctx.stroke();

      // Lane labels
      ctx.textBaseline = "middle";
      sim.lanes.forEach((lane, i) => {
        const yMid = roadTop + i * laneH + laneH / 2;
        ctx.font = `600 ${compact ? 12 : 14}px system-ui, sans-serif`;
        ctx.fillStyle = v("--text-primary");
        ctx.textAlign = "left";
        ctx.fillText(`${lane.secPerCar} s`, 0, yMid);
        ctx.font = `${compact ? 12 : 14}px system-ui, sans-serif`;
        ctx.fillStyle = v("--text-secondary");
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(toMph(slowest(lane)))} mph`, width, yMid);
      });
    };

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let lastRead = -1;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); // don't jump after a hidden tab
      last = now;
      const sim = simRef.current!;
      if (playing) {
        acc += dt * timeScale;
        while (acc >= DT) {
          step(sim);
          acc -= DT;
        }
      }
      const sec = Math.floor(now / 1000);
      if (sec !== lastRead) {
        lastRead = sec;
        setRows(readRows(sim));
        setContacts(hasContacts(sim));
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height, roadW, playing, timeScale, compact, leftGutter, laneH]);

  const tapAll = () => {
    const sim = simRef.current!;
    sim.lanes.forEach((lane, i) => tap(sim, i, nearestCar(lane, TAP_SPOT_M)));
  };

  // Clicking the road taps the nearest car in that lane.
  const tapAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const sim = simRef.current!;
    const box = e.currentTarget.getBoundingClientRect();
    const lane = Math.floor((e.clientY - box.top - headerH) / laneH);
    const x = VIEW_START_M + ((e.clientX - box.left - leftGutter) / roadW) * VIEW_M;
    if (lane < 0 || lane >= sim.lanes.length || x < VIEW_START_M || x > VIEW_START_M + VIEW_M) return;
    tap(sim, lane, nearestCar(sim.lanes[lane], x));
  };

  const restart = () => {
    const sim = createSim(SEC_PER_CAR, levers);
    simRef.current = sim;
    setRows(readRows(sim));
    setContacts(false);
  };

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← I-70 widgets
      </Link>
      <h1>One tap, ten lanes</h1>
      <p className="i70w-intro">
        Ten lanes of simulated drivers. Cars arrive from the left at a steady rate, from one every 5
        seconds in the top lane to one a second in the bottom lane. Every driver follows the same
        rules and nobody can pass. How many cars actually get through, and how fast, isn't set
        anywhere: it comes out of the drivers reacting to each other. Pull the levers and watch the
        table.
      </p>

      <div className="i70w-controls">
        <button type="button" onClick={tapAll}>
          Tap the brakes
        </button>
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={restart}>
          Restart
        </button>
        <button type="button" onClick={() => setLevers(DEFAULT_LEVERS)}>
          Reset levers
        </button>
        <span className="i70w-seg" role="group" aria-label="Playback speed">
          {TIME_SCALES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={timeScale === s}
              onClick={() => setTimeScale(s)}
            >
              {s}×
            </button>
          ))}
        </span>
      </div>

      <div ref={wrapRef} className="i70w-canvas-wrap">
        <canvas
          ref={canvasRef}
          onClick={tapAt}
          style={{ width: `${width}px`, height: `${height}px`, cursor: "pointer" }}
          role="img"
          aria-label="Ten lanes of simulated traffic with arrivals from one car every 5 seconds to one every second, cars colored by speed. The table below gives each lane's flow and speeds."
        />
      </div>
      <div className="i70w-ramp">
        <span>0 mph</span>
        <i style={{ background: RAMP_CSS }} />
        <span>{fullColorMph(levers)}+ mph</span>
      </div>
      {contacts && (
        <p className="i70w-warn" role="status">
          Cars are running into the car ahead at these settings. That's the model breaking, not a
          crash to read anything into: real drivers look further up the road than this one does.
        </p>
      )}
      <p className="i70w-note">
        Click any car to tap just that one. A black tick marks a driver who just tapped. A{" "}
        {(VIEW_M / M_PER_MI).toFixed(1)}-mile stretch, cars drawn a little longer than scale.
      </p>

      <div className="i70w-levers">
        {LEVERS.map((lever) => (
          <label key={lever.key} className="i70w-lever">
            <span>{lever.label}</span>
            <output>{lever.fmt(levers[lever.key])}</output>
            <input
              type="range"
              aria-label={lever.label}
              min={lever.min}
              max={lever.max}
              step={lever.step}
              value={levers[lever.key]}
              onChange={(e) => setLevers((l) => ({ ...l, [lever.key]: Number(e.target.value) }))}
            />
            <small>{lever.hint}</small>
          </label>
        ))}
      </div>

      <table className="i70w-table">
        <thead>
          <tr>
            <th>Arrivals</th>
            <th>Arriving per hour</th>
            <th>Passing the counter, last 3 min</th>
            <th>Average speed now</th>
            <th>Slowest, last 2 min</th>
          </tr>
        </thead>
        <tbody>
          {SEC_PER_CAR.map((s, i) => (
            <tr key={s}>
              <td>{s} s</td>
              <td>{Math.round(3600 / s).toLocaleString()}</td>
              <td>{Math.round(rows[i].perHour).toLocaleString()}</td>
              <td>{Number.isNaN(rows[i].average) ? "–" : `${Math.round(rows[i].average)} mph`}</td>
              <td>{Number.isFinite(rows[i].slowest) ? `${Math.round(rows[i].slowest)} mph` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="i70w-note">
        A model, not I-70 data. Cars follow IDM+, a variant of the Intelligent Driver Model, with a
        reaction delay from the Human Driver Model. Left out: passing, trucks, hills, weather, and
        drivers looking more than one car ahead. Arrivals that find no room join the first gap there
        is, so a lane can't pass on more cars than it can carry.
      </p>
    </div>
  );
}
