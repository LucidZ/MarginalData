// Smoke test for the WeekendSpread widget (Jan–Mar day types by year +
// Saturday hourly profiles by era).
// Run with: BASE_URL=http://localhost:<port> node tests/i70-weekend-spread-smoke.mjs
//
// At 1000px and 390px: both charts draw (4 day lines, 3 era lines), the
// year tooltip appears on hover, the % change and profile toggles redraw,
// no horizontal page scroll. Fails on console errors.
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
  ["desktop", { width: 1000, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  console.log(name);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/2026/I70Widgets/WeekendSpread`);
  await page.waitForSelector(".i70w-scatter svg path");
  const svgs = page.locator(".i70w-scatter svg");
  check((await svgs.count()) === 2, "two charts drawn");
  const dayPaths = await svgs.nth(0).locator("path").count();
  check(dayPaths === 4, `day-type lines: ${dayPaths}`);
  const eraPaths = await svgs.nth(1).locator("path").count();
  check(eraPaths === 3, `era lines: ${eraPaths}`);
  await page.screenshot({ path: `${OUT}/i70-weekend-spread-${name}.png`, fullPage: true });

  const box = await svgs.nth(0).boundingBox();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2);
  const tip = await page.locator(".i70w-tip").first().textContent();
  check(/Jan–Mar \d{4}/.test(tip ?? ""), `year tooltip: ${tip?.slice(0, 40)}`);

  const before = await svgs.nth(0).locator("path").first().getAttribute("d");
  await page.getByRole("button", { name: "% change" }).click();
  const after = await svgs.nth(0).locator("path").first().getAttribute("d");
  check(before !== after, "% change redraws lines");
  await page.screenshot({ path: `${OUT}/i70-weekend-spread-pct-${name}.png`, fullPage: true });

  const pb = await svgs.nth(1).locator("path").first().getAttribute("d");
  await page.getByRole("button", { name: "Sunday eastbound" }).click();
  const pa = await svgs.nth(1).locator("path").first().getAttribute("d");
  check(pb !== pa, "profile toggle redraws");

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
