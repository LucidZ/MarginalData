import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { geoMollweide } from "d3-geo-projection";
import type { FeatureCollection } from "geojson";
import land from "./data/land-countries-110m.json";
import { WEALTH_GROUPS, TOTAL_LAND_KM2 } from "./data";
import { buildLandMask, growRegions } from "./landGrowth";
import "./App.css";

const GRID_WIDTH = 960;
const GRID_HEIGHT = 480;
const OCEAN_COLOR: [number, number, number] = [11, 18, 32];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<
    { name: string; color: string; wealthShare: number; km2: number }[] | null
  >(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = GRID_WIDTH;
    canvas.height = GRID_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const projection = geoMollweide().fitSize([GRID_WIDTH, GRID_HEIGHT], { type: "Sphere" });
    const path = d3.geoPath(projection, ctx);

    const landMask = buildLandMask(land as FeatureCollection, path, ctx, GRID_WIDTH, GRID_HEIGHT);

    const toPixel = (lonLat: [number, number]): [number, number] => {
      const p = projection(lonLat);
      return p ?? [0, 0];
    };

    const result = growRegions(landMask, GRID_WIDTH, GRID_HEIGHT, WEALTH_GROUPS, toPixel);

    // render final raster
    const out = ctx.createImageData(GRID_WIDTH, GRID_HEIGHT);
    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
      let c: [number, number, number];
      if (!landMask[i]) c = OCEAN_COLOR;
      else if (result.claimedBy[i] === -1) c = [90, 90, 90];
      else c = hexToRgb(WEALTH_GROUPS[result.claimedBy[i]].color);
      out.data[i * 4] = c[0];
      out.data[i * 4 + 1] = c[1];
      out.data[i * 4 + 2] = c[2];
      out.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);

    // seed markers
    WEALTH_GROUPS.forEach((g) => {
      const [x, y] = toPixel(g.seed);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "#000";
      ctx.stroke();
    });

    setStats(
      result.perGroup.map(({ group, claimedPixels }) => ({
        name: group.name,
        color: group.color,
        wealthShare: group.wealthShare,
        km2: (claimedPixels / result.totalLandPixels) * TOTAL_LAND_KM2,
      }))
    );
  }, []);

  return (
    <div className="wlc-root">
      <header className="wlc-header">
        <h1 className="wlc-title">If Wealth Were Land</h1>
        <p className="wlc-subtitle">
          Global wealth, redrawn as claimed territory. Each region's size matches that
          group's share of global wealth — not their share of the population. Grown
          bottom-up: the poorest band claims first, the wealthiest claims last, taking
          whatever's left.
        </p>
      </header>

      <div className="wlc-chart-area">
        <canvas ref={canvasRef} className="wlc-canvas" />

        <div className="wlc-legend">
          {WEALTH_GROUPS.map((g) => (
            <div key={g.id} className="wlc-legend-item">
              <span className="wlc-legend-swatch" style={{ background: g.color }} />
              {g.name} — {(g.wealthShare * 100).toFixed(1)}% of wealth
            </div>
          ))}
        </div>
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
        habitable landmass except Antarctica (~141M km²), rendered in an equal-area
        (Mollweide) projection so claimed area on the map is proportional to real km².
        Seed points are fixed for this version; placing them yourself is coming next.
      </p>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
