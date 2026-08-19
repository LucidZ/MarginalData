import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { geoMollweide } from "d3-geo-projection";
import type { GeoPath, GeoProjection } from "d3-geo";
import type { FeatureCollection } from "geojson";
import land from "./data/land-countries-110m.json";
import { WEALTH_GROUPS, TOTAL_LAND_KM2, SAMPLE_ADULTS, SAMPLE_TOTAL_WEALTH_USD } from "./data";
import { buildLandMask } from "./landGrowth";
import {
  buildPathData,
  computeRanges,
  pointAtArcLength,
  rankToArcLength,
  rankToPixel,
  rasterizeRanges,
  type PathData,
  type Range,
} from "./pathAssign";
import { buildPersonDots, sampleRangeRanks, STAGING_HEIGHT } from "./personDots";
import {
  buildPitchIcons,
  PITCH_ICON_SIZE,
  PITCH_ICON_DETAILED,
  FOOTBALL_PITCH_M2,
  PENALTY_BOX_M2,
  PitchIcon,
  PitchSymbolDefs,
} from "./PitchIcons";
import "./App.css";

const GRID_WIDTH = 1600;
const GRID_HEIGHT = 800;
const OCEAN_COLOR = "#0b1220";
const UNCLAIMED_COLOR: [number, number, number] = [90, 90, 90];

// Click animation: land grows/shifts from the click point — pushing and
// resizing any neighboring regions along with it — while every affected
// dot travels to its new spot in one continuous motion (see the "offWeight"
// comment below for how travel and landing are blended together).
const GROW_MS = 1100;
// "Start over" isn't animated by the JS loop above (there's nothing to grow
// toward), so it leans on dotPhaseMs's CSS transition instead, for a smooth
// fade back up to the staging row rather than an instant snap.
const RESET_MS = 500;

interface GeoSetup {
  projection: GeoProjection;
  path: GeoPath<unknown, d3.GeoPermissibleObjects>;
  ctx: CanvasRenderingContext2D;
  offCtx: CanvasRenderingContext2D;
  imageData: ImageData;
  landMask: Uint8Array;
  pathData: PathData;
}

interface PerPersonRow {
  name: string;
  color: string;
  m2: number;
  avgWealthUsd: number;
  openEnded: boolean;
  compareLabel: string;
}

// Per-person land isn't part of the click-to-place interaction at all — it's
// a fixed value straight from WEALTH_GROUPS (wealthShare/populationShare
// determine it entirely), so this is computed once, independent of seeds.
function buildPerPersonStats(): PerPersonRow[] {
  return WEALTH_GROUPS.map((g) => {
    const adults = g.populationShare * SAMPLE_ADULTS;
    const km2 = g.wealthShare * TOTAL_LAND_KM2;
    const m2 = (km2 * 1e6) / adults;
    const avgWealthUsd = (g.wealthShare * SAMPLE_TOTAL_WEALTH_USD) / adults;
    const pitches = m2 / FOOTBALL_PITCH_M2;
    const compareLabel =
      m2 < PENALTY_BOX_M2
        ? "less than one penalty box"
        : pitches < 3
          ? `about ${pitches.toFixed(1)} football pitches`
          : `about ${Math.round(pitches)} football pitches`;
    return { name: g.name, color: g.color, m2, avgWealthUsd, openEnded: g.openEnded ?? false, compareLabel };
  });
}

function formatArea(m2: number): string {
  if (m2 >= 1e6) return `${(m2 / 1e6).toFixed(2)} km²`;
  return `${Math.round(m2).toLocaleString()} m²`;
}

function formatUsd(usd: number): string {
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  const rounded = usd >= 1e3 ? Math.round(usd / 10) * 10 : Math.round(usd);
  return `$${rounded.toLocaleString()}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef<GeoSetup | null>(null);
  // Last fully-settled (post-animation) range per group index — the
  // baseline the next click's animation grows/shifts away from.
  const committedRangesRef = useRef<(Range | null)[]>([]);
  // Last fully-settled path-rank per dot — the baseline the next click's
  // animation slides that dot away from (see rankToPixel in pathAssign.ts).
  const committedDotRanksRef = useRef<Map<number, number>>(new Map());
  // Last fully-settled *pixel* per dot — the source of truth for where an
  // already-landed, unaffected dot currently sits, used as the travel
  // start point ("fromPoint") the next time its group gets pushed.
  const committedDotPixelsRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const rafRef = useRef<number | null>(null);
  const [seeds, setSeeds] = useState<[number, number][]>([]);
  const [landedPositions, setLandedPositions] = useState<Map<number, { x: number; y: number }>>(
    new Map()
  );
  const [isReady, setIsReady] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [dotPhaseMs, setDotPhaseMs] = useState(GROW_MS);

  const isComplete = seeds.length >= WEALTH_GROUPS.length;
  const currentGroup = isComplete ? null : WEALTH_GROUPS[seeds.length];
  const personDots = useMemo(() => buildPersonDots(WEALTH_GROUPS, GRID_WIDTH), []);
  const virtualTotalHeight = STAGING_HEIGHT + GRID_HEIGHT;
  const perPersonStats = useMemo(() => buildPerPersonStats(), []);
  // Revealed in step with the map: each group's pitch row appears once that
  // group has actually been placed, so the biggest row (millionaires,
  // ~153 pitches per person) lands as the same late climax the map itself
  // builds to, instead of spoiling it up front.
  const visiblePerPerson = perPersonStats.slice(0, seeds.length);

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
    const toPixel = (lonLat: [number, number]): [number, number] => projection(lonLat) ?? [0, 0];

    // Unrolling the land mask along the path (~1s+) is the heaviest part of
    // setup — deferred a tick so React can paint the "preparing map…" state
    // first, instead of the whole page just freezing with nothing rendered.
    const timer = setTimeout(() => {
      const pathData = buildPathData(landMask, GRID_WIDTH, GRID_HEIGHT, toPixel);
      // Reused every redraw (including every animation frame) instead of
      // allocating a fresh ~5MB buffer each time.
      const imageData = offCtx.createImageData(GRID_WIDTH, GRID_HEIGHT);
      geoRef.current = { projection, path, ctx, offCtx, imageData, landMask, pathData };
      setIsReady(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Paints a (possibly mid-animation) set of ranges onto the visible canvas.
  // Pulled out of the effect below so it can run once per settled state and
  // also many times per second while an animation is in flight.
  function drawFrame(geo: GeoSetup, claimedBy: Int8Array) {
    const { path, ctx, offCtx, imageData, landMask, pathData } = geo;

    // Paint claimed/unclaimed colors onto an offscreen buffer at raster
    // resolution (only land pixels matter — everything else gets clipped
    // away next), then composite it onto the visible canvas through a clip
    // path built from the real vector coastlines. That keeps the true
    // land/ocean edge crisp even though the boundaries *between* claimed
    // regions (which aren't real geography) stay raster-resolution.
    const out = imageData.data;
    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
      if (!landMask[i]) continue; // left transparent; clipped away regardless
      const c = claimedBy[i] === -1 ? UNCLAIMED_COLOR : hexToRgb(WEALTH_GROUPS[claimedBy[i]].color);
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      out[i * 4 + 3] = 255;
    }
    offCtx.putImageData(imageData, 0, 0);

    ctx.clearRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    ctx.fillStyle = OCEAN_COLOR;
    ctx.fillRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    ctx.save();
    ctx.beginPath();
    (land as FeatureCollection).features.forEach((f) => path(f));
    ctx.clip();
    ctx.drawImage(offCtx.canvas, 0, 0);
    ctx.restore();

    // faint guide line showing the route territory is unrolled along —
    // mostly a legibility aid for why regions land where they do
    ctx.beginPath();
    pathData.pathPixels.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function cancelPendingAnimation() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  // Re-assign and animate whenever a seed is placed (or reset). Land grows
  // outward from the click point — and any pushed regions shift to their new
  // extent — while every affected dot travels to its own new resting cell in
  // one continuous motion along that *same* path the land is animating
  // through, so a dot (and the region it's part of) that gets pushed from
  // one side of the map to the other visibly travels the route instead of
  // cutting straight across open ocean. Dots within a region aren't nudged
  // apart from each other — overlap in small, crowded regions is left as-is
  // rather than spread out, which read as an extra "pop" once the motion
  // above had already finished.
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo || !isReady) return;
    cancelPendingAnimation();

    const { projection, pathData } = geo;
    const toPixel = (lonLat: [number, number]): [number, number] => projection(lonLat) ?? [0, 0];
    const totalCells = GRID_WIDTH * GRID_HEIGHT;

    if (seeds.length === 0) {
      committedRangesRef.current = [];
      committedDotRanksRef.current = new Map();
      committedDotPixelsRef.current = new Map();
      drawFrame(geo, rasterizeRanges(pathData, [], totalCells));
      setDotPhaseMs(RESET_MS);
      setLandedPositions(new Map());
      setIsAnimating(false);
      return;
    }

    const prevRanges = committedRangesRef.current;
    const { ranges: targetRanges, anchors } = computeRanges(
      pathData,
      GRID_WIDTH,
      WEALTH_GROUPS,
      seeds,
      toPixel,
      prevRanges
    );

    const newGroupIndex = seeds.length - 1;
    const clickPixel = toPixel(seeds[newGroupIndex]);
    const anchorRank = anchors[newGroupIndex];

    // Per-group start point for this animation: the brand-new group grows
    // from a zero-width point at its own anchor; anyone else only animates
    // if a later push actually moved their extent, starting from wherever
    // they were last settled.
    const startRanges: (Range | null)[] = targetRanges.map((target, gi) => {
      if (!target) return null;
      if (gi === newGroupIndex) return { start: anchorRank, end: anchorRank };
      return prevRanges[gi] ?? { start: anchorRank, end: anchorRank };
    });

    const changedGroups = targetRanges
      .map((target, gi) => ({ gi, target, from: startRanges[gi] }))
      .filter((c): c is { gi: number; target: Range; from: Range } => {
        if (!c.target) return false;
        if (c.gi === newGroupIndex) return true;
        const prev = prevRanges[c.gi];
        return !prev || prev.start !== c.target.start || prev.end !== c.target.end;
      });

    // Precompute each affected dot's travel: from/to rank (needed for the
    // settle phase's exact final cell and to remember it for next time),
    // from/to arc-length (its position along the path), and from/to *offset*
    // — the perpendicular vector from the path line out to the dot's actual
    // land cell, since real land isn't generally sitting exactly on the
    // hand-drawn route. From is wherever it last actually settled (or the
    // click point itself, for the newly placed group's own dots, which
    // start bundled at a single spot); to is its deterministic resting cell
    // within the group's final target range.
    const dotToRank = new Map<number, number>();
    const dotFromArc = new Map<number, number>();
    const dotToArc = new Map<number, number>();
    const dotFromOffset = new Map<number, { x: number; y: number }>();
    const dotToOffset = new Map<number, { x: number; y: number }>();
    for (const { gi, target } of changedGroups) {
      const targetRanks = sampleRangeRanks(personDots, gi, target, pathData.sortedCells.length);
      for (const [id, toRank] of targetRanks) {
        const fromRank =
          gi === newGroupIndex ? anchorRank : committedDotRanksRef.current.get(id) ?? anchorRank;
        const fromArc = rankToArcLength(pathData, fromRank);
        const toArc = rankToArcLength(pathData, toRank);
        const fromPoint =
          gi === newGroupIndex
            ? { x: clickPixel[0], y: clickPixel[1] }
            : committedDotPixelsRef.current.get(id) ?? rankToPixel(pathData, fromRank, GRID_WIDTH);
        const fromPath = pointAtArcLength(pathData, fromArc);
        const toPoint = rankToPixel(pathData, toRank, GRID_WIDTH);
        const toPath = pointAtArcLength(pathData, toArc);

        dotToRank.set(id, toRank);
        dotFromArc.set(id, fromArc);
        dotToArc.set(id, toArc);
        dotFromOffset.set(id, { x: fromPoint.x - fromPath.x, y: fromPoint.y - fromPath.y });
        dotToOffset.set(id, { x: toPoint.x - toPath.x, y: toPoint.y - toPath.y });
      }
    }

    setIsAnimating(true);
    setDotPhaseMs(0);

    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / GROW_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic

      const frameRanges: (Range | null)[] = targetRanges.map((target, gi) => {
        if (!target) return null;
        const changed = changedGroups.find((c) => c.gi === gi);
        if (!changed) return prevRanges[gi] ?? target;
        return {
          start: changed.from.start + (target.start - changed.from.start) * eased,
          end: changed.from.end + (target.end - changed.from.end) * eased,
        };
      });
      drawFrame(geo, rasterizeRanges(pathData, frameRanges, totalCells));

      if (dotFromArc.size > 0) {
        // Along-path motion and the perpendicular "step off the path onto
        // real land" offset are blended by the *same* eased value every
        // frame — so both happen together throughout the trip, not as two
        // visually separate beats (glide, then peel off). This does carry a
        // real risk a purely-along-path design doesn't: the offset is a
        // straight-line blend, so a dot with a large offset could, for a
        // frame or two, sit off the path in a direction that isn't real
        // land (e.g. crossing a strait between islands, or the open-ocean
        // gaps WORLD_PATH itself deliberately skips over, like Canada to
        // Greenland) before the path and offset finish resolving onto the
        // real target cell together at t=1. Measured to be a minor, brief
        // wobble in the worst case tested (a large regional push), not the
        // large discontinuities this whole animation was built to avoid —
        // accepted as the trade for genuinely simultaneous motion.
        setLandedPositions((prev) => {
          const next = new Map(prev);
          dotFromArc.forEach((fromArc, id) => {
            const toArc = dotToArc.get(id)!;
            const path = pointAtArcLength(pathData, fromArc + (toArc - fromArc) * eased);
            const from = dotFromOffset.get(id)!;
            const to = dotToOffset.get(id)!;
            next.set(id, {
              x: path.x + from.x + (to.x - from.x) * eased,
              y: path.y + from.y + (to.y - from.y) * eased,
            });
          });
          return next;
        });
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Land has finished growing/shifting, and every affected dot has
      // arrived at its individually-sampled ideal cell — the same one the
      // last frame above already painted it at (eased reaches 1 exactly
      // where the offset fully resolves onto real land), so there's nothing
      // left to settle. Overlap between tightly-packed dots in a small
      // region is left as-is rather than nudged apart — spreading them out
      // read as a distracting extra "pop" after the motion had already
      // finished, worst on the smallest, most crowded regions.
      committedRangesRef.current = targetRanges;
      dotToRank.forEach((rank, id) => {
        committedDotRanksRef.current.set(id, rank);
        committedDotPixelsRef.current.set(id, rankToPixel(pathData, rank, GRID_WIDTH));
      });
      rafRef.current = null;
      setIsAnimating(false);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelPendingAnimation();
  }, [seeds, personDots, isReady]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const geo = geoRef.current;
    const canvas = canvasRef.current;
    if (!geo || !canvas || !isReady || isComplete || isAnimating) return;

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
          Wealth across the 56 major markets UBS tracks — together over 92% of global
          wealth — redrawn as claimed territory. Each region's size matches that group's
          share of that wealth, not their share of the population. Placed bottom-up:
          click to place the poorest band first, the wealthiest last — it claims
          whatever's left.
        </p>
      </header>

      <div className="wlc-chart-area">
        <div className="wlc-legend">
          {WEALTH_GROUPS.map((g, i) => (
            <div
              key={g.id}
              className={`wlc-legend-item ${i >= seeds.length ? "wlc-legend-item--pending" : ""}`}
            >
              <span className="wlc-legend-swatch" style={{ background: g.color }} />
              <strong>{g.name}</strong> — {(g.populationShare * 100).toFixed(1)}% of people,{" "}
              {(g.wealthShare * 100).toFixed(1)}% of wealth
            </div>
          ))}
        </div>

        <div className="wlc-map-wrap" style={{ aspectRatio: `${GRID_WIDTH} / ${virtualTotalHeight}` }}>
          <canvas
            ref={canvasRef}
            className="wlc-canvas"
            style={{ cursor: isComplete || isAnimating ? "default" : "crosshair" }}
            onClick={handleCanvasClick}
          />
          {!isReady && <div className="wlc-loading">Preparing map…</div>}
          {/* Shared symbol so every dot below is a lightweight <use>, not its
              own copy of the path data. Outline is a real SVG stroke (scales
              with the icon via the viewBox) rather than a CSS drop-shadow,
              which stays a fixed physical size and would swallow the fill
              at small icon sizes. */}
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <symbol id="wlc-person-icon" viewBox="0 0 24 24">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill="currentColor"
                  stroke="rgba(255,255,255,.95)"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  paintOrder="stroke fill"
                />
              </symbol>
            </defs>
          </svg>
          <div
            className="wlc-dots-overlay"
            style={{ "--wlc-dot-duration": `${dotPhaseMs}ms` } as React.CSSProperties}
          >
            {personDots.map((dot) => {
              const landed = dot.groupIndex < seeds.length ? landedPositions.get(dot.id) : undefined;
              const xVirtual = landed ? landed.x : dot.stagingX;
              const yVirtual = landed ? STAGING_HEIGHT + landed.y : dot.stagingY;
              return (
                <svg
                  key={dot.id}
                  className="wlc-dot"
                  style={{
                    left: `${(xVirtual / GRID_WIDTH) * 100}%`,
                    top: `${(yVirtual / virtualTotalHeight) * 100}%`,
                    color: WEALTH_GROUPS[dot.groupIndex].color,
                  }}
                >
                  <use href="#wlc-person-icon" />
                </svg>
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

      {visiblePerPerson.length > 0 && (
        <div className="wlc-person-section">
          <h2 className="wlc-person-heading">What that land means per person</h2>
          <p className="wlc-person-subtitle">
            Split each group's territory evenly across everyone in it, measured out in
            football pitches — this is roughly what one person's share would look like.
          </p>
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <PitchSymbolDefs />
            </defs>
          </svg>
          <div className="wlc-pitch-rows">
            {visiblePerPerson.map((s) => {
              const icons = buildPitchIcons(s.m2);
              return (
                <div className="wlc-pitch-row" key={s.name}>
                  <div className="wlc-pitch-row-label">
                    <span className="wlc-pitch-row-swatch" style={{ background: s.color }} />
                    <strong>{s.name}</strong>
                    <span className="wlc-pitch-row-detail">
                      On average, {formatArea(s.m2)} — {s.compareLabel}
                    </span>
                  </div>
                  {s.openEnded && (
                    <p className="wlc-pitch-row-caveat">
                      That "{s.compareLabel}" figure comes from an average of{" "}
                      <strong>{formatUsd(s.avgWealthUsd)}</strong> per person in this band —
                      "$1M+" has no upper bound, so a small number of billionaires inside it pull
                      that average well above what most people in this group actually hold.
                    </p>
                  )}
                  <div className="wlc-pitch-row-icons">
                    {icons.map((icon, i) => (
                      <PitchIcon
                        key={i}
                        icon={icon}
                        color={s.color}
                        size={PITCH_ICON_SIZE}
                        detailed={PITCH_ICON_DETAILED}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="wlc-footnote">
        Wealth bands: UBS Global Wealth Report 2026, year-end 2025 — modeled across 56
        major markets UBS estimates represent over 92% of global wealth (population
        figures reflect adults in those markets, not literally the whole world). Land =
        all habitable landmass except Antarctica (~141M km²).
      </p>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
