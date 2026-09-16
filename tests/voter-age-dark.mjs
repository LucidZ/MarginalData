import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, colorScheme: "dark" });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

// Beat 1 (age bars) and beat 3 (category small multiples, div-adjacent
// legend swatches) both had a real dark-mode bug in v1 - shared color
// classes set SVG `fill` only, so `<div>`-based marks (StateGrid tiles)
// rendered with no visible background. This story's marks are all SVG
// <rect>/<circle> now, but the legend swatches are <span> divs using
// `background-color` - check those render visibly in dark mode too.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.1));
await page.waitForTimeout(500);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-beat1.png" });

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
await page.waitForTimeout(500);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-beat3.png" });

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.85));
await page.waitForTimeout(500);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-beat4.png" });

const swatchBg = await page.$eval(".pb-legend-votes", (el) => getComputedStyle(el).backgroundColor);
console.log("pb-legend-votes background-color in dark mode:", swatchBg);

await browser.close();
console.log("done");
