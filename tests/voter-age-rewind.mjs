// Section 3's rewind (AgeBeats.tsx), scroll-driven: one year card per
// election back 2022 -> 2012 in the gold view, then the gold summary. The
// VCR badge (RewindOverlay.tsx) is up mid-hop only.
// Run with: BASE_URL=http://localhost:5174 node tests/voter-age-rewind.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const fail = (msg) => {
  throw new Error(`FAIL: ${msg}`);
};

const browser = await chromium.launch();

async function open(opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, ...opts });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/2026/ShapeOfTheElectorate/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".voa-beat .pb-surface");
  return { page, errors };
}

const toStep = (page, i) =>
  page.evaluate((i) => {
    const step = document.querySelectorAll(".voa-beat .voa-step")[i];
    const r = step.getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY + r.height / 2 - window.innerHeight / 2);
  }, i);
const state = (page) =>
  page.evaluate(() => {
    const s = document.querySelector(".voa-morph-state").dataset;
    return {
      pos: +s.pos,
      resting: s.resting,
      shown: s.shown,
      badge: parseFloat(getComputedStyle(document.querySelector(".voa-vcr")).opacity),
      badgeText: document.querySelector(".voa-vcr").textContent,
      registered: Math.max(
        0,
        ...[...document.querySelectorAll("rect.pb-registered")].map((r) => parseFloat(r.style.opacity) || 0)
      ),
    };
  });

const { page, errors } = await open();
const data = await page.evaluate(() => fetch("/data/voter-age.json").then((r) => r.json()));
const years = Object.keys(data.byAge).sort(); // oldest first
const stepIndex = (sel) =>
  page.evaluate((sel) => [...document.querySelectorAll(".voa-beat .voa-step")].findIndex((s) => s.querySelector(sel)), sel);
const REWIND = await page.evaluate(() =>
  [...document.querySelectorAll(".voa-beat .voa-step")].findIndex((s) => s.textContent.includes("isn't new"))
);
if (REWIND < 0) fail("no rewind step");

// Beat 2 resting on 2022: no badge.
await toStep(page, REWIND - 1);
await page.waitForTimeout(800);
let s = await state(page);
if (Math.abs(s.pos - 1) > 1e-3 || s.badge > 0.01) fail(`before the rewind: ${JSON.stringify(s)}`);

// The rewind pass: one card per election, 2022 back to the first year, each
// resting on its year in the gold view.
const rewindYears = years.slice(0, -1).reverse(); // 2022 .. 2012
for (const y of rewindYears) {
  await toStep(page, await stepIndex(`.voa-year-card[data-year="${y}"]`));
  await page.waitForTimeout(400);
  s = await state(page);
  if (s.resting !== y) fail(`rewind card ${y}: chart resting on ${s.resting}`);
  if (s.registered > 0.01) fail(`rewind card ${y}: should be the gold view ${JSON.stringify(s)}`);
  if (s.badge > 0.01) fail(`rewind card ${y}: badge should be off at rest`);
  const on = await page.$$eval(".voa-year-card.is-on", (els) => els.map((e) => e.dataset.year));
  if (JSON.stringify(on) !== JSON.stringify([y])) fail(`rewind card ${y}: outlined cards ${on}`);
}
// Mid-hop between two rewind cards, scrolling down into it: badge up and
// reading rew.
{
  const i = await stepIndex(`.voa-year-card[data-year="${rewindYears[2]}"]`);
  await toStep(page, i);
  await page.waitForTimeout(300);
  await page.evaluate((i) => {
    const a = document.querySelectorAll(".voa-beat .voa-step")[i].getBoundingClientRect();
    const b = document.querySelectorAll(".voa-beat .voa-step")[i + 1].getBoundingClientRect();
    const mid = (a.top + a.height / 2 + b.top + b.height / 2) / 2;
    window.scrollTo(0, mid + window.scrollY - window.innerHeight / 2);
  }, i);
  await page.waitForTimeout(300);
  s = await state(page);
  if (s.badge < 0.5 || !s.badgeText.includes("rew")) fail(`mid-rewind hop: ${JSON.stringify(s)}`);
}
console.log(`PASS: rewind pass rests on ${rewindYears.join(" ")} in the gold view, badge only mid-hop`);

// The gold summary after the last rewind card: the first year's columns
// merge into one votes / shortfall / rest-of-eligible bar, then every
// election's bar. Heights checked against the JSON, summed with the same
// rule as PopulationBars' goldSegments.
{
  const first = rewindYears[rewindYears.length - 1];
  const lastRewind = await stepIndex(`.voa-year-card[data-year="${first}"]`);
  const goldOf = (y) =>
    data.byAge[y].rows.reduce(
      (acc, r) => {
        const g = Math.max(0, -r.missing);
        [r.votes, g, r.cvap - r.votes - g].forEach((v, k) => (acc[k] += v));
        return acc;
      },
      [0, 0, 0]
    );
  const bars = () =>
    page.evaluate(() => ({
      rects: [...document.querySelectorAll("g.pb-summary rect")].map((r) => ({
        cls: r.getAttribute("class"),
        h: +r.getAttribute("height"),
      })),
      ageHidden: getComputedStyle(document.querySelector("g.pb-age")).display === "none",
    }));
  await toStep(page, lastRewind + 1);
  await page.waitForTimeout(400);
  let b = await bars();
  if (b.rects.length !== 3 || !b.ageHidden || !b.rects[1].cls.includes("pb-seg--gap"))
    fail(`gold merge: should be one votes/gold/eligible bar ${JSON.stringify(b)}`);
  await page.locator(".voa-beat .voa-scrolly-viz").screenshot({ path: `${OUT}/voter-age-gold-merge.png` });
  // Halfway to the next step: every bar in, not yet cut to percent.
  await page.evaluate((i) => {
    const [a, c] = [i, i + 1].map((k) => {
      const r = document.querySelectorAll(".voa-beat .voa-step")[k].getBoundingClientRect();
      return r.top + window.scrollY + r.height / 2;
    });
    window.scrollTo(0, (a + c) / 2 - window.innerHeight / 2);
  }, lastRewind + 1);
  await page.waitForTimeout(400);
  b = await bars();
  const chrono = [...years].sort();
  if (b.rects.length !== chrono.length * 3) fail(`gold reveal: ${b.rects.length} rects, want ${chrono.length * 3}`);
  const pxPerK = b.rects.slice(0, 3).reduce((a, r) => a + r.h, 0) / goldOf(chrono[0]).reduce((a, v) => a + v, 0);
  chrono.forEach((y, i) =>
    goldOf(y).forEach((v, k) => {
      const got = b.rects[i * 3 + k].h / pxPerK;
      if (Math.abs(got - v) > 50) fail(`gold ${y} segment ${k}: drew ${got.toFixed(0)}k, data ${v.toFixed(0)}k`);
    })
  );
  await page.locator(".voa-beat .voa-scrolly-viz").screenshot({ path: `${OUT}/voter-age-gold-reveal.png` });
  console.log("PASS: gold summary merges the first year, then every election's bar matches the data");

  // Then each bar cut to its gold, as a share of that election's votes cast.
  await toStep(page, lastRewind + 2);
  await page.waitForTimeout(400);
  const pct = await page.evaluate(() => ({
    rects: [...document.querySelectorAll("g.pb-summary rect")].map((r) => ({
      cls: r.getAttribute("class"),
      h: +r.getAttribute("height"),
    })),
    labels: [...document.querySelectorAll("g.pb-summary-pct-labels text.pb-pct-label")].map((t) => t.textContent),
  }));
  const wantPct = chrono.map((y) => (goldOf(y)[1] / data.byAge[y].totalVotes) * 100);
  if (pct.rects.length !== chrono.length || pct.rects.some((r) => !r.cls.includes("pb-seg--gap")))
    fail(`gold percent: should be gold bars only ${JSON.stringify(pct.rects)}`);
  const pxPerPct = pct.rects[0].h / wantPct[0];
  chrono.forEach((y, i) => {
    if (Math.abs(pct.rects[i].h / pxPerPct - wantPct[i]) > 0.1) fail(`gold percent ${y}: drew ${(pct.rects[i].h / pxPerPct).toFixed(1)}%, data ${wantPct[i].toFixed(1)}%`);
  });
  const wantLabels = wantPct.map((v) => `${v.toFixed(1)}%`);
  if (JSON.stringify(pct.labels) !== JSON.stringify(wantLabels)) fail(`gold percent labels ${pct.labels}, want ${wantLabels}`);
  await page.locator(".voa-beat .voa-scrolly-viz").screenshot({ path: `${OUT}/voter-age-gold-pct.png` });
  console.log(`PASS: gold percent bars match the data (${pct.labels.join(" ")})`);

  // Last: the bars slide left for an empty 2026 slot, with no value drawn.
  await toStep(page, lastRewind + 3);
  await page.waitForTimeout(400);
  const next = await page.evaluate(() => {
    const slot = document.querySelector(".pb-pending-slot");
    const gold = [...document.querySelectorAll("g.pb-summary rect")];
    const plot = document.querySelector("g.pb-summary").closest("svg").getBoundingClientRect();
    return {
      slot: slot && +getComputedStyle(slot.parentNode).opacity,
      mark: document.querySelector(".pb-pending-mark")?.textContent,
      bars: gold.length,
      slotInside: slot && slot.getBoundingClientRect().right <= plot.right,
      tick: [...document.querySelectorAll("g.pb-axis-x2 g.tick")].some((t) => t.textContent.startsWith("2026") && +t.style.opacity === 1),
    };
  });
  if (next.slot !== 1 || next.mark !== "?" || next.bars !== chrono.length || !next.slotInside || !next.tick)
    fail(`2026 slot: ${JSON.stringify(next)}`);
  await page.locator(".voa-beat .voa-scrolly-viz").screenshot({ path: `${OUT}/voter-age-gold-2026.png` });
  console.log("PASS: an empty 2026 slot opens beside the gold percent bars");
}

// Back above section 3: the scroll alone brings it forward to 2022, gold view restored.
await toStep(page, REWIND - 1);
await page.waitForTimeout(400);
s = await state(page);
if (s.resting !== "2022" || s.registered > 0.01) fail(`back on beat 2: ${JSON.stringify(s)}`);
console.log("PASS: scrolling back above section 3 returns to 2022, gold view restored");
if (errors.length) fail(`console errors: ${errors.slice(0, 3).join(" | ")}`);
await page.close();

await browser.close();
console.log("all checks passed");
