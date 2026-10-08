// Section 3's rewind and forward passes (AgeBeats.tsx), both scroll-driven:
// one year card per election back 2022 -> 2012 in the gold view, then one
// per election forward 2012 -> 2024 with the registered band on. The VCR
// badge (RewindOverlay.tsx) is up mid-hop only.
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

// The rewind pass: one card per election, 2022 back to the first year, each
// resting on its year in the gold view, scroll-driven like the forward pass.
const rewindYears = years.slice(0, -1).reverse(); // 2022 .. 2012
for (const y of rewindYears) {
  await toStep(page, await stepIndex(`.voa-year-card[data-pass="rewind"][data-year="${y}"]`));
  await page.waitForTimeout(400);
  s = await state(page);
  if (s.resting !== y) fail(`rewind card ${y}: chart resting on ${s.resting}`);
  if (s.registered > 0.01 || s.hero.length !== 1) fail(`rewind card ${y}: should be the gold view ${JSON.stringify(s)}`);
  if (s.badge > 0.01) fail(`rewind card ${y}: badge should be off at rest`);
  const on = await page.$$eval(".voa-year-card.is-on", (els) => els.map((e) => `${e.dataset.pass}-${e.dataset.year}`));
  if (JSON.stringify(on) !== JSON.stringify([`rewind-${y}`])) fail(`rewind card ${y}: outlined cards ${on}`);
}
// Mid-hop between two rewind cards, scrolling down into it: badge up and
// reading rew.
{
  const i = await stepIndex(`.voa-year-card[data-pass="rewind"][data-year="${rewindYears[2]}"]`);
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

// Forward pass: each card rests on its year, registered band on, hero
// figures = that year's registered-didn't-vote / not registered.
for (const y of years) {
  const i = await stepIndex(`.voa-year-card[data-pass="forward"][data-year="${y}"]`);
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

// Back above section 3: the scroll alone brings it forward to 2022, gold view restored.
await toStep(page, REWIND - 1);
await page.waitForTimeout(400);
s = await state(page);
if (s.resting !== "2022" || s.registered > 0.01 || s.hero.length !== 1) fail(`back on beat 2: ${JSON.stringify(s)}`);
console.log("PASS: scrolling back above section 3 returns to 2022, gold view restored");
if (errors.length) fail(`console errors: ${errors.slice(0, 3).join(" | ")}`);
await page.close();

await browser.close();
console.log("all checks passed");
