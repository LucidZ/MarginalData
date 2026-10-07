// Section 3's summary (AgeBeats.tsx, PopulationBars.tsx
// `summary`): 2022's age columns merge into one stacked bar, then every
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

/** Steps counted from beat 2's last step (resting on 2022): 0 that step,
 * 1 merged bar, 2 every election, 3-5 the arrow beats. Scrolls `frac` of
 * the way from step a to step a+1. */
const BEAT2_LAST = 5; // AgeBeats.tsx: MORPH_STEP + 1
async function scrollBetweenLast(a, frac) {
  await page.evaluate(
    ({ a, frac, base }) => {
      const steps = [...document.querySelectorAll(".voa-beat .voa-step")];
      const c = (el) => {
        const r = el.getBoundingClientRect();
        return window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
      };
      const from = c(steps[base + a]);
      const to = c(steps[Math.min(base + a + 1, steps.length - 1)]);
      window.scrollTo(0, from + (to - from) * frac);
    },
    { a, frac, base: BEAT2_LAST }
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

// Segment heights proportional to the JSON's sums (pixel ratio vs the first bar's total).
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

// The arrow beats: one layer's arrows at a time (eligible, registered,
// votes), one per presidential -> midterm pair, labelled with that pair's
// change in the data.
const tops = (y) => {
  const [v, r, u] = segmentsOf(y);
  return [v, v + r, v + r + u]; // votes, registered, eligible
};
const pairs = years.flatMap((y, i) =>
  data.byAge[y].kind === "presidential" && data.byAge[years[i + 1]]?.kind === "midterm" ? [[y, years[i + 1]]] : []
);
const layers = [2, 1, 0]; // beat order: eligible, registered, votes
for (let k = 0; k < 3; k++) {
  await scrollBetweenLast(3 + k, 0);
  await page.waitForTimeout(300);
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll("g.pb-summary-arrows g.pb-arrow")]
      .filter((g) => parseFloat(g.style.opacity) > 0.5)
      .map((g) => g.querySelector("text").textContent)
  );
  const want = pairs.map(([a, b]) => {
    const pct = (tops(b)[layers[k]] / tops(a)[layers[k]] - 1) * 100;
    return `${pct >= 0 ? "+" : "\u2212"}${Math.abs(pct).toFixed(1)}%`;
  });
  if (JSON.stringify(shown) !== JSON.stringify(want)) fail(`arrow beat ${k}: labels ${JSON.stringify(shown)}, want ${JSON.stringify(want)}`);
  await plot().screenshot({ path: `${OUT}/voter-age-summary-arrows-${k}.png` });
  console.log(`arrow beat ${k}:`, shown.join(" "));
}

// Back up: plain age chart again.
await scrollBetweenLast(0, 0);
c = await counts();
if (c.ageHidden || c.summary || c.merge) fail(`scrolling back should restore the age chart: ${JSON.stringify(c)}`);

if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 3).join(" | ")}`);
console.log("PASS");
await browser.close();
