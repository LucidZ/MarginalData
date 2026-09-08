import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

async function scrollBeatToStep(page, titleIncludes, stepIndex, stepCount) {
  const box = await page.evaluate((t) => {
    const titles = [...document.querySelectorAll(".voa-beat-title")];
    const title = titles.find((el) => el.textContent.includes(t));
    const section = title.closest(".voa-beat");
    const rect = section.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: section.scrollHeight };
  }, titleIncludes);
  const viewportH = 900;
  const scrollable = box.height - viewportH;
  const frac = (stepIndex + 0.5) / stepCount;
  await page.evaluate((y) => window.scrollTo(0, y), box.top + scrollable * frac);
  await page.waitForTimeout(500);
}

// ---- Mouse hover test (desktop) ----
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.goto("http://localhost:4321/2026/VoterAge/", { waitUntil: "networkidle" });
  await page.waitForSelector(".voa-root h1");

  // Beat1 step 6 (full reveal, gap mode) - hover a dot
  await scrollBeatToStep(page, "Turnout by age", 6, 8);
  const hit = await page.$(".voa-dot-hit");
  const box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1); // ensure move fires
  await page.waitForTimeout(200);
  const tooltipVisible = await page.$(".voa-tooltip");
  console.log("Beat1 hover tooltip appeared:", !!tooltipVisible);
  if (tooltipVisible) await page.screenshot({ path: `${OUT}/tooltip-beat1-hover.png` });

  // move mouse away, tooltip should disappear (non-touch clears on leave)
  await page.mouse.move(10, 10);
  await page.waitForTimeout(200);
  const goneAfterLeave = await page.$(".voa-tooltip");
  console.log("Beat1 tooltip cleared after mouse leave:", !goneAfterLeave);

  // Beat3 state grid tile hover
  await scrollBeatToStep(page, "varies by state", 0, 3);
  const tile = await page.$(".voa-tile");
  const tbox = await tile.boundingBox();
  await page.mouse.move(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await page.waitForTimeout(200);
  const gridTooltip = await page.$(".voa-tooltip");
  console.log("StateGrid hover tooltip appeared:", !!gridTooltip);
  if (gridTooltip) await page.screenshot({ path: `${OUT}/tooltip-stategrid-hover.png` });

  // MailTrend dot hover
  await scrollBeatToStep(page, "switched on, then off", 3, 4);
  const trendHit = await page.$(".voa-trend-hit-group .voa-dot-hit");
  if (trendHit) {
    const hbox = await trendHit.boundingBox();
    await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
    await page.waitForTimeout(200);
    const trendTooltip = await page.$(".voa-tooltip");
    console.log("MailTrend hover tooltip appeared:", !!trendTooltip);
    if (trendTooltip) await page.screenshot({ path: `${OUT}/tooltip-mailtrend-hover.png` });
  } else {
    console.log("MailTrend hit target NOT FOUND");
  }

  await browser.close();
}

// ---- Touch tap test (mobile emulation) ----
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto("http://localhost:4321/2026/VoterAge/", { waitUntil: "networkidle" });
  await page.waitForSelector(".voa-root h1");

  await scrollBeatToStep(page, "Turnout by age", 6, 8);
  const hit = await page.$(".voa-dot-hit");
  const box = await hit.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const tapTooltip = await page.$(".voa-tooltip");
  console.log("Beat1 TAP tooltip appeared:", !!tapTooltip);
  if (tapTooltip) await page.screenshot({ path: `${OUT}/tooltip-beat1-tap.png` });

  // tap elsewhere (not on a dot) - per convention, touch tooltip persists
  // until the next tap on a mark; verify it doesn't vanish from a generic
  // page tap (only from tapping a different mark) - tap the chart surface background
  const surface = await page.$(".voa-chart-surface");
  const sbox = await surface.boundingBox();
  await page.touchscreen.tap(sbox.x + 5, sbox.y + 5);
  await page.waitForTimeout(300);
  const stillThereOrGone = await page.$(".voa-tooltip");
  console.log("Beat1 tooltip after tapping chart background (expected: still present, no dot under tap):", !!stillThereOrGone);

  await browser.close();
}
