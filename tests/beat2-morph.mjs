// Verifies Beat 2's 2024<->2022 morph never prints a number that didn't
// happen: geometry interpolates continuously with scroll, but every label
// snaps between the two real elections. The dotted line traces each cycle's
// OWN 65+ rate (not a value pinned to 2024 - see the 2026-09-18 addendum at
// the top of .claude/voter-age-morph-honesty-spec.md), so unlike the
// original version of this beat, the line is expected to move.
//
// Beats 1 and 2 were merged into one section sharing one pinned chart on
// 2026-09-18 (`AgeBeats.tsx`, formerly `Beat1.tsx` + `Beat2.tsx`), so the
// morph window here is measured off step elements rather than off a "beat 2
// section". That the chart stays pinned across the boundary is asserted in
// tests/age-beats-steps.mjs.
// Run with: BASE_URL=http://localhost:5174 node tests/beat2-morph.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:4321";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

// Beats 1 and 2 now share one section and one chart (AgeBeats.tsx), so the
// morph window can't be read off a "beat 2 section" - it's measured from the
// steps themselves. Progress is a fractional step index, and the morph runs
// from progress MORPH_STEP+0.15 to MORPH_STEP+0.85, i.e. between the centers
// of steps 5 and 6. Scan a little past both ends so the true endpoints are
// reached regardless of how step heights map to scroll position. We read `u`
// back from the scrubber's data-u (RewindOverlay.tsx) rather than assume a
// scrollY formula for it.
const MORPH_STEP = 5; // AgeBeats.tsx
const window_ = await page.evaluate(
  ({ i, h }) => {
    const steps = [...document.querySelectorAll(".voa-beat .voa-step")];
    const centerY = (el) => {
      const r = el.getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2 - h / 2;
    };
    return { from: centerY(steps[i]), to: centerY(steps[i + 1]) };
  },
  { i: MORPH_STEP, h: 900 }
);
const span = window_.to - window_.from;
const SCAN_START = window_.from - span * 0.15;
const SCAN_END = window_.to + span * 0.15;
const N = 40;

async function scrollTo(y) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  // Wait for useStepProgress's rAF measure and React's re-render, not a
  // fixed 60ms - one frame costs 100-200ms in headless Chromium, so a fixed
  // short wait sometimes read the previous sample's state.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(30);
}

// Beats 1 and 2 render one chart between them, so `.voa-beat:first-of-type`
// IS the morphing chart - but beats 3 and 4 further down the page reuse the
// same PopulationBars class names, so every query still has to be scoped to
// a section rather than run against the document.
async function readState() {
  return page.evaluate(() => {
    const section = document.querySelector(".voa-beat");
    const state = section.querySelector(".voa-morph-state");
    const u = state ? parseFloat(state.dataset.u0) : null;
    // The timeline's 2022 and 2024 buttons stand in for the old two-year
    // scrubber's end circles: filled only while resting on that year.
    const btn = (y) => section.querySelector(`.voa-yc-btn[aria-label^="${y}"]`);
    const endsOn = [btn("2022"), btn("2024")].map((e) => e.classList.contains("is-on"));
    const plotOpacity = parseFloat(getComputedStyle(section.querySelector(".pb-plot-wrap svg")).opacity);
    const heroFigEl = section.querySelector(".pb-gap-hero-figure");
    const heroFig = heroFigEl ? parseFloat(heroFigEl.textContent) : null;
    const deltaEl = section.querySelector(".pb-gap-hero-delta");
    const deltaOpacity = deltaEl ? parseFloat(getComputedStyle(deltaEl).opacity) : null;
    const surface = section.querySelector(".pb-surface");
    const nodeCount = surface ? surface.querySelectorAll("*").length : null;
    const surfaceHeight = surface ? surface.getBoundingClientRect().height : null;
    const d = section.querySelector("path.pb-line-reg")?.getAttribute("d") ?? null;
    return { u, endsOn, plotOpacity, heroFig, deltaOpacity, nodeCount, surfaceHeight, d };
  });
}

function lineYs(d) {
  // d3's curveLinear path is "Mx,yLx,yLx,y..." - no spaces.
  return d
    .replace(/^M/, "")
    .split("L")
    .map((pt) => parseFloat(pt.split(",")[1]));
}

const samples = [];
for (let i = 0; i < N; i++) {
  const y = SCAN_START + (SCAN_END - SCAN_START) * (i / (N - 1));
  await scrollTo(y);
  samples.push({ y, ...(await readState()) });
}

// 1. The scan actually spans the full morph.
const us = samples.map((s) => s.u);
if (Math.min(...us) > 0.05) throw new Error(`FAIL: never reached near u=0 (min u=${Math.min(...us).toFixed(3)})`);
if (Math.max(...us) < 0.95) throw new Error(`FAIL: never reached near u=1 (max u=${Math.max(...us).toFixed(3)})`);
console.log(`PASS: scan spans u=${Math.min(...us).toFixed(3)}..${Math.max(...us).toFixed(3)}`);

// 2. Timeline: a year's button is filled only while resting on that real
// year, and the plot is only undimmed there.
for (const s of samples) {
  const [on2022, on2024] = s.endsOn;
  if (on2022 !== s.u >= 0.999 || on2024 !== s.u <= 0.001) { console.log(JSON.stringify(s.endsOn), s.y);
    throw new Error(`FAIL: timeline buttons [2022=${on2022}, 2024=${on2024}] wrong at u=${s.u}`);
  }
  const atRealYear = s.u <= 0.001 || s.u >= 0.999;
  if (atRealYear !== (s.plotOpacity > 0.99)) {
    throw new Error(`FAIL: plot opacity ${s.plotOpacity} at u=${s.u} - should be dimmed iff between years`);
  }
}
console.log("PASS: timeline buttons fill only at a real year; plot dimmed only between years");

// 3. The printed gold figure only ever takes one of the two real values -
// never something in between, which would describe an election that never
// happened. Both years' shortfalls are measured against their OWN 65+ rate
// (23.3M / 36.1M), not a value pinned to 2024's rate (that was 54.0M in the
// earlier pinned-benchmark version of this beat - see spec addendum).
// First hero figure is now the registration gap (people not registered),
// the view beat 1 hands to the morph since the 2026-09-25 simplification.
const ALLOWED = [16.7, 20.6];
for (const s of samples) {
  const nearest = ALLOWED.reduce((a, b) => (Math.abs(b - s.heroFig) < Math.abs(a - s.heroFig) ? b : a));
  if (Math.abs(s.heroFig - nearest) > 0.05) {
    throw new Error(`FAIL: gold figure ${s.heroFig}M at u=${s.u.toFixed(2)} is neither 16.7M nor 20.6M`);
  }
}
const below = samples.filter((s) => s.u < 0.45);
const above = samples.filter((s) => s.u > 0.55);
if (!below.every((s) => Math.abs(s.heroFig - 16.7) < 0.05)) throw new Error("FAIL: gold figure isn't pinned to 16.7M before the flip");
if (!above.every((s) => Math.abs(s.heroFig - 20.6) < 0.05)) throw new Error("FAIL: gold figure isn't pinned to 20.6M after the flip");
console.log("PASS: gold figure snaps between the two real values only (16.7M / 20.6M), never a blend");

// 4. Delta line stays invisible until deep in the morph (last ~15% of u),
// then fades in - reserved space, never a mount (spec S5/S7).
const early = samples.filter((s) => s.u < 0.8);
if (!early.every((s) => s.deltaOpacity < 0.02)) throw new Error("FAIL: delta line visible before u=0.8");
const veryLate = samples.filter((s) => s.u > 0.98);
if (!veryLate.some((s) => s.deltaOpacity > 0.8)) throw new Error("FAIL: delta line never reaches full opacity near u=1");
console.log("PASS: delta line stays hidden until the very end of the morph, then fades in");

// 6. DOM node count under the chart surface stays within a small band.
// Legend/hero/year-stamp elements are always-mounted (opacity-only, spec
// S5) so they contribute zero variance. The one legitimate source of
// mount/unmount left is the gold gap `<rect>` per bar (`showGap`): since
// each cycle now has its OWN 65+ line, a handful of ages sit on different
// sides of "short" in 2024 vs. 2022, so a few gap rects enter/exit as the
// bars cross their own cycle's line. That's real geometry, not a printed
// number, so a small spread here is expected. The other is cohorts crossing
// the chart's edges (ageRows.ts hopRows): the two oldest 2022 cohorts mount
// mid-hop to slide in from the right, and the two youngest 2024 cohorts
// unmount once the chart settles on 2022 - up to 5 elements each (track,
// registered, votes, gap, hit), so up to 20 more. Anything beyond that
// means something unrelated is mounting/unmounting.
const counts = samples.map((s) => s.nodeCount);
const countSpread = Math.max(...counts) - Math.min(...counts);
if (countSpread > 30) throw new Error(`FAIL: DOM node count swung by ${countSpread} across the morph (${Math.min(...counts)}-${Math.max(...counts)}) - more than gap rects crossing threshold plus cohorts crossing the edges`);
console.log(`PASS: DOM node count stays within a small band across the morph (${Math.min(...counts)}-${Math.max(...counts)})`);

// 7. Chart surface height identical at both true endpoints (spec S5
// sanity check).
const first = samples[0].surfaceHeight;
const last = samples[samples.length - 1].surfaceHeight;
if (Math.abs(first - last) > 0.5) throw new Error(`FAIL: chart surface height differs at the two endpoints: ${first} vs ${last}`);
console.log(`PASS: chart surface height identical at both endpoints (${first}px)`);

// 8. The primary dotted line DOES move now - it traces each cycle's own
// 65+ rate (74.62% -> 66.79%), not a value pinned to 2024. Assert it drops
// (higher y-pixel = lower value) by a visible amount at a middle age.
const firstYs = lineYs(samples[0].d);
const lastYs = lineYs(samples[samples.length - 1].d);
const midIdx = Math.floor(firstYs.length / 2);
const lineDrift = lastYs[midIdx] - firstYs[midIdx];
// The morph now carries the registration line (80.24% -> 77.34%), a much
// smaller drop than the turnout line's 74.62% -> 66.79%.
if (lineDrift < 3) throw new Error(`FAIL: registration dotted line only moved ${lineDrift.toFixed(1)}px at a middle age - expected a visible drop from 80.24% to 77.34%`);
console.log(`PASS: registration dotted line drops from the 2024 rate to the 2022 rate (${lineDrift.toFixed(2)}px at a middle age)`);

// 9. Reversibility - revisit descending, expect the same u->figure map.
const descSamples = [];
for (let i = N - 1; i >= 0; i--) {
  const y = SCAN_START + (SCAN_END - SCAN_START) * (i / (N - 1));
  await scrollTo(y);
  descSamples.push(await readState());
}
descSamples.reverse();
for (let i = 0; i < samples.length; i++) {
  // useStepProgress quantizes to 1/200 (see useStepProgress.ts) - right at
  // the t=0.5 flip, a sub-pixel scrollTo difference between the ascending
  // and descending pass can round to the opposite side, which a hard snap
  // (by design, spec S2) turns into a full 23.3<->54.0 flip instead of the
  // sub-0.01M wobble a continuous value would show. Skip only that razor's
  // edge; everywhere else must match exactly.
  if (Math.abs(samples[i].u - 0.5) < 0.07) continue;
  if (Math.abs(samples[i].heroFig - descSamples[i].heroFig) > 0.05) {
    throw new Error(`FAIL: reversal mismatch at sample ${i} (u=${samples[i].u})`);
  }
}
console.log("PASS: reversing the scroll retraces the same gold figure at every point (away from the exact flip boundary)");

// 10. Stability - hold a midpoint, confirm no drift after a long wait
// (transitionMs={0}, so nothing should be mid-tween).
await scrollTo(SCAN_START + (SCAN_END - SCAN_START) * 0.5);
await page.waitForTimeout(200);
const heldFirst = await readState();
await page.waitForTimeout(1500);
const heldLater = await readState();
if (heldFirst.heroFig !== heldLater.heroFig) throw new Error("FAIL: gold figure drifted while held");
console.log(`PASS: value stable while held (${heldLater.heroFig}M)`);

await browser.close();
console.log("all checks passed");
