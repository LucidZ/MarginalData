// Smoke test for the I-70 widgets hub and the flow-vs-speed widget.
// Run with: BASE_URL=http://localhost:<port> node tests/i70-flow-vs-speed-smoke.mjs
//
// At 1000px and 390px: hub lists every widget, the widget animates (canvas
// pixels change between frames), the tally climbs, Pause freezes the canvas,
// and the flow slider resets the tally. Then the two-counter widget animates
// and its A/B tallies match, and the daily-vs-peak scatter draws and
// follows the counter switch, and the brake-wave sim responds to its levers.
// Fails on console errors.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, msg) => {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await chromium.launch();
for (const [name, viewport] of [
  ["desktop", { width: 1000, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  console.log(name);
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto(`${BASE}/2026/I70Widgets`);
  await page.waitForSelector(".i70w-card");
  const cards = await page.locator(".i70w-card").count();
  check(cards >= 3, `hub lists ${cards} widgets`);
  await page.screenshot({ path: `${OUT}/i70-widgets-hub-${name}.png`, fullPage: true });

  await page.locator('.i70w-card[href$="/FlowVsSpeed"]').click();
  await page.waitForSelector("canvas");
  const snap = () => page.locator("canvas").evaluate((c) => c.toDataURL());
  const tally = async () => Number(await page.locator(".i70w-tally strong").textContent());

  const a = await snap();
  await page.waitForTimeout(500);
  const b = await snap();
  check(a !== b, "canvas animates");
  await page.waitForTimeout(2500);
  const t1 = await tally();
  check(t1 >= 1, `tally climbs (${t1})`);
  await page.screenshot({ path: `${OUT}/i70-flow-vs-speed-${name}.png`, fullPage: true });

  await page.getByRole("button", { name: "Pause" }).click();
  await page.waitForTimeout(100);
  const p1 = await snap();
  await page.waitForTimeout(400);
  check(p1 === (await snap()), "pause freezes the canvas");
  await page.getByRole("button", { name: "Play" }).click();

  await page.locator(".i70w-flow input").fill("900");
  await page.waitForTimeout(100);
  check((await tally()) <= 1, "changing the flow resets the tally");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, "no horizontal scroll");

  // Two counters: animates, 20x fast-forward climbs the tally quickly.
  await page.goto(`${BASE}/2026/I70Widgets/TwoCounters`);
  await page.waitForSelector("canvas");
  const c1 = await snap();
  await page.waitForTimeout(500);
  check(c1 !== (await snap()), "two counters: canvas animates");
  await page.getByRole("button", { name: "20×" }).click();
  await page.waitForTimeout(3000);
  const ab = await page.locator(".i70w-tally strong").allTextContents();
  check(Number(ab[0]) >= 20 && ab[0] === ab[1], `two counters: A and B tally match at 20x (${ab.join(", ")})`);
  await page.screenshot({ path: `${OUT}/i70-two-counters-${name}.png`, fullPage: true });
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow2, "two counters: no horizontal scroll");

  // Daily vs peak: scatter draws, switching counter redraws, a note counts the days.
  await page.goto(`${BASE}/2026/I70Widgets/DailyVsPeak`);
  await page.waitForSelector("canvas");
  await page.waitForFunction(() => /\d+ days at/.test(document.querySelector(".i70w-note")?.textContent ?? ""));
  const s1 = await snap();
  await page.getByRole("button", { name: "Eisenhower Tunnel" }).click();
  await page.waitForTimeout(200);
  check(s1 !== (await snap()), "daily vs peak: switching counter redraws");
  const note = await page.locator(".i70w-note").textContent();
  check(/Eisenhower Tunnel/.test(note ?? ""), "daily vs peak: note follows the counter");
  // Capacity band: per direction, hidden for both ways and for Berthoud.
  const capAttr = () => page.locator("canvas").getAttribute("data-capacity");
  const capNote = () => page.locator(".i70w-cap-note").textContent();
  const slowAttr = () => page.locator("canvas").getAttribute("data-slowdown");
  check((await capAttr()) === "2430-2630" && /^Red band:.*Pale band:/.test(await capNote()), "daily vs peak: Tunnel westbound band");
  check((await slowAttr()) === "1500-1620", "daily vs peak: Tunnel westbound slowdown");
  await page.getByRole("button", { name: "Eastbound" }).click();
  check((await capAttr()) === "2400-2850" && (await slowAttr()) === "2070-2460", "daily vs peak: Tunnel eastbound bands");
  await page.screenshot({ path: `${OUT}/i70-daily-vs-peak-eb-${name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Both ways" }).click();
  check((await capAttr()) === "" && (await slowAttr()) === "" && /per direction/.test(await capNote()), "daily vs peak: no bands for both ways");
  await page.getByRole("button", { name: "Westbound" }).click();
  await page.getByRole("button", { name: "Berthoud Pass" }).click();
  check((await capAttr()) === "" && /no red band/.test(await capNote()), "daily vs peak: no band at Berthoud");
  await page.getByRole("button", { name: "Twin Tunnels" }).click();
  check((await capAttr()) === "3420-3570" && (await slowAttr()) === "2660-2780" && /express lanes/.test(await capNote()), "daily vs peak: Twin bands + lane note");
  await page.getByRole("button", { name: "Eisenhower Tunnel" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/i70-daily-vs-peak-${name}.png`, fullPage: true });
  const overflow3 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow3, "daily vs peak: no horizontal scroll");
  // Brake wave: animates, the following gap caps flow, extreme reaction warns.
  await page.goto(`${BASE}/2026/I70Widgets/BrakeWave`);
  await page.waitForSelector("canvas");
  const w1 = await snap();
  await page.waitForTimeout(500);
  check(w1 !== (await snap()), "brake wave: canvas animates");
  await page.getByRole("button", { name: "5×" }).click();
  await page.getByRole("button", { name: "Tap the brakes" }).click();
  await page.getByRole("slider", { name: "Following gap" }).fill("3");
  await page.getByRole("button", { name: "Restart" }).click();
  await page.waitForTimeout(3000);
  const flowCol = async () =>
    (await page.locator(".i70w-table td:nth-child(3)").allTextContents()).map((t) => Number(t.replace(/,/g, "")));
  const flows = await flowCol();
  check(flows[0] >= 600 && flows[0] <= 840, `brake wave: top lane carries its arrivals (${flows[0]}/hr)`);
  check(flows[9] <= 1250, `brake wave: a 3 s gap caps the bottom lane (${flows[9]}/hr)`);
  await page.getByRole("button", { name: "Reset levers" }).click();
  await page.getByRole("button", { name: "Restart" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/i70-brake-wave-${name}.png`, fullPage: true });
  await page.getByRole("slider", { name: "Reaction time" }).fill("2");
  await page.waitForSelector(".i70w-warn", { timeout: 20000 });
  check(true, "brake wave: extreme reaction time shows the model warning");
  const overflow4 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow4, "brake wave: no horizontal scroll");
  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.close();
}
await browser.close();

if (failures.length) {
  console.log(`\n${failures.length} failure(s)`);
  process.exit(1);
}
console.log("\nall checks passed");
