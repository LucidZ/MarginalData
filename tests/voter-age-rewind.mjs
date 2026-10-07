// Section 3's timed rewind and forward pass (AgeBeats.tsx). Reaching the
// rewind step plays 2022 -> 2012 on a timer, pausing on every real year,
// with the VCR badge (RewindOverlay.tsx) up the whole time; the scroll then
// plays it forward one year card per election with the registered band on;
// scrolling back above the rewind step plays it forward to 2022 again.
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
  await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
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
      hero: [...document.querySelectorAll(".voa-beat .pb-gap-hero-figure")].map((e) => parseFloat(e.textContent)),
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
  [...document.querySelectorAll(".voa-beat .voa-step")].findIndex((s) => s.textContent.includes("not just"))
);
if (REWIND < 0) fail("no rewind step");

// Beat 2 resting on 2022: no badge.
await toStep(page, REWIND - 1);
await page.waitForTimeout(800);
let s = await state(page);
if (Math.abs(s.pos - 1) > 1e-3 || s.badge > 0.01) fail(`before the rewind: ${JSON.stringify(s)}`);

// The timed rewind: sample pos; it must only grow, pass through every year,
// and hold the badge up until 2012.
await toStep(page, REWIND);
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 9000) {
  samples.push(await state(page));
  if (samples.at(-1).resting === years[0] && samples.at(-1).badge < 0.01) break;
  await page.waitForTimeout(60);
}
const posSeries = samples.map((x) => x.pos);
for (let i = 1; i < posSeries.length; i++)
  if (posSeries[i] < posSeries[i - 1] - 1e-4) fail(`rewind went backwards: ${posSeries.slice(i - 2, i + 1)}`);
const restedOn = [...new Set(samples.map((x) => x.resting).filter(Boolean))];
const wantRest = years.slice(0, -1).reverse(); // 2022 .. 2012
if (JSON.stringify(restedOn) !== JSON.stringify(wantRest)) fail(`rested on ${restedOn}, want ${wantRest}`);
const mid = samples.filter((x) => x.pos > 1.05 && x.pos < years.length - 1.05);
// Allow a couple of samples caught in the badge's CSS fade-in.
if (!mid.length || mid.filter((x) => x.badge < 0.5).length > 2) fail("badge should stay up through the whole rewind");
if (!mid.every((x) => x.badgeText.includes("rew"))) fail(`badge should read rew: ${mid[0]?.badgeText}`);
s = samples.at(-1);
if (s.resting !== years[0] || Math.abs(s.pos - (years.length - 1)) > 1e-3) fail(`rewind should end on ${years[0]}: ${JSON.stringify(s)}`);
console.log(`PASS: timed rewind 2022 -> ${years[0]}, rested on ${restedOn.join(" ")}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await page.waitForTimeout(400);
s = await state(page);
if (s.badge > 0.01) fail("badge should clear once the rewind is done");

// Forward pass: each card rests on its year, registered band on, hero
// figures = that year's registered-didn't-vote / not registered.
for (const y of years) {
  const i = await stepIndex(`.voa-year-card[data-year="${y}"]`);
  await toStep(page, i);
  await page.waitForTimeout(500);
  s = await state(page);
  const want = data.byAge[y].rows.reduce(
    (a, r) => [a[0] + (r.registered - r.votes) / 1000, a[1] + (r.cvap - r.registered) / 1000],
    [0, 0]
  );
  if (s.resting !== y) fail(`card ${y}: chart resting on ${s.resting}`);
  if (s.registered < 0.99) fail(`card ${y}: registered band opacity ${s.registered}`);
  if (s.hero.length !== 2 || Math.abs(s.hero[0] - want[0]) > 0.06 || Math.abs(s.hero[1] - want[1]) > 0.06)
    fail(`card ${y}: hero ${s.hero}, want ${want.map((v) => v.toFixed(1))}`);
  const on = await page.$$eval(".voa-year-card.is-on", (els) => els.map((e) => e.dataset.year));
  if (JSON.stringify(on) !== JSON.stringify([y])) fail(`card ${y}: outlined cards ${on}`);
  await page.locator(".voa-beat .voa-scrolly-viz").screenshot({ path: `${OUT}/voter-age-forward-${y}.png` });
}
console.log(`PASS: forward pass rests on every year with the registered band and its counts`);

// Back above the rewind step: plays forward to 2022, badge reads ff.
await toStep(page, REWIND - 1);
await page.waitForTimeout(250);
s = await state(page);
if (!s.badgeText.includes("ff")) fail(`scrolling back should fast-forward: ${s.badgeText}`);
await page.waitForTimeout(8000);
s = await state(page);
if (s.resting !== "2022" || s.registered > 0.01 || s.hero.length !== 1) fail(`back on beat 2: ${JSON.stringify(s)}`);
console.log("PASS: scrolling back above the rewind fast-forwards to 2022, gold view restored");
if (errors.length) fail(`console errors: ${errors.slice(0, 3).join(" | ")}`);
await page.close();

// Reduced motion: no timed animation, straight to the first year.
const rm = await open({ reducedMotion: "reduce" });
await toStep(rm.page, REWIND);
await rm.page.waitForTimeout(400);
s = await state(rm.page);
if (s.resting !== years[0]) fail(`reduced motion should jump to ${years[0]}, resting on ${s.resting}`);
console.log("PASS: reduced motion jumps straight to the first year");
await rm.page.close();

await browser.close();
console.log("all checks passed");
