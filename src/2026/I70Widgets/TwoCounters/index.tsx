import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useContainerWidth } from "../../I70Crossfilter/useContainerWidth";
import { CAR_M, FLASH_S, M_PER_MI, MPS_PER_MPH, SPEEDS_MPH, prefersReducedMotion } from "../lanes";
import "../widgets.css";

const FLOW = 1800; // cars per hour, each lane
const HEADWAY = 3600 / FLOW;
// Lane spacings are 1..7 x the 10 mph spacing, so the shortest gap that holds a
// whole number of cars in every lane is lcm(1..7) = 420 of the slowest spacing.
// Car k then crosses B exactly (420 * 10 / mph) headways after it crossed A, and
// both counters click in lockstep across all seven lanes.
const SLOW_MPH = 10;
const LCM = 420;
const GAP_M = LCM * SLOW_MPH * MPS_PER_MPH * HEADWAY;
const PAD_M = GAP_M * 0.04;
const ROAD_M = GAP_M + 2 * PAD_M;
// Every 60th car is tagged: exactly one tagged car between the counters in the
// 70 mph lane, seven in the 10 mph lane. They leave A together and spread out.
const TAG_EVERY = (LCM * SLOW_MPH) / 70;
const TIME_SCALES = [1, 5, 20];

const tripMin = (mph: number) => GAP_M / (mph * MPS_PER_MPH) / 60;
const fmtClock = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

export default function TwoCounters() {
  const [wrapRef, width] = useContainerWidth<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [timeScale, setTimeScale] = useState(5);
  const [clock, setClock] = useState({ tally: 0, elapsed: 0 });
  const tRef = useRef(HEADWAY * 0.5);

  const compact = width < 560;
  const leftGutter = compact ? 52 : 80;
  const rightGutter = compact ? 52 : 96;
  const headerH = 44;
  const laneH = compact ? 24 : 32;
  const height = headerH + laneH * SPEEDS_MPH.length + 8;

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
    const xOf = (m: number) => leftGutter + (m + PAD_M) * pxPerM; // counter A at m = 0
    const xA = xOf(0);
    const xB = xOf(GAP_M);
    const carW = Math.max(CAR_M * pxPerM, 1);
    const carH = compact ? 5 : 7;
    const tagW = Math.max(carW, 3);
    const tagH = carH + 4;
    // Keep the flash under a headway so fast-forward still blinks.
    const flashSim = Math.min(FLASH_S * timeScale, HEADWAY * 0.4);

    const draw = () => {
      const css = getComputedStyle(canvas);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const t = tRef.current;
      const flashing = t - Math.floor(t / HEADWAY) * HEADWAY < flashSim;
      const roadTop = headerH;
      const roadBottom = headerH + laneH * SPEEDS_MPH.length;
      const labelY = headerH - 10;
      const fontPx = compact ? 11 : 12;

      ctx.clearRect(0, 0, width, height);

      // Headers + the A-B distance
      ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = v("--muted");
      ctx.textAlign = "left";
      ctx.fillText("Speed", 0, labelY);
      ctx.textAlign = "right";
      ctx.fillText(compact ? "A→B" : "A→B trip", width, labelY);
      ctx.fillStyle = v("--counter");
      ctx.textAlign = "center";
      ctx.fillText("A", xA, labelY);
      ctx.fillText("B", xB, labelY);
      const dimY = labelY - 4;
      const dimLabel = `${(GAP_M / M_PER_MI).toFixed(2)} miles`;
      const dimHalf = ctx.measureText(dimLabel).width / 2 + 8;
      const mid = (xA + xB) / 2;
      ctx.strokeStyle = v("--baseline");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xA + 10, dimY);
      ctx.lineTo(mid - dimHalf, dimY);
      ctx.moveTo(mid + dimHalf, dimY);
      ctx.lineTo(xB - 10, dimY);
      ctx.stroke();
      ctx.fillStyle = v("--text-secondary");
      ctx.fillText(dimLabel, mid, labelY);

      // Road
      ctx.fillStyle = v("--road");
      ctx.fillRect(leftGutter, roadTop, roadW, roadBottom - roadTop);
      ctx.strokeStyle = v("--baseline");
      ctx.setLineDash([4, 6]);
      for (let i = 1; i < SPEEDS_MPH.length; i++) {
        const y = roadTop + i * laneH + 0.5;
        ctx.beginPath();
        ctx.moveTo(leftGutter, y);
        ctx.lineTo(leftGutter + roadW, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Cars, then the tagged cars on top
      ctx.save();
      ctx.beginPath();
      ctx.rect(leftGutter, roadTop, roadW, roadBottom - roadTop);
      ctx.clip();
      const tagged: [number, number][] = [];
      ctx.fillStyle = v("--car");
      SPEEDS_MPH.forEach((mph, i) => {
        const speed = mph * MPS_PER_MPH;
        const yMid = roadTop + i * laneH + laneH / 2;
        // Front bumper of car k sits at speed * (t - k * HEADWAY), A = 0.
        const kMin = Math.ceil((t - (GAP_M + PAD_M + CAR_M) / speed) / HEADWAY);
        const kMax = Math.floor((t + PAD_M / speed) / HEADWAY);
        for (let k = kMin; k <= kMax; k++) {
          const x = xOf(speed * (t - k * HEADWAY));
          if (k % TAG_EVERY === 0) tagged.push([x, yMid]);
          else ctx.fillRect(x - carW, yMid - carH / 2, carW, carH);
        }
      });
      ctx.fillStyle = v("--text-primary");
      for (const [x, y] of tagged) {
        ctx.beginPath();
        ctx.roundRect(x - tagW, y - tagH / 2, tagW, tagH, 1.5);
        ctx.fill();
      }
      ctx.restore();

      // Counters
      ctx.strokeStyle = v("--counter");
      ctx.lineWidth = flashing ? 4 : 2;
      for (const x of [xA, xB]) {
        ctx.beginPath();
        ctx.moveTo(x, roadTop - 4);
        ctx.lineTo(x, roadBottom + 4);
        ctx.stroke();
      }

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
        ctx.fillText(`${tripMin(mph).toFixed(1)} min`, width, yMid);
      });
    };

    let raf = 0;
    let last = performance.now();
    let lastSec = -1;
    let lastTally = -1;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1); // don't jump after a hidden tab
      last = now;
      if (playing) tRef.current += dt * timeScale;
      const t = tRef.current;
      const tally = Math.floor(t / HEADWAY);
      const sec = Math.floor(t);
      if (tally !== lastTally || sec !== lastSec) {
        lastTally = tally;
        lastSec = sec;
        setClock({ tally, elapsed: t });
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, height, playing, timeScale, compact, leftGutter, rightGutter, laneH]);

  const restart = () => {
    tRef.current = HEADWAY * 0.5;
    setClock({ tally: 0, elapsed: tRef.current });
  };

  return (
    <div className="i70w-root">
      <Link className="i70w-back" to="/2026/I70Widgets">
        ← I-70 widgets
      </Link>
      <h1>Two counters, one rhythm</h1>
      <p className="i70w-intro">
        The same seven lanes, each passing {FLOW.toLocaleString()} cars an hour, now with a second
        counter {(GAP_M / M_PER_MI).toFixed(2)} miles down the road. That's the shortest distance
        where a whole number of cars fits between the counters in every lane, so A and B click in
        unison. Both log the same count. The difference is only in the trip: the dark cars leave A
        together, and the 70 mph one reaches B in 2 minutes while the 10 mph one takes 14.
      </p>

      <div className="i70w-controls">
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={restart}>
          Restart
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
        <span className="i70w-tally">
          Elapsed {fmtClock(clock.elapsed)} · counted at A: <strong>{clock.tally}</strong>, at B:{" "}
          <strong>{clock.tally}</strong>, every lane
        </span>
      </div>

      <div ref={wrapRef} className="i70w-canvas-wrap">
        <canvas
          ref={canvasRef}
          style={{ width: `${width}px`, height: `${height}px` }}
          role="img"
          aria-label={`Seven lanes from 70 down to 10 miles per hour between two counters ${(GAP_M / M_PER_MI).toFixed(2)} miles apart. Both counters register a car in every lane at the same moments.`}
        />
      </div>
      <p className="i70w-note">
        Every {TAG_EVERY}th car is dark. Car length is to scale along the road (about one pixel);
        lanes are drawn far wider than life.
      </p>

      <table className="i70w-table">
        <thead>
          <tr>
            <th>Speed</th>
            <th>Counted per hour, A and B</th>
            <th>Cars between A and B</th>
            <th>A→B trip</th>
          </tr>
        </thead>
        <tbody>
          {SPEEDS_MPH.map((mph) => (
            <tr key={mph}>
              <td>{mph} mph</td>
              <td>{FLOW.toLocaleString()}</td>
              <td>{(LCM * SLOW_MPH) / mph}</td>
              <td>{tripMin(mph).toFixed(1)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
