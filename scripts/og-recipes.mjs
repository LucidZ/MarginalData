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
};
