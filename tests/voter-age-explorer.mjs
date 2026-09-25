// The election explorer (Explorer.tsx / YearControl.tsx): seven year
// buttons, a fixed y-axis across every cycle, hero figures that match the
// JSON for each year, keyboard selection, no NaN geometry, and a year row
// that fits a 360px phone without scrolling sideways.
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
const years = Object.keys(data.byAge).sort();

const explorer = await page.$(".voa-explorer");
await explorer.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);

// 1. Seven buttons, 2024 selected by default.
const buttons = await explorer.$$(".voa-yc-btn");
if (buttons.length !== 7) fail(`expected 7 year buttons, found ${buttons.length}`);
const checked = await explorer.$$eval('[role="radio"][aria-checked="true"]', (els) => els.map((e) => e.getAttribute("aria-label")));
if (checked.length !== 1 || !checked[0].startsWith("2024")) fail(`expected 2024 selected by default, got ${JSON.stringify(checked)}`);
console.log(`PASS: 7 year buttons (${years.join(", ")}), 2024 selected by default`);

// 2 + 3. Per year: hero figures match the JSON; y-axis ticks never change.
const heroFigures = () => explorer.$$eval(".pb-gap-hero-figure", (els) => els.map((e) => e.textContent.trim()));
const yTicks = () => explorer.$$eval(".pb-axis-y .tick text", (els) => els.map((e) => e.textContent.trim()).join("|"));
const nanTransforms = () =>
  page.evaluate(() => [...document.querySelectorAll("[transform]")].filter((el) => /NaN/.test(el.getAttribute("transform"))).length);

let firstTicks = null;
for (const y of years) {
  await explorer.$(`.voa-yc-btn[aria-label^="${y}"]`).then((b) => b.click());
  await page.waitForTimeout(900); // > the 700ms tween
  const c = data.byAge[y];
  const want = [fmtM(c.registrationGap), fmtM(c.registeredNotVoted)];
  const got = await heroFigures();
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${y} hero figures ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  const ticks = await yTicks();
  if (firstTicks === null) firstTicks = ticks;
  else if (ticks !== firstTicks) fail(`${y} y-axis ticks changed: ${ticks} vs ${firstTicks}`);
  const nan = await nanTransforms();
  if (nan) fail(`${y}: ${nan} elements with NaN in transform`);
  await explorer.screenshot({ path: `${OUT}/voter-age-explorer-${y}.png` });
  console.log(`PASS: ${y} (${c.kind}) hero ${got.join(" / ")}, y ticks fixed`);
}

// 4. Keyboard: from 2024, ArrowLeft selects 2022.
await explorer.$('.voa-yc-btn[aria-label^="2024"]').then((b) => b.click());
await explorer.$('.voa-yc-btn[aria-label^="2024"]').then((b) => b.focus());
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(100);
const afterKey = await explorer.$eval('[role="radio"][aria-checked="true"]', (e) => e.getAttribute("aria-label"));
const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
if (!afterKey.startsWith("2022") || !focused?.startsWith("2022")) fail(`ArrowLeft from 2024: selected ${afterKey}, focused ${focused}`);
console.log("PASS: ArrowLeft from 2024 selects and focuses 2022");

// 7. Hover a bar in a midterm year: the tooltip names that year.
await explorer.$('.voa-yc-btn[aria-label^="2014"]').then((b) => b.click());
await page.waitForTimeout(900);
const hits = await explorer.$$(".pb-hit");
const hit = hits[Math.floor(hits.length * 0.1)];
await hit.hover();
await page.waitForTimeout(150);
const tip = await page.$eval(".voa-tooltip", (e) => e.textContent).catch(() => null);
if (!tip || !tip.includes("2014")) fail(`midterm tooltip should name 2014, got ${JSON.stringify(tip)}`);
console.log(`PASS: 2014 tooltip: ${tip.slice(0, 60)}...`);
await page.mouse.move(0, 0);

// 5. No console errors, no NaN anywhere.
if ((await nanTransforms()) > 0) fail("NaN in a transform attribute");
if (consoleErrors.length) fail(`console errors:\n  ${consoleErrors.join("\n  ")}`);
console.log("PASS: zero console errors, no NaN transforms");

// 6. 360px phone: no horizontal scroll, all seven buttons visible and unclipped.
const phone = await browser.newPage({ viewport: { width: 360, height: 800 } });
await phone.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await phone.waitForSelector(".voa-explorer .pb-surface");
await phone.$eval(".voa-explorer .voa-yc", (e) => e.scrollIntoView({ block: "start" }));
await phone.waitForTimeout(400);
const fit = await phone.evaluate(() => {
  const btns = [...document.querySelectorAll(".voa-explorer .voa-yc-btn")];
  return {
    scrollWidth: document.documentElement.scrollWidth,
    boxes: btns.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left, right: r.right, w: r.width, clipped: b.scrollWidth > b.clientWidth, text: b.innerText.trim() };
    }),
  };
});
if (fit.scrollWidth > 360) fail(`360px: scrollWidth ${fit.scrollWidth}`);
for (const b of fit.boxes) {
  if (b.left < 0 || b.right > 360 || b.w < 24 || b.clipped) fail(`360px: button ${JSON.stringify(b)} is off-screen or clipped`);
}
console.log(`PASS: 360px fits (scrollWidth ${fit.scrollWidth}), labels ${fit.boxes.map((b) => b.text).join(" ")}`);
await phone.screenshot({ path: `${OUT}/voter-age-explorer-360.png` });
const phoneExplorer = await phone.$(".voa-explorer");
await phoneExplorer.screenshot({ path: `${OUT}/voter-age-explorer-360-section.png` });

await browser.close();
console.log("All explorer checks passed.");
