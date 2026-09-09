import { test, expect, type Page } from "@playwright/test";

// Actor ids confirmed present in the bundled default slice
// (src/2026/UsualSuspects/defaultActors.json) at spec-writing time, so these
// tests resolve on the first paint and don't need to wait for the ~3MB full
// pool to load in the background. If a future regeneration of that file
// drops one of these actors, re-pick a replacement from the current slice
// rather than waiting out the full-pool fetch in every run.
const TOM_HANKS_ID = 49;
const MICHAEL_CAINE = "Michael Caine";
const ANUPAM_KHER = "Anupam Kher";
const BRUCE_WILLIS = "Bruce Willis";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 800 }; // iPhone-ish, no device emulation needed for these checks

async function selectActor(page: Page, name: string) {
  await page.fill(".tus-search-input", "");
  await page.fill(".tus-search-input", name);
  await page.waitForTimeout(400); // client-side substring filter, no network round trip to wait on
  await page.locator(`.tus-search-results button:has-text("${name}")`).first().click();
  await page.waitForTimeout(600); // beeswarm re-layout (d3-force settles synchronously, but give React a paint)
}

test.describe("The Usual Suspects", () => {
  test("axis header is visible above the fold on load, desktop and mobile", async ({ browser }) => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await page.goto("/2026/UsualSuspects");
      await page.waitForSelector(".tus-node");
      const axisLabel = page.locator(".tus-axis-label").first();
      await expect(axisLabel).toBeInViewport();
      await page.screenshot({ path: `tests/screenshots/usual-suspects-axis-${viewport.width}.png` });
      await page.close();
    }
  });

  test("chart bottom stays within the viewport on desktop", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);
    const box = await page.locator(".tus-graph").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(DESKTOP.height);
    await page.close();
  });

  test("page never scrolls horizontally, across breakpoints", async ({ browser }) => {
    for (const width of [1440, 1280, 1024, 768, 390]) {
      const height = width === 390 ? 800 : 900;
      const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
      await page.goto("/2026/UsualSuspects");
      await selectActor(page, MICHAEL_CAINE);
      const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflows, `page overflowed horizontally at ${width}px`).toBe(false);
      await page.close();
    }
  });

  test("empty columns collapse - Anupam Kher's chart stays narrow despite 11 empty gaps", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, ANUPAM_KHER);
    const scrollWidth = await page.evaluate(() => document.querySelector(".tus-graph-scroll")!.scrollWidth);
    // Pre-collapse this was 4094px; verifying it stays well under that rather
    // than pinning an exact number, since the pool can regenerate.
    expect(scrollWidth).toBeLessThan(2500);
    await page.close();
  });

  test("detail card stays fully on screen for nodes at every extreme", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    const boxes = await page.locator(".tus-node").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    const extremeIndices = {
      topmost: boxes.reduce((best, b, i) => (b.y < boxes[best].y ? i : best), 0),
      bottommost: boxes.reduce((best, b, i) => (b.y > boxes[best].y ? i : best), 0),
      leftmost: boxes.reduce((best, b, i) => (b.x < boxes[best].x ? i : best), 0),
      rightmost: boxes.reduce((best, b, i) => (b.x > boxes[best].x ? i : best), 0),
    };

    for (const [label, index] of Object.entries(extremeIndices)) {
      await page.locator(".tus-node").nth(index).click({ force: true });
      await page.waitForTimeout(300);
      const cardBox = await page.locator(".tus-card").boundingBox();
      expect(cardBox, `${label} node: no card opened`).not.toBeNull();
      expect(cardBox!.x, `${label}: card left edge off-screen`).toBeGreaterThanOrEqual(0);
      expect(cardBox!.y, `${label}: card top edge off-screen`).toBeGreaterThanOrEqual(0);
      expect(cardBox!.x + cardBox!.width, `${label}: card right edge off-screen`).toBeLessThanOrEqual(
        DESKTOP.width,
      );
      expect(cardBox!.y + cardBox!.height, `${label}: card bottom edge off-screen`).toBeLessThanOrEqual(
        DESKTOP.height,
      );
      await expect(page.locator(".tus-card-center")).toBeInViewport();
      await page.locator(".tus-card-close").click();
      await page.waitForTimeout(200);
    }
    await page.close();
  });

  test("search: ArrowDown + Enter selects the highlighted result", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await page.waitForSelector(".tus-node");

    await page.click(".tus-search-input");
    await page.fill(".tus-search-input", BRUCE_WILLIS);
    await page.waitForTimeout(400);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);

    await expect(page.locator(".tus-root-name")).toHaveText(BRUCE_WILLIS);
  });

  test("deep link ?actor=<id> renders that actor and survives a reload", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto(`/2026/UsualSuspects?actor=${TOM_HANKS_ID}`);
    await page.waitForSelector(".tus-node");
    await expect(page.locator(".tus-root-name")).toHaveText("Tom Hanks");

    await page.reload();
    await page.waitForSelector(".tus-node");
    await expect(page.locator(".tus-root-name")).toHaveText("Tom Hanks");
    await page.close();
  });

  test("Back walks through recenter history", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    await page.locator(".tus-node").first().click({ force: true });
    const first = await page.locator(".tus-card-name").textContent();
    await page.locator(".tus-card-center").click();
    await page.waitForTimeout(600);
    await expect(page.locator(".tus-root-name")).toHaveText(first!);

    await page.goBack();
    await page.waitForTimeout(400);
    await expect(page.locator(".tus-root-name")).toHaveText(MICHAEL_CAINE);
    await page.close();
  });
});
