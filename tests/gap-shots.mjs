import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
const dark = process.env.DARK === "1";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, colorScheme: dark ? "dark" : "light" });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");
const sfx = dark ? "-dark" : "";

// Scroll each named step into the middle of the viewport, then shoot the sticky chart.
const targets = [
  { beat: 0, step: 2, name: "gap-age-sum" },
  { beat: 0, step: 3, name: "gap-age-registered" },
  { beat: 0, step: 4, name: "gap-age-registration" },
];
for (const t of targets) {
  await page.evaluate(({ beat, step }) => {
    const b = document.querySelectorAll(".voa-beat")[beat];
    const s = b.querySelectorAll(".voa-step")[step];
    const r = s.getBoundingClientRect();
    window.scrollTo(0, r.top + window.scrollY - window.innerHeight / 2 + r.height / 2);
  }, t);
  await page.waitForTimeout(1100);
  const viz = page.locator(".voa-beat").nth(t.beat).locator(".voa-scrolly-viz");
  await viz.screenshot({ path: `${OUT}/${t.name}${sfx}.png` });
}
await browser.close();
console.log("done");
