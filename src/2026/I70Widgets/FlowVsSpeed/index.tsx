import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import "../widgets.css";
import "./FlowVsSpeed.css";

const SPEEDS_MPH = [10, 20, 30, 40, 50, 60, 70];
const MPS_PER_MPH = 0.44704;
const FT_PER_M = 3.28084;
const ROAD_M = 200; // visible stretch, same for every lane
const COUNTER_M = ROAD_M / 2;
const CAR_M = 4.5; // drawn to scale along the road
const FLOW_MIN = 600;
const FLOW_MAX = 2400;
const FLOW_DEFAULT = 1800;
const FLASH_S = 0.15;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function FlowVsSpeed() {
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [flow, setFlow] = useState(FLOW_DEFAULT); // cars per hour, per lane
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [tally, setTally] = useState(0);

  const headway = 3600 / flow; // seconds between cars, every lane
  // Simulation clock. Car k crosses the counter at t = k * headway in every lane,
  // so the lanes stay in lockstep at the counter whatever their speed.
  const tRef = useRef(headway * 0.5);

  const compact = width < 560;
  const leftGutter = compact ? 52 : 80;
  const rightGutter = compact ? 52 : 96;
  const headerH = 28;
  const laneH = compact ? 24 : 32;
  const height = headerH + laneH * SPEEDS_MPH.length + 8;

  useEffect(() => {
    tRef.current = headway * 0.5;
    setTally(0);
  }, [headway]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const roadW = width - leftGutter - rightGutter;
    const pxPerM = roadW / ROAD_M;
    const xOf = (m: number) => leftGutter + m * pxPerM;
    const carW = CAR_M * pxPerM;
    // Keep a car-ish aspect ratio rather than filling the (exaggerated) lane.
    const carH = Math.max(5, Math.min(carW * 0.55, laneH * 0.45));

    const draw = () => {
      const css = getComputedStyle(canvas);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const t = tRef.current;
      const sinceCross = t - Math.floor(t / headway) * headway;
      const flashing = sinceCross < FLASH_S;

      ctx.clearRect(0, 0, width, height);
      const roadTop = headerH;
      const roadBottom = headerH + laneH * SPEEDS_MPH.length;

      // Column headers
      ctx.font = `600 ${compact ? 11 : 12}px system-ui, sans-serif`;
      ctx.fillStyle = v("--muted");
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillText("Speed", 0, headerH - 10);
      ctx.textAlign = "right";
      ctx.fillText(compact ? "Cars/mi" : "Cars per mile", width, headerH - 10);
      ctx.textAlign = "center";
      ctx.fillStyle = v("--counter");
      ctx.fillText("Counter", xOf(COUNTER_M), headerH - 10);

      // Road
      ctx.fillStyle = v("--road");
      ctx.fillRect(xOf(0), roadTop, roadW, roadBottom - roadTop);
      ctx.strokeStyle = v("--baseline");
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 10]);
      for (let i = 1; i < SPEEDS_MPH.length; i++) {
        const y = roadTop + i * laneH + 0.5;
        ctx.beginPath();
        ctx.moveTo(xOf(0), y);
        ctx.lineTo(xOf(ROAD_M), y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Cars, clipped to the road
      ctx.save();
      ctx.beginPath();
      ctx.rect(xOf(0), roadTop, roadW, roadBottom - roadTop);
      ctx.clip();
      ctx.fillStyle = v("--car");
      SPEEDS_MPH.forEach((mph, i) => {
        const speed = mph * MPS_PER_MPH;
        const yMid = roadTop + i * laneH + laneH / 2;
        // Front bumper of car k sits at COUNTER_M + speed * (t - k * headway).
        const kMin = Math.ceil((t - (ROAD_M + CAR_M - COUNTER_M) / speed) / headway);
        const kMax = Math.floor((t + COUNTER_M / speed) / headway);
        for (let k = kMin; k <= kMax; k++) {
          const front = COUNTER_M + speed * (t - k * headway);
          ctx.beginPath();
          ctx.roundRect(xOf(front) - carW, yMid - carH / 2, carW, carH, Math.min(3, carH / 3));
          ctx.fill();
        }
      });
      ctx.restore();

      // Counter line
      ctx.strokeStyle = v("--counter");
      ctx.lineWidth = flashing ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(xOf(COUNTER_M), roadTop - 4);
      ctx.lineTo(xOf(COUNTER_M), roadBottom + 4);
      ctx.stroke();

      // Lane labels
      ctx.textBaseline = "middle";
      SPEEDS_MPH.forEach((mph, i) => {
        const yMid = roadTop + i * laneH + laneH / 2;
        ctx.font = `600 ${compact ? 12 : 14}px system-ui, sans-serif`;
        ctx.fillStyle = v("--text-primary");
        ctx.textAlign = "left";
        ctx.fillText(`${mph} mph`, 0, yMid);
        ctx.font = `${compact ? 12 : 14}px system-ui, sans-serif`;
        ctx.fillStyle = v("--text-secondary");
        ctx.textAlign = "right";
        ctx.fillText(Math.round(flow / mph).toString(), width, yMid);
      });
    };

    let raf = 0;
    let last = performance.now();
    let lastTally = -1;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); // don't jump after a hidden tab
      last = now;
      if (playing) tRef.current += dt;
      const n = Math.floor(tRef.current / headway);
      if (n !== lastTally) {
        lastTally = n;
        setTally(n);
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height, headway, flow, playing, compact, leftGutter, rightGutter, laneH]);

  const restart = () => {
    tRef.current = headway * 0.5;
    setTally(0);
  };

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← I-70 widgets
      </Link>
      <h1>Same count, different road</h1>
      <p className="i70w-intro">
        A traffic counter records how many vehicles pass a point. Every lane below passes{" "}
        {flow.toLocaleString()} cars an hour, one every {headway.toFixed(1)} seconds, so the counter
        logs the same number in all seven. What it can't see is how packed the road is: at 10 mph
        those cars are nearly bumper to bumper, at 70 mph they're spread out.
      </p>

      <div className="fvs-controls">
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={restart}>
          Restart
        </button>
        <label className="fvs-flow">
          <span>Cars per hour, each lane</span>
          <input
            type="range"
            min={FLOW_MIN}
            max={FLOW_MAX}
            step={100}
            value={flow}
            onChange={(e) => setFlow(Number(e.target.value))}
          />
          <output>{flow.toLocaleString()}</output>
        </label>
        <span className="fvs-tally" aria-live="off">
          Counted so far: <strong>{tally}</strong> in every lane
        </span>
      </div>

      <div ref={wrapRef} className="fvs-canvas-wrap">
        <canvas
          ref={canvasRef}
          style={{ width: `${width}px`, height: `${height}px` }}
          role="img"
          aria-label={`Seven lanes at 10 to 70 miles per hour, each passing ${flow} cars per hour through a counter in the middle. Slow lanes are densely packed, fast lanes sparse.`}
        />
      </div>
      <p className="fvs-note">
        A {ROAD_M} m (about {Math.round((ROAD_M * FT_PER_M) / 10) * 10} ft) stretch. Car length is to
        scale along the road; lanes are drawn wider than life so the cars are visible.
      </p>

      <table className="fvs-table">
        <thead>
          <tr>
            <th>Speed</th>
            <th>Counted per hour</th>
            <th>Cars per mile</th>
            <th>Front-to-front spacing</th>
          </tr>
        </thead>
        <tbody>
          {SPEEDS_MPH.map((mph) => (
            <tr key={mph}>
              <td>{mph} mph</td>
              <td>{flow.toLocaleString()}</td>
              <td>{Math.round(flow / mph)}</td>
              <td>{Math.round(mph * MPS_PER_MPH * headway * FT_PER_M)} ft</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
