// The explorer after the story (Explorer.tsx, YearControl.tsx, ageRows.ts):
// the beat 1-2 age chart for every election, picked from the year buttons
// and animated on a timer through every hop in between. Checks every year's
// printed figures against the JSON, the "locked in" signals, mid-jump
// honesty (no filled year, figures only ever a real election's), cohorts
// followed across a hop, the right edge filling at 2012, keyboard, reduced
// motion, and a 360px phone.
// (The story's scroll used to rewind through these years itself; that
// version and its test are at tag `voter-age-full-rewind`.)
// Run with: BASE_URL=http://localhost:5174 node tests/voter-age-explorer.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const fmtM = (thousands, digits = 1) => `${(thousands / 1000).toFixed(digits)}M`;
const fail = (msg) => {
  throw new Error(`FAIL: ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-explorer .pb-surface");
const data = await page.evaluate(() => fetch("/data/voter-age.json").then((r) => r.json()));
const years = Object.keys(data.byAge).sort(); // chronological
await page.$eval(".voa-explorer", (e) => e.scrollIntoView());

const X = ".voa-explorer";
const state = () => page.$eval(`${X} .voa-explorer-state`, (e) => ({ ...e.dataset }));
const nanTransforms = () =>
  page.evaluate(() => [...document.querySelectorAll("[transform]")].filter((el) => /NaN/.test(el.getAttribute("transform"))).length);
async function pick(year) {
  await page.click(`${X} .voa-yc-btn[aria-label^="${year}"]`);
  await page.waitForFunction((y) => document.querySelector(".voa-explorer-state").dataset.resting === y, year, { timeout: 8000 });
}
const shortfallOf = (y) => fmtM(Math.abs(data.byAge[y].rows.reduce((a, r) => a + Math.min(0, r.missing), 0)));
const turnoutOf = (y) => `${data.byAge[y].avgTurnout.toFixed(1)}%`;

// 1. The timeline lives in the explorer only; seven buttons, chronological.
const storyTimelines = await page.$$eval(".voa-beat .voa-yc", (els) => els.length);
if (storyTimelines) fail(`the story chart should have no year buttons, found ${storyTimelines}`);
const labels = await page.$$eval(`${X} .voa-yc-btn`, (els) => els.map((e) => e.getAttribute("aria-label").slice(0, 4)));
if (JSON.stringify(labels) !== JSON.stringify(years)) fail(`timeline buttons ${labels}, want ${years}`);
if ((await state()).resting !== "2024") fail(`explorer should start on 2024, got ${JSON.stringify(await state())}`);
console.log(`PASS: ${years.length} buttons (${years.join(", ")}) in the explorer only, starting on 2024`);

// 2. Every year, at rest: filled button, figures from the JSON, fixed axis.
const yTicks = () => page.$$eval(`${X} .pb-axis-y .tick text`, (els) => els.map((e) => e.textContent.trim()).join("|"));
let firstTicks = null;
for (const year of [...years].reverse()) {
  await pick(year);
  const lock = await page.evaluate((X) => ({
    on: [...document.querySelectorAll(`${X} .voa-yc-btn.is-on`)].map((b) => b.getAttribute("aria-label").slice(0, 4)),
    dotOpacity: parseFloat(document.querySelector(`${X} .voa-yc-dot`).style.opacity),
    hero: [...document.querySelectorAll(`${X} .pb-gap-hero-figure`)].map((e) => e.textContent.trim()),
    legend: document.querySelector(`${X} .pb-legend-expected`).textContent.trim(),
  }), X);
  if (JSON.stringify(lock.on) !== JSON.stringify([year])) fail(`${year}: filled buttons ${JSON.stringify(lock.on)}`);
  if (lock.dotOpacity > 0.01) fail(`${year}: dot should be hidden at rest`);
  const want = [shortfallOf(year), turnoutOf(year)];
  if (JSON.stringify(lock.hero) !== JSON.stringify(want)) fail(`${year}: hero ${JSON.stringify(lock.hero)}, want ${JSON.stringify(want)}`);
  if (!lock.legend.includes(`${data.byAge[year].over65Turnout.toFixed(1)}%`)) fail(`${year}: legend "${lock.legend}" lacks its own 65+ rate`);
  const ticks = await yTicks();
  if (firstTicks === null) firstTicks = ticks;
  else if (ticks !== firstTicks) fail(`${year}: y ticks changed ${ticks} vs ${firstTicks}`);
  if (await nanTransforms()) fail(`${year}: NaN in a transform`);
  await page.locator(`${X} .voa-explorer-chart`).screenshot({ path: `${OUT}/voter-age-explorer-${year}.png` });
  console.log(`PASS: ${year} (${data.byAge[year].kind}): button filled; ${lock.hero.join(" / ")}; y ticks fixed`);
}

// 3. A long jump plays every hop: sampled mid-flight, no year is filled,
// the dot shows, and the figures are always some real election's.
const realHeroes = new Set(years.map((y) => `${shortfallOf(y)}|${turnoutOf(y)}`));
await page.click(`${X} .voa-yc-btn[aria-label^="2024"]`);
const seenPos = new Set();
let midChecked = 0;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(60);
  const s = await page.evaluate((X) => ({
    pos: parseFloat(document.querySelector(".voa-explorer-state").dataset.pos),
    resting: document.querySelector(".voa-explorer-state").dataset.resting,
    on: document.querySelectorAll(`${X} .voa-yc-btn.is-on`).length,
    dot: parseFloat(document.querySelector(`${X} .voa-yc-dot`).style.opacity),
    hero: [...document.querySelectorAll(`${X} .pb-gap-hero-figure`)].map((e) => e.textContent.trim()).join("|"),
  }), X);
  seenPos.add(Math.floor(s.pos));
  if (!realHeroes.has(s.hero)) fail(`mid-jump figures ${s.hero} belong to no election`);
  if (!s.resting) {
    midChecked++;
    if (s.on !== 0 || s.dot < 0.99) fail(`mid-jump should show only the dot ${JSON.stringify(s)}`);
  }
  if (s.resting === "2024") break;
}
if (midChecked < 5 || seenPos.size < 5) fail(`2012 -> 2024 should pass through every hop (saw ${[...seenPos]}, ${midChecked} mid samples)`);
console.log(`PASS: 2012 -> 2024 plays through every hop; mid-flight shows only the dot and real figures (${midChecked} samples)`);

// 4. Cohorts followed across a hop: c-1984 is 36 in 2020, 34 in 2018.
const xOf = (key) => page.$eval(`${X} rect.pb-track[data-key="${key}"]`, (e) => parseFloat(e.getAttribute("x")));
await pick("2020");
const x2020 = await xOf("c-1984");
const slot = (await xOf("c-1983")) - x2020;
await pick("2018");
const x2018 = await xOf("c-1984");
if (Math.abs(x2020 - x2018 - 2 * slot) > 0.5) fail(`c-1984 slid ${(x2020 - x2018).toFixed(1)}px 2020->2018, want 2 slots = ${(2 * slot).toFixed(1)}px`);
const hb = await (await page.$(`${X} rect.pb-hit[data-key="c-1984"]`)).boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.waitForTimeout(150);
const tip = await page.$eval(".voa-tooltip", (e) => e.textContent).catch(() => null);
if (!tip || !tip.includes("Age 34") || !tip.includes("2018")) fail(`c-1984 at rest on 2018 should read Age 34 · 2018, got ${tip}`);
await page.mouse.move(5, 5);
console.log(`PASS: cohort born 1984 slides 2 slots 2020->2018 and its tooltip reads ${tip.slice(0, 16)}`);

// 5. The right edge never goes empty: at 2012, ages 99 and 100+ are real bars.
await pick("2012");
const edge = await page.evaluate((X) =>
  ["c-1913", "c-1912"].map((k) => {
    const el = document.querySelector(`${X} rect.pb-track[data-key="${k}"]`);
    return el ? parseFloat(getComputedStyle(el).opacity) : null;
  }), X);
if (edge.some((o) => o === null || o < 0.99)) fail(`2012 ages 99/100+ should be fully drawn, opacities ${JSON.stringify(edge)}`);
console.log("PASS: at 2012 the oldest cohorts (ages 99, 100+) fill the right edge");

// 6. Keyboard: ArrowRight from 2012 goes to 2014 and moves focus there.
await page.focus(`${X} .voa-yc-btn[aria-label^="2012"]`);
await page.keyboard.press("ArrowRight");
await page.waitForFunction(() => document.querySelector(".voa-explorer-state").dataset.resting === "2014", null, { timeout: 8000 });
const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
if (!focused?.startsWith("2014")) fail(`ArrowRight should focus 2014, focused ${focused}`);
console.log("PASS: ArrowRight from 2012 goes to 2014 and moves focus there");

if ((await nanTransforms()) > 0) fail("NaN in a transform attribute");
if (consoleErrors.length) fail(`console errors:\n  ${consoleErrors.join("\n  ")}`);
console.log("PASS: zero console errors, no NaN transforms");

// 7. Reduced motion: a pick lands at once, no hops played.
const rm = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: "reduce" });
await rm.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await rm.waitForSelector(".voa-explorer .pb-surface");
await rm.click(`${X} .voa-yc-btn[aria-label^="2012"]`);
await rm.waitForTimeout(50);
const rmState = await rm.$eval(".voa-explorer-state", (e) => e.dataset.resting);
if (rmState !== "2012") fail(`reduced motion: should land on 2012 at once, resting=${rmState}`);
console.log("PASS: reduced motion jumps straight to the picked year");
await rm.close();

// 8. 360px phone: no horizontal scroll, all seven buttons visible and unclipped.
const phone = await browser.newPage({ viewport: { width: 360, height: 800 } });
await phone.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await phone.waitForSelector(".voa-explorer .pb-surface");
await phone.$eval(".voa-explorer", (e) => e.scrollIntoView());
await phone.waitForTimeout(400);
const fit = await phone.evaluate((X) => ({
  scrollWidth: document.documentElement.scrollWidth,
  boxes: [...document.querySelectorAll(`${X} .voa-yc-btn`)].map((b) => {
    const r = b.getBoundingClientRect();
    return { left: r.left, right: r.right, w: r.width, clipped: b.scrollWidth > b.clientWidth, text: b.innerText.trim() };
  }),
}), X);
if (fit.scrollWidth > 360) fail(`360px: scrollWidth ${fit.scrollWidth}`);
for (const b of fit.boxes) if (b.left < 0 || b.right > 360 || b.w < 24 || b.clipped) fail(`360px: button ${JSON.stringify(b)}`);
await phone.screenshot({ path: `${OUT}/voter-age-explorer-360.png` });
console.log(`PASS: 360px fits (scrollWidth ${fit.scrollWidth}), labels ${fit.boxes.map((b) => b.text).join(" ")}`);

await browser.close();
console.log("All explorer checks passed.");
