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
// The two busiest charts in the pool (351 and 196 nodes respectively at
// spec-writing time) - the clickability regression below deliberately
// targets the densest packing, not an easy case.
const KEANU_REEVES = "Keanu Reeves";
const SAMUEL_L_JACKSON = "Samuel L. Jackson";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 800 }; // iPhone-ish, no device emulation needed for these checks

async function selectActor(page: Page, name: string) {
  await page.fill(".tus-search-input", "");
  await page.fill(".tus-search-input", name);
  await page.waitForTimeout(400); // client-side substring filter, no network round trip to wait on
  await page.locator(`.tus-search-results button:has-text("${name}")`).first().click();
  await page.waitForTimeout(600); // beeswarm re-layout (d3-force settles synchronously, but give React a paint)
}

// Every node now owns its own hit-testing center (App.tsx's nearest-center
// overlay + ActorNode.tsx's own-radius hit circle replaced the old inflated
// touch-target circle that used to blanket neighboring nodes), so a plain
// leftmost/rightmost bounding-box pick is reliable without the
// elementFromPoint dance this used to need - see "in-view nodes are
// clickable at their own center" below for the regression test that
// actually verifies that claim, rather than just assuming it here.
async function leftmostAndRightmostClickable(page: Page) {
  const boxes = await page.locator(".tus-node").evaluateAll((nodes) =>
    nodes.map((n) => n.getBoundingClientRect().x),
  );
  const left = boxes.reduce((best, x, i) => (x < boxes[best] ? i : best), 0);
  const right = boxes.reduce((best, x, i) => (x > boxes[best] ? i : best), 0);
  return { left: page.locator(".tus-node").nth(left), right: page.locator(".tus-node").nth(right) };
}

test.describe("The Usual Suspects", () => {
  // Regression for the inflated-hit-circle bug: the old per-node touch
  // target (padded up to a fixed 44px minimum) was routinely larger than
  // the gap between packed avatars, so whichever node painted on top
  // absorbed clicks aimed at its neighbors - measured at spec-writing time
  // as 66-89% of in-view nodes unreachable at their own center, across
  // these same two actors and viewports. Fixed by sizing each node's own
  // hit circle to its visible radius (so same-size discs can never reach
  // past packColumn's forceCollide-guaranteed center spacing) plus a
  // nearest-center overlay behind the chart for clicks that land in the
  // gaps (see resolveNearestNode in App.tsx). This asserts the *result*
  // (does a click at a node's own center open that node's card) rather
  // than the mechanism, so it stays meaningful even if the implementation
  // changes again.
  for (const [name, viewport] of [
    [KEANU_REEVES, DESKTOP],
    [KEANU_REEVES, MOBILE],
    [SAMUEL_L_JACKSON, DESKTOP],
    [SAMUEL_L_JACKSON, MOBILE],
  ] as const) {
    test(`${name} at ${viewport.width}px: in-view nodes are clickable at their own center`, async ({ browser }) => {
      const page = await (await browser.newContext({ viewport })).newPage();
      await page.goto("/2026/UsualSuspects");
      await selectActor(page, name);

      const result = await page.evaluate((vp) => {
        const nodes = [...document.querySelectorAll(".tus-node")];
        let inView = 0;
        let owned = 0;
        for (const n of nodes) {
          const r = n.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          if (cx < 0 || cy < 0 || cx > vp.width || cy > vp.height) continue;
          inView++;
          const top = document.elementFromPoint(cx, cy);
          if (top && (top === n || n.contains(top))) owned++;
        }
        return { inView, owned };
      }, viewport);

      expect(result.inView, "expected a non-trivial in-view sample").toBeGreaterThan(20);
      const pct = result.owned / result.inView;
      expect(pct, `${result.owned}/${result.inView} in-view nodes owned their own center`).toBeGreaterThanOrEqual(
        0.95,
      );
      await page.close();
    });
  }

  // Complements the percentage check above by verifying the *mechanism*
  // directly: a click that lands strictly outside every node's own painted
  // circle should still resolve to whichever node is genuinely nearest
  // (App.tsx's resolveNearestNode, behind the chart), not silently do
  // nothing and not grab some other node further away. Derives its
  // expectations from the real rendered DOM rather than pinning specific
  // coordinates, so it isn't tied to one actor's exact packing.
  test("clicking in the gap between avatars resolves to the nearest one", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, KEANU_REEVES); // densest column in the pool - plenty of narrow gaps to sample
    // Wait out the background full-pool fetch (App.tsx: `data ?? defaultActors`)
    // before snapshotting node positions below - if it lands mid-test, the
    // swap re-buckets/re-packs the chart and every position captured before
    // it would go stale under the clicks issued after it. networkidle alone
    // isn't quite enough - it only tracks the HTTP request finishing, not
    // the JSON parse + React re-render + d3-force re-layout that follows it
    // - so poll for the root's own "N costars" figure (which only reflects
    // the full pool's real total, not the bundled slice's) to stop changing
    // before treating the layout as settled.
    await page.waitForLoadState("networkidle");
    let previousMeta = await page.locator(".tus-root-meta").textContent();
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(200);
      const currentMeta = await page.locator(".tus-root-meta").textContent();
      if (currentMeta === previousMeta) break;
      previousMeta = currentMeta;
    }

    const { nodes, minMatchRadiusPx } = await page.evaluate(() => {
      const svg = document.querySelector(".tus-graph") as SVGSVGElement;
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      // Mirrors App.tsx's MIN_MATCH_RADIUS (viewBox units) - converted to
      // CSS px via the svg's own uniform scale, same as the app does.
      const MIN_MATCH_RADIUS_VIEWBOX_UNITS = 24;
      const nodeEls = [...document.querySelectorAll(".tus-node")];
      const nodeList = nodeEls.map((n) => {
        const r = n.getBoundingClientRect();
        return {
          label: n.getAttribute("aria-label")!.replace(" - open details", ""),
          cx: r.x + r.width / 2,
          cy: r.y + r.height / 2,
          r: r.width / 2,
        };
      });
      return { nodes: nodeList, minMatchRadiusPx: MIN_MATCH_RADIUS_VIEWBOX_UNITS * scale };
    });

    // Sample points just outside each node's own hit circle in each of the
    // four cardinal directions - genuine "gap" clicks, filtered to ones that
    // don't happen to fall inside some *other* node's own circle instead.
    // Rounded to integer CSS px immediately: page.mouse.click ultimately
    // dispatches a real (integer-pixel) mouse event, so predicting off
    // fractional coordinates and then clicking the rounded version can
    // silently target a different pixel than the one just evaluated.
    const candidates: { x: number; y: number }[] = [];
    for (const n of nodes) {
      for (const [dx, dy] of [
        [n.r + 3, 0],
        [-(n.r + 3), 0],
        [0, n.r + 3],
        [0, -(n.r + 3)],
      ]) {
        const x = Math.round(n.cx + dx);
        const y = Math.round(n.cy + dy);
        if (nodes.every((m) => Math.hypot(m.cx - x, m.cy - y) > m.r)) candidates.push({ x, y });
      }
    }
    expect(candidates.length, "expected genuine gap points in this dense column").toBeGreaterThan(3);

    let checked = 0;
    for (const { x, y } of candidates.slice(0, 15)) {
      // Full sorted distances, not just the minimum - a point can be a
      // legitimate "gap" (outside every node's own circle) while still
      // sitting almost exactly between two nodes. Densely packed avatars
      // put real candidates within a couple of CSS px of a tie there, and
      // resolveNearestNode's own real-world behavior on such a point is
      // legitimately sensitive to the exact pixel a mouse event rounds to
      // - not a bug, just not a fair assertion to pin down. Skipping
      // anything under a safety margin keeps this test asserting on points
      // an actual nearest-neighbor call has no reasonable ambiguity about.
      const sorted = nodes
        .map((n) => ({ n, d: Math.hypot(n.cx - x, n.cy - y) }))
        .sort((a, b) => a.d - b.d);
      const [nearest, second] = sorted;
      if (nearest.d > Math.max(nearest.n.r, minMatchRadiusPx)) continue; // outside the overlay's catch radius here
      const TIE_MARGIN_PX = 3;
      if (second && second.d - nearest.d < TIE_MARGIN_PX) continue; // too close to call - see comment above

      await page.mouse.click(x, y);
      await page.waitForTimeout(150);
      await expect(page.locator(".tus-card-name"), `click at (${x}, ${y})`).toHaveText(nearest.n.label);
      checked++;
    }
    expect(checked, "none of the sampled gap points fell within the overlay's catch radius").toBeGreaterThan(0);
    await page.close();
  });

  test("clicking in empty space past the last column closes an open card without opening a new one", async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    await page.locator(".tus-node").first().click();
    await expect(page.locator(".tus-card")).toHaveCount(1);

    const svgBox = await page.locator(".tus-graph").boundingBox();
    // 20px in from the svg's own right edge - inside the chart's reserved
    // sideMargin buffer (>=78px even at the lowest allowed render scale),
    // so this lands well past every column's real content while still
    // being a click *on* the chart's nearest-center overlay, not off it.
    await page.mouse.click(svgBox!.x + svgBox!.width - 20, svgBox!.y + svgBox!.height / 2);
    await page.waitForTimeout(200);

    await expect(page.locator(".tus-card")).toHaveCount(0);
    await page.close();
  });

  // Hover readout (App.tsx): replaces the old ~1s-delayed native <title>
  // tooltip as the fast way to read a name while sweeping the mouse across
  // a dense column, without requiring a click. Covers the three things that
  // sank the *previous* hover tooltip (see its removal note in App.css) -
  // this one must not repeat any of them.
  test("hovering a node shows its name without a click, and clears on pointer leave", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    await expect(page.locator(".tus-hover-label-text")).toHaveCount(0);

    const node = page.locator(".tus-node").first();
    const box = await node.boundingBox();
    const label = (await node.getAttribute("aria-label"))!.replace(" - open details", "");
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.locator(".tus-hover-label-text")).toContainText(label);
    // No click happened - hovering alone must not have opened the card.
    await expect(page.locator(".tus-card")).toHaveCount(0);

    await page.mouse.move(5, 5); // off the chart entirely
    await expect(page.locator(".tus-hover-label-text")).toHaveCount(0);
    await page.close();
  });

  // The old tooltip's fatal flaw was chasing the cursor and sitting *over*
  // its own node, so a click meant for the avatar hit the tooltip instead.
  // This one is anchored beside its node, not over it (see its comment in
  // App.tsx), so there's no node "underneath" it to reclaim - the thing to
  // actually verify is that its own painted rect/text never become the
  // click target in the first place (pointerEvents="none"), letting every
  // click pass straight through to whatever real, interactive thing (a
  // node's hit circle, or the background overlay) is really there.
  test("the hover label's own elements never absorb a click", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    const node = page.locator(".tus-node").first();
    const box = await node.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(page.locator(".tus-hover-label-text")).toHaveCount(1);

    const labelBox = await page.locator(".tus-hover-label-bg").boundingBox();
    const hitsLabel = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return !!el?.closest(".tus-hover-label-bg, .tus-hover-label-text");
      },
      { x: labelBox!.x + labelBox!.width / 2, y: labelBox!.y + labelBox!.height / 2 },
    );
    expect(hitsLabel, "a point inside the label's own rendered box resolved to the label itself").toBe(false);
    await page.close();
  });

  test("hover label never appears on a touch-only context", async ({ browser }) => {
    const context = await browser.newContext({ viewport: MOBILE, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);

    // Real touch input has no hover concept and never fires pointermove
    // the way a mouse does, but some browsers still dispatch synthetic
    // pointer events around a tap - dispatch one directly with
    // pointerType "touch" so this asserts the media-query gate itself
    // (App.tsx's onGraphPointerMove), not just "nobody happened to move a
    // mouse in this test".
    const node = page.locator(".tus-node").first();
    const box = await node.boundingBox();
    await page.evaluate(
      ({ x, y }) => {
        const svg = document.querySelector(".tus-graph")!;
        svg.dispatchEvent(
          new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, pointerType: "touch" }),
        );
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    await page.waitForTimeout(200);
    await expect(page.locator(".tus-hover-label-text")).toHaveCount(0);
    await page.close();
  });

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
      await page.locator(".tus-node").nth(index).click();
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
    await node0.click();
    await page.waitForTimeout(300);
    const firstName = await page.locator(".tus-card-name").textContent();

    await node1.click();
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

    await node.dblclick();
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

  // SearchBox.tsx used to be a plain lowercased contiguous-substring match -
  // each case here is a real query that previously came back empty (or
  // badly ranked) against the shipped pool.
  test("search: finds names across a missing middle initial, an accent, and a dropped space", async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await page.waitForSelector(".tus-node");

    const search = async (q: string) => {
      await page.fill(".tus-search-input", "");
      await page.fill(".tus-search-input", q);
      await page.waitForTimeout(400);
      return page.locator(".tus-search-results [role=option]").allTextContents();
    };

    // Multi-token, order- and extra-word-insensitive: "Samuel L. Jackson"
    // has a middle initial between the two words actually typed.
    expect(await search("samuel jackson")).toContain("Samuel L. Jackson");
    // Diacritic-insensitive: typing a plain "e" still finds "Penélope".
    expect(await search("Penelope Cruz")).toContain("Penélope Cruz");
    // Collapsed fallback: "deniro" has no space for token-matching to
    // split on - the space it's missing is inside the name, not the query.
    expect(await search("deniro")).toContain("Robert De Niro");

    // Prefix matches outrank an interior substring match - "tom" used to
    // rank Marisa Tomei (a mid-word match) above real "Tom ___" names.
    const tomResults = await search("tom");
    const cruiseIndex = tomResults.indexOf("Tom Cruise");
    const hanksIndex = tomResults.indexOf("Tom Hanks");
    const tomeiIndex = tomResults.indexOf("Marisa Tomei");
    expect(cruiseIndex, "Tom Cruise should be in the results").toBeGreaterThanOrEqual(0);
    expect(hanksIndex, "Tom Hanks should be in the results").toBeGreaterThanOrEqual(0);
    if (tomeiIndex >= 0) {
      expect(tomeiIndex).toBeGreaterThan(cruiseIndex);
      expect(tomeiIndex).toBeGreaterThan(hanksIndex);
    }
    await page.close();
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

    await page.locator(".tus-node").first().click();
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
