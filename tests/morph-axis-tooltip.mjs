// VoterAge 2024->2022 morph: (1) x-axis ticks must not move - the bars slide
// two slots, the age axis doesn't; (2) no tooltip while the chart is
// mid-morph (it would describe geometry no real election produced), and it
// comes back once the chart rests on 2022.
// Run with: BASE_URL=http://localhost:5174 node tests/morph-axis-tooltip.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const H = 900;
const MORPH_STEP = 6; // AgeBeats.tsx

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: H } });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

const { from, to } = await page.evaluate(
  ({ i, h }) => {
    const steps = [...document.querySelectorAll(".voa-beat .voa-step")];
    const c = (el) => { const r = el.getBoundingClientRect(); return r.top + scrollY + r.height / 2 - h / 2; };
    return { from: c(steps[i]), to: c(steps[i + 1]) };
  },
  { i: MORPH_STEP, h: H }
);
const span = to - from;

const scrollTo = async (y) => { await page.evaluate((yy) => scrollTo(0, yy), y); await page.waitForTimeout(250); };
const u = () => page.evaluate(() => parseFloat(document.querySelector(".voa-beat .voa-scrubber").dataset.u));
const ticks = () => page.evaluate(() =>
  [...document.querySelector(".voa-beat").querySelectorAll(".pb-axis-x .tick")].map((t) => {
    // Compare rounded px: a tween-written transform and a directly-set one
    // format the same position differently.
    const x = parseFloat(t.getAttribute("transform").match(/translate\(([-\d.]+)/)[1]);
    return [t.textContent, Math.round(x * 10) / 10];
  })
);
// Hover the bar column under age slot 40, then report whether a tooltip shows.
async function hoverTooltip() {
  const box = await page.evaluate(() => {
    const hits = [...document.querySelectorAll(".voa-beat rect.pb-hit")];
    const r = hits[22].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y + 5);
  await page.mouse.move(box.x, box.y);
  await page.waitForTimeout(100);
  const txt = await page.evaluate(() => document.querySelector(".voa-tooltip")?.textContent ?? null);
  await page.mouse.move(5, 5);
  return txt;
}

let fail = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); if (!ok) fail++; };

await scrollTo(from - span * 0.3);
const u0 = await u();
const t2024 = await ticks();
const tip2024 = await hoverTooltip();
check(u0 === 0 && tip2024?.includes("2024"), `rest 2024 (u=${u0}): tooltip shows 2024 -> ${tip2024?.slice(0, 40)}`);

await scrollTo(from + span * 0.5);
const uMid = await u();
const tipMid = await hoverTooltip();
check(uMid > 0 && uMid < 1 && tipMid === null, `mid-morph (u=${uMid.toFixed(2)}): no tooltip -> ${tipMid}`);

await scrollTo(to + span * 0.3);
const u1 = await u();
const t2022 = await ticks();
const tip2022 = await hoverTooltip();
check(u1 === 1 && tip2022?.includes("2022"), `rest 2022 (u=${u1}): tooltip shows 2022 -> ${tip2022?.slice(0, 40)}`);
check(tip2022?.includes("Age 38"), "2022 tooltip on slot 40... bar there is the 2024 age-40 cohort, i.e. 2022 age 38");
check(JSON.stringify(t2024) === JSON.stringify(t2022), `axis ticks identical 2024 vs 2022\n  2024: ${JSON.stringify(t2024)}\n  2022: ${JSON.stringify(t2022)}`);

await browser.close();
process.exit(fail ? 1 : 0);
