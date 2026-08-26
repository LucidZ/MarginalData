// Generates one 1200x630 card per route in src/routes.ts, written to
// public/og/<slug>.jpg. The same file serves as both the og:image /
// twitter:image (see generate-static-pages.mjs) and the homepage feed
// thumbnail — one asset, two jobs.
//
// Two-step composition, entirely in Playwright (no sharp/ImageMagick):
//   1. Routes with a scripts/og-recipes.mjs entry get posed and their
//      chart element screenshotted (a raw PNG buffer, not written to disk).
//   2. That screenshot (or nothing, for routes with no recipe) is embedded
//      as a data: URI into a local HTML card template — title band, group
//      tag, site wordmark — which is itself screenshotted at 1200x630 and
//      saved as the final JPEG (q85). Routes with no recipe get a
//      title-only card from the same template, so the feed has no ragged
//      holes while real captures get backfilled over time.
//
// Requires a running production build to capture against:
//   npm run build && npm run preview
//   npm run og                # in a second terminal
//
// Flags:
//   --force        regenerate every route, including ones that already
//                  have a routes.ts `image` (e.g. WealthLandCartogram's
//                  hand-picked one — skipped by default so this doesn't
//                  clobber it).
//   --only=<path>  regenerate a single route, e.g. --only=/2026/MarginalTax
//
// After running, paste the printed `image:` lines into src/routes.ts.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTES } from "../src/routes.ts";
import { RECIPES } from "./og-recipes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const OUT_DIR = path.join(rootDir, "public", "og");
const BASE_URL = process.env.PREVIEW_URL ?? "http://localhost:4173";
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length);

// "/2026/WealthLandCartogram" -> "wealth-land-cartogram"
function slugify(routePath) {
  const name = routePath.split("/").pop();
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Self-contained HTML card: navy brand background throughout, real
// captures get the screenshot as a full-bleed background image with a
// bottom gradient band for legibility; title-only cards are just the band,
// centered.
function cardHtml({ title, group, imageDataUrl }) {
  const safeTitle = escapeHtml(title);
  const safeGroup = escapeHtml(group.toUpperCase());
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${CARD_WIDTH}px;
    height: ${CARD_HEIGHT}px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: linear-gradient(135deg, #16304f, #0d1b2e);
  }
  .card { position: relative; width: 100%; height: 100%; }
  .capture {
    position: absolute; inset: 0;
  }
  .capture img {
    width: 100%; height: 100%;
    object-fit: cover;
    object-position: center center;
  }
  .band {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: ${imageDataUrl ? "2.5rem 3.5rem 3rem" : "0 4rem"};
    ${imageDataUrl
      ? "background: linear-gradient(to top, rgba(9,17,30,0.94), rgba(9,17,30,0.75) 65%, rgba(9,17,30,0));"
      : "top: 0; display: flex; flex-direction: column; justify-content: center;"}
  }
  .group {
    color: #d4af37;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.1em;
    margin-bottom: 14px;
  }
  .title {
    color: #ffffff;
    font-size: ${imageDataUrl ? "48px" : "58px"};
    font-weight: 800;
    line-height: 1.15;
    max-width: 980px;
  }
  .wordmark {
    position: absolute; right: 3.5rem; bottom: 2.2rem;
    color: rgba(255,255,255,0.55);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style></head>
<body>
  <div class="card">
    ${imageDataUrl ? `<div class="capture"><img src="${imageDataUrl}" /></div>` : ""}
    <div class="band">
      <div class="group">${safeGroup}</div>
      <div class="title">${safeTitle}</div>
    </div>
    <div class="wordmark">Marginal Data</div>
  </div>
</body></html>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  for (const route of ROUTES) {
    if (ONLY && route.path !== ONLY) continue;

    const slug = slugify(route.path);
    const outPath = path.join(OUT_DIR, `${slug}.jpg`);

    if (route.image && !FORCE && !ONLY) {
      console.log(`skip  ${route.path}  (already has route.image: ${route.image})`);
      continue;
    }

    const recipe = RECIPES[route.path];
    let imageDataUrl = null;

    if (recipe) {
      const page = await browser.newPage({
        viewport: recipe.viewport ?? { width: 1400, height: 900 },
        // Some charts render at a small fixed pixel size (e.g. USAIDSize's
        // 300x300 pie) — a higher deviceScaleFactor captures more source
        // pixels so the card's object-fit:cover upscale doesn't look soft.
        deviceScaleFactor: recipe.deviceScaleFactor ?? 1,
      });
      try {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: "load" });
        if (typeof recipe.clip === "string") {
          await page.waitForSelector(recipe.clip, { state: "visible", timeout: 15000 });
        }
        if (recipe.pose) await recipe.pose(page);
        // clip is either a CSS selector (screenshot that element directly)
        // or an async(page) => {x,y,width,height} for compositions that
        // span more than one element (e.g. a fixed-position strip that
        // isn't a descendant of the main board).
        const buffer =
          typeof recipe.clip === "string"
            ? await page.locator(recipe.clip).first().screenshot()
            : await page.screenshot({ clip: await recipe.clip(page) });
        imageDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
      } catch (err) {
        console.warn(
          `warn  ${route.path}  pose/capture failed (${err.message}) — falling back to title-only`
        );
      } finally {
        await page.close();
      }
    }

    const html = cardHtml({
      title: route.title.split(" — ")[0],
      group: route.group,
      imageDataUrl,
    });

    const composePage = await browser.newPage({
      viewport: { width: CARD_WIDTH, height: CARD_HEIGHT },
    });
    await composePage.setContent(html, { waitUntil: "load" });
    await composePage.screenshot({ path: outPath, type: "jpeg", quality: 85 });
    await composePage.close();

    results.push({ path: route.path, slug, real: Boolean(imageDataUrl) });
    console.log(`${imageDataUrl ? "capture" : "generate"}  ${route.path}  ->  public/og/${slug}.jpg`);
  }

  await browser.close();

  if (results.length) {
    console.log("\nAdd to src/routes.ts (image field) for each route above:");
    for (const r of results) {
      console.log(`  ${r.path}\n    image: "/og/${r.slug}.jpg", ${r.real ? "" : "// title-only"}`);
    }
  } else {
    console.log("\nNothing to do — every route already has an image (use --force to regenerate).");
  }
}

main();
