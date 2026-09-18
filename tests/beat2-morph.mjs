// Verifies Beat 2's 2024<->2022 morph never prints a number that didn't
// happen: geometry interpolates continuously with scroll, but every label
// snaps between the two real elections. The dotted line traces each cycle's
// OWN 65+ rate (not a value pinned to 2024 - see the 2026-09-18 addendum at
// the top of .claude/voter-age-morph-honesty-spec.md), so unlike the
// original version of this beat, the line is expected to move.
// Run with: BASE_URL=http://localhost:5183 node tests/beat2-morph.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:4321";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

const box = await page.evaluate(() => {
  const titles = [...document.querySelectorAll(".voa-beat-title")];
  const t = titles.find((el) => el.textContent.includes("Midterms make it worse"));
  const section = t.closest(".voa-beat");
  const rect = section.getBoundingClientRect();
  return { top: rect.top + window.scrollY, height: section.scrollHeight };
});
const scrollable = box.height - 900;

// Scan wider than the nominal step0->step1 span so both true endpoints of
// the morph window (u=0 at progress 0.15, u=1 at progress 0.85 - see
// Beat2.tsx) are actually reached, regardless of exactly how step heights
// map to scroll position. We read `u` back from the year-stamp opacity
// (op2022 == u by construction, spec S6) rather than assume a scrollY
// formula for it.
const SCAN_START = box.top + scrollable * (0 / 3);
const SCAN_END = box.top + scrollable * (1.7 / 3);
const N = 40;

async function scrollTo(y) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(60);
}

// `.pb-surface`, `path.pb-expected-line`, `rect.pb-track` etc. are NOT
// unique to Beat 2 - Beat 1 renders the exact same PopulationBars class
// names for its own (independently static) chart, earlier in the DOM. An
// unscoped querySelector silently grabs Beat 1's frozen copy instead of
// Beat 2's, which would make every geometry assertion below vacuously true
// regardless of what Beat 2 actually does. Scope every query to Beat 2's
// own <section>.
async function readState() {
  return page.evaluate(() => {
    const titles = [...document.querySelectorAll(".voa-beat-title")];
    const section = titles.find((el) => el.textContent.includes("Midterms make it worse")).closest(".voa-beat");
    const spans = [...section.querySelectorAll(".voa-year-stamp span")];
    const op2024 = spans[0] ? parseFloat(getComputedStyle(spans[0]).opacity) : null;
    const op2022 = spans[1] ? parseFloat(getComputedStyle(spans[1]).opacity) : null;
    const heroFigEl = section.querySelector(".pb-gap-hero-figure");
    const heroFig = heroFigEl ? parseFloat(heroFigEl.textContent) : null;
    const deltaEl = section.querySelector(".pb-gap-hero-delta");
    const deltaOpacity = deltaEl ? parseFloat(getComputedStyle(deltaEl).opacity) : null;
    const surface = section.querySelector(".pb-surface");
    const nodeCount = surface ? surface.querySelectorAll("*").length : null;
    const surfaceHeight = surface ? surface.getBoundingClientRect().height : null;
    const d = section.querySelector("path.pb-expected-line")?.getAttribute("d") ?? null;
    return { op2024, op2022, heroFig, deltaOpacity, nodeCount, surfaceHeight, d };
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
const us = samples.map((s) => s.op2022);
if (Math.min(...us) > 0.05) throw new Error(`FAIL: never reached near u=0 (min u=${Math.min(...us).toFixed(3)})`);
if (Math.max(...us) < 0.95) throw new Error(`FAIL: never reached near u=1 (max u=${Math.max(...us).toFixed(3)})`);
console.log(`PASS: scan spans u=${Math.min(...us).toFixed(3)}..${Math.max(...us).toFixed(3)}`);

// 2. Year stamp cross-fades and stays complementary throughout.
for (const s of samples) {
  if (Math.abs(s.op2024 + s.op2022 - 1) > 0.03) {
    throw new Error(`FAIL: year-stamp opacities don't sum to 1 at u=${s.op2022}: ${s.op2024} + ${s.op2022}`);
  }
}
console.log("PASS: year-stamp opacities are complementary at every sample");

// 3. The printed gold figure only ever takes one of the two real values -
// never something in between, which would describe an election that never
// happened. Both years' shortfalls are measured against their OWN 65+ rate
// (23.3M / 36.1M), not a value pinned to 2024's rate (that was 54.0M in the
// earlier pinned-benchmark version of this beat - see spec addendum).
const ALLOWED = [23.3, 36.1];
for (const s of samples) {
  const nearest = ALLOWED.reduce((a, b) => (Math.abs(b - s.heroFig) < Math.abs(a - s.heroFig) ? b : a));
  if (Math.abs(s.heroFig - nearest) > 0.05) {
    throw new Error(`FAIL: gold figure ${s.heroFig}M at u=${s.op2022.toFixed(2)} is neither 23.3M nor 36.1M`);
  }
}
const below = samples.filter((s) => s.op2022 < 0.45);
const above = samples.filter((s) => s.op2022 > 0.55);
if (!below.every((s) => Math.abs(s.heroFig - 23.3) < 0.05)) throw new Error("FAIL: gold figure isn't pinned to 23.3M before the flip");
if (!above.every((s) => Math.abs(s.heroFig - 36.1) < 0.05)) throw new Error("FAIL: gold figure isn't pinned to 36.1M after the flip");
console.log("PASS: gold figure snaps between the two real values only (23.3M / 36.1M), never a blend");

// 4. Delta line stays invisible until deep in the morph (last ~15% of u),
// then fades in - reserved space, never a mount (spec S5/S7).
const early = samples.filter((s) => s.op2022 < 0.8);
if (!early.every((s) => s.deltaOpacity < 0.02)) throw new Error("FAIL: delta line visible before u=0.8");
const veryLate = samples.filter((s) => s.op2022 > 0.98);
if (!veryLate.some((s) => s.deltaOpacity > 0.8)) throw new Error("FAIL: delta line never reaches full opacity near u=1");
console.log("PASS: delta line stays hidden until the very end of the morph, then fades in");

// 6. DOM node count under the chart surface stays within a small band.
// Legend/hero/year-stamp elements are always-mounted (opacity-only, spec
// S5) so they contribute zero variance. The one legitimate source of
// mount/unmount left is the gold gap `<rect>` per bar (`showGap`): since
// each cycle now has its OWN 65+ line, a handful of ages sit on different
// sides of "short" in 2024 vs. 2022, so a few gap rects enter/exit as the
// bars cross their own cycle's line. That's real geometry, not a printed
// number, so a small spread here is expected - a large one would mean
// something unrelated is mounting/unmounting.
const counts = samples.map((s) => s.nodeCount);
const countSpread = Math.max(...counts) - Math.min(...counts);
if (countSpread > 10) throw new Error(`FAIL: DOM node count swung by ${countSpread} across the morph (${Math.min(...counts)}-${Math.max(...counts)}) - more than the expected few gap rects crossing threshold`);
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
if (lineDrift < 15) throw new Error(`FAIL: primary dotted line only moved ${lineDrift.toFixed(1)}px at a middle age - expected a visible drop from 74.62% to 66.79%`);
console.log(`PASS: primary dotted line drops from the 2024 rate to the 2022 rate (${lineDrift.toFixed(2)}px at a middle age)`);

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
  if (Math.abs(samples[i].op2022 - 0.5) < 0.07) continue;
  if (Math.abs(samples[i].heroFig - descSamples[i].heroFig) > 0.05) {
    throw new Error(`FAIL: reversal mismatch at sample ${i} (u=${samples[i].op2022})`);
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
