// Smoke test for the I-70 widgets hub and the flow-vs-speed widget.
// Run with: BASE_URL=http://localhost:<port> node tests/i70-flow-vs-speed-smoke.mjs
//
// At 1000px and 390px: hub lists every widget, the widget animates (canvas
// pixels change between frames), the tally climbs, Pause freezes the canvas,
// and the flow slider resets the tally. Fails on console errors.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
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

  await page.goto(`${BASE}/2026/I70Widgets`);
  await page.waitForSelector(".i70w-card");
  const cards = await page.locator(".i70w-card").count();
  check(cards >= 3, `hub lists ${cards} widgets`);
  await page.screenshot({ path: `${OUT}/i70-widgets-hub-${name}.png`, fullPage: true });

  await page.locator(".i70w-card").first().click();
  await page.waitForSelector("canvas");
  const snap = () => page.locator("canvas").evaluate((c) => c.toDataURL());
  const tally = async () => Number(await page.locator(".fvs-tally strong").textContent());

  const a = await snap();
  await page.waitForTimeout(500);
  const b = await snap();
  check(a !== b, "canvas animates");
  await page.waitForTimeout(2500);
  const t1 = await tally();
  check(t1 >= 1, `tally climbs (${t1})`);
  await page.screenshot({ path: `${OUT}/i70-flow-vs-speed-${name}.png`, fullPage: true });

  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(100);
  const p1 = await snap();
  await page.waitForTimeout(400);
  check(p1 === (await snap()), "pause freezes the canvas");
  await page.getByRole("button", { name: "Play" }).click();

  await page.locator(".fvs-flow input").fill("900");
  await page.waitForTimeout(100);
  check((await tally()) <= 1, "changing the flow resets the tally");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, "no horizontal scroll");
  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.close();
}
await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall checks passed");
