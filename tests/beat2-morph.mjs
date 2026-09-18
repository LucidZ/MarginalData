// Verifies Beat 2's 2024->2022 morph is scroll-driven, not a step-boundary
// tween: intermediate states exist, reversing retraces them, and holding a
// position doesn't keep drifting toward an endpoint. See
// .claude/voter-age-scroll-morph-spec.md.
// Run with: BASE_URL=http://localhost:5183 node tests/beat2-morph.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:4321";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
await page.waitForSelector(".voa-root h1");

const box = await page.evaluate(() => {
  const titles = [...document.querySelectorAll(".voa-beat-title")];
  const t = titles.find((el) => el.textContent.includes("Midterms make it worse"));
  const section = t.closest(".voa-beat");
  const rect = section.getBoundingClientRect();
  return { top: rect.top + window.scrollY, height: section.scrollHeight };
});
const scrollable = box.height - 900;

// Span between step 0 and step 1's centers, in STEP_COUNT=3 units.
const START = box.top + scrollable * (0 / 3 + 0.5 / 3);
const END = box.top + scrollable * (1 / 3 + 0.5 / 3);

const N = 8;
const fracs = Array.from({ length: N }, (_, i) => i / (N - 1));

async function readMissingVotes() {
  const text = await page.locator(".pb-gap-summary strong").first().innerText();
  const m = text.match(/([\d.]+)M/);
  return m ? parseFloat(m[1]) : null;
}

async function scrollTo(frac) {
  const y = START + (END - START) * frac;
  await page.evaluate((y) => window.scrollTo(0, y), y);
}

// 1. Intermediate states exist and move monotonically between endpoints.
const ascending = [];
for (const f of fracs) {
  await scrollTo(f);
  await page.waitForTimeout(80);
  ascending.push(await readMissingVotes());
}
console.log("ascending:", ascending);

const startVal = ascending[0];
const endVal = ascending[ascending.length - 1];
if (startVal === endVal) {
  throw new Error(`FAIL: endpoints identical (${startVal}) - morph isn't happening`);
}
for (let i = 1; i < ascending.length; i++) {
  const rising = endVal > startVal;
  const ok = rising ? ascending[i] >= ascending[i - 1] - 0.05 : ascending[i] <= ascending[i - 1] + 0.05;
  if (!ok) throw new Error(`FAIL: non-monotonic at step ${i}: ${ascending[i - 1]} -> ${ascending[i]}`);
}
for (let i = 1; i < ascending.length - 1; i++) {
  const between =
    ascending[i] >= Math.min(startVal, endVal) - 0.05 && ascending[i] <= Math.max(startVal, endVal) + 0.05;
  if (!between) throw new Error(`FAIL: intermediate value ${ascending[i]} not between endpoints`);
}
console.log("PASS: intermediate states exist and are monotonic");

// 2. Reversibility - revisit descending, expect exact match.
const descending = [];
for (const f of [...fracs].reverse()) {
  await scrollTo(f);
  await page.waitForTimeout(80);
  descending.push(await readMissingVotes());
}
descending.reverse();
console.log("descending (re-ordered ascending):", descending);
for (let i = 0; i < ascending.length; i++) {
  if (Math.abs(ascending[i] - descending[i]) > 0.01) {
    throw new Error(`FAIL: reversal mismatch at index ${i}: ${ascending[i]} vs ${descending[i]}`);
  }
}
console.log("PASS: reversal retraces the same states");

// 3. Stability - hold a midpoint, confirm no drift after a long wait.
await scrollTo(0.5);
await page.waitForTimeout(200);
const immediate = await readMissingVotes();
await page.waitForTimeout(1500);
const held = await readMissingVotes();
if (immediate !== held) {
  throw new Error(`FAIL: value drifted while held: ${immediate} -> ${held}`);
}
console.log(`PASS: value stable while held (${held}M)`);

await browser.close();
console.log("all checks passed");
