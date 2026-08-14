import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { geoMollweide } from "d3-geo-projection";
import type { GeoPath, GeoProjection } from "d3-geo";
import type { FeatureCollection } from "geojson";
import land from "./data/land-countries-110m.json";
import { WEALTH_GROUPS, TOTAL_LAND_KM2 } from "./data";
import { buildLandMask, growRegions } from "./landGrowth";
import { buildPersonDots, sampleLandedPositions, STAGING_HEIGHT } from "./personDots";
import "./App.css";

const GRID_WIDTH = 1600;
const GRID_HEIGHT = 800;
const OCEAN_COLOR = "#0b1220";
const UNCLAIMED_COLOR: [number, number, number] = [90, 90, 90];

interface GeoSetup {
  projection: GeoProjection;
  path: GeoPath<unknown, d3.GeoPermissibleObjects>;
  ctx: CanvasRenderingContext2D;
  offCtx: CanvasRenderingContext2D;
  landMask: Uint8Array;
}

interface StatRow {
  name: string;
  color: string;
  wealthShare: number;
  km2: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef<GeoSetup | null>(null);
  const [seeds, setSeeds] = useState<[number, number][]>([]);
  const [stats, setStats] = useState<StatRow[] | null>(null);
  const [landedPositions, setLandedPositions] = useState<Map<number, { x: number; y: number }>>(
    new Map()
  );

  const isComplete = seeds.length >= WEALTH_GROUPS.length;
  const currentGroup = isComplete ? null : WEALTH_GROUPS[seeds.length];
  const personDots = useMemo(() => buildPersonDots(WEALTH_GROUPS, GRID_WIDTH), []);
  const virtualTotalHeight = STAGING_HEIGHT + GRID_HEIGHT;

  // one-time setup: rasterize land onto the grid, in an equal-area projection
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = GRID_WIDTH;
    canvas.height = GRID_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const offscreen = document.createElement("canvas");
    offscreen.width = GRID_WIDTH;
    offscreen.height = GRID_HEIGHT;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const projection = geoMollweide().fitSize([GRID_WIDTH, GRID_HEIGHT], { type: "Sphere" });
    const path = d3.geoPath(projection, ctx);
    // transient: draws onto the visible canvas just to read back which pixels
    // are land, before any real content exists there — overwritten below.
    const landMask = buildLandMask(land as FeatureCollection, path, ctx, GRID_WIDTH, GRID_HEIGHT);

    geoRef.current = { projection, path, ctx, offCtx, landMask };
  }, []);

  // re-grow and repaint whenever a seed is placed (or reset)
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    const { projection, path, ctx, offCtx, landMask } = geo;

    const toPixel = (lonLat: [number, number]): [number, number] => projection(lonLat) ?? [0, 0];
    const result = growRegions(landMask, GRID_WIDTH, GRID_HEIGHT, WEALTH_GROUPS, seeds, toPixel);

    // Paint claimed/unclaimed colors onto an offscreen buffer at raster
    // resolution (only land pixels matter — everything else gets clipped
    // away next), then composite it onto the visible canvas through a clip
    // path built from the real vector coastlines. That keeps the true
    // land/ocean edge crisp even though the boundaries *between* claimed
    // regions (which aren't real geography) stay raster-resolution.
    const out = offCtx.createImageData(GRID_WIDTH, GRID_HEIGHT);
    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
      if (!landMask[i]) continue; // left transparent; clipped away regardless
      const c = result.claimedBy[i] === -1 ? UNCLAIMED_COLOR : hexToRgb(WEALTH_GROUPS[result.claimedBy[i]].color);
      out.data[i * 4] = c[0];
      out.data[i * 4 + 1] = c[1];
      out.data[i * 4 + 2] = c[2];
      out.data[i * 4 + 3] = 255;
    }
    offCtx.putImageData(out, 0, 0);

    ctx.clearRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    ctx.fillStyle = OCEAN_COLOR;
    ctx.fillRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    ctx.save();
    ctx.beginPath();
    (land as FeatureCollection).features.forEach((f) => path(f));
    ctx.clip();
    ctx.drawImage(offCtx.canvas, 0, 0);
    ctx.restore();

    seeds.forEach(([lon, lat]) => {
      const [x, y] = toPixel([lon, lat]);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    });

    setStats(
      seeds.length === 0
        ? null
        : result.perGroup.map(({ group, claimedPixels }) => ({
            name: group.name,
            color: group.color,
            wealthShare: group.wealthShare,
            km2: (claimedPixels / result.totalLandPixels) * TOTAL_LAND_KM2,
          }))
    );

    setLandedPositions(sampleLandedPositions(personDots, result.claimedBy, GRID_WIDTH, seeds.length));
  }, [seeds, personDots]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const geo = geoRef.current;
    const canvas = canvasRef.current;
    if (!geo || !canvas || isComplete) return;

    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * GRID_WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * GRID_HEIGHT;
    const lonLat = geo.projection.invert?.([px, py]);
    if (!lonLat) return; // no inverse at all for this point

    // Mollweide's invert() extrapolates rather than returning null for points
    // outside the drawn ellipse (e.g. the corners of the canvas), so validate
    // by projecting back and checking it lands near the original click.
    const roundTrip = geo.projection(lonLat);
    if (!roundTrip || Math.hypot(roundTrip[0] - px, roundTrip[1] - py) > 1) return;

    setSeeds((prev) => [...prev, lonLat as [number, number]]);
  }

  return (
    <div className="wlc-root">
      <header className="wlc-header">
        <div className="wlc-header-row">
          <h1 className="wlc-title">If Wealth Were Land</h1>
          <button
            className="wlc-reset"
            onClick={() => setSeeds([])}
            disabled={seeds.length === 0}
          >
            Start over
          </button>
        </div>
        <p className="wlc-subtitle">
          Global wealth, redrawn as claimed territory. Each region's size matches that
          group's share of global wealth — not their share of the population. Placed
          bottom-up: click to place the poorest band first, the wealthiest last — it
          claims whatever's left.
        </p>
      </header>

      <div className="wlc-chart-area">
        <div className="wlc-map-wrap" style={{ aspectRatio: `${GRID_WIDTH} / ${virtualTotalHeight}` }}>
          <canvas
            ref={canvasRef}
            className="wlc-canvas"
            style={{ cursor: isComplete ? "default" : "crosshair" }}
            onClick={handleCanvasClick}
          />
          <div className="wlc-dots-overlay">
            {personDots.map((dot) => {
              const landed = dot.groupIndex < seeds.length ? landedPositions.get(dot.id) : undefined;
              const xVirtual = landed ? landed.x : dot.stagingX;
              const yVirtual = landed ? STAGING_HEIGHT + landed.y : dot.stagingY;
              return (
                <span
                  key={dot.id}
                  className="wlc-dot"
                  style={{
                    left: `${(xVirtual / GRID_WIDTH) * 100}%`,
                    top: `${(yVirtual / virtualTotalHeight) * 100}%`,
                    background: WEALTH_GROUPS[dot.groupIndex].color,
                  }}
                />
              );
            })}
          </div>
        </div>

        <p className="wlc-prompt">
          {currentGroup ? (
            <>
              Click the map to place <strong>{currentGroup.name}</strong> —{" "}
              {(currentGroup.wealthShare * 100).toFixed(1)}% of global wealth
            </>
          ) : (
            <>All four groups placed.</>
          )}
        </p>

        <div className="wlc-legend">
          {WEALTH_GROUPS.map((g, i) => (
            <div
              key={g.id}
              className={`wlc-legend-item ${i >= seeds.length ? "wlc-legend-item--pending" : ""}`}
            >
              <span className="wlc-legend-swatch" style={{ background: g.color }} />
              {g.name} — {(g.wealthShare * 100).toFixed(1)}% of wealth
            </div>
          ))}
        </div>
      </div>

      <div className="wlc-note">
        <strong>Why does this map look stretched?</strong> It's drawn in an equal-area
        (Mollweide) projection, not a familiar one like Mercator. That's deliberate: this
        piece only works if area on screen means what it claims to mean, so every pixel
        represents the same real-world km² no matter where it falls on the map. A standard
        map inflates land near the poles — this one can't, or a region would look bigger
        than its actual wealth share just because of where it happened to grow. The trade
        is that shapes and angles get visibly distorted to keep area exactly right.
      </div>

      {stats && (
        <table className="wlc-stats">
          <thead>
            <tr>
              <th>Group</th>
              <th>Wealth share</th>
              <th>Land-equivalent</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.name}>
                <td>
                  <span className="wlc-stats-swatch" style={{ background: s.color }} />
                  {s.name}
                </td>
                <td>{(s.wealthShare * 100).toFixed(1)}%</td>
                <td>{(s.km2 / 1e6).toFixed(1)}M km²</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="wlc-footnote">
        Wealth bands: Global Wealth Databook (Shorrocks, Davies, Lluberas), end of 2022 —
        the methodology behind the UBS/Credit Suisse Global Wealth Report. Land = all
        habitable landmass except Antarctica (~141M km²).
      </p>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
