// Verifies VoterAge's cohort slide (.claude/voter-age-cohort-slide-spec.md):
// during the 2024->2022 morph, each bar slides two age-slots left while its
// height changes, so the bar that was age 40 in 2024 ends up in the age-38
// slot carrying 2022's age-38 values - the same cohort, two years younger.
// Covers acceptance criteria 3 (monotone slide), 5 (departing cohorts don't
// paint outside the plot), and 6 (tooltip truth). Criteria 1/2/4/7/8 are
// covered by the existing suite (age-beats-steps, beat2-morph, tooltip-check,
// voter-age-dark), which this test doesn't duplicate.
// Run with: BASE_URL=http://localhost:5174 node tests/cohort-slide.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

// Same morph-window discovery as tests/beat2-morph.mjs - measured off the
// step elements themselves (progress MORPH_STEP+0.15 .. MORPH_STEP+0.85),
// scanning a little past both ends so the true endpoints are reached
// regardless of how step heights map to scroll position.
const MORPH_STEP = 6; // AgeBeats.tsx
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
const N = 30;

async function scrollTo(y) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(60);
}

// Age 40 (index 22, since rows start at age 18): an ordinary single-year
// bar, not one of the two departing cohorts (18/19, index 0/1) and not a
// pooled 80+ rate. Age 18 (index 0) is the departing-cohort probe.
const TRACK_INDEX = 40 - 18;
const DEPART_INDEX = 0;

async function readState() {
  return page.evaluate(
    ({ trackIdx, departIdx }) => {
      const section = document.querySelector(".voa-beat");
      const scrub = section.querySelector(".voa-scrubber");
      const u = scrub ? parseFloat(scrub.dataset.u) : null;
      const tracks = [...section.querySelectorAll("rect.pb-track")];
      const trackX = tracks[trackIdx] ? parseFloat(tracks[trackIdx].getAttribute("x")) : null;
      const departTrack = tracks[departIdx];
      const departOpacity = departTrack ? parseFloat(getComputedStyle(departTrack).opacity) : null;
      return { u, trackX, departOpacity };
    },
    { trackIdx: TRACK_INDEX, departIdx: DEPART_INDEX }
  );
}

// Step size in pixels, measured from two adjacent bars at rest (u~=0), used
// below to check the tracked bar travels exactly 2 slots' worth of pixels.
await scrollTo(SCAN_START);
const stepPx = await page.evaluate(() => {
  const tracks = [...document.querySelector(".voa-beat").querySelectorAll("rect.pb-track")];
  return parseFloat(tracks[1].getAttribute("x")) - parseFloat(tracks[0].getAttribute("x"));
});

const samples = [];
for (let i = 0; i < N; i++) {
  const y = SCAN_START + (SCAN_END - SCAN_START) * (i / (N - 1));
  await scrollTo(y);
  samples.push({ y, ...(await readState()) });
}

if (Math.min(...samples.map((s) => s.u)) > 0.05) throw new Error("FAIL: scan never reached near u=0");
if (Math.max(...samples.map((s) => s.u)) < 0.95) throw new Error("FAIL: scan never reached near u=1");

// 3. Monotone slide: as u increases, the tracked bar's x only decreases
// (small tolerance for float/subpixel noise), and total travel is exactly
// 2 slots. Position and height move together (both are on `t`), so this
// also stands in for "neither finishes before the other" - the bar can't
// have finished sliding without also having finished changing height, since
// both come from the same `t`.
for (let i = 1; i < samples.length; i++) {
  if (samples[i].trackX > samples[i - 1].trackX + 0.5) {
    throw new Error(
      `FAIL: tracked bar's x increased between samples ${i - 1} and ${i} (${samples[i - 1].trackX} -> ${samples[i].trackX})`
    );
  }
}
const travel = samples[0].trackX - samples[samples.length - 1].trackX;
const expectedTravel = 2 * stepPx;
if (Math.abs(travel - expectedTravel) > 1) {
  throw new Error(`FAIL: tracked bar travelled ${travel.toFixed(1)}px, expected ${expectedTravel.toFixed(1)}px (2 slots)`);
}
console.log(`PASS: tracked bar (age 40) slides monotonically, ${travel.toFixed(1)}px total = 2 x ${stepPx.toFixed(1)}px step`);

// 5. The departing cohort (2024 age 18, no 2022 counterpart) fades to
// invisible well before the morph completes - it keeps its real 2024
// height on the way out (a geometry claim), so opacity is what "doesn't
// paint outside the plot" reduces to for this bar.
const early = samples.filter((s) => s.u < 0.1);
if (!early.every((s) => s.departOpacity > 0.8)) throw new Error("FAIL: departing bar not fully opaque near u=0");
const late = samples.filter((s) => s.u > 0.6);
if (!late.every((s) => s.departOpacity < 0.02)) throw new Error("FAIL: departing bar still visible past u=0.6");
console.log("PASS: departing cohort (2024 age 18) fades to invisible well before the morph completes");

// Screenshots at approximate u checkpoints, for visual review (spec S10).
for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
  await scrollTo(SCAN_START + (SCAN_END - SCAN_START) * frac);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/cohort-slide-${frac}.png` });
}

// 6. Tooltip truth, at rest on t=1 (current scroll position from the loop
// above): the tracked bar (2024 age 40) now reports itself as the cohort it
// carries - 2022's age 38. Hovering where a departed cohort sits shows no
// tooltip (tooltipFor returns null for a key with no 2022 counterpart).
const section = await page.$(".voa-beat");
const hits = await section.$$("rect.pb-hit");

const trackedHit = hits[TRACK_INDEX];
const tbox = await trackedHit.boundingBox();
await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
await page.waitForTimeout(150);
const tooltipText = await page.$eval(".voa-tooltip", (el) => el.textContent).catch(() => null);
if (!tooltipText || !tooltipText.includes("Age 38")) {
  throw new Error(`FAIL: tracked bar's tooltip at t=1 doesn't read "Age 38": ${tooltipText}`);
}
if (!tooltipText.includes("2022")) throw new Error(`FAIL: tracked bar's tooltip at t=1 doesn't say 2022: ${tooltipText}`);
console.log(`PASS: tooltip on the tracked bar at t=1 reads the cohort's real 2022 data (${tooltipText.slice(0, 40)}...)`);

await page.mouse.move(10, 10);
await page.waitForTimeout(150);
const departHit = hits[DEPART_INDEX];
const dbox = await departHit.boundingBox();
await page.mouse.move(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
await page.waitForTimeout(150);
const departTooltip = await page.$(".voa-tooltip");
if (departTooltip) throw new Error("FAIL: a departed cohort (2024 age 18) still shows a tooltip at t=1");
console.log("PASS: no tooltip where a departed cohort (2024 age 18) would be");

await browser.close();
console.log("all checks passed");
