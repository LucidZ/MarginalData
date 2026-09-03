// Ad hoc visual smoke check for the VoterAge story - not a committed test
// suite (none of the tests/ scaffold referenced in project memory exists
// in this worktree; only its gitignored output dirs were present). Run
// with: node tests/voter-age-smoke.mjs (preview server must be running).
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

const dotCounts = await page.$$eval("circle.voa-dot", (els) => els.length);
console.log("scatter dots on last frame:", dotCounts);

const tileCounts = await page.$$eval(".voa-tile", (els) => els.length);
console.log("state grid tiles on last frame:", tileCounts);

console.log("console/page errors:", errors.length ? errors : "none");

await browser.close();
console.log("done - screenshots in", OUT);
