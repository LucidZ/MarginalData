// Smoke test for the I-70 Tunnel crossfilter explorer.
// Run with: BASE_URL=http://localhost:<port> node tests/i70-crossfilter-smoke.mjs
// (serve a build with `npx vite preview --port <port> --strictPort`).
//
// At 1000px and 390px: applies Saturday + Jan-Mar + snow overnight >= 4",
// screenshots each step, fails on console errors, checks every filter takes
// < 100 ms, and checks that filtering hours to 7-9 AM doesn't triple the
// day counts (the distinct-day reduce). Then Compare by + presets: groups
// partition the matching days, A/B gets a headline, one-line-per-year hover.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const BAR_LEFT = 34; // BarFilter left margin
const BAR_RIGHT = 4;
const HERO_LEFT = { desktop: 46, mobile: 38 };
const HERO_RIGHT = 12;
const LIMIT_MS = 100;

const failures = [];
const check = (ok, msg) => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch();

for (const width of [1000, 390]) {
  const tag = `i70x-${width}`;
  console.log(`\n== ${width}px`);
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const t0 = Date.now();
  await page.goto(`${BASE}/2026/I70Crossfilter`, { waitUntil: "networkidle" });
  await page.waitForSelector(".i70x-count-n", { timeout: 20000 });
  console.log(`  loaded + crossfilter built in ${Date.now() - t0} ms`);
  const total = await page.evaluate(() => window.__i70x.nMatched);
  console.log(`  days matching with no filters: ${total}`);
  await page.screenshot({ path: `${OUT}/${tag}-0-initial.png`, fullPage: true });

  const card = (title) => page.locator(".i70x-card", { has: page.locator("h3", { hasText: title }) }).first();

  // Click (or drag between) bins of a BarFilter.
  const pickBins = async (title, from, to = from) => {
    const svg = card(title).locator("svg");
    await svg.scrollIntoViewIfNeeded();
    const box = await svg.boundingBox();
    const n = await card(title).locator("text.i70x-tick").count(); // not exact; use label count from state
    void n;
    const nKeys = await page.evaluate((t) => {
      const map = { "Day of week": "dow", Month: "month", "Snow overnight (in)": "snowOvernight" };
      return window.__i70x.bars[map[t]].length;
    }, title);
    const step = (box.width - BAR_LEFT - BAR_RIGHT) / nKeys;
    const cx = (k) => box.x + BAR_LEFT + (k + 0.5) * step;
    const cy = box.y + 50;
    await page.mouse.move(cx(from), cy);
    await page.mouse.down();
    if (to !== from) await page.mouse.move(cx(to), cy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(50);
    return page.evaluate(() => ({ ms: window.__i70x.ms, n: window.__i70x.nMatched }));
  };

  let r = await pickBins("Day of week", 5); // Sat
  check(r.ms < LIMIT_MS, `Saturday filter took ${r.ms.toFixed(1)} ms -> ${r.n} days`);
  await page.screenshot({ path: `${OUT}/${tag}-1-saturday.png`, fullPage: true });

  r = await pickBins("Month", 0, 2); // Jan-Mar
  check(r.ms < LIMIT_MS, `Jan-Mar filter took ${r.ms.toFixed(1)} ms -> ${r.n} days`);

  r = await pickBins("Snow overnight (in)", 4, 7); // 4"+
  check(r.ms < LIMIT_MS, `snowOvernight >= 4" filter took ${r.ms.toFixed(1)} ms -> ${r.n} days`);
  await page.screenshot({ path: `${OUT}/${tag}-2-powder-saturdays.png`, fullPage: true });

  // Distinct-day check: hours 7-9 AM must not change any day count.
  const before = await page.evaluate(() => window.__i70x.bars.dow.map((b) => b.days));
  const hero = page.locator(".i70x-hero-svg");
  await hero.scrollIntoViewIfNeeded();
  const hb = await hero.boundingBox();
  const left = width < 600 ? HERO_LEFT.mobile : HERO_LEFT.desktop;
  const hstep = (hb.width - left - HERO_RIGHT) / 24;
  const hx = (h) => hb.x + left + (h + 0.5) * hstep;
  await page.mouse.move(hx(7), hb.y + 60);
  await page.mouse.down();
  await page.mouse.move(hx(9), hb.y + 60, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => ({ days: window.__i70x.bars.dow.map((b) => b.days), ms: window.__i70x.ms }));
  check(after.ms < LIMIT_MS, `hours 7-9 AM filter took ${after.ms.toFixed(1)} ms`);
  check(JSON.stringify(before) === JSON.stringify(after.days), `dow day counts unchanged by hour filter: ${before} vs ${after.days}`);
  await page.screenshot({ path: `${OUT}/${tag}-3-hours.png`, fullPage: true });

  // Direction toggle
  await page.getByRole("button", { name: "Eastbound" }).click();
  await page.waitForTimeout(50);
  const dirMs = await page.evaluate(() => window.__i70x.ms);
  check(dirMs < 400, `direction switch took ${dirMs.toFixed(1)} ms (rebuilds 2 dimensions)`);

  // Compare by: groups partition the matching days.
  const tableRows = () =>
    page.locator(".i70x-series-table tbody tr").evaluateAll((trs) =>
      trs.map((tr) => ({
        label: tr.cells[0].innerText.trim(),
        days: Number(tr.cells[1].innerText.replace(/,/g, "")),
      })),
    );
  await page.getByRole("button", { name: "Reset all filters" }).click();
  await page.locator(".i70x-compare select").selectOption("dow-each");
  await page.waitForTimeout(50);
  let rows = await tableRows();
  const nAll = await page.evaluate(() => window.__i70x.nMatched);
  const groupSum = rows.slice(1).reduce((t, r) => t + r.days, 0);
  check(rows.length === 8 && groupSum === nAll, `each-day groups (${rows.length - 1}) sum to matching days: ${groupSum} vs ${nAll}`);

  // Preset: A/B with a headline.
  await page.getByRole("button", { name: "Snowy vs clear winter weekends" }).click();
  await page.waitForTimeout(50);
  rows = await tableRows();
  const headline = await page.locator(".i70x-headline").innerText();
  const nScope = await page.evaluate(() => window.__i70x.nMatched);
  console.log(`  headline: ${headline}`);
  check(rows.length === 2 && rows[0].days + rows[1].days <= nScope, `snow A/B: ${rows.map((r) => r.days)} of ${nScope} days`);
  check(await page.locator(".i70x-chip.active").count() === 1, "preset chip shows active");
  await hero.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${tag}-4-snow-ab.png`, fullPage: true });

  // Preset: one line per year, hover highlights the nearest.
  await page.getByRole("button", { name: "Winter Saturdays, every year" }).click();
  await page.waitForTimeout(50);
  rows = await tableRows();
  check(rows.length >= 25, `every-year preset shows ${rows.length - 1} year lines`);
  await hero.scrollIntoViewIfNeeded();
  const hb3 = await hero.boundingBox();
  await page.mouse.move(hb3.x + left + 8.5 * hstep, hb3.y + 40);
  await page.waitForTimeout(50);
  const readout = await page.locator(".i70x-hero-chart .i70x-readout").innerText();
  console.log(`  readout: ${readout}`);
  check(/\d{4}/.test(readout) && readout.includes("All matching days"), "hovering picks a year line vs the scope average");
  await page.screenshot({ path: `${OUT}/${tag}-5-every-year.png`, fullPage: true });

  // A manual filter change drops the preset highlight; reset clears compare.
  await pickBins("Day of week", 6);
  check(await page.locator(".i70x-chip.active").count() === 0, "manual change clears preset chip");
  await page.getByRole("button", { name: "Reset all filters" }).click();
  check((await page.locator(".i70x-compare select").inputValue()) === "", "reset clears Compare by");

  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, "no horizontal page scroll");
  await page.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failure(s)` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
