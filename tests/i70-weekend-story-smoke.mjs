// Smoke test for the WeekendStory scrollyteller (sticky LensChart, 3 charts x 3 lenses, scroll-driven steps).
// Run with: BASE_URL=http://localhost:<port> node tests/i70-weekend-story-smoke.mjs
//
// At 1000px and 390px: scrolls each step's centre to the reading line and checks
// the chart state (step, season, chart, lens and its gold layer, tracker cell); checks the first scrub
// plays seasons forward mid-way and that the drift seasons flag westbound; no
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

// Expected chart state when each step is centred: [season, chart, lens].
const L = 2026;
const EXPECT = [
  [1996, "sat", ""],
  [L, "sat", "peak"],
  [L, "sat", "total"],
  [L, "sat", "net"],
  [L, "friSun", "peak"],
  [L, "friSun", "total"],
  [L, "friSun", "net"],
  [L, "wedTue", "peak"],
  [L, "wedTue", "total"],
  [L, "wedTue", "net"],
  [L, "wedTue", ""],
];
// The gold layer each lens draws.
const LAYER = { peak: ".i70s-peak", total: ".i70s-gap path", net: ".i70s-net path" };

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
    const [season, chart, lens] = EXPECT[k];
    const layers = {};
    for (const [l, sel] of Object.entries(LAYER)) layers[l] = await page.locator(`.i70s-viz svg ${sel}`).count();
    const layersOk = Object.entries(layers).every(([l, n]) => (n > 0) === (l === lens));
    const here = await page.locator(".i70s-tracker td.is-here").count();
    check(
      Number(s.step) === k && Number(s.season) === season && s.chart === chart && s.lens === lens && layersOk &&
        (name === "mobile" || here === (lens ? 1 : 0)),
      `step ${k}: step=${s.step} season=${s.season} chart=${s.chart} lens=${s.lens} layers=${JSON.stringify(layers)} tracker=${here}`,
    );
    await page.screenshot({ path: `${OUT}/i70-weekend-story-${k}-${name}.png` });
  }

  await scrollTo(0, 0.5);
  await page.waitForTimeout(250);
  const mid = await state();
  check(Number(mid.season) > 1996 && Number(mid.season) < L, `scrub mid-way plays forward (season ${mid.season})`);
  await page.screenshot({ path: `${OUT}/i70-weekend-story-scrub-${name}.png` });

  // Somewhere in the scrub the drift seasons flag westbound's clock.
  let sawDrift = false;
  for (let f = 0.3; f < 0.7 && !sawDrift; f += 0.02) {
    await scrollTo(0, f);
    await page.waitForTimeout(80);
    const s = await state();
    if (Number(s.season) >= 2006 && Number(s.season) <= 2010)
      sawDrift = await page.locator(".i70s-viz svg text", { hasText: "clock likely ran" }).count() > 0;
  }
  check(sawDrift, "drift seasons show the clock note during the scrub");

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
