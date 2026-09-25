// Ad hoc visual smoke check for the VoterAge story (spec v2 - "The Shape
// of the Electorate"). Run with: node tests/voter-age-smoke.mjs
// (preview server must be running).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1", { timeout: 10000 });
await page.screenshot({ path: `${OUT}/voter-age-top.png` });

const totalHeight = await page.evaluate(() => document.body.scrollHeight);
console.log("page height:", totalHeight);

const stops = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
for (const [i, frac] of stops.entries()) {
  await page.evaluate((f) => window.scrollTo(0, document.body.scrollHeight * f), frac);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/voter-age-scroll-${i}.png` });
}

const beatTitles = await page.$$eval(".voa-beat-title", (els) => els.map((e) => e.textContent));
console.log("beat titles found:", beatTitles);
const expectedTitleFragments = [
  "age of the electorate",
  "Midterms make it worse",
  "isn't only about age",
  "Does anything change",
];
for (const fragment of expectedTitleFragments) {
  const found = beatTitles.some((t) => t.includes(fragment));
  console.log(`  beat title containing "${fragment}":`, found ? "OK" : "MISSING");
}

const barCount = await page.$$eval("rect.pb-track", (els) => els.length);
console.log("PopulationBars track bars on last frame (category variant, beat 3 income = 10):", barCount);

const dotCount = await page.$$eval("circle.cd-dot", (els) => els.length);
console.log("ColoradoDots dots on last frame:", dotCount);

console.log("console/page errors:", errors.length ? errors : "none");

await browser.close();
console.log("done - screenshots in", OUT);
