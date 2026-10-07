import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, colorScheme: "dark" });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

// v1 had a real dark-mode bug - shared color classes set SVG `fill` only,
// so `<div>`-based marks (StateGrid tiles) rendered with no visible
// background. This story's marks are all SVG <rect> now, but the legend
// swatches are <span> divs using `background-color` - check those render
// visibly in dark mode too.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.1));
await page.waitForTimeout(500);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-beat1.png" });

// The explorer resting on a midterm, so the filled timeline button's
// dashed border is checked against the dark page too.
await page.$eval(".voa-explorer", (e) => e.scrollIntoView());
await page.click('.voa-explorer .voa-yc-btn[aria-label^="2018"]');
await page.waitForFunction(() => document.querySelector(".voa-explorer-state").dataset.resting === "2018");
await page.waitForTimeout(300);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-explorer.png" });

// The summary's gold arrows, on the last story step.
await page.evaluate(() => {
  const steps = document.querySelectorAll(".voa-beat .voa-step");
  steps[steps.length - 1].scrollIntoView({ block: "center" });
});
await page.waitForTimeout(600);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-arrows.png" });

const swatchBg =await page.$eval(".pb-legend-votes", (el) => getComputedStyle(el).backgroundColor);
console.log("pb-legend-votes background-color in dark mode:", swatchBg);

await browser.close();
console.log("done");
