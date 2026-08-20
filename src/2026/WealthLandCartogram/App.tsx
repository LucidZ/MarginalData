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
// "Place groups myself" isn't animated by the JS loop above (there's
// nothing to grow toward), so it leans on dotPhaseMs's CSS transition
// instead, for a smooth fade back up to the staging row rather than an
// instant snap.
const RESET_MS = 500;

// Fixed seed points for the auto-play intro (see "Auto-play" below).
// Order matches WEALTH_GROUPS (bottom-up: smallest wealth share first).
const AUTO_PLAY_SEEDS: [number, number][] = [
  [-3.7, 40.42], // Madrid, Spain
  [13.4, 52.52], // Berlin, Germany
  [10.0, 23.0], // Sahara Desert
  [-5.6, 35.95], // Strait of Gibraltar
];
// Gap between each auto-play step: long enough for that step's GROW_MS
// animation to fully finish, plus a short pause so it reads as a beat, not
// a blur.
const AUTO_PLAY_GAP_MS = GROW_MS + 400;

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

// Superscript link to an entry in the "Notes & sources" list at the bottom
// of the page (matching id="wlc-note-N"). Numbers are assigned by hand at
// each call site below — if the notes list gets reordered, update both.
function FootnoteRef({ n }: { n: number }) {
  return (
    <sup>
      <a href={`#wlc-note-${n}`} className="wlc-footnote-ref">
        {n}
      </a>
    </sup>
  );
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

  // Auto-play: the map plays through AUTO_PLAY_SEEDS by itself the first
  // time it scrolls into view, so nobody has to realize clicking is even
  // possible to see the payoff — see the two effects below. isAutoPlaying
  // (state, for the prompt text) and the ref (read synchronously inside
  // handleCanvasClick, where state would be stale) track the same thing.
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const isAutoPlayingRef = useRef(false);
  const hasAutoPlayedRef = useRef(false);
  const [hasIntersected, setHasIntersected] = useState(false);
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const autoPlayTimeoutsRef = useRef<number[]>([]);

  const isComplete = seeds.length >= WEALTH_GROUPS.length;
  const currentGroup = isComplete ? null : WEALTH_GROUPS[seeds.length];
  const personDots = useMemo(() => buildPersonDots(WEALTH_GROUPS, GRID_WIDTH), []);
  const virtualTotalHeight = STAGING_HEIGHT + GRID_HEIGHT;
  const perPersonStats = useMemo(() => buildPerPersonStats(), []);

  function clearAutoPlayTimeouts() {
    autoPlayTimeoutsRef.current.forEach((id) => clearTimeout(id));
    autoPlayTimeoutsRef.current = [];
  }

  // Plays AUTO_PLAY_SEEDS from a blank map, one group at a time, using the
  // exact same seeds-effect/animation pipeline a real click does — this
  // function is just a scripted sequence of setSeeds calls spread out over
  // time. Used both for the scroll-triggered intro and the "Replay" button.
  function playSequence() {
    clearAutoPlayTimeouts();
    isAutoPlayingRef.current = true;
    setIsAutoPlaying(true);
    setSeeds([]);
    AUTO_PLAY_SEEDS.forEach((seed, i) => {
      const id = window.setTimeout(
        () => {
          setSeeds((prev) => [...prev, seed]);
          if (i === AUTO_PLAY_SEEDS.length - 1) {
            // hold the guard up a little past the last placement so its own
            // animation finishes before manual clicks are allowed again
            const doneId = window.setTimeout(() => {
              isAutoPlayingRef.current = false;
              setIsAutoPlaying(false);
            }, GROW_MS + 100);
            autoPlayTimeoutsRef.current.push(doneId);
          }
        },
        300 + i * AUTO_PLAY_GAP_MS
      );
      autoPlayTimeoutsRef.current.push(id);
    });
  }

  // Watches the chart area for scroll visibility — fires once, then
  // disconnects; the actual auto-play trigger lives in the effect below,
  // which also waits on the map data being ready (whichever finishes last).
  useEffect(() => {
    const el = chartAreaRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasIntersected(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fires the intro exactly once, as soon as the map is both ready and
  // on-screen — but only if nothing has been placed yet, so it never
  // interrupts someone who started clicking on their own before either
  // condition was met. Deliberately doesn't depend on `seeds`: this should
  // run once off isReady/hasIntersected, not re-run every time seeds changes.
  useEffect(() => {
    if (!isReady || !hasIntersected || hasAutoPlayedRef.current) return;
    hasAutoPlayedRef.current = true;
    if (seeds.length === 0) playSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, hasIntersected]);

  useEffect(() => clearAutoPlayTimeouts, []);

  // Hands control back to the user: cancels any in-flight (or not-yet-
  // started) auto-play and clears the board, so they can click their own
  // four seeds. Deliberately not gated on seeds.length === 0 — this is also
  // how someone interrupts the intro to take over early.
  function handlePlaceMyself() {
    clearAutoPlayTimeouts();
    isAutoPlayingRef.current = false;
    setIsAutoPlaying(false);
    hasAutoPlayedRef.current = true;
    setSeeds([]);
  }

  function handleReplay() {
    hasAutoPlayedRef.current = true;
    playSequence();
  }

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
    if (!geo || !canvas || !isReady || isComplete || isAnimating || isAutoPlayingRef.current) return;

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
        <h1 className="wlc-title">If Wealth Were Land</h1>
        <p className="wlc-intro">
          I've always found wealth distributions difficult to intuit, and there's
          plenty of evidence I'm not alone<FootnoteRef n={1} />. One possible reason:
          the concept of wealth is very abstract. I was curious how differently I'd
          feel about wealth distributions if I equated global wealth to global land.
          Below are two visual takes on that idea.
        </p>
      </header>

      <p className="wlc-lead-in">
        First, what if instead of a regular pie chart, we divided the world's
        land<FootnoteRef n={4} /> among different wealth tiers? Placed bottom-up:
        click to place the poorest band first, the wealthiest last — it claims
        whatever's left.
      </p>

      <div className="wlc-chart-area" ref={chartAreaRef}>
        <div className="wlc-legend">
          {WEALTH_GROUPS.map((g, i) => (
            <div
              key={g.id}
              className={`wlc-legend-item ${i >= seeds.length ? "wlc-legend-item--pending" : ""}`}
            >
              <span className="wlc-legend-swatch" style={{ background: g.color }} />
              <strong>{g.name}</strong> — {(g.populationShare * 100).toFixed(1)}% of adults,{" "}
              {(g.wealthShare * 100).toFixed(1)}% of wealth
            </div>
          ))}
        </div>

        <div className="wlc-map-wrap" style={{ aspectRatio: `${GRID_WIDTH} / ${virtualTotalHeight}` }}>
          <canvas
            ref={canvasRef}
            className="wlc-canvas"
            style={{
              cursor: isComplete || isAnimating || isAutoPlaying ? "default" : "crosshair",
            }}
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
          {isAutoPlaying && currentGroup ? (
            <>
              Now placing <strong>{currentGroup.name}</strong> —{" "}
              {(currentGroup.wealthShare * 100).toFixed(1)}% of wealth
            </>
          ) : currentGroup ? (
            <>
              Click the map to place <strong>{currentGroup.name}</strong> —{" "}
              {(currentGroup.wealthShare * 100).toFixed(1)}% of global wealth
            </>
          ) : (
            <>All four groups placed.</>
          )}
        </p>

        <div className="wlc-header-actions">
          <button className="wlc-replay" onClick={handleReplay}>
            ▶ Replay
          </button>
          <button className="wlc-reset" onClick={handlePlaceMyself}>
            Place groups myself
          </button>
        </div>
      </div>

      <div className="wlc-takeaways">
        <h3 className="wlc-takeaways-heading">Some interesting takeaways</h3>
        <ol className="wlc-takeaways-list">
          <li>
            This data comes from UBS's 2026 Global Wealth Report<FootnoteRef n={2} />,
            which only models 56 major markets. UBS estimates this covers over 92% of
            global wealth — but that's only about 3.85 billion of the world's roughly
            6.1 billion adults<FootnoteRef n={3} />. This probably understates the
            poorest wealth tier and skews the whole picture wealthier than reality.
          </li>
          <li>
            If this map looks a little weird, it's because it's drawn in an equal-area
            (Mollweide) projection, not a familiar one like Mercator. That's
            deliberate: this piece only works if area on screen means what it
            claims to mean, so every pixel represents the same real-world km² no matter
            where it falls on the map. A standard map inflates land near the poles —
            this one can't, or a region would look bigger than its actual wealth share
            just because of where it happened to grow. The trade is that shapes and
            angles get visibly distorted to keep area exactly right.
          </li>
          <li>
            I think it's interesting how, as an American, I place more visual
            importance on North America and Europe despite Asia being significantly
            larger. Part of this is probably a "Western" bias from where I live, and
            part of it may be an internalized bias created by more common projections
            (e.g. Mercator) that make Europe look disproportionately big.
          </li>
        </ol>
      </div>

      <div className="wlc-person-section">
        <h2 className="wlc-person-heading">What that land means per person</h2>
        <p className="wlc-person-subtitle">
          If we split each group's territory evenly across everyone in it, measured
          out in football pitches — this is roughly what one person's share would
          look like.
        </p>
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <PitchSymbolDefs />
          </defs>
        </svg>
        <div className="wlc-pitch-rows">
          {perPersonStats.map((s) => {
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

        <div className="wlc-takeaways">
          <h3 className="wlc-takeaways-heading">Some interesting takeaways</h3>
          <ol className="wlc-takeaways-list">
            <li>
              It's again difficult to intuit the size of the smallest and largest
              lands — a unit of measurement (like football pitches) that works for
              the smallest doesn't seem to work for the largest.
            </li>
            <li>Higher wealth tiers (e.g. billionaires) would be even harder to comprehend.</li>
          </ol>
        </div>
      </div>

      <div className="wlc-notes-section">
        <h3 className="wlc-notes-heading">Notes &amp; sources</h3>
        <ol className="wlc-notes-list">
          <li id="wlc-note-1">
            Norton, M. I., &amp; Ariely, D. (2011). "Building a Better America—One
            Wealth Quintile at a Time." <em>Perspectives on Psychological Science</em>,
            6(1), 9–12. —{" "}
            <a href="https://pubmed.ncbi.nlm.nih.gov/26162108/" target="_blank" rel="noreferrer">
              PubMed
            </a>
          </li>
          <li id="wlc-note-2">
            UBS Global Wealth Report 2026, year-end 2025 data. —{" "}
            <a
              href="https://www.ubs.com/global/en/wealthmanagement/insights/global-wealth-report.html"
              target="_blank"
              rel="noreferrer"
            >
              ubs.com
            </a>
          </li>
          <li id="wlc-note-3">
            UBS models 56 major markets it estimates represent over 92% of global
            wealth; summing that sample's own adult headcounts gives ~3.85 billion.
            True global adult population is harder to pin to an exact figure, but
            based on UN population data (~8.2 billion people total, of whom roughly a
            quarter are under 15) it's closer to 6.1–6.2 billion — so the sample
            leaves out somewhere around 2.3 billion adults, almost entirely in
            lower-income countries that hold little aggregate wealth.
          </li>
          <li id="wlc-note-4">"Land" here means all land minus Antarctica (~141M km²).</li>
        </ol>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
