import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto("http://localhost:4321/2026/VoterAge/", { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");
const box = await page.evaluate(() => {
  const titles = [...document.querySelectorAll(".voa-beat-title")];
  const t = titles.find(el => el.textContent.includes("Midterms make it worse"));
  const section = t.closest(".voa-beat");
  const rect = section.getBoundingClientRect();
  return { top: rect.top + window.scrollY, height: section.scrollHeight };
});
const scrollable = box.height - 900;
const STEPS = 4;
for (let i = 0; i < STEPS; i++) {
  const frac = (i + 0.5) / STEPS;
  await page.evaluate((y) => window.scrollTo(0, y), box.top + scrollable * frac);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/beat2-step-${i}.png` });
}
await browser.close();
console.log("done");
