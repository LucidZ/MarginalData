// The summary after section 3's rewind (AgeBeats.tsx, PopulationBars.tsx
// `summary`): 2012's age columns merge into one stacked bar, then every
// other election's bar rises beside it. Screenshots the merge and reveal at
// several scroll fractions, checks the merged bars' segment heights against
// the JSON (summed with the same stackSegments rule), and that scrolling back
// up restores the plain age chart.
// Run with: BASE_URL=http://localhost:5174 node tests/voter-age-summary.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const fail = (msg) => {
  throw new Error(`FAIL: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-beat .pb-surface");
const data = await page.evaluate(() => fetch("/data/voter-age.json").then((r) => r.json()));
const years = Object.keys(data.byAge).sort();

// Same rule as PopulationBars' stackSegments.
const segmentsOf = (y) =>
  data.byAge[y].rows.reduce(
    (acc, r) => {
      const std = Math.max(r.registered, r.expectedRegistered);
      [r.votes, r.registered - r.votes, std - r.registered, r.cvap - std].forEach((v, s) => (acc[s] += v));
      return acc;
    },
    [0, 0, 0, 0]
  );

/** Steps counted from the 2012 card: 0 card, 1 merged bar, 2 every
 * election, 3 shortfall alone, 4 registered non-voters alone. Scrolls
 * `frac` of the way from step a to step a+1. */
async function scrollBetweenLast(a, frac) {
  await page.evaluate(
    ({ a, frac, first }) => {
      const steps = [...document.querySelectorAll(".voa-beat .voa-step")];
      const card = steps.indexOf(document.querySelector(`.voa-year-card[data-year="${first}"]`).closest(".voa-step"));
      const c = (el) => {
        const r = el.getBoundingClientRect();
        return window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
      };
      const from = c(steps[card + a]);
      const to = c(steps[card + a + 1]);
      window.scrollTo(0, from + (to - from) * frac);
    },
    { a, frac, first: years[0] }
  );
  await page.waitForTimeout(300);
}

const plot = () => page.locator(".voa-beat .pb-surface").first();
const counts = () =>
  page.evaluate(() => ({
    merge: document.querySelectorAll("g.pb-merge rect").length,
    summary: document.querySelectorAll("g.pb-summary rect").length,
    ageHidden: getComputedStyle(document.querySelector("g.pb-age")).display === "none",
  }));

// Merge, at several fractions.
for (const f of [0, 0.3, 0.5, 0.7, 1]) {
  await scrollBetweenLast(0, f);
  await plot().screenshot({ path: `${OUT}/voter-age-summary-merge-${Math.round(f * 100)}.png` });
  console.log("merge", f, await counts());
}
let c = await counts();
if (c.summary !== 4) fail(`merged view should be one 4-segment bar, got ${c.summary} rects`);

// Reveal.
for (const f of [0.4, 0.7, 1]) {
  await scrollBetweenLast(1, f);
  await plot().screenshot({ path: `${OUT}/voter-age-summary-reveal-${Math.round(f * 100)}.png` });
  console.log("reveal", f, await counts());
}
c = await counts();
if (c.summary !== years.length * 4) fail(`every election should be a 4-segment bar, got ${c.summary} rects`);

// Segment heights proportional to the JSON's sums (pixel ratio vs the 2012 total).
const heights = await page.evaluate(() =>
  [...document.querySelectorAll("g.pb-summary rect")].map((r) => +r.getAttribute("height"))
);
const pxPerK = heights.slice(0, 4).reduce((a, v) => a + v, 0) / segmentsOf(years[0]).reduce((a, v) => a + v, 0);
years.forEach((y, i) =>
  segmentsOf(y).forEach((v, s) => {
    const got = heights[i * 4 + s] / pxPerK;
    if (Math.abs(got - v) > 50) fail(`${y} segment ${s}: drew ${got.toFixed(0)}k, data ${v.toFixed(0)}k`);
  })
);
console.log("segment heights match the data");

// Focus step: gold and light green pulled out side by side on the axis,
// each direct-labelled with its value.
for (const f of [0.2, 0.4, 0.55, 0.7, 1]) {
  await scrollBetweenLast(2, f);
  await plot().screenshot({ path: `${OUT}/voter-age-summary-focus-${Math.round(f * 100)}.png` });
}
{
  const got = await page.evaluate(() => [...document.querySelectorAll("g.pb-summary-labels text")].map((t) => t.textContent));
  const want = years.flatMap((y) => [1, 2].map((s) => (segmentsOf(y)[s] / 1000).toFixed(1)));
  if (JSON.stringify([...got].sort()) !== JSON.stringify([...want].sort())) fail(`focus labels ${got} != ${want}`);
  const rects = await page.evaluate(() =>
    [...document.querySelectorAll("g.pb-summary rect")].map((r) => ({ x: +r.getAttribute("x"), w: +r.getAttribute("width"), y: +r.getAttribute("y"), h: +r.getAttribute("height") }))
  );
  if (rects.length !== years.length * 2) fail(`focus: expected two segments per bar, got ${rects.length}`);
  // Both on the axis, and no pair overlapping.
  const base = Math.max(...rects.map((r) => r.y + r.h));
  if (rects.some((r) => Math.abs(r.y + r.h - base) > 0.5)) fail("focus: every segment should sit on the axis");
  const sorted = [...rects].sort((a, b) => a.x - b.x);
  sorted.slice(1).forEach((r, i) => {
    if (r.x < sorted[i].x + sorted[i].w - 0.5) fail(`focus: bars overlap at x=${r.x}`);
  });
  console.log(`focus: ${got.join(" ")}`);
}

// Back up: plain age chart again.
await scrollBetweenLast(0, 0);
c = await counts();
if (c.ageHidden || c.summary || c.merge) fail(`scrolling back should restore the age chart: ${JSON.stringify(c)}`);

if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
console.log("PASS");
await browser.close();
