import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "tests/screenshots";
mkdirSync(OUT, { recursive: true });

// Returns the ElementHandle for the beat <section>, scrolled so step
// stepIndex (of stepCount) is centered. All four beats stay mounted at
// once (the scrolly pattern doesn't unmount off-screen beats), so a
// page-wide `page.$(...)` grabs the first match in DOM order - usually
// an off-screen Beat1 element - rather than the one actually on screen.
// Every hit-target query below goes through this section handle instead.
async function scrollBeatToStep(page, titleIncludes, stepIndex, stepCount) {
  const sectionHandle = await page.evaluateHandle((t) => {
    const titles = [...document.querySelectorAll(".voa-beat-title")];
    const title = titles.find((el) => el.textContent.includes(t));
    return title.closest(".voa-beat");
  }, titleIncludes);
  const box = await sectionHandle.evaluate((section) => {
    const rect = section.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: section.scrollHeight };
  });
  const viewportH = 900;
  const scrollable = box.height - viewportH;
  const frac = (stepIndex + 0.5) / stepCount;
  await page.evaluate((y) => window.scrollTo(0, y), box.top + scrollable * frac);
  await page.waitForTimeout(500);
  return sectionHandle;
}

// ---- Mouse hover test (desktop) ----
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  await page.goto("http://localhost:4321/2026/VoterAge/", { waitUntil: "networkidle" });
  await page.waitForSelector(".voa-root h1");

  // Beat1 step 4 (full reveal, count callout) - hover an age bar
  let section = await scrollBeatToStep(page, "shape of the electorate", 4, 5);
  const hit = await section.$("rect.pb-hit");
  const box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.move(box.x + box.width / 2 + 1, box.y + box.height / 2 + 1); // ensure move fires
  await page.waitForTimeout(200);
  const tooltipVisible = await page.$(".voa-tooltip");
  console.log("Beat1 (age bars) hover tooltip appeared:", !!tooltipVisible);
  if (tooltipVisible) await page.screenshot({ path: `${OUT}/tooltip-beat1-hover.png` });

  // move mouse away, tooltip should disappear (non-touch clears on leave)
  await page.mouse.move(10, 10);
  await page.waitForTimeout(200);
  const goneAfterLeave = await page.$(".voa-tooltip");
  console.log("Beat1 tooltip cleared after mouse leave:", !goneAfterLeave);

  // Beat3 category bar hover (education panel, step 1)
  section = await scrollBeatToStep(page, "isn't only about age", 1, 4);
  const catHit = await section.$("rect.pb-hit");
  const cbox = await catHit.boundingBox();
  await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
  await page.waitForTimeout(200);
  const catTooltip = await page.$(".voa-tooltip");
  console.log("Beat3 (category bars) hover tooltip appeared:", !!catTooltip);
  if (catTooltip) await page.screenshot({ path: `${OUT}/tooltip-beat3-hover.png` });

  // Beat4 ColoradoDots hover
  section = await scrollBeatToStep(page, "Does anything change", 0, 5);
  const dotHit = await section.$("rect.cd-hit");
  if (dotHit) {
    const dbox = await dotHit.boundingBox();
    await page.mouse.move(dbox.x + dbox.width / 2, dbox.y + dbox.height / 2);
    await page.waitForTimeout(200);
    const dotTooltip = await page.$(".voa-tooltip");
    console.log("Beat4 (ColoradoDots) hover tooltip appeared:", !!dotTooltip);
    if (dotTooltip) await page.screenshot({ path: `${OUT}/tooltip-beat4-hover.png` });
  } else {
    console.log("ColoradoDots hit target NOT FOUND");
  }

  await browser.close();
}

// ---- Touch tap test (mobile emulation) ----
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto("http://localhost:4321/2026/VoterAge/", { waitUntil: "networkidle" });
  await page.waitForSelector(".voa-root h1");

  const section = await scrollBeatToStep(page, "shape of the electorate", 4, 5);
  const hit = await section.$("rect.pb-hit");
  const box = await hit.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const tapTooltip = await page.$(".voa-tooltip");
  console.log("Beat1 TAP tooltip appeared:", !!tapTooltip);
  if (tapTooltip) await page.screenshot({ path: `${OUT}/tooltip-beat1-tap.png` });

  // Tap elsewhere on the chart surface (the legend row, not a bar).
  // Chromium synthesizes a compatibility mousemove at the new tap point,
  // which fires a real mouseleave on the previously-hovered bar - so the
  // tooltip is expected to clear here, same as a mouse pointer moving off
  // a hovered mark. This is a legitimate "tap away to dismiss" pattern,
  // not a bug.
  const surface = await section.$(".voa-chart-surface");
  const sbox = await surface.boundingBox();
  await page.touchscreen.tap(sbox.x + 5, sbox.y + 5);
  await page.waitForTimeout(300);
  const clearedOnBackgroundTap = !(await page.$(".voa-tooltip"));
  console.log("Beat1 tooltip cleared after tapping chart background (expected: true):", clearedOnBackgroundTap);

  await browser.close();
}
