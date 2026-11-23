// Smoke test for the WeekendStory scrollyteller (sticky LensChart, 3 charts, one sentence + one gold highlight per step)
// and its closing two-trip sandbox.
// Run with: BASE_URL=http://localhost:<port> node tests/i70-weekend-story-smoke.mjs
//
// At 1000px and 390px: scrolls each step's centre to the reading line and checks
// the chart state (step, season, chart, highlight and its gold layer); checks the scrub
// plays seasons forward mid-way, both zooms widen, the drift seasons flag westbound, and the
// sandbox draws and redraws its two trips; no
// horizontal scroll, no console errors. Screenshots each step.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, msg) => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

// Expected chart state when each step is centred: [season, chart, highlight, shaded windows, gold layers].
const L = 2026;
const EXPECT = [
  [1996, "sat", "", 0, []],
  [1996, "sat", "peak", 0, ["peak"]],
  [1996, "sat", "", 0, []],
  [L, "sat", "", 0, []],
  [L, "sat", "gap", 0, ["gap"]],
  [L, "sat", "gap", 0, ["gap"]],
  [L, "sat", "gap", 0, ["gap"]],
  [L, "friSun", "", 0, []],
  [L, "friSun", "peak", 0, ["peak"]],
  [L, "friSun", "peak", 0, ["peak"]],
  [L, "thuMon", "", 0, []],
  [L, "thuMon", "pick", 0, ["pick"]],
  [L, "thuMon", "pick", 0, ["pick"]],
  [L, "thuMon", "pick", 0, ["pick", "holiday"]],
  [L, "thuMon", "pick", 0, ["pick", "then"]],
];
// The scrub runs from this step to the next.
const SCRUB = 2;
// The zooms (Saturday out to Fri–Sun, Fri–Sun out to Thu–Mon) run from these steps to the next.
const ZOOMS = [6, 9];
// The gold layer each highlight draws.
const LAYER = {
  peak: ".i70s-peak-bar:not(.i70s-pick *)",
  gap: ".i70s-gap path",
  pick: ".i70s-pick rect",
  holiday: ".i70s-holiday",
  then: ".i70s-pick .is-then",
};

const browser = await chromium.launch();
for (const [name, viewport] of [
  ["desktop", { width: 1000, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  console.log(name);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/2026/I70Widgets/WeekendStory`);
  await page.waitForSelector(".i70s-viz svg path");
  const state = () =>
    page.locator(".i70s-state").evaluate((el) => ({ ...el.dataset }));

  // Scroll so a point at `frac` between step k's centre and step k+1's sits on the reading line.
  const scrollTo = (k, frac = 0) =>
    page.evaluate(
      ([k, frac]) => {
        const steps = [...document.querySelectorAll(".i70s-step")];
        const c = (el) => {
          const r = el.getBoundingClientRect();
          return r.top + window.scrollY + r.height / 2;
        };
        const target = c(steps[k]) + (k + 1 < steps.length ? (c(steps[k + 1]) - c(steps[k])) * frac : 0);
        const phone = window.matchMedia("(max-width: 720px)").matches;
        const pane = document.querySelector(".i70s-viz");
        const covered = phone ? pane.getBoundingClientRect().height : 0;
        const line = covered + (window.innerHeight - covered) / 2;
        window.scrollTo(0, target - line);
      },
      [k, frac],
    );

  for (let k = 0; k < EXPECT.length; k++) {
    await scrollTo(k);
    await page.waitForTimeout(250);
    const s = await state();
    const [season, chart, hl, windows, want] = EXPECT[k];
    const layers = {};
    for (const [l, sel] of Object.entries(LAYER)) layers[l] = await page.locator(`.i70s-viz svg ${sel}`).count();
    const layersOk = Object.entries(layers).every(([l, n]) => (n > 0) === want.includes(l));
    const win = await page.locator(".i70s-viz svg .i70s-window").count();
    check(
      Number(s.step) === k && Number(s.season) === season && s.chart === chart && s.hl === hl && layersOk && win === windows,
      `step ${k}: step=${s.step} season=${s.season} chart=${s.chart} hl=${s.hl} layers=${JSON.stringify(layers)} windows=${win}`,
    );
    await page.screenshot({ path: `${OUT}/i70-weekend-story-${k}-${name}.png` });
  }

  await scrollTo(SCRUB, 0.5);
  await page.waitForTimeout(250);
  const mid = await state();
  check(Number(mid.season) > 1996 && Number(mid.season) < L, `scrub mid-way plays forward (season ${mid.season})`);
  await page.screenshot({ path: `${OUT}/i70-weekend-story-scrub-${name}.png` });

  // Mid-zoom: the next chart drawn, partly widened, no highlight; screenshots along the way.
  for (const k of ZOOMS)
    for (const f of [0.35, 0.5, 0.65]) {
      await scrollTo(k, f);
      await page.waitForTimeout(250);
      const z = await state();
      const t = Number(z.zoom);
      check(z.chart === EXPECT[k + 1][1] && t > 0 && t < 1 && z.hl === "", `zoom ${k} at ${f}: chart=${z.chart} t=${z.zoom} hl=${z.hl}`);
      await page.screenshot({ path: `${OUT}/i70-weekend-story-zoom-${k}-${Math.round(f * 10)}-${name}.png` });
    }

  // While a step's text is still being read (past centre, before the gap), nothing has started moving.
  for (const k of [SCRUB, ...ZOOMS]) {
    await scrollTo(k, 0.2);
    await page.waitForTimeout(250);
    const s = await state();
    const [season, chart, hl] = EXPECT[k];
    check(
      Number(s.step) === k && Number(s.season) === season && s.chart === chart && s.hl === hl && s.zoom === "",
      `step ${k} at 0.2 still holds: season=${s.season} chart=${s.chart} hl=${s.hl} zoom=${s.zoom}`,
    );
  }

  // Somewhere in the scrub the drift seasons flag westbound's clock.
  let sawDrift = false;
  for (let f = 0.3; f < 0.7 && !sawDrift; f += 0.02) {
    await scrollTo(SCRUB, f);
    await page.waitForTimeout(80);
    const s = await state();
    if (Number(s.season) >= 2006 && Number(s.season) <= 2010)
      sawDrift = await page.locator(".i70s-viz svg text", { hasText: "clock likely ran" }).count() > 0;
  }
  check(sawDrift, "drift seasons show the clock note during the scrub");

  // The sandbox: four bars on the week chart (two trips, both ways), two clock panels with a bar per
  // trip each, a scoreboard row per leg (counts only: no percentages, no total); the toggles redraw it.
  const box = page.locator(".i70s-compare");
  await box.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const bars = () => box.locator(".i70s-pick rect").count();
  const clockBars = () => box.locator(".i70s-clock rect.i70s-peak-bar").count();
  const vals = () => box.locator(".i70s-score-val").allTextContents();
  check((await bars()) === 4, `sandbox draws 4 trip bars (${await bars()})`);
  check((await box.locator(".i70s-clock svg").count()) === 2 && (await clockBars()) === 4, `two clock panels, 4 bars (${await clockBars()})`);
  const scoreText = await box.locator(".i70s-score").textContent();
  check((await vals()).length === 4 && !/%|fewer|Both ways/.test(scoreText), `scoreboard: ${(await vals()).join(" / ")}`);
  const days = await box.locator(".i70w-scatter svg text.i70w-direct").allTextContents();
  check(["Wed", "Tue"].every((d) => days.includes(d)), `week chart runs Wed–Tue: ${days.filter((d) => d.length === 3).join(" ")}`);
  await box.screenshot({ path: `${OUT}/i70-weekend-story-sandbox-${name}.png` });
  // Trip A up Wednesday, home Tuesday: both ends of the week draw and read out.
  await box.getByRole("group", { name: "Trip A day up" }).getByRole("button", { name: "Wed" }).click();
  await box.getByRole("group", { name: "Trip A day home" }).getByRole("button", { name: "Tue" }).click();
  const wt = await vals();
  check((await bars()) === 4 && /Wednesday/.test(wt[0]) && /Tuesday/.test(wt[2]) && wt.every((v) => /\d/.test(v)), `Wed up / Tue home: ${wt[0]} / ${wt[2]}`);
  await box.screenshot({ path: `${OUT}/i70-weekend-story-sandbox-wedtue-${name}.png` });
  // Any home day goes, even one before the day up (a stay of a week or more): Trip B up Saturday, home Wednesday.
  await box.getByRole("group", { name: "Trip B day up" }).getByRole("button", { name: "Sat" }).click();
  const homeDays = box.getByRole("group", { name: "Trip B day home" }).getByRole("button");
  const disabled = await homeDays.evaluateAll((els) => els.filter((e) => e.disabled).length);
  await box.getByRole("group", { name: "Trip B day home" }).getByRole("button", { name: "Wed" }).click();
  const bv = await vals();
  check(disabled === 0 && /Saturday/.test(bv[1]) && /Wednesday/.test(bv[3]) && (await bars()) === 4, `Sat up / Wed home: ${bv[1]} / ${bv[3]}`);
  await box.screenshot({ path: `${OUT}/i70-weekend-story-sandbox-anyday-${name}.png` });
  await box.getByRole("button", { name: /Presidents/ }).click();
  await page.waitForTimeout(150);
  const key = await box.locator(".i70s-key-now").textContent();
  check(/\d{4}–\d{2}/.test(key) && (await bars()) === 4 && (await clockBars()) === 4, `holiday weekend: key=${key}, bars=${await bars()}`);
  await box.screenshot({ path: `${OUT}/i70-weekend-story-sandbox-holiday-${name}.png` });
  await box.getByRole("group", { name: "Season" }).getByRole("button").nth(1).click();
  await page.waitForTimeout(150);
  check((await bars()) === 4 && (await box.locator(".i70s-key-then").count()) === 0, "1996 season: 4 bars, no 1996 reference");
  await box.screenshot({ path: `${OUT}/i70-weekend-story-sandbox-1996-${name}.png` });

  const sw = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(sw <= 0, `no horizontal scroll (${sw}px)`);
  check(errors.length === 0, `console errors: ${errors.join(" | ") || "none"}`);
  await page.close();
}
await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
