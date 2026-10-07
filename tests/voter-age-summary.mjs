// The summary after section 3's rewind (AgeBeats.tsx, PopulationBars.tsx
// `summary`): 2012's age columns merge into one stacked bar, then every
// other election's bar fades in beside it. Screenshots the merge and reveal at
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
      [r.votes, r.registered - r.votes, r.cvap - r.registered].forEach((v, s) => (acc[s] += v));
      return acc;
    },
    [0, 0, 0]
  );

/** Steps counted from the 2012 card: 0 card, 1 merged bar, 2 every
 * election. Scrolls
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
for (const f of [0, 0.2, 0.3, 0.5, 0.7, 1]) {
  await scrollBetweenLast(0, f);
  await plot().screenshot({ path: `${OUT}/voter-age-summary-merge-${Math.round(f * 100)}.png` });
  console.log("merge", f, await counts());
}
let c = await counts();
if (c.summary !== 3) fail(`merged view should be one 3-segment bar, got ${c.summary} rects`);

// Reveal.
for (const f of [0.4, 0.7, 1]) {
  await scrollBetweenLast(1, f);
  await plot().screenshot({ path: `${OUT}/voter-age-summary-reveal-${Math.round(f * 100)}.png` });
  console.log("reveal", f, await counts());
}
c = await counts();
if (c.summary !== years.length * 3) fail(`every election should be a 3-segment bar, got ${c.summary} rects`);

// Segment heights proportional to the JSON's sums (pixel ratio vs the 2012 total).
const heights = await page.evaluate(() =>
  [...document.querySelectorAll("g.pb-summary rect")].map((r) => +r.getAttribute("height"))
);
const pxPerK = heights.slice(0, 3).reduce((a, v) => a + v, 0) / segmentsOf(years[0]).reduce((a, v) => a + v, 0);
years.forEach((y, i) =>
  segmentsOf(y).forEach((v, s) => {
    const got = heights[i * 3 + s] / pxPerK;
    if (Math.abs(got - v) > 50) fail(`${y} segment ${s}: drew ${got.toFixed(0)}k, data ${v.toFixed(0)}k`);
  })
);
console.log("segment heights match the data");

// Back up: plain age chart again.
await scrollBetweenLast(0, 0);
c = await counts();
if (c.ageHidden || c.summary || c.merge) fail(`scrolling back should restore the age chart: ${JSON.stringify(c)}`);

if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
console.log("PASS");
await browser.close();
