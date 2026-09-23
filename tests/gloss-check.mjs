// Checks the Gloss popover ("eligible" in VoterAge step 1) on desktop and
// mobile: hover-peek + click-pin with a mouse, tap-toggle + outside-tap and
// scroll dismissal on touch. Run with: node tests/gloss-check.mjs
// (dev server must be running).
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:4321";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const errors = [];
let failed = false;
function check(label, ok) {
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) failed = true;
}

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/2026/VoterAge/`, { waitUntil: "networkidle" });
  const term = page.locator("button.gloss-term", { hasText: "eligible" }).first();
  await term.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  return { ctx, page, term };
}
const popover = (page) => page.locator(".footnote-popover");

async function inViewport(page) {
  return page.locator(".footnote-popover").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  });
}

console.log("desktop (mouse):");
{
  const { ctx, page, term } = await open({ viewport: { width: 1200, height: 850 } });
  await term.hover();
  await page.waitForTimeout(100);
  check("hover opens popover", await popover(page).isVisible());
  check("popover lists 5 exclusions", (await page.locator(".gloss-list-item").count()) === 5);
  check("popover fully on screen", await inViewport(page));
  await page.screenshot({ path: `${OUT}/gloss-desktop-hover.png` });
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  check("mouse leave closes it", !(await popover(page).isVisible()));
  await term.click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(300);
  check("click pins it open past mouse leave", await popover(page).isVisible());
  await page.mouse.click(5, 400);
  await page.waitForTimeout(100);
  check("click outside closes it", !(await popover(page).isVisible()));
  await term.focus();
  await page.keyboard.press("Enter");
  check("Enter opens it", await popover(page).isVisible());
  await page.keyboard.press("Escape");
  check("Escape closes it", !(await popover(page).isVisible()));
  await ctx.close();
}

for (const [name, device] of [
  ["iPhone 13", devices["iPhone 13"]],
  ["iPhone SE", devices["iPhone SE"]],
]) {
  console.log(`mobile (${name}, touch):`);
  const { ctx, page, term } = await open({ ...device });
  await term.tap();
  await page.waitForTimeout(150);
  check("tap opens popover", await popover(page).isVisible());
  check("popover fully on screen", await inViewport(page));
  await page.screenshot({ path: `${OUT}/gloss-${name.replace(" ", "-")}-open.png` });
  await term.tap();
  await page.waitForTimeout(100);
  check("second tap closes it", !(await popover(page).isVisible()));
  await term.tap();
  await page.touchscreen.tap(10, device.viewport.height - 40);
  await page.waitForTimeout(100);
  check("tap outside closes it", !(await popover(page).isVisible()));
  await term.tap();
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(200);
  check("scrolling away closes it", !(await popover(page).isVisible()));

  // Term near the bottom of the screen: popover must flip above.
  await term.evaluate((el) => {
    const y = el.getBoundingClientRect().top + scrollY - innerHeight + 60;
    scrollTo(0, y);
  });
  await page.waitForTimeout(300);
  await term.tap();
  await page.waitForTimeout(150);
  check("near bottom: flips above, still on screen", await inViewport(page));
  await page.screenshot({ path: `${OUT}/gloss-${name.replace(" ", "-")}-flip.png` });
  await ctx.close();
}

await browser.close();
if (errors.length) console.log("console/page errors:", errors);
process.exit(failed || errors.length ? 1 : 0);
