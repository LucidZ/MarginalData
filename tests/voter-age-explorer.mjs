// The explorer after the story (Explorer.tsx, YearControl.tsx, ageRows.ts):
// the beat 1-2 age chart for every election, picked from the year buttons
// and animated on a timer through every hop in between. Checks every year's
// printed figures against the JSON, the education/income/race views, the "locked in" signals, mid-jump
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

await page.goto(`${BASE}/2026/ShapeOfTheElectorate/`, { waitUntil: "networkidle" });
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
const shortfallOf = (y) =>
  `${((Math.abs(data.byAge[y].rows.reduce((a, r) => a + Math.min(0, r.missing), 0)) / data.byAge[y].totalVotes) * 100).toFixed(1)}%`;
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
    rect: parseFloat(document.querySelector(`${X} .voa-yc-row`).style.getPropertyValue("--yc-p")),
    hero: [...document.querySelectorAll(`${X} .pb-gap-hero-figure`)].map((e) => e.textContent.trim()),
    legend: document.querySelector(`${X} .pb-legend-expected`).textContent.trim(),
  }), X);
  if (JSON.stringify(lock.on) !== JSON.stringify([year])) fail(`${year}: filled buttons ${JSON.stringify(lock.on)}`);
  if (lock.rect !== years.indexOf(year)) fail(`${year}: highlight rect at slot ${lock.rect}, want ${years.indexOf(year)}`);
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
// the black rect slides between buttons, and the figures are always some real election's.
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
    rect: parseFloat(document.querySelector(`${X} .voa-yc-row`).style.getPropertyValue("--yc-p")),
    hero: [...document.querySelectorAll(`${X} .pb-gap-hero-figure`)].map((e) => e.textContent.trim()).join("|"),
  }), X);
  seenPos.add(Math.floor(s.pos));
  if (!realHeroes.has(s.hero)) fail(`mid-jump figures ${s.hero} belong to no election`);
  if (!s.resting) {
    midChecked++;
    // The rect straddles two buttons, tracking pos (counted from 2012 here).
    if (s.on !== 0 || Number.isInteger(s.rect) || Math.abs(s.rect - (years.length - 1 - s.pos)) > 1e-3)
      fail(`mid-jump the rect should slide between years ${JSON.stringify(s)}`);
  }
  if (s.resting === "2024") break;
}
if (midChecked < 5 || seenPos.size < 5) fail(`2012 -> 2024 should pass through every hop (saw ${[...seenPos]}, ${midChecked} mid samples)`);
console.log(`PASS: 2012 -> 2024 plays through every hop; mid-flight the rect slides between years, figures stay real (${midChecked} samples)`);

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

// 6b. The dimension switch: each non-age view keeps the shown year, then
// every year draws its groups, prints its JSON figures, keeps the view's
// y axis pinned, and leaves no year disabled. A year pick plays the timed
// hops like age does - a 2012 -> 2024 jump passes through every election in
// between - rather than cutting. Switching back to age restores the age
// chart at the same year.
const fmtPct = (v) => `${v.toFixed(1)}%`;
async function pickView(label) {
  await page.click(`${X} .voa-dims-btn:text-is("${label}")`);
  await page.waitForTimeout(1200); // the category chart's bars grow in over 700ms
}
const trackHeights = () => page.$$eval(`${X} g.pb-tracks rect`, (els) => els.map((e) => +e.getAttribute("height")));
await pick("2016");
for (const [key, label] of [["education", "Education"], ["income", "Family income"], ["race", "Race / ethnicity"]]) {
  const shown = (await state()).resting;
  await pickView(label);
  const st = await state();
  if (st.view !== key || st.resting !== shown) fail(`${key}: should stay on ${shown}, state ${JSON.stringify(st)}`);
  const dimYears = Object.keys(data.byDimension[key].years).sort();
  if (JSON.stringify(dimYears) !== JSON.stringify(years)) fail(`${key}: JSON has ${dimYears}, want every year`);

  let dimTicks = null;
  for (const year of [...years].reverse()) {
    const before = await trackHeights();
    await page.click(`${X} .voa-yc-btn[aria-label^="${year}"]`);
    await page.waitForTimeout(150);
    const mid = await trackHeights();
    await page.waitForFunction((y) => document.querySelector(".voa-explorer-state").dataset.resting === y, year, { timeout: 8000 });
    const st = await state();
    if (st.view !== key || st.resting !== year) fail(`${key} ${year}: state ${JSON.stringify(st)}`);
    const after = await trackHeights();
    // Mid-tween, some bar that moves sits strictly between where it was and where it lands.
    const moves = (i) => Math.abs(after[i] - before[i]) > 2;
    const moved = before.some((_, i) => moves(i));
    const between = before.some(
      (b, i) => moves(i) && Math.min(b, after[i]) + 0.5 < mid[i] && mid[i] < Math.max(b, after[i]) - 0.5
    );
    if (moved && !between) fail(`${key} ${year}: bars cut instead of tweening (${before} -> ${mid} -> ${after})`);

    const y = data.byDimension[key].years[year];
    const got = await page.evaluate((X) => ({
      ticks: [...document.querySelectorAll(`${X} .pb-axis-x .tick text`)].map((e) => e.textContent.trim()),
      hero: [...document.querySelectorAll(`${X} .pb-gap-hero-figure`)].map((e) => e.textContent.trim()),
      legend: document.querySelector(`${X} .pb-legend-expected`).textContent.trim(),
      disabled: document.querySelectorAll(`${X} .voa-yc-btn:disabled`).length,
      on: [...document.querySelectorAll(`${X} .voa-yc-btn.is-on`)].map((b) => b.getAttribute("aria-label").slice(0, 4)),
      caveat: document.querySelector(`${X} .voa-explorer-caveat`).textContent,
    }), X);
    const wantTicks = y.rows.map((r) => r.short);
    if (JSON.stringify(got.ticks) !== JSON.stringify(wantTicks)) fail(`${key} ${year}: x ticks ${JSON.stringify(got.ticks)}, want ${JSON.stringify(wantTicks)}`);
    const wantHero = [fmtPct((y.shortfall / y.totalVotes) * 100), fmtPct(y.avgTurnout)];
    if (JSON.stringify(got.hero) !== JSON.stringify(wantHero)) fail(`${key} ${year}: hero ${JSON.stringify(got.hero)}, want ${JSON.stringify(wantHero)}`);
    if (!got.legend.includes(fmtPct(y.benchmarkTurnout))) fail(`${key} ${year}: legend "${got.legend}" lacks the benchmark rate`);
    if (got.disabled) fail(`${key} ${year}: ${got.disabled} year buttons disabled`);
    if (JSON.stringify(got.on) !== JSON.stringify([year])) fail(`${key} ${year}: filled buttons ${JSON.stringify(got.on)}`);
    if (!got.caveat.includes(y.benchmarkGroup.toLowerCase())) fail(`${key} ${year}: caveat lacks the benchmark group`);
    if (/only for now/.test(got.caveat)) fail(`${key} ${year}: caveat still says "only for now"`);
    if (key === "income" && !got.caveat.includes(`${fmtPct(y.imputedPct)} who`)) fail(`income ${year}: caveat lacks the imputed share`);
    if (key === "income" && !got.caveat.includes(`${year} dollars`)) fail(`income ${year}: caveat lacks its own year's dollars`);
    const ticks = await yTicks();
    if (dimTicks === null) dimTicks = ticks;
    else if (ticks !== dimTicks) fail(`${key} ${year}: y ticks changed ${ticks} vs ${dimTicks}`);
    if (await nanTransforms()) fail(`${key} ${year}: NaN in a transform`);
    await page.locator(`${X} .voa-explorer-chart`).screenshot({ path: `${OUT}/voter-age-explorer-${key}-${year}.png` });
    console.log(`PASS: ${key} ${year}: ${got.ticks.length} groups; ${got.hero.join(" / ")}; ${got.legend}${moved ? "; tweened" : ""}`);
  }

  // At 2012 now: jump to 2024 and watch pos walk through every hop in between.
  await page.click(`${X} .voa-yc-btn[aria-label^="2024"]`);
  const seen = new Set();
  let midHeights = 0;
  for (let i = 0; i < 80 && (await state()).resting !== "2024"; i++) {
    const pos = +(await state()).pos;
    if (!Number.isInteger(pos)) seen.add(Math.floor(pos));
    const h = await trackHeights();
    if (h.some((v) => !Number.isFinite(v))) fail(`${key}: non-finite bar height mid-jump`);
    midHeights++;
    await page.waitForTimeout(40);
  }
  if ((await state()).resting !== "2024") fail(`${key}: 2012 -> 2024 jump never landed`);
  if (seen.size < years.length - 2) fail(`${key}: 2012 -> 2024 jump only passed through hops ${[...seen]}`);
  console.log(`PASS: ${key}: 2012 -> 2024 played ${seen.size} in-between hops (${midHeights} samples)`);
}
await pick("2016");
await pickView("Age");
const back = await state();
const ageTicks = await page.$$eval(`${X} .pb-axis-x .tick text`, (els) => els.length);
const stillDisabled = await page.$$eval(`${X} .voa-yc-btn:disabled`, (els) => els.length);
if (back.view !== "age" || ageTicks < 5 || stillDisabled) fail(`back to age: ${JSON.stringify(back)}, ${ageTicks} ticks, ${stillDisabled} disabled`);
console.log(`PASS: back to age at ${back.resting}, every year enabled again`);

// 6c. The measure switch: "Shortfall only" strips every view to its gold on
// a percent axis, and the bars sum to the hero's shortfall share. Back to
// People restores the people axis.
const goldSum = () =>
  page.$$eval(`${X} g.pb-gaps rect`, (els) => els.reduce((a, e) => a + +e.getAttribute("height"), 0));
const pctAt = async (v) => {
  // Pixel height of v% on the current y axis, from its 0 and top ticks.
  const t = await page.$$eval(`${X} .pb-axis-y .tick`, (els) =>
    els.map((e) => ({ v: parseFloat(e.textContent), y: +e.getAttribute("transform").match(/,([\d.]+)/)[1] }))
  );
  return (v * (t[0].y - t.at(-1).y)) / (t.at(-1).v - t[0].v);
};
for (const [key, label] of [["age", "Age"], ["race", "Race / ethnicity"]]) {
  await pickView(label);
  await page.click(`${X} .voa-dims-btn:text-is("Shortfall only")`);
  // The switch plays on a timer: catch it mid-drop and mid-resize, then settled.
  for (const u of [0.4, 0.8]) {
    await page.waitForFunction(
      ([X, u]) => +document.querySelector(`${X} .voa-explorer-state`).dataset.gapU >= u,
      [X, u]
    );
    if (await nanTransforms()) fail(`${key} switching at u=${u}: NaN in a transform`);
    await page.locator(`${X} .voa-explorer-chart`).screenshot({ path: `${OUT}/voter-age-explorer-gap-${key}-u${u}.png` });
  }
  await page.waitForFunction((X) => document.querySelector(`${X} .voa-explorer-state`).dataset.gapU === "1.0000", X);
  const st = await state();
  const year = st.resting;
  const got = await page.evaluate((X) => ({
    ticks: [...document.querySelectorAll(`${X} .pb-axis-y .tick text`)].map((e) => e.textContent.trim()),
    votes: [...document.querySelectorAll(`${X} rect.pb-votes`)].filter((e) => getComputedStyle(e).opacity !== "0").length,
    hero: document.querySelector(`${X} .pb-gap-hero-figure`).textContent.trim(),
  }), X);
  if (st.measure !== "gap") fail(`${key}: measure should be gap, ${JSON.stringify(st)}`);
  if (!got.ticks.every((t) => t.endsWith("%"))) fail(`${key} shortfall-only: y ticks ${got.ticks}`);
  if (got.votes) fail(`${key} shortfall-only: ${got.votes} votes bars still visible`);
  const want = await pctAt(parseFloat(got.hero));
  const sum = await goldSum();
  // The hero rounds to 0.1%, so allow half that plus a pixel.
  if (Math.abs(sum - want) > (await pctAt(0.05)) + 1) fail(`${key} ${year} shortfall-only: gold sums to ${sum.toFixed(1)}px, hero ${got.hero} = ${want.toFixed(1)}px`);
  if (await nanTransforms()) fail(`${key} shortfall-only: NaN in a transform`);
  await page.locator(`${X} .voa-explorer-chart`).screenshot({ path: `${OUT}/voter-age-explorer-gap-${key}-${year}.png` });
  await page.click(`${X} .voa-dims-btn:text-is("People")`);
  await page.waitForFunction((X) => document.querySelector(`${X} .voa-explorer-state`).dataset.gapU === "0.0000", X);
  const back = await yTicks();
  if (!back.includes("M")) fail(`${key}: back to People, y ticks ${back}`);
  console.log(`PASS: ${key} ${year} shortfall-only: percent axis ${got.ticks.join(" ")}, gold bars sum to the hero ${got.hero}`);
}
await pickView("Age");

if ((await nanTransforms()) > 0) fail("NaN in a transform attribute");
if (consoleErrors.length) fail(`console errors:\n  ${consoleErrors.join("\n  ")}`);
console.log("PASS: zero console errors, no NaN transforms");

// 7. Reduced motion: a pick lands at once, no hops played.
const rm = await browser.newPage({ viewport: { width: 1000, height: 900 }, reducedMotion: "reduce" });
await rm.goto(`${BASE}/2026/ShapeOfTheElectorate/`, { waitUntil: "networkidle" });
await rm.waitForSelector(".voa-explorer .pb-surface");
await rm.click(`${X} .voa-yc-btn[aria-label^="2012"]`);
await rm.waitForTimeout(50);
const rmState = await rm.$eval(".voa-explorer-state", (e) => e.dataset.resting);
if (rmState !== "2012") fail(`reduced motion: should land on 2012 at once, resting=${rmState}`);
console.log("PASS: reduced motion jumps straight to the picked year");
await rm.close();

// 8. 360px phone: no horizontal scroll, all seven buttons visible and unclipped.
const phone = await browser.newPage({ viewport: { width: 360, height: 800 } });
await phone.goto(`${BASE}/2026/ShapeOfTheElectorate/`, { waitUntil: "networkidle" });
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
