// Per-route "pose" recipes for scripts/capture-og.mjs.
//
// Keyed by route.path. `clip` is the CSS selector capture-og screenshots;
// `pose` is an optional async(page) that puts the page into a good state
// first — scroll to a beat, set a filter, wait for a transition — before
// the clip happens. A cold goto()+screenshot() gives empty initial states
// (MarginalTax at scroll 0 is a lone $0 bar; VoterAffiliation at step 0 is
// bare axes) so most entries here exist to get past that, not to do
// anything fancy.
//
// Routes with no entry get a generated title-only card instead of a real
// capture — see capture-og.mjs. Add an entry here and re-run
// `npm run og -- --force <path>` to backfill a real capture later.

async function scrollFraction(page, fraction) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, max * f));
  }, fraction);
  // Let the scroll-driven React state (and any CSS transition it triggers)
  // settle before the screenshot.
  await page.waitForTimeout(400);
}

export const RECIPES = {
  "/2026/PassingCompass": {
    // The svg only, not .pc-chart-area — that also includes the legend
    // row, which just eats into the card's bottom gradient band.
    clip: ".pc-chart-area svg",
    // Default state (Argentina, compass mode, all players) is already the
    // most legible view of this chart — nothing to pose, just wait for the
    // match data fetch (handled generically in capture-og.mjs).
  },

  "/2026/PossessionShape": {
    clip: ".ps-pitch-wrap",
    // Default state (Argentina in possession) is fine as-is. Already a
    // landscape pitch, so no need to drop down to the inner svg.
  },

  "/2026/PassingTriangleMatchingGame": {
    // The jersey strip (".ptmg-strip") is a position:fixed sibling, not a
    // descendant of the pitch board, and is translateY(100%)-hidden until
    // a slot is active — so this needs a click first and a clip that spans
    // both elements, not a single-selector screenshot.
    clip: async (page) => {
      const board = await page.locator(".ptmg-board").boundingBox();
      const strip = await page.locator(".ptmg-strip").boundingBox();
      const left = Math.min(board.x, strip.x);
      const top = Math.min(board.y, strip.y);
      const right = Math.max(board.x + board.width, strip.x + strip.width);
      const bottom = Math.max(board.y + board.height, strip.y + strip.height);
      return { x: left, y: top, width: right - left, height: bottom - top };
    },
    pose: async (page) => {
      // Tap the first pitch slot to reveal the jersey strip — an empty
      // board of "?" placeholders (the true default state) reads as
      // broken, not as an invitation to play.
      const hit = page
        .locator('.ptmg-pitch-wrap-single svg circle[fill="transparent"]')
        .first();
      await hit.click({ force: true });
      await page.waitForSelector(".ptmg-strip.visible", { state: "visible" });
      await page.waitForTimeout(300);
    },
  },

  "/2026/MarginalTax": {
    // The sticky wrapper (.scrolly-viz) is height:100vh with the chart
    // centered inside it — mostly empty space. The svg itself has a fixed
    // 520x400 viewBox, a much saner card crop.
    clip: ".scrolly-viz svg",
    // Scroll well past the $0/empty starting frame into a mid-bracket
    // state where the chart actually has something to show.
    pose: (page) => scrollFraction(page, 0.45),
  },

  "/2026/VoterAffiliation": {
    // Same reasoning as MarginalTax: the sticky wrapper is 100vh with the
    // chart vertically centered, so clip the svg directly.
    clip: ".va-chart-wrap svg",
    // Scroll into the story steps, past the bare-axes opening state.
    pose: (page) => scrollFraction(page, 0.35),
  },

  "/2025/SpaceTraveler": {
    // Only one <canvas> on the page — the starfield/trajectory view.
    clip: "canvas",
    pose: async (page) => {
      // Default trajectory (Earth -> Mars, 1g, computed on mount) starts
      // the ship flush against Earth with a zero-length trail — not much
      // of a picture. Click into the timeline slider's track instead of
      // .fill() (Playwright refuses to fill range inputs) so the ship is
      // mid-flight, green (accelerating), with a visible trail against the
      // dashed trajectory line.
      const slider = page.locator("#timeline");
      const box = await slider.boundingBox();
      await slider.click({ position: { x: box.width * 0.38, y: box.height / 2 } });
      await page.waitForTimeout(300);
    },
  },

  "/2025/HowMany13ers": {
    // Tried spanning the histogram + map together (like the matching
    // game's board+strip crop), but that box is ~2.3:1 vs. the card's
    // 1.9:1 — the template's object-fit:cover center-crop chewed the
    // narrow histogram down to an unreadable sliver. The map alone (react-
    // leaflet's own ".leaflet-container", lazy-loaded) already tells the
    // story: colored summit dots by elevation across Colorado terrain.
    clip: ".leaflet-container",
    // Default filter range (13000-14000ft) is already exactly this page's
    // premise, so nothing to set there — just wait out the lazy chunk
    // load + Leaflet init + Esri tile fetch. .leaflet-container exists
    // as soon as the map mounts (before markers/tiles paint), so wait for
    // an actual marker rather than the container itself.
    pose: async (page) => {
      await page.waitForSelector(".leaflet-interactive", { state: "visible" });
      await page.waitForTimeout(800);
    },
  },

  "/2025/USAIDSize": {
    // Cold state: guess1 is null, so the pie's arc endAngle is NaN (nothing
    // draws) — needs a drag before there's anything to see. dragTracker's
    // onDragMove reads a state var one render behind the event, so a single
    // mousemove undershoots; move to the target twice to let it converge.
    clip: ".container svg",
    deviceScaleFactor: 2,
    pose: async (page) => {
      const svg = page.locator(".container svg").first();
      const box = await svg.boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      // ~22% around the circle from the top — a readable wedge, not a
      // sliver and not a near-full circle.
      const targetX = cx + 98;
      const targetY = cy - 19;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(targetX, targetY, { steps: 10 });
      await page.mouse.move(targetX, targetY);
      await page.mouse.up();
      await page.waitForTimeout(150);
    },
  },

  "/2025/ForeignAid": {
    // AxisLeft (the country name labels) only renders once
    // guess1SubmittedAtom is true — a hover-only pose leaves the chart
    // unlabeled. Click a bar (selects it, advances step 0->1) then the
    // "submit guess" button (step 1->2, sets guess1Submitted) to get
    // labels + a green selected bar together. Object-fit:cover on this
    // square 600x600 clip keeps only the vertical middle band of the
    // card, so pick the middle bar — the first (tallest) renders near the
    // top edge and would get cropped away entirely.
    clip: ".container svg",
    deviceScaleFactor: 2,
    pose: async (page) => {
      const bars = page.locator(".container svg rect.mark");
      await bars.first().waitFor({ state: "visible" });
      const count = await bars.count();
      await bars.nth(Math.floor(count / 2)).click({ force: true });
      await page
        .getByRole("button", { name: "Click to submit guess!" })
        .click({ force: true });
      await page.waitForTimeout(200);
    },
  },

  "/2025/FederalEmployment": {
    // Default render already has data + the three pulsing guess-region
    // triangles, but at low opacity (0.2-0.4). Clicking one locks it to a
    // solid 0.6 and settles the others at 0.2 — more legible than catching
    // the pulse mid-fade. Chart is 960x500, almost exactly the card's own
    // 1.9:1 aspect, so no distortion from object-fit:cover.
    clip: ".container svg",
    pose: async (page) => {
      await page.locator(".container svg polygon").first().click({ force: true });
      await page.waitForTimeout(300);
    },
  },

  "/2025/DecisionVectorizer": {
    // Both charts ship with real seed data (a fictional job-choice
    // example) baked into App.tsx's initial state, so nothing needs
    // posing — just picking the right one. ValueJoyChart and
    // VectorAdditionChart both render a "value-joy-chart" wrapper and a
    // "chart-svg" svg (yes, both — copy-pasted class name), in that DOM
    // order, so the aggregate vector chart is the *second* .chart-svg.
    // It's the more legible pick as a card: one combined arrow instead of
    // three overlapping per-category ones. Function clips (unlike string
    // ones) get no automatic waitForSelector in capture-og.mjs, so wait
    // for it explicitly before reading its bounding box.
    clip: async (page) => page.locator(".chart-svg").nth(1).boundingBox(),
    deviceScaleFactor: 2,
    pose: async (page) => {
      // page.screenshot({clip}) only captures the current viewport, and
      // the second chart sits below the fold at 1400x900 — scroll it into
      // view first or the clip box lands outside the captured frame.
      await page.locator(".chart-svg").nth(1).scrollIntoViewIfNeeded();
    },
  },

  "/2025/DecisionComponentAnalyzer": {
    // Same seed-data situation as DecisionVectorizer, but this variant has
    // no ValueJoyChart (it uses ComponentSliders instead), so its
    // VectorAdditionChart is the only ".chart-svg" — no nth() needed.
    clip: ".chart-svg",
    deviceScaleFactor: 2,
  },

  "/2025/PizzaAreaComparison": {
    // Default 12"-diameter pizza is already a good picture — no pose
    // needed. Clip spans the pizza circle and the crust/cheese area
    // breakdown square together (two sibling elements, not one
    // container), same bounding-box-union approach as the matching game.
    deviceScaleFactor: 2,
    pose: async (page) => {
      await page.locator(".rectangle-container").waitFor({ state: "visible" });
    },
    clip: async (page) => {
      const pizza = await page.locator(".container > svg").first().boundingBox();
      const rect = await page.locator(".rectangle-container").boundingBox();
      const left = Math.min(pizza.x, rect.x);
      const top = Math.min(pizza.y, rect.y);
      const right = Math.max(pizza.x + pizza.width, rect.x + rect.width);
      const bottom = Math.max(pizza.y + pizza.height, rect.y + rect.height);
      return { x: left, y: top, width: right - left, height: bottom - top };
    },
  },

  "/2025/FuelEconomyTool": {
    // No default chart here (it's a search-and-compare tool, empty until
    // a vehicle is searched, which needs live fueleconomy.gov API calls —
    // too flaky to script). The "Gas Prices & Settings" panel populates
    // from a fast local default on mount, though, and is a reasonable
    // stand-in: real numbers, a slider, an actual UI to look at.
    clip: ".gas-prices-section",
    pose: async (page) => {
      await page.waitForSelector(".gas-prices-section", { state: "visible" });
      await page.waitForTimeout(200);
    },
  },

  "/2025/FuelEconomyCurve": {
    // Unlike FuelEconomyTool, this one seeds from DEFAULT_VEHICLE_DATA (a
    // static pre-fetched bundle, not a live API call) — the scatter plot
    // of default vehicles is already populated shortly after mount, no
    // pose needed beyond waiting for it. .chart-wrapper only exists once
    // vehicles.length > 0, so wait for a plotted circle rather than the
    // wrapper (which would exist first, mid-render).
    clip: ".chart-wrapper svg",
    pose: async (page) => {
      await page.waitForSelector(".chart-wrapper svg circle", { state: "visible" });
      await page.waitForTimeout(200);
    },
  },

  "/2025/SolarAnimation": {
    // Step 0 (cold load) intentionally shows bare axes — currentDayIndex
    // is -1 until the story starts. Step 5 ("Jump to maximum day") pins
    // both the min- and max-generation days on the daily curve chart
    // (red + orange) and shows the year overview with its peak marked —
    // the single richest static frame in the whole stepper. Next/Begin
    // button has no class, just text ending in an arrow.
    clip: async (page) => {
      const svgs = page.locator(".solar-animation-container svg");
      const count = await svgs.count();
      const boxes = [];
      for (let i = 0; i < count; i++) boxes.push(await svgs.nth(i).boundingBox());
      const left = Math.min(...boxes.map((b) => b.x));
      const top = Math.min(...boxes.map((b) => b.y));
      const right = Math.max(...boxes.map((b) => b.x + b.width));
      const bottom = Math.max(...boxes.map((b) => b.y + b.height));
      return { x: left, y: top, width: right - left, height: bottom - top };
    },
    pose: async (page) => {
      const next = page.getByRole("button", { name: /→/ });
      await next.waitFor({ state: "visible" }); // data fetch must resolve first
      for (let i = 0; i < 5; i++) {
        await next.click();
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(300);
    },
  },

  "/2025/ImageScrambler": {
    // Cold load has no image and two empty canvases — needs the full
    // load-then-sort flow. Default imageUrl (picsum.photos, a random
    // photo) is already filled in, so just click through it. Clips all
    // three canvas-wrapper columns (original / sorted / animation); the
    // third stays blank until "Animate Return" runs, which is fine — the
    // before/after pair alone tells the story.
    clip: ".canvas-container",
    pose: async (page) => {
      await page.getByRole("button", { name: "Load Image" }).click();
      await page.waitForFunction(() => {
        const c = document.querySelector(".canvas-wrapper canvas");
        return c && c.width > 0;
      }, { timeout: 15000 });
      await page.getByRole("button", { name: "Sort by Hue", exact: true }).click();
      await page.waitForTimeout(500);
    },
  },
};
