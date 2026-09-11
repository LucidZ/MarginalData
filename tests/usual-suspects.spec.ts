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

/** Waits out the background full-pool fetch (App.tsx: `data ?? defaultActors`).
 * networkidle alone isn't enough - it only tracks the HTTP request finishing,
 * not the JSON parse + React re-render + d3-force re-layout that follows it -
 * so poll the context line's own costar figure, which only reflects the full
 * pool's real total, until it stops changing.
 *
 * Any test that captures coordinates and then clicks them needs this: the
 * swap re-buckets and re-packs the chart, invalidating every position taken
 * before it. That matters more since the axis flipped to descending, because
 * the column that grows most between the bundled slice and the full pool is
 * the 1-film crowd - which descending puts at the *right* edge, so the
 * chart's right-hand geometry is now the part that moves furthest when the
 * pool lands. */
async function waitForFullPool(page: Page) {
  await page.waitForLoadState("networkidle");
  let previous = await page.locator(".tus-context-meta").textContent();
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(200);
    const current = await page.locator(".tus-context-meta").textContent();
    if (current === previous) break;
    previous = current;
  }
}

/** Scrolls to the chart's densest end. The layout stacks rows with the
 * closest collaborators at the top, so density is at the *bottom* - the
 * 1-film row, hundreds of costars packed at minNodeSize - and it's the page
 * that scrolls, not a container. The click-accuracy tests below need a
 * genuinely dense sample on screen; at rest the viewport holds only the
 * sparse named rows, which are a handful of large avatars and prove nothing
 * about packing. */
async function scrollToDensestRows(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(250);
}

/** Every node's own avatar center in viewport coordinates, taken from its hit
 * circle rather than the <g>'s bounding box. Those used to be the same point
 * and no longer are: on the sparse rows a node also contains its name label,
 * which extends well to the right of the face and drags the bbox center out
 * into empty space beside it. Measuring the bbox there reported nine of
 * Keanu Reeves' eighty in-view nodes as "not owning their own center" when
 * every one of them was in fact clickable - the point being probed simply
 * wasn't on the avatar. The hit circle is the first <circle> in the node and
 * is the only hit-testable element in it (see ActorNode.tsx). */
async function nodeCenters(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".tus-node")].map((n) => {
      const circle = n.querySelector("circle")!.getBoundingClientRect();
      return {
        label: n.getAttribute("aria-label")!.replace(" - open details", ""),
        cx: circle.x + circle.width / 2,
        cy: circle.y + circle.height / 2,
        r: circle.width / 2,
      };
    }),
  );
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
      await scrollToDensestRows(page);

      const result = await page.evaluate((vp) => {
        const nodes = [...document.querySelectorAll(".tus-node")];
        let inView = 0;
        let owned = 0;
        for (const n of nodes) {
          // The hit circle, not the <g> - see nodeCenters above for why
          // those differ now and why the bbox is the wrong point to probe.
          const r = n.querySelector("circle")!.getBoundingClientRect();
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
    await waitForFullPool(page);
    await scrollToDensestRows(page);

    const nodes = await nodeCenters(page);
    // Mirrors App.tsx's MIN_MATCH_RADIUS. The chart renders 1:1 with its
    // viewBox now - the vertical arrangement has no uniform scale to fit
    // itself into a height budget - so viewBox units and CSS px are the
    // same thing and there's no conversion left to do.
    const minMatchRadiusPx = 24;

    // Sample points just outside each node's own hit circle in each of the
    // four cardinal directions - genuine "gap" clicks, filtered to ones that
    // don't happen to fall inside some *other* node's own circle instead.
    // Rounded to integer CSS px immediately: page.mouse.click ultimately
    // dispatches a real (integer-pixel) mouse event, so predicting off
    // fractional coordinates and then clicking the rounded version can
    // silently target a different pixel than the one just evaluated.
    // Smallest avatars first, not DOM order. DOM order used to be good
    // enough because the axis ran ascending, so the 1-film column - hundreds
    // of nodes at minNodeSize, the tightest packing in the chart - came
    // first and the 15-candidate slice below landed squarely in it. Under
    // the descending axis (graph.ts) DOM order starts at the one- and
    // two-person columns instead, whose avatars are at maxNodeSize: a point
    // 3px outside a 32px-radius avatar is further from its center than both
    // that radius and MIN_MATCH_RADIUS, so every sampled point was skipped
    // as "outside the overlay's catch radius" and the test checked nothing.
    // Sorting by radius targets dense packing directly, which is what this
    // test is actually about, and is indifferent to which end of the axis
    // that packing sits at. Offscreen nodes are dropped first - after
    // scrollToDensestColumn the dense column is in view, but the sparse end
    // has scrolled out, and page.mouse.click can't reach a point outside
    // the viewport.
    const vp = page.viewportSize()!;
    const onScreen = nodes.filter((n) => n.cx > 0 && n.cy > 0 && n.cx < vp.width && n.cy < vp.height);
    const candidates: { x: number; y: number }[] = [];
    for (const n of [...onScreen].sort((a, b) => a.r - b.r)) {
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
      // Close between samples. The card is anchored near whatever was just
      // clicked, and with the dense rows packed edge to edge the next
      // candidate point regularly lands underneath it - which dismisses the
      // card via the outside-click handler instead of opening a new one, so
      // the following assertion finds no card at all.
      await page.locator(".tus-card-close").click();
      await page.waitForTimeout(100);
    }
    expect(checked, "none of the sampled gap points fell within the overlay's catch radius").toBeGreaterThan(0);
    await page.close();
  });

  // "Past the last column" used to mean the chart's right-hand side margin.
  // Stacked rows have no such margin - the blob fills the width - but they
  // have something better: the sparse top rows are a couple of faces on an
  // otherwise empty full-width line, so the empty space to the right of the
  // first row is the clearest "obviously nothing here" target on the page,
  // and the furthest any point gets from a node center.
  test("clicking in empty space beside a sparse row closes an open card without opening a new one", async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);
    // Must settle before the measurements below: the full-pool swap
    // re-buckets the chart and moves everything. Without this the test is
    // flaky rather than wrong - it passed and failed on consecutive runs of
    // identical code.
    await waitForFullPool(page);

    await page.locator(".tus-node").first().click();
    await expect(page.locator(".tus-card")).toHaveCount(1);

    const svgBox = (await page.locator(".tus-graph").boundingBox())!;
    const nodes = await nodeCenters(page);
    // 24px in from the chart's right edge, on the vertical line of the top
    // row. Asserted rather than assumed: if a future layout ever packs that
    // row full width, this stops being an empty-space click and the test
    // should fail loudly instead of quietly testing nothing.
    const x = svgBox.x + svgBox.width - 24;
    const y = nodes[0].cy;
    const nearest = Math.min(...nodes.map((n) => Math.hypot(n.cx - x, n.cy - y)));
    expect(nearest, "expected the click point to be genuine empty space").toBeGreaterThan(48);

    await page.mouse.click(x, y);
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

    // Deliberately NOT .tus-node first(): the sparse top rows render each
    // face with its name already beside it, and App.tsx suppresses the hover
    // readout there rather than painting the same name twice. The readout
    // exists for the dense rows, where there's no room for a name - so the
    // test has to hover one of those.
    const node = page.locator(".tus-node").filter({ hasNot: page.locator(".tus-node-label") }).first();
    await node.scrollIntoViewIfNeeded();
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

    // A dense-row node, for the same reason as the test above.
    const node = page.locator(".tus-node").filter({ hasNot: page.locator(".tus-node-label") }).first();
    await node.scrollIntoViewIfNeeded();
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

  // The chart's own labels moved from a shared axis header row into a
  // per-row left gutter when the layout went vertical, so this checks the
  // first row's label rather than an axis header that no longer exists.
  test("the closest-collaborator row is above the fold on load, desktop and mobile", async ({ browser }) => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await page.goto("/2026/UsualSuspects");
      await page.waitForSelector(".tus-node");
      // Both the row's label and its first face: the whole point of leading
      // with the closest collaborators is that they arrive without scrolling,
      // and a visible label over an off-screen face would not be that.
      await expect(page.locator(".tus-row-label").first()).toBeInViewport();
      await expect(page.locator(".tus-node").first()).toBeInViewport();
      await page.screenshot({ path: `tests/screenshots/usual-suspects-top-${viewport.width}.png` });
      await page.close();
    }
  });

  // Replaces "chart bottom stays within the viewport on desktop", which was
  // the right assertion for a horizontal chart squeezed into the space below
  // the header and is the wrong one now: rows stack downward and the page
  // scrolls, by design. What still has to hold is that the *payoff* is on
  // screen at rest (covered above) and that the chart never demands more
  // width than it has - so this pins the width instead.
  test("the chart never exceeds its own frame's width", async ({ browser }) => {
    for (const viewport of [DESKTOP, MOBILE]) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await page.goto("/2026/UsualSuspects");
      await selectActor(page, MICHAEL_CAINE);
      const fits = await page.evaluate(() => {
        const svg = document.querySelector(".tus-graph")!.getBoundingClientRect();
        const frame = document.querySelector(".tus-graph-frame")!.getBoundingClientRect();
        return { svg: Math.round(svg.width), frame: Math.round(frame.width) };
      });
      expect(fits.svg, `chart overflowed its frame at ${viewport.width}px`).toBeLessThanOrEqual(fits.frame);
      await page.close();
    }
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

  // Anupam Kher is the pool's gap champion - his costars jump from 8 shared
  // films to 15, 21 and 25 - and under the old linear 1..max axis that cost
  // him a blank column per missing integer and a 4094px-wide chart. Rows
  // make width a non-issue, so what this now guards is the collapse itself:
  // each *run* of missing counts must cost one break marker, not one row per
  // number, or his chart grows a screenful of empty rows instead.
  test("gap runs collapse to one break marker each - Anupam Kher's chart stays short", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, ANUPAM_KHER);
    await waitForFullPool(page);
    const shape = await page.evaluate(() => ({
      rows: document.querySelectorAll(".tus-row-label").length,
      breaks: document.querySelectorAll(".tus-axis-break").length,
      height: Math.round(document.querySelector(".tus-graph")!.getBoundingClientRect().height),
    }));
    // One marker per run, and never more markers than populated rows - the
    // failure mode being guarded against is a marker per missing integer.
    expect(shape.breaks).toBeLessThanOrEqual(shape.rows);
    expect(shape.height, "chart grew a screenful of empty rows").toBeLessThan(2000);
    await page.close();
  });

  test("the info panel opens, carries the required TMDB attribution, and closes on Escape", async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await page.waitForSelector(".tus-node");

    await expect(page.locator(".tus-info")).toHaveCount(0);
    await page.locator(".tus-info-toggle").click();
    const panel = page.locator(".tus-info");
    await expect(panel).toHaveCount(1);

    // TMDB's API terms require this wording; the page hotlinks profile images
    // off image.tmdb.org on every view and had no attribution anywhere
    // before this panel existed.
    await expect(panel).toContainText("not endorsed or certified by TMDB");
    // The two caveats that make every count on the page a floor rather than
    // a total. If either disappears the panel is no longer honest about what
    // its numbers mean.
    await expect(panel).toContainText("only counted inside the pool");
    await expect(panel).toContainText("ten credited cast");

    await page.keyboard.press("Escape");
    await expect(page.locator(".tus-info")).toHaveCount(0);
    await page.close();
  });

  test("the cold-open copy shows on the landing page and not on a deep link", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    const OPENER = "Keanu Reeves and Winona Ryder";

    await page.goto("/2026/UsualSuspects");
    await page.waitForSelector(".tus-node");
    await expect(page.locator(".tus-context-meta")).toContainText(OPENER);

    // A shared link goes straight to the chart: the generated headline
    // already says something specific about the actor in front of you, so
    // the four-pair pitch would just be in the way.
    await page.goto(`/2026/UsualSuspects?actor=${TOM_HANKS_NCONST}`);
    await page.waitForSelector(".tus-node");
    await expect(page.locator(".tus-headline")).toContainText("Tom Hanks");
    await expect(page.locator(".tus-context-meta")).not.toContainText(OPENER);
    await page.close();
  });

  // The recenter FLIP animates nodes with the Web Animations API over a
  // transform *attribute* set by ActorNode, relying on the animation not
  // filling forwards so the attribute takes over again when it ends. If that
  // ever changes, nodes would be left pinned at stale coordinates - a much
  // worse failure than no animation at all, and an invisible one in a
  // screenshot taken after things settle.
  test("recentering leaves no node stuck at its pre-animation position", async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: DESKTOP })).newPage();
    await page.goto("/2026/UsualSuspects");
    await selectActor(page, MICHAEL_CAINE);
    await waitForFullPool(page);

    await page.locator(".tus-node").first().dblclick();
    await page.waitForTimeout(1200); // well past the 420ms transition

    const stuck = await page.evaluate(() =>
      [...document.querySelectorAll(".tus-node")].filter((n) => {
        const inline = (n as SVGGElement).style.transform;
        return inline !== "" && inline !== "none";
      }).length,
    );
    expect(stuck, "nodes left with an inline transform after the FLIP settled").toBe(0);
    // And the chart is still interactive afterwards.
    await page.locator(".tus-node").first().click();
    await expect(page.locator(".tus-card")).toHaveCount(1);
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
