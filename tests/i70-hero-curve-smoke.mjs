// Smoke test for the HeroCurve widget (average winter day by hour at the
// Eisenhower Tunnel, played back season by season).
// Run with: BASE_URL=http://localhost:<port> node tests/i70-hero-curve-smoke.mjs
//
// At 1000px and 390px: the chart draws, the season slider moves the current
// curve, the drift seasons draw westbound with an asterisk note, Play advances the
// season, the span control widens the x-axis to Wed–Wed, no horizontal
// scroll. Fails on console errors.
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

const browser = await chromium.launch();
for (const [name, viewport] of [
  ["desktop", { width: 1000, height: 1000 }],
  ["mobile", { width: 390, height: 900 }],
]) {
  console.log(name);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/2026/I70Widgets/HeroCurve`);
  await page.waitForSelector(".i70w-scatter svg path");
  const slider = page.getByRole("slider", { name: "Season" });
  const readout = page.locator(".i70w-readout");
  const setSeason = (v) => slider.evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(el, String(v));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);

  await setSeason(1997);
  const r1997 = await readout.textContent();
  check(/vehicles both ways/.test(r1997 ?? ""), `1997 readout: ${r1997?.slice(0, 70)}`);
  await page.screenshot({ path: `${OUT}/i70-hero-curve-1997-${name}.png`, fullPage: true });

  await setSeason(2008);
  const r2008 = await readout.textContent();
  check(/vehicles both ways/.test(r2008 ?? ""), "2008: westbound drawn");
  check((await page.locator(".i70w-scatter text", { hasText: "likely ran" }).count()) === 1, "2008: asterisk note shown");
  await page.screenshot({ path: `${OUT}/i70-hero-curve-2008-${name}.png`, fullPage: true });

  await setSeason(2019);
  const r2019 = await readout.textContent();
  check(/\+\d+% vs 1996/.test(r2019 ?? ""), `2019 readout: ${r2019?.slice(0, 80)}`);
  await page.getByRole("button", { name: "Pin 2019" }).click();
  await setSeason(2024);
  await page.screenshot({ path: `${OUT}/i70-hero-curve-2024-${name}.png`, fullPage: true });

  await setSeason(2000);
  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(1200);
  const played = await slider.inputValue();
  check(Number(played) > 2000, `play advances season (2000 → ${played})`);
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("button", { name: "Wed–Wed" }).click();
  await setSeason(2024);
  const dayLabels = await page.locator(".i70w-scatter svg text.i70w-direct").allTextContents();
  check(dayLabels.filter((t) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(t)).length === 8, "Wed–Wed shows 8 day labels");
  await page.screenshot({ path: `${OUT}/i70-hero-curve-week-${name}.png`, fullPage: true });

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
