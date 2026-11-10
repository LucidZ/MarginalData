// Smoke test for the WeekendStory scrollyteller shell (sticky HeroChart, scroll-driven steps).
// Run with: BASE_URL=http://localhost:<port> node tests/i70-weekend-story-smoke.mjs
//
// At 1000px and 390px: scrolls each step's centre to the reading line and checks
// the chart state (step, season, span, highlight marks); checks the first scrub
// plays seasons forward mid-way and that the drift seasons hide westbound; no
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

// Expected chart state when each step is centred: [season, span, marks].
const EXPECT = [
  [2025, "sat", 0],
  [1996, "sat", 0],
  [2025, "sat", 0],
  [2025, "sat", 2],
  [2025, "sat", 2],
  [2025, "friSun", 0],
  [1996, "thuMon", 0],
  [2025, "thuMon", 0],
  [2025, "thuMon", 0],
];

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
    const [season, span, marks] = EXPECT[k];
    check(
      Number(s.step) === k && Number(s.season) === season && s.span === span && Number(s.marks) === marks,
      `step ${k}: step=${s.step} season=${s.season} span=${s.span} marks=${s.marks}`,
    );
    await page.screenshot({ path: `${OUT}/i70-weekend-story-${k}-${name}.png` });
  }

  await scrollTo(1, 0.5);
  await page.waitForTimeout(250);
  const mid = await state();
  check(Number(mid.season) > 1996 && Number(mid.season) < 2025, `scrub mid-way plays forward (season ${mid.season})`);
  await page.screenshot({ path: `${OUT}/i70-weekend-story-scrub-${name}.png` });

  // Somewhere in the scrub the drift seasons hide westbound.
  let sawDrift = false;
  for (let f = 0.3; f < 0.7 && !sawDrift; f += 0.02) {
    await scrollTo(1, f);
    await page.waitForTimeout(80);
    const s = await state();
    if (Number(s.season) >= 2006 && Number(s.season) <= 2010)
      sawDrift = await page.locator(".i70s-viz svg text", { hasText: "not shown" }).count() > 0;
  }
  check(sawDrift, "drift seasons show the westbound-hidden note during the scrub");

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
