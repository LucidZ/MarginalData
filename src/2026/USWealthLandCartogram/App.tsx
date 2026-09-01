import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import type { GeoPath, GeoProjection } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import outline from "./data/us-outline.json";
import statesGeo from "./data/states-geo.json";
import { WEALTH_GROUPS, TOTAL_LAND_KM2, TOTAL_US_ADULTS, TOTAL_US_WEALTH_USD } from "./data";
import { buildLandMask } from "./landGrowth";
import {
  collectLandCells,
  dotDepthFractions,
  geodesicDistance,
  nearestLandCell,
  pickDotCells,
  solvePartition,
  DIST_INF,
} from "./geoAssign";
import { buildPersonDots, STAGING_HEIGHT } from "./personDots";
import {
  buildFieldIcons,
  FIELD_ICON_SIZE,
  FIELD_ICON_DETAILED,
  FOOTBALL_FIELD_M2,
  FIELD_LENGTH_YD,
  END_ZONE_DEPTH_YD,
  FieldIcon,
  FieldSymbolDefs,
} from "./FieldIcons";
import { FootnoteRef, FootnotesProvider, NotesList, type FootnoteEntry } from "../../components/Footnotes";
import "./App.css";

// Same 1600-wide canvas convention as the global version; height is picked
// to closely match CONUS's actual bounding-box aspect under an Albers fit
// (~1502x950 once geoAlbers().fitSize() finishes) so almost none of the
// canvas goes to empty margin.
const GRID_WIDTH = 1600;
const GRID_HEIGHT = 950;
const OCEAN_COLOR = "#0b1220";
const UNCLAIMED_COLOR: [number, number, number] = [90, 90, 90];
// Group colors pre-parsed once. drawFrame touches every one of the ~1.5M
// canvas pixels per frame, so re-parsing a hex string inside that loop (as
// this used to) is pure waste at 60fps.
const GROUP_RGB: [number, number, number][] = WEALTH_GROUPS.map((g) => hexToRgb(g.color));
// Person icons are drawn on top of a region filled with that same group
// color, so using the raw color as the icon fill gives the icon no contrast
// at all against its own background — it was only visible via its outline.
// A heavily whitened tint keeps the group readable (pale red on the Top 1%
// region, pale blue on the Bottom 50%) while restoring the value contrast
// that actually makes the icon a distinct shape.
const DOT_FILL: string[] = WEALTH_GROUPS.map((g) => {
  const [r, gr, b] = hexToRgb(g.color);
  const t = 0.62;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)},${mix(gr)},${mix(b)})`;
});

// Click animation: land grows/shifts from the click point — pushing and
// resizing any neighboring regions along with it — while every affected
// dot travels to its new spot in one continuous motion (see the "offWeight"
// comment below for how travel and landing are blended together).
const GROW_MS = 1100;
// How long a single cell spends cross-fading from its old owner to its new
// one as the wave passes over it. Land goes straight from one color to the
// next and never flashes through a neutral shade: it never actually becomes
// unowned, and strobing a third of the map through white at once looks
// terrible. The sense of being *pushed* comes from the wave's timing and its
// bright leading edge instead.
const CELL_FADE_MS = 300;
// Width and brightness of the highlight riding the front of the wave, so the
// recolor reads as one ripple sweeping outward from the click rather than a
// diffuse dissolve.
const WAVE_EDGE_MS = 90;
const WAVE_EDGE_STRENGTH = 0.32;
// The wave gets a gentler curve than the dots do. On the ease-out cubic the
// dots use, the front covers 61% of its distance in the first 27% of the
// time — it's past most of the map before the eye picks it up, which loses
// the whole point of animating the displacement as a travelling front.
// Dots still ease out, because an object arriving somewhere should settle.
const WAVE_EASE_POWER = 1.5;
// "Place groups myself" isn't animated by the JS loop above (there's
// nothing to grow toward), so it leans on dotPhaseMs's CSS transition
// instead, for a smooth fade back up to the staging row rather than an
// instant snap.
const RESET_MS = 500;

// Fixed seed points for the auto-play intro (see "Auto-play" below).
// Order matches WEALTH_GROUPS (bottom-up: smallest wealth share first).
const AUTO_PLAY_SEEDS: [number, number][] = [
  [-72.7, 41.76], // Hartford, CT
  [-94.58, 39.1], // Kansas City, MO
  [-104.99, 39.74], // Denver, CO
  [-118.2, 34.0], // Los Angeles, CA
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
  /** Index of every land cell, ascending — the iteration set for the solver. */
  landCells: Int32Array;
  /** Real state borders, pre-rendered once (the projection never changes)
   *  onto their own transparent canvas — pure decoration composited on top
   *  of the colored land raster every frame. Doesn't touch the fill/
   *  assignment logic: regions are grown outward from their own seeds (see
   *  geoAssign.ts), not built out of whole states, so a group's claimed
   *  region can span parts of several states. */
  bordersCanvas: HTMLCanvasElement;
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
    const adults = g.populationShare * TOTAL_US_ADULTS;
    const km2 = g.wealthShare * TOTAL_LAND_KM2;
    const m2 = (km2 * 1e6) / adults;
    const avgWealthUsd = (g.wealthShare * TOTAL_US_WEALTH_USD) / adults;
    const fields = m2 / FOOTBALL_FIELD_M2;
    // Yards from x=0, the very back of the near end zone — matches exactly
    // where the field icon's fill starts, so the words and the picture
    // agree. Past midfield the yard-line count runs back down toward the
    // far goal line, same as how a real broadcast reads the numbers painted
    // on the field.
    const depthYd = fields * FIELD_LENGTH_YD;
    const yardLine = Math.round(
      depthYd <= FIELD_LENGTH_YD / 2 ? depthYd - END_ZONE_DEPTH_YD : FIELD_LENGTH_YD - END_ZONE_DEPTH_YD - depthYd,
    );
    const compareLabel =
      depthYd < END_ZONE_DEPTH_YD
        ? "doesn't even reach the far side of the end zone"
        : fields < 1
          ? `from the back of the end zone to about the ${yardLine}-yard line`
          : fields < 3
            ? `about ${fields.toFixed(1)} football fields`
            : `about ${Math.round(fields)} football fields`;
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

// Single source of truth for this story's footnote text — both the inline
// FootnoteRef popovers and the NotesList at the bottom read this same array
// via FootnotesProvider (see ../../components/Footnotes), so they can't
// drift out of sync.
const NOTES: FootnoteEntry[] = [
  {
    id: 1,
    content: (
      <>
        Norton, M. I., &amp; Ariely, D. (2011). "Building a Better America—One Wealth
        Quintile at a Time." <em>Perspectives on Psychological Science</em>, 6(1),
        9–12. (
        <a href="https://pubmed.ncbi.nlm.nih.gov/26162108/" target="_blank" rel="noreferrer">
          PubMed
        </a>
        )
      </>
    ),
  },
  {
    id: 2,
    content: (
      <>
        "Land" here means the 48 contiguous states plus Washington, D.C.
        (~7.8M km²). Alaska and Hawaii are excluded so the map is one
        contiguous landmass to route wealth across, same as the global
        version's own "all land minus Antarctica" simplification.
      </>
    ),
  },
  {
    id: 3,
    content: (
      <>
        Federal Reserve{" "}
        <a
          href="https://www.federalreserve.gov/releases/efa/efa-distributional-financial-accounts.htm"
          target="_blank"
          rel="noreferrer"
        >
          Distributional Financial Accounts
        </a>
        , 2026:Q1 data.
      </>
    ),
  },
];

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geoRef = useRef<GeoSetup | null>(null);
  // Last fully-settled (post-animation) label grid — the "before" picture
  // the next click's wave animates away from.
  const committedLabelRef = useRef<Int8Array | null>(null);
  // Geodesic distance field per placed seed, and the land cell each seed
  // actually landed on. Both are cached across clicks: the landmass never
  // changes, so an already-placed seed's field stays valid forever and only
  // the newly placed seed needs a traversal.
  const distFieldsRef = useRef<Int32Array[]>([]);
  const seedCellsRef = useRef<number[]>([]);
  // Previous solve's radius budgets, used to warm-start the next fit — only
  // the brand-new group's weight is genuinely unknown, so this cuts the fit
  // to a handful of passes.
  const weightsRef = useRef<Float64Array | null>(null);
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
  // True while the pointer is over ground that can't take a seed — see
  // seedPointAt for why claimed land is off limits.
  const [isHoverBlocked, setIsHoverBlocked] = useState(false);

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

    // Albers equal-area conic — the standard equal-area choice for a
    // single country (vs. the global version's Mollweide for the whole
    // world), fit directly to the merged CONUS+DC outline rather than the
    // AK/HI-inset-composite geoAlbersUsa, since this map's scope is the 48
    // contiguous states + DC only (see footnote 2).
    const projection = d3.geoAlbers().fitSize([GRID_WIDTH, GRID_HEIGHT], outline as Feature<Geometry>);
    const path = d3.geoPath(projection, ctx);
    // transient: draws onto the visible canvas just to read back which pixels
    // are land, before any real content exists there — overwritten below.
    const landMask = buildLandMask(outline as Feature<Geometry>, path, ctx, GRID_WIDTH, GRID_HEIGHT);

    // Real state borders, pre-rendered once onto their own canvas (the
    // projection never changes) — decorative only, composited on top of the
    // colored raster every frame in drawFrame. See the GeoSetup doc comment.
    const bordersCanvas = document.createElement("canvas");
    bordersCanvas.width = GRID_WIDTH;
    bordersCanvas.height = GRID_HEIGHT;
    const bordersCtx = bordersCanvas.getContext("2d");
    if (bordersCtx) {
      const bordersPath = d3.geoPath(projection, bordersCtx);
      // Kept deliberately faint: at .55 these read at the same value as the
      // person icons sitting on top of them, and the icons got lost in the
      // border mesh. The state shapes still register at .3.
      bordersCtx.strokeStyle = "rgba(255,255,255,.3)";
      bordersCtx.lineWidth = 1;
      (statesGeo as FeatureCollection).features.forEach((f) => {
        bordersCtx.beginPath();
        bordersPath(f);
        bordersCtx.stroke();
      });
    }

    // Still deferred a tick so React can paint the "preparing map…" state
    // before any of this runs. Setup itself is now cheap — the real per-click
    // cost moved into the solver (see the seeds effect below), which is where
    // it belongs, since the answer depends on where you click.
    const timer = setTimeout(() => {
      const landCells = collectLandCells(landMask);
      // Reused every redraw (including every animation frame) instead of
      // allocating a fresh ~5MB buffer each time.
      const imageData = offCtx.createImageData(GRID_WIDTH, GRID_HEIGHT);
      geoRef.current = { projection, path, ctx, offCtx, imageData, landMask, landCells, bordersCanvas };
      setIsReady(true);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Paints one (possibly mid-animation) frame onto the visible canvas.
  //
  // Mid-animation, `wave` is the geodesic distance field from the seed that
  // was just placed and `waveR` is how far that wave has travelled so far —
  // so a cell shows its new owner once the wave has swept past it, its old
  // owner until then, and cross-fades between the two across the fade band
  // in between. Everything the wave passes also picks up a brief highlight,
  // which is what makes a displacement on the far side of the country read
  // as one ripple travelling outward from the click. Pass `wave` as null for
  // a settled state.
  function drawFrame(
    geo: GeoSetup,
    fromLabel: Int8Array,
    toLabel: Int8Array,
    wave: Int32Array | null,
    waveR: number,
    fadeWidth: number,
    edgeWidth: number
  ) {
    const { path, ctx, offCtx, imageData, landMask, bordersCanvas } = geo;

    // Paint claimed/unclaimed colors onto an offscreen buffer at raster
    // resolution (only land pixels matter — everything else gets clipped
    // away next), then composite it onto the visible canvas through a clip
    // path built from the real vector coastline. That keeps the true
    // land/ocean edge crisp even though the boundaries *between* claimed
    // regions (which aren't real geography) stay raster-resolution.
    const out = imageData.data;
    for (let i = 0; i < GRID_WIDTH * GRID_HEIGHT; i++) {
      if (!landMask[i]) continue; // left transparent; clipped away regardless
      const from = fromLabel[i];
      const to = toLabel[i];

      let mix = 1;
      let edge = 0;
      if (wave) {
        const d = wave[i];
        if (d !== DIST_INF) {
          if (from !== to) {
            if (d >= waveR) mix = 0;
            else if (d > waveR - fadeWidth) mix = (waveR - d) / fadeWidth;
          }
          if (d <= waveR && d > waveR - edgeWidth) edge = 1 - (waveR - d) / edgeWidth;
        } else if (from !== to) {
          mix = 0;
        }
      }

      const a = from === -1 ? UNCLAIMED_COLOR : GROUP_RGB[from];
      const b = to === -1 ? UNCLAIMED_COLOR : GROUP_RGB[to];
      let cr = a[0] + (b[0] - a[0]) * mix;
      let cg = a[1] + (b[1] - a[1]) * mix;
      let cb = a[2] + (b[2] - a[2]) * mix;
      if (edge > 0) {
        const lift = edge * WAVE_EDGE_STRENGTH;
        cr += (255 - cr) * lift;
        cg += (255 - cg) * lift;
        cb += (255 - cb) * lift;
      }

      out[i * 4] = cr;
      out[i * 4 + 1] = cg;
      out[i * 4 + 2] = cb;
      out[i * 4 + 3] = 255;
    }
    offCtx.putImageData(imageData, 0, 0);

    ctx.clearRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    ctx.fillStyle = OCEAN_COLOR;
    ctx.fillRect(0, 0, GRID_WIDTH, GRID_HEIGHT);
    ctx.save();
    ctx.beginPath();
    path(outline as Feature<Geometry>);
    ctx.clip();
    ctx.drawImage(offCtx.canvas, 0, 0);
    // Decorative state-border overlay, still clipped to real land — see the
    // GeoSetup doc comment for why this doesn't touch the fill logic.
    ctx.drawImage(bordersCanvas, 0, 0);
    ctx.restore();
  }

  function cancelPendingAnimation() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  // Re-solve and animate whenever a seed is placed (or reset).
  //
  // Every click re-solves the whole partition from scratch rather than
  // patching the previous one. That's what makes displacement work: drop the
  // last seed in Miami and whoever held Florida is pushed out of it
  // automatically, because their own radius budget has to grow to keep their
  // quota and so they expand somewhere else instead. It also means the final
  // map depends only on where the four seeds are, not the order they were
  // placed in — worth knowing, since it makes "the top 1% takes a third of
  // the country wherever you put them" structurally true rather than just
  // asserted.
  //
  // The visible motion is one wave sweeping outward from the click: the new
  // group's own land grows behind it, and any land changing hands recolors
  // as the wave reaches it, so a knock-on shift two thousand miles away
  // still reads as a consequence of that click.
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo || !isReady) return;
    cancelPendingAnimation();

    const { projection, landMask, landCells } = geo;
    const toPixel = (lonLat: [number, number]): [number, number] => projection(lonLat) ?? [0, 0];
    const totalCells = GRID_WIDTH * GRID_HEIGHT;
    const emptyLabel = new Int8Array(totalCells).fill(-1);

    if (seeds.length === 0) {
      distFieldsRef.current = [];
      seedCellsRef.current = [];
      weightsRef.current = null;
      committedLabelRef.current = null;
      committedDotPixelsRef.current = new Map();
      drawFrame(geo, emptyLabel, emptyLabel, null, 0, 1, 1);
      setDotPhaseMs(RESET_MS);
      setLandedPositions(new Map());
      setIsAnimating(false);
      return;
    }

    const newGroupIndex = seeds.length - 1;
    const clickPixel = toPixel(seeds[newGroupIndex]);

    // One traversal per click, never more: the landmass never changes, so
    // every already-placed seed's distance field stays valid and is reused.
    if (!distFieldsRef.current[newGroupIndex]) {
      const seedCell = nearestLandCell(landCells, GRID_WIDTH, clickPixel[0], clickPixel[1]);
      seedCellsRef.current[newGroupIndex] = seedCell;
      distFieldsRef.current[newGroupIndex] = geodesicDistance(
        landMask,
        GRID_WIDTH,
        GRID_HEIGHT,
        seedCell
      );
    }
    const fields = distFieldsRef.current.slice(0, seeds.length);
    const seedCells = seedCellsRef.current.slice(0, seeds.length);

    // Quotas are exact cell counts. Once all four groups are down, the last
    // one absorbs the rounding remainder so they sum to the landmass exactly
    // instead of leaving a stray sliver permanently unclaimed.
    const quotas = WEALTH_GROUPS.slice(0, seeds.length).map((g) =>
      Math.round(landCells.length * g.wealthShare)
    );
    if (seeds.length === WEALTH_GROUPS.length) {
      quotas[quotas.length - 1] += landCells.length - quotas.reduce((a, b) => a + b, 0);
    }

    const solveStart = performance.now();
    // Diagnostics are collected only in dev; passing undefined in production
    // means the solver skips recording entirely rather than filling arrays
    // nobody will read. Both are surfaced on the window handle below — the
    // fit trace shows whether the weight solve converged or oscillated, the
    // dither log shows each pass's transfers, and it was the dither log that
    // exposed two groups trading the same debt back and forth while a patch
    // of land sat unclaimed against a third.
    const fitTrace: number[] | undefined = import.meta.env.DEV ? [] : undefined;
    const ditherLog: unknown[] | undefined = import.meta.env.DEV ? [] : undefined;
    const { label: targetLabel, weights } = solvePartition(
      landMask,
      landCells,
      fields,
      seedCells,
      quotas,
      totalCells,
      GRID_WIDTH,
      GRID_HEIGHT,
      weightsRef.current,
      fitTrace,
      ditherLog
    );
    weightsRef.current = weights;

    // Dev-only diagnostic handle (stripped from production by Vite's dead-code
    // elimination). Kept deliberately rather than re-added ad hoc each time:
    // this partition's invariants are not things you can eyeball. A stippled
    // region and a clean one look identical to an 8-connected component count,
    // because a checkerboard is diagonally connected — it takes 4-connected
    // components and total boundary length to tell them apart, and both of the
    // bugs this file has had were invisible until those were measured. See
    // tests/us-wealth-cartogram-invariants.mjs for the checks that read this.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__wlc = {
        label: targetLabel,
        // Water carries the same -1 label as unclaimed land, so anything
        // reasoning about "open ground" needs the mask to tell them apart.
        land: landMask,
        width: GRID_WIDTH,
        height: GRID_HEIGHT,
        quotas,
        landCount: landCells.length,
        weights: Array.from(weights),
        seedCells: [...seedCells],
        trace: fitTrace,
        ditherLog,
        solveMs: performance.now() - solveStart,
      };
    }

    const prevLabel = committedLabelRef.current ?? emptyLabel;
    const wave = fields[newGroupIndex];

    // The wave stops at the furthest cell that actually changes hands.
    // Without this, the first click — a 2.4% region — would spend its whole
    // animation sweeping an empty front across the rest of the country with
    // nothing happening behind it.
    let maxChangeDist = 0;
    for (let r = 0; r < landCells.length; r++) {
      const c = landCells[r];
      if (prevLabel[c] === targetLabel[c]) continue;
      const d = wave[c];
      if (d !== DIST_INF && d > maxChangeDist) maxChangeDist = d;
    }
    // Fade and edge widths are distances, but they're specified in
    // milliseconds and converted here, so a cell always takes the same
    // ~300ms to change color whether the wave crossed one state or twenty.
    const fadeWidth = Math.max(1, maxChangeDist * (CELL_FADE_MS / GROW_MS));
    const edgeWidth = Math.max(1, maxChangeDist * (WAVE_EDGE_MS / GROW_MS));
    const waveEnd = maxChangeDist + fadeWidth;

    // Every placed group's dots get re-placed against the new partition.
    // Groups whose territory didn't move get byte-identical cells back (the
    // placement is deterministic in the region's own depth ordering), so
    // they simply don't animate — no need to detect that case separately.
    const dotTargets = new Map<number, { x: number; y: number }>();
    for (let gi = 0; gi < seeds.length; gi++) {
      const cells = pickDotCells(
        targetLabel,
        landCells,
        fields[gi],
        gi,
        dotDepthFractions(personDots, gi)
      );
      cells.forEach((cell, id) => {
        dotTargets.set(id, { x: cell % GRID_WIDTH, y: (cell / GRID_WIDTH) | 0 });
      });
    }
    // A dot travels from wherever it last settled; the newly placed group's
    // dots have no history, so they fly in from the click point itself.
    const dotFrom = new Map<number, { x: number; y: number }>();
    dotTargets.forEach((_, id) => {
      dotFrom.set(
        id,
        committedDotPixelsRef.current.get(id) ?? { x: clickPixel[0], y: clickPixel[1] }
      );
    });

    setIsAnimating(true);
    setDotPhaseMs(0);

    const start = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / GROW_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic, for the dots
      const waveEased = 1 - Math.pow(1 - t, WAVE_EASE_POWER);
      drawFrame(geo, prevLabel, targetLabel, wave, waveEased * waveEnd, fadeWidth, edgeWidth);

      if (dotTargets.size > 0) {
        setLandedPositions((prev) => {
          const next = new Map(prev);
          dotTargets.forEach((to, id) => {
            const from = dotFrom.get(id)!;
            next.set(id, {
              x: from.x + (to.x - from.x) * eased,
              y: from.y + (to.y - from.y) * eased,
            });
          });
          return next;
        });
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Settled: redraw with no wave at all, so the trailing edge highlight
      // clears rather than being left frozen wherever the last frame landed.
      drawFrame(geo, targetLabel, targetLabel, null, 0, 1, 1);
      committedLabelRef.current = targetLabel;
      dotTargets.forEach((point, id) => committedDotPixelsRef.current.set(id, point));
      rafRef.current = null;
      setIsAnimating(false);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => cancelPendingAnimation();
  }, [seeds, personDots, isReady]);

  /**
   * Where a pointer event lands, or null if it isn't a legal place to seed a
   * group.
   *
   * Groups may only be seeded on *unclaimed* land. Two seeds landing on the
   * same cell give the solver identical distance fields, at which point no
   * choice of weights can tell the groups apart and one of them takes
   * everything — and seeds merely close together are a softer version of the
   * same problem (see geoAssign.ts). Requiring open ground rules that out,
   * and does it with a rule that scales itself: a group's territory is
   * exactly as large as its share of the wealth, so the space it reserves
   * around its own seed grows with it, which is the shape the degeneracy
   * has too. It also needs no explaining in the UI, because the legal area
   * is already on screen as the grey land.
   *
   * The trade is that a group can't be aimed at ground somebody already
   * holds. Displacement still happens — the last group is seeded in whatever
   * is left and shoves the others aside to reach its share — you just can't
   * point at the spot it should shove from.
   */
  function seedPointAt(e: React.MouseEvent<HTMLCanvasElement>): [number, number] | null {
    const geo = geoRef.current;
    const canvas = canvasRef.current;
    if (!geo || !canvas || !isReady || isComplete || isAnimating || isAutoPlayingRef.current) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * GRID_WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * GRID_HEIGHT;
    const lonLat = geo.projection.invert?.([px, py]);
    if (!lonLat) return null; // no inverse at all for this point

    // Albers, like Mollweide, extrapolates rather than returning null for
    // points outside the drawn landmass (e.g. the corners of the canvas),
    // so validate by projecting back and checking it lands near the
    // original click.
    const roundTrip = geo.projection(lonLat);
    if (!roundTrip || Math.hypot(roundTrip[0] - px, roundTrip[1] - py) > 1) return null;

    // Test the land cell the seed would actually snap to, not the raw pixel:
    // a click a little offshore is legal and lands on the nearest coast, but
    // it must not snap onto ground that is already spoken for.
    const cell = nearestLandCell(geo.landCells, GRID_WIDTH, roundTrip[0], roundTrip[1]);
    const claimed = committedLabelRef.current;
    if (claimed && claimed[cell] >= 0) return null;

    return lonLat as [number, number];
  }

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const point = seedPointAt(e);
    if (!point) return;
    setSeeds((prev) => [...prev, point]);
  }

  // Hover feedback, so nobody has to discover the rule by clicking and having
  // nothing happen. Only writes state on an actual change — this fires on
  // every mouse move over a full-width canvas.
  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const blocked = seedPointAt(e) === null;
    setIsHoverBlocked((prev) => (prev === blocked ? prev : blocked));
  }

  return (
    <FootnotesProvider notes={NOTES}>
    <div className="wlc-root">
      <header className="wlc-header">
        <h1 className="wlc-title">If American Wealth Were Land</h1>
        <p>
          I've always found wealth distributions difficult to intuit, and Americans
          in particular have been shown to badly misjudge just how unequal U.S.
          wealth actually is<FootnoteRef n={1} />. After building a global version
          of this idea, I wanted to see what it looked like zoomed in on just the
          United States, using real Federal Reserve data instead of a global model.
        </p>
        <p>
          So again: what if, instead of a pie chart, we divided the land of the
          United States<FootnoteRef n={2} /> among different wealth tiers?
        </p>
      </header>

      <div className="wlc-chart-area" ref={chartAreaRef}>
        <div className="wlc-legend">
          {WEALTH_GROUPS.map((g, i) => (
            <div
              key={g.id}
              className={`wlc-legend-item ${i >= seeds.length ? "wlc-legend-item--pending" : ""}`}
            >
              <span className="wlc-legend-swatch" style={{ background: g.color }} />
              <strong>{g.name}</strong>: {(g.populationShare * 100).toFixed(0)}% of adults,{" "}
              {(g.wealthShare * 100).toFixed(1)}% of net worth
            </div>
          ))}
        </div>

        <div className="wlc-map-wrap" style={{ aspectRatio: `${GRID_WIDTH} / ${virtualTotalHeight}` }}>
          <canvas
            ref={canvasRef}
            className="wlc-canvas"
            style={{
              cursor: isComplete || isAnimating || isAutoPlaying
                ? "default"
                : isHoverBlocked
                  ? "not-allowed"
                  : "crosshair",
            }}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMove}
            onMouseLeave={() => setIsHoverBlocked(false)}
          />
          {!isReady && <div className="wlc-loading">Preparing map…</div>}
          {/* Shared symbol so every dot below is a lightweight <use>, not its
              own copy of the path data. Outline is a real SVG stroke (scales
              with the icon via the viewBox) rather than a CSS drop-shadow,
              which stays a fixed physical size and would swallow the fill
              at small icon sizes. It is dark, not white: the state borders
              underneath are white, so a white outline camouflaged the icon
              against the very lines it needed to separate from. */}
          <svg width="0" height="0" style={{ position: "absolute" }}>
            <defs>
              <symbol id="wlc-person-icon" viewBox="0 0 24 24">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  fill="currentColor"
                  stroke="rgba(9,14,26,.92)"
                  strokeWidth="2.4"
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
                    color: DOT_FILL[dot.groupIndex],
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
              Now placing <strong>{currentGroup.name}</strong>:{" "}
              {(currentGroup.wealthShare * 100).toFixed(1)}% of net worth
            </>
          ) : currentGroup ? (
            <>
              Click {seeds.length > 0 ? "any unclaimed (grey) land" : "the map"} to
              place <strong>{currentGroup.name}</strong>:{" "}
              {(currentGroup.wealthShare * 100).toFixed(1)}% of U.S. net worth
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
        <h3 className="wlc-takeaways-heading">Some interesting insights</h3>
        <ol className="wlc-takeaways-list">
          <li>
            This data comes from the Federal Reserve's Distributional Financial
            Accounts<FootnoteRef n={3} />, updated quarterly. Unlike the global
            version's UBS-based data, which only samples 56 major markets, these
            percentiles cover the actual full U.S. population — no sample-coverage
            caveat needed here.
          </li>
          <li>
            This map uses an Albers equal-area conic projection rather than the
            Mollweide projection the global map uses — same underlying principle
            (no region can end up looking bigger than its actual wealth share just
            because of where it landed), just the standard equal-area choice for a
            single country instead of the whole globe. It's also why state shapes
            here look subtly different from a typical U.S. map.
          </li>
          <li>
            The state borders drawn on top are purely decorative. Each group's
            territory grows outward from the point you click, travelling through
            land only and bending around the coastline, until it covers exactly
            its share of the country — so a region can span parts of several
            states rather than being made of whole ones, and a group placed
            later physically shoves the earlier ones out of the way to make room.
          </li>
          <li>
            Where you click changes the shape of every region but never their
            sizes. The map is also re-solved from scratch on each click rather
            than patched, so the finished result doesn't depend on the order you
            placed the groups in either — the top 1% ends up with a third of the
            country wherever you decide to put it.
          </li>
        </ol>
      </div>

      <div className="wlc-person-section">
        <h2 className="wlc-person-heading">What that land means per person</h2>
        <p className="wlc-person-subtitle">
          If we split each group's territory evenly across everyone in it and measured
          it out in football fields, this is roughly what one person's share would
          look like.
        </p>
        <svg width="0" height="0" style={{ position: "absolute" }}>
          <defs>
            <FieldSymbolDefs />
          </defs>
        </svg>
        <div className="wlc-field-rows">
          {perPersonStats.map((s) => {
            const icons = buildFieldIcons(s.m2);
            return (
              <div className="wlc-field-row" key={s.name}>
                <div className="wlc-field-row-label">
                  <span className="wlc-field-row-swatch" style={{ background: s.color }} />
                  <strong>{s.name}</strong>
                  <span className="wlc-field-row-detail">
                    On average, {formatArea(s.m2)}: {s.compareLabel}
                  </span>
                </div>
                {s.openEnded && (
                  <p className="wlc-field-row-caveat">
                    That "{s.compareLabel}" figure comes from an average of{" "}
                    <strong>{formatUsd(s.avgWealthUsd)}</strong> per person in this band.
                    "Top 1%" has no upper bound, so a small number of extremely wealthy
                    people inside it pull that average well above what most people in
                    this group actually hold.
                  </p>
                )}
                <div className="wlc-field-row-icons">
                  {icons.map((icon, i) => (
                    <FieldIcon
                      key={i}
                      icon={icon}
                      color={s.color}
                      size={FIELD_ICON_SIZE}
                      detailed={FIELD_ICON_DETAILED}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="wlc-takeaways">
          <h3 className="wlc-takeaways-heading">Some interesting insights</h3>
          <ol className="wlc-takeaways-list">
            <li>
              It's again difficult to intuit the size of the smallest and largest
              lands; a unit of measurement (like football fields) that works for
              the smallest doesn't seem to work for the largest — the bottom
              50%'s share doesn't even reach midfield, while the top 1%'s is well
              over a hundred entire fields.
            </li>
            <li>Higher tiers within the top 1% (e.g. billionaires) would be even harder to wrap my head around.</li>
          </ol>
        </div>
      </div>

      <NotesList />
    </div>
    </FootnotesProvider>
  );
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
