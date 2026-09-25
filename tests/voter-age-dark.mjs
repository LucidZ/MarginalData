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

// Section 3 resting on a midterm, so the filled timeline button's dashed
// border and the year card are checked against the dark page too.
await page.$eval('.voa-year-card[data-year="2018"]', (e) => e.closest(".voa-step").scrollIntoView({ block: "center" }));
await page.waitForTimeout(500);
await page.screenshot({ path: "tests/screenshots/voter-age-dark-explorer.png" });

const swatchBg =await page.$eval(".pb-legend-votes", (el) => getComputedStyle(el).backgroundColor);
console.log("pb-legend-votes background-color in dark mode:", swatchBg);

await browser.close();
console.log("done");
