// Smoke check for the I-70 traffic toy (.claude/i70-traffic-poc-spec.md).
// Run with: node tests/i70-traffic-smoke.mjs   (preview server must be running;
// BASE_URL overrides the default port). Loads the page at 1000px and 390px,
// presses play, captures frames at hours 7, 12 and 17, and exits non-zero on
// any console/page error.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const HOURS = [7, 12, 17];
const LABELS = { 7: "7 AM", 12: "12 PM", 17: "5 PM" };
const errors = [];
const browser = await chromium.launch();

for (const width of [1000, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1400 } });
  page.on("pageerror", (e) => errors.push(`[${width}] ${e}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[${width}] ${msg.text()}`);
  });

  await page.goto(`${BASE}/2026/I70Traffic`, { waitUntil: "networkidle" });
  await page.waitForSelector(".i70-strip", { timeout: 10000 });
  console.log(`${width}px: strips=${await page.locator(".i70-strip").count()}, curve panels=${await page.locator(".i70-curve-panel").count()}`);

  // Fast speed, then play from just before the first capture hour.
  await page.getByRole("button", { name: "0.4 s / hr" }).click();
  await page.locator(".i70-scrubber").fill("6");
  await page.getByRole("button", { name: "Play" }).click();

  for (const h of HOURS) {
    await page.waitForFunction(
      (label) => document.querySelector(".i70-clock-hour")?.textContent === label,
      LABELS[h],
      { timeout: 15000 },
    );
    // Pause on the frame so the tween settles before the shot.
    await page.getByRole("button", { name: "Pause" }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/i70-${width}-h${h}.png`, fullPage: true });
    await page.getByRole("button", { name: "Play" }).click();
  }
  await page.close();
}

await browser.close();
if (errors.length) {
  console.error("console/page errors:", errors);
  process.exit(1);
}
console.log("no console errors - screenshots in", OUT);
