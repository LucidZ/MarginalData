// Screenshots every step of the merged beats 1+2 (AgeBeats.tsx), which share
// a single pinned chart, and asserts the chart really is one element that
// never unsticks across the beat boundary - the thing the merge bought and
// the thing a future edit is most likely to break.
// Run with: BASE_URL=http://localhost:5174 node tests/age-beats-steps.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1000, height: 900 };
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");
await page.waitForTimeout(300);

const STEPS = 18; // AgeBeats.tsx: 9 beat steps + section 3 intro + one per earlier election (2022 ... 2012) + 2 summary steps

// One section, one sticky pane, one chart for beats 1-2 and section 3.
const shape = await page.evaluate(() => {
  const section = document.querySelector(".voa-beat");
  return {
    steps: section.querySelectorAll(".voa-step").length,
    vizPanes: section.querySelectorAll(".voa-scrolly-viz").length,
    charts: section.querySelectorAll(".pb-surface").length,
    titles: [...section.querySelectorAll(".voa-beat-title")].map((t) => t.textContent.trim()),
  };
});
if (shape.steps !== STEPS) throw new Error(`FAIL: expected ${STEPS} steps in the merged section, found ${shape.steps}`);
if (shape.vizPanes !== 1 || shape.charts !== 1) {
  throw new Error(`FAIL: beats 1+2 must share one chart, found ${shape.vizPanes} sticky panes / ${shape.charts} charts`);
}
if (shape.titles.length !== 3 || !shape.titles[1].includes("Midterms") || !shape.titles[2].includes("Every election")) {
  throw new Error(`FAIL: beat 2's and section 3's headings should live inside the merged section, got ${JSON.stringify(shape.titles)}`);
}
console.log(`PASS: beats 1-2 and section 3 are one section, one sticky pane, one chart (${shape.titles.join(" / ")})`);

// Scroll a given step's center to viewport center - the same thing
// useStepProgress measures, so `progress` lands on exactly i.
async function toStep(i) {
  await page.evaluate(
    ({ i, h }) => {
      const step = document.querySelectorAll(".voa-beat .voa-step")[i];
      const r = step.getBoundingClientRect();
      window.scrollTo(0, r.top + window.scrollY + r.height / 2 - h / 2);
    },
    { i, h: VIEWPORT.height }
  );
  await page.waitForTimeout(900);
}

const heroFigs = () =>
  page.evaluate(() => [...document.querySelectorAll(".voa-beat .pb-gap-hero-figure")].map((e) => parseFloat(e.textContent)));
const seen = [];
const hero = {};
for (let i = 0; i < STEPS; i++) {
  await toStep(i);
  if (i === 3 || i === 5) hero[i] = await heroFigs();
  await page.screenshot({ path: `${OUT}/age-beats-step-${i}.png` });
  seen.push(
    await page.evaluate(() => {
      const r = document.querySelector(".voa-beat .pb-surface").getBoundingClientRect();
      return { top: Math.round(r.top), height: Math.round(r.height) };
    })
  );
}

// Pinned: same offset at every step from the first through beat 2's first,
// i.e. straight across the beat 1 -> beat 2 boundary, which before the merge
// was where the chart scrolled away and an identical one scrolled back in.
// The final step is excluded on purpose - it's the tail of the section, so
// the pane is legitimately releasing there.
const pinned = seen.slice(0, STEPS - 1).map((s) => s.top);
if (Math.max(...pinned) - Math.min(...pinned) > 2) {
  throw new Error(`FAIL: chart moved between steps (top ${Math.min(...pinned)}..${Math.max(...pinned)}) - it unstuck somewhere mid-story`);
}
console.log(`PASS: chart holds one position across the beat boundary (top=${pinned[0]}px at steps 0-${STEPS - 2})`);

// The shortfall's two parts (step 5) sum to its total (step 3) - the gold
// wedge splits, it doesn't change size.
const partsSum = hero[5][0] + hero[5][1];
if (hero[3].length !== 1 || hero[5].length !== 2 || Math.abs(partsSum - hero[3][0]) > 0.1 + 1e-9) {
  throw new Error(`FAIL: step-5 parts ${JSON.stringify(hero[5])} should sum to the step-3 total ${JSON.stringify(hero[3])} (±0.1M)`);
}
console.log(`PASS: the two shortfall parts (${hero[5].join("M + ")}M) sum to the step-3 total (${hero[3][0]}M)`);

// Height constant at every step including the last: the hero figure, the
// delta line and the gap legend all fade in over space reserved from first
// paint, so nothing they do can nudge the chart (see PopulationBars heroGap).
const heights = seen.map((s) => s.height);
if (Math.max(...heights) - Math.min(...heights) > 1) {
  throw new Error(`FAIL: chart height changed between steps (${Math.min(...heights)}..${Math.max(...heights)}) - something mounted instead of fading in over reserved space`);
}
console.log(`PASS: chart surface height identical at all ${STEPS} steps (${heights[0]}px)`);

await browser.close();
console.log("done - screenshots in tests/screenshots");
