import { test, expect, type Page } from "@playwright/test";

// Actors confirmed present in the bundled default slice
// (src/2026/UsualSuspects/defaultActors.json) at spec-writing time, so these
// tests resolve on the first paint and don't need to wait for the ~3MB full
// pool to load in the background. If a future regeneration of that file
// drops one of these actors, re-pick a replacement from the current slice
// rather than waiting out the full-pool fetch in every run.
//
// Deep links key on IMDb nconst, not the pool's numeric ids - those are
// positional and get reshuffled by any regeneration (see App.tsx). This
// constant used to be `= 49` and had to be re-pinned every time the pool
// was rebuilt; nm0000158 is Tom Hanks permanently.
const TOM_HANKS_NCONST = "nm0000158";
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

// Beeswarm-packed nodes deliberately overlap (their hit-radius is padded up
// to a real touch-target minimum even when the visible avatar is smaller -
// see ActorNode.tsx), so a plain leftmost/rightmost pick can land on a node
// whose *own* bounding-box center is actually covered by a different,
// later-painted node's hit circle - clicking there opens that other node's
// card, not the one the test thinks it clicked. This confirms each
// candidate's own center point via elementFromPoint before trusting it, so
// tests that need two specific, distinct, reliably-clickable actors don't
// flake on an overlap coin-flip.
async function leftmostAndRightmostClickable(page: Page) {
  const clickable = await page.locator(".tus-node").evaluateAll((nodes) =>
    nodes
      .map((n, i) => {
        const r = n.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { i, x: r.x, ownsCenter: !!top && (top === n || n.contains(top)) };
      })
      .filter((n) => n.ownsCenter),
  );
  const left = clickable.reduce((best, n) => (n.x < best.x ? n : best));
  const right = clickable.reduce((best, n) => (n.x > best.x ? n : best));
  return { left: page.locator(".tus-node").nth(left.i), right: page.locator(".tus-node").nth(right.i) };
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

  // Regression for the old full-viewport backdrop <div>: it sat above the
  // chart to catch outside clicks, so a click on a *different* node hit the
  // backdrop first and only closed the open card - opening the new one took
  // a second click. Now a capture-phase document listener (DetailCard.tsx)
  // lets that same click keep going to the node underneath, so one click on
  // a different actor should swap the card directly.
  test("clicking a different node swaps the open card in one click", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    const { left: node0, right: node1 } = await leftmostAndRightmostClickable(page);
    await node0.click({ force: true });
    await page.waitForTimeout(300);
    const firstName = await page.locator(".tus-card-name").textContent();

    await node1.click({ force: true });
    await page.waitForTimeout(300);
    const secondName = await page.locator(".tus-card-name").textContent();
    const node1Label = await node1.getAttribute("aria-label");

    expect(secondName).not.toBe(firstName);
    expect(node1Label).toContain(secondName!);
    await expect(page.locator(".tus-card")).toHaveCount(1); // never fully closed in between
    await page.close();
  });

  // Fast path for confident exploration: double-click skips the card and
  // jumps straight to centering. Single click's meaning is untouched (still
  // just opens the card) - see ActorNode.tsx.
  test("double-clicking a node recenters on them directly", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    const { left: node } = await leftmostAndRightmostClickable(page);
    const label = await node.getAttribute("aria-label");
    const name = label!.replace(" - open details", "");

    await node.dblclick({ force: true });
    await page.waitForTimeout(600);
    await expect(page.locator(".tus-root-name")).toHaveText(name);
    await expect(page.locator(".tus-card")).toHaveCount(0);
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

  test("deep link ?actor=<nconst> renders that actor and survives a reload", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto(`/2026/UsualSuspects?actor=${TOM_HANKS_NCONST}`);
    await page.waitForSelector(".tus-node");
    await expect(page.locator(".tus-root-name")).toHaveText("Tom Hanks");

    await page.reload();
    await page.waitForSelector(".tus-node");
    await expect(page.locator(".tus-root-name")).toHaveText("Tom Hanks");
    await page.close();
  });

  // Covers both ways a link can be unusable, since the fix that moved this
  // param from numeric ids to nconst turned every previously-shared link into
  // the first case.
  for (const [label, value] of [
    ["a legacy numeric id", "39"],
    ["an unknown nconst", "nm9999999"],
  ] as const) {
    test(`?actor= with ${label} falls back to a real actor and scrubs the URL`, async ({ browser }) => {
      const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
      await page.goto(`/2026/UsualSuspects?actor=${value}`);
      await page.waitForSelector(".tus-node");
      // Fell back to somebody real rather than rendering an empty chart...
      await expect(page.locator(".tus-root-name")).not.toHaveText("");
      // ...and the dead param is gone, so a reload doesn't repeat the dead end.
      await expect.poll(() => new URL(page.url()).searchParams.get("actor")).toBeNull();
      await page.close();
    });
  }

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
