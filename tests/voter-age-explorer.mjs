// Section 3: the beat 1-2 chart keeps going back, one election per scroll
// step, 2022 -> 2012 (AgeBeats.tsx, YearControl.tsx, ageRows.ts). Checks
// every year's printed figures against the JSON, the "locked in" signals
// (timeline button, year card, crisp plot), cohorts followed across a later
// hop, arriving old cohorts filling the right edge, the clock's direction
// label, the timeline's click/keyboard jumps, and a 360px phone.
// Run with: BASE_URL=http://localhost:5174 node tests/voter-age-explorer.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const MORPH_STEP = 5; // AgeBeats.tsx - the step resting on 2024 just before the first hop
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
await page.waitForSelector(".voa-beat .pb-surface");
const data = await page.evaluate(() => fetch("/data/voter-age.json").then((r) => r.json()));
const years = Object.keys(data.byAge).sort(); // chronological

const state = () => page.evaluate(() => ({ ...document.querySelector(".voa-morph-state").dataset }));
const nanTransforms = () =>
  page.evaluate(() => [...document.querySelectorAll("[transform]")].filter((el) => /NaN/.test(el.getAttribute("transform"))).length);

/** Scroll so the step resting on `year` is centred. */
async function scrollToYear(year) {
  await page.evaluate(
    ({ year, morphStep }) => {
      const steps = [...document.querySelectorAll(".voa-beat .voa-step")];
      const el = year === "2024" ? steps[morphStep] : document.querySelector(`.voa-year-card[data-year="${year}"]`).closest(".voa-step");
      const r = el.getBoundingClientRect();
      window.scrollTo(0, window.scrollY + r.top + r.height / 2 - window.innerHeight / 2);
    },
    { year, morphStep: MORPH_STEP }
  );
  await page.waitForTimeout(250);
}
/** Scroll to a fraction of the way between two years' resting steps. */
async function scrollBetween(fromYear, toYear, frac) {
  const y = await page.evaluate(
    ({ a, b, frac, morphStep }) => {
      const stepOf = (yr) =>
        yr === "2024"
          ? [...document.querySelectorAll(".voa-beat .voa-step")][morphStep]
          : document.querySelector(`.voa-year-card[data-year="${yr}"]`).closest(".voa-step");
      const c = (el) => {
        const r = el.getBoundingClientRect();
        return window.scrollY + r.top + r.height / 2 - window.innerHeight / 2;
      };
      return c(stepOf(a)) + (c(stepOf(b)) - c(stepOf(a))) * frac;
    },
    { a: fromYear, b: toYear, frac, morphStep: MORPH_STEP }
  );
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(150);
}

// 1. Seven timeline buttons, chronological, hidden and inert through beat 1.
const labels = await page.$$eval(".voa-yc-btn", (els) => els.map((e) => e.getAttribute("aria-label").slice(0, 4)));
if (JSON.stringify(labels) !== JSON.stringify(years)) fail(`timeline buttons ${labels}, want ${years}`);
await page.evaluate(() => window.scrollTo(0, document.querySelector(".voa-beat .voa-step").offsetTop));
await page.waitForTimeout(250);
const beat1 = await page.$eval(".voa-yc", (e) => ({ inert: e.inert, opacity: parseFloat(e.style.opacity) }));
if (!beat1.inert || beat1.opacity > 0.01) fail(`timeline should be hidden and inert in beat 1, got ${JSON.stringify(beat1)}`);
console.log(`PASS: ${years.length} timeline buttons (${years.join(", ")}), hidden and inert in beat 1`);

// 2. Every year, at rest: locked-in signals + figures from the JSON + fixed axis.
const yTicks = () => page.$$eval(".voa-beat .pb-axis-y .tick text", (els) => els.map((e) => e.textContent.trim()).join("|"));
let firstTicks = null;
for (const year of [...years].reverse()) {
  await scrollToYear(year);
  const s = await state();
  if (s.resting !== year || s.shown !== year) fail(`${year}: resting=${s.resting} shown=${s.shown}`);
  const lock = await page.evaluate((year) => {
    const on = [...document.querySelectorAll(".voa-yc-btn.is-on")].map((b) => b.getAttribute("aria-label").slice(0, 4));
    const card = document.querySelector(`.voa-year-card[data-year="${year}"]`);
    return {
      on,
      cardOn: card ? card.classList.contains("is-on") : null,
      plotOpacity: parseFloat(getComputedStyle(document.querySelector(".voa-beat .pb-plot-wrap svg")).opacity),
      dotOpacity: parseFloat(document.querySelector(".voa-yc-dot").style.opacity),
      hero: [...document.querySelectorAll(".voa-beat .pb-gap-hero-figure")].map((e) => e.textContent.trim()),
      legend: document.querySelector(".voa-beat .pb-legend-expected").textContent.trim(),
    };
  }, year);
  if (JSON.stringify(lock.on) !== JSON.stringify([year])) fail(`${year}: filled buttons ${JSON.stringify(lock.on)}`);
  if (year !== "2024" && !lock.cardOn) fail(`${year}: year card not marked as resting`);
  if (lock.plotOpacity < 0.99 || lock.dotOpacity > 0.01) fail(`${year}: plot should be crisp and dot hidden at rest ${JSON.stringify(lock)}`);
  const c = data.byAge[year];
  const want = [fmtM(c.registrationGap), fmtM(c.registeredNotVoted)];
  if (JSON.stringify(lock.hero) !== JSON.stringify(want)) fail(`${year}: hero ${JSON.stringify(lock.hero)}, want ${JSON.stringify(want)}`);
  if (!lock.legend.includes(`${c.over65Registration.toFixed(1)}%`)) fail(`${year}: legend "${lock.legend}" lacks its own 65+ rate`);
  const ticks = await yTicks();
  if (firstTicks === null) firstTicks = ticks;
  else if (ticks !== firstTicks) fail(`${year}: y ticks changed ${ticks} vs ${firstTicks}`);
  if (await nanTransforms()) fail(`${year}: NaN in a transform`);
  await page.$eval(".voa-beat .voa-scrolly-viz", (e) => e.scrollIntoView({ block: "nearest" }));
  await page.screenshot({ path: `${OUT}/voter-age-explorer-${year}.png` });
  console.log(`PASS: ${year} (${c.kind}) locked in: button + card + crisp plot; hero ${lock.hero.join(" / ")}; y ticks fixed`);
}

// 3. Mid-hop: no year filled, dot showing, chart hazed, clock says which way.
await scrollToYear("2020");
await scrollBetween("2020", "2018", 0.5);
let mid = await page.evaluate(() => ({
  on: document.querySelectorAll(".voa-yc-btn.is-on").length,
  dot: parseFloat(document.querySelector(".voa-yc-dot").style.opacity),
  label: document.querySelector(".voa-rewind-clock__label").textContent,
  plotOpacity: parseFloat(getComputedStyle(document.querySelector(".voa-beat .pb-plot-wrap svg")).opacity),
}));
if (mid.on !== 0 || mid.dot < 0.99 || mid.plotOpacity > 0.9) fail(`mid-hop should show only the dot and a hazed plot ${JSON.stringify(mid)}`);
if (mid.label !== "rewinding") fail(`scrolling down: clock says "${mid.label}", want "rewinding"`);
await page.screenshot({ path: `${OUT}/voter-age-explorer-mid-rewinding.png` });
await scrollToYear("2018");
await scrollBetween("2020", "2018", 0.5);
mid = await page.evaluate(() => document.querySelector(".voa-rewind-clock__label").textContent);
if (mid !== "fast-forwarding") fail(`scrolling up: clock says "${mid}", want "fast-forwarding"`);
await page.screenshot({ path: `${OUT}/voter-age-explorer-mid-fastforward.png` });
console.log("PASS: mid-hop shows the dot, no filled year, hazed plot; clock reads rewinding / fast-forwarding by direction");

// 4. Cohorts followed across a later hop: c-1984 is 36 in 2020, 34 in 2018.
const xOf = (key) => page.$eval(`.voa-beat rect.pb-track[data-key="${key}"]`, (e) => parseFloat(e.getAttribute("x")));
await scrollToYear("2020");
const x2020 = await xOf("c-1984");
const step = await page.evaluate(() => {
  const a = document.querySelector('.voa-beat rect.pb-track[data-key="c-1984"]');
  const b = document.querySelector('.voa-beat rect.pb-track[data-key="c-1983"]');
  return parseFloat(b.getAttribute("x")) - parseFloat(a.getAttribute("x"));
});
let prev = x2020;
for (const f of [0.2, 0.35, 0.5, 0.65, 0.8, 1]) {
  await scrollBetween("2020", "2018", f);
  const x = await xOf("c-1984");
  if (x > prev + 0.01) fail(`cohort c-1984 moved right going back (${prev} -> ${x})`);
  prev = x;
}
await scrollToYear("2018");
const x2018 = await xOf("c-1984");
if (Math.abs(x2020 - x2018 - 2 * step) > 0.5) fail(`c-1984 slid ${(x2020 - x2018).toFixed(1)}px 2020->2018, want 2 slots = ${(2 * step).toFixed(1)}px`);
const hit = await page.$('.voa-beat rect.pb-hit[data-key="c-1984"]');
const hb = await hit.boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.waitForTimeout(150);
const tip = await page.$eval(".voa-tooltip", (e) => e.textContent).catch(() => null);
if (!tip || !tip.includes("Age 34") || !tip.includes("2018")) fail(`c-1984 at rest on 2018 should read Age 34 · 2018, got ${tip}`);
await page.mouse.move(5, 5);
console.log(`PASS: cohort born 1984 slides 2 slots 2020->2018 (${(x2020 - x2018).toFixed(1)}px) and its tooltip reads ${tip.slice(0, 16)}`);

// 5. The right edge never goes empty: at rest on 2012, ages 99 and 100+
// are real bars (they slid in from past the edge).
await scrollToYear("2012");
const edge = await page.evaluate(() =>
  ["c-1913", "c-1912"].map((k) => {
    const el = document.querySelector(`.voa-beat rect.pb-track[data-key="${k}"]`);
    return el ? parseFloat(getComputedStyle(el).opacity) : null;
  })
);
if (edge.some((o) => o === null || o < 0.99)) fail(`2012 ages 99/100+ should be fully drawn, opacities ${JSON.stringify(edge)}`);
console.log("PASS: at 2012 the oldest cohorts (ages 99, 100+) fill the right edge");

// 6. Timeline click and keyboard: both scroll there, playing every hop.
await scrollToYear("2022");
await page.click('.voa-yc-btn[aria-label^="2016"]');
await page.waitForFunction(() => document.querySelector(".voa-morph-state").dataset.resting === "2016", null, { timeout: 8000 });
console.log("PASS: clicking 2016 from 2022 scrolls the chart to rest on 2016");
await page.focus('.voa-yc-btn[aria-label^="2016"]');
await page.keyboard.press("ArrowLeft");
await page.waitForFunction(() => document.querySelector(".voa-morph-state").dataset.resting === "2014", null, { timeout: 8000 });
const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
if (!focused?.startsWith("2014")) fail(`ArrowLeft should focus 2014, focused ${focused}`);
console.log("PASS: ArrowLeft from 2016 scrolls to 2014 and moves focus there");

if ((await nanTransforms()) > 0) fail("NaN in a transform attribute");
if (consoleErrors.length) fail(`console errors:\n  ${consoleErrors.join("\n  ")}`);
console.log("PASS: zero console errors, no NaN transforms");

// 7. 360px phone: no horizontal scroll, all seven buttons visible and unclipped.
const phone = await browser.newPage({ viewport: { width: 360, height: 800 } });
await phone.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await phone.waitForSelector(".voa-year-card");
await phone.$eval('.voa-year-card[data-year="2018"]', (e) => e.closest(".voa-step").scrollIntoView({ block: "center" }));
await phone.waitForTimeout(500);
const fit = await phone.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  boxes: [...document.querySelectorAll(".voa-yc-btn")].map((b) => {
    const r = b.getBoundingClientRect();
    return { left: r.left, right: r.right, w: r.width, clipped: b.scrollWidth > b.clientWidth, text: b.innerText.trim() };
  }),
}));
if (fit.scrollWidth > 360) fail(`360px: scrollWidth ${fit.scrollWidth}`);
for (const b of fit.boxes) if (b.left < 0 || b.right > 360 || b.w < 24 || b.clipped) fail(`360px: button ${JSON.stringify(b)}`);
await phone.screenshot({ path: `${OUT}/voter-age-explorer-360.png` });
console.log(`PASS: 360px fits (scrollWidth ${fit.scrollWidth}), labels ${fit.boxes.map((b) => b.text).join(" ")}`);

await browser.close();
console.log("All section 3 checks passed.");
