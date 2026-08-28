// Invariant checks for the wealth-land partition (src/2026/USWealthLandCartogram).
//
// Run against a dev server:  npm run dev  &&  node tests/us-wealth-cartogram-invariants.mjs
// Reads the dev-only window.__wlc handle App.tsx publishes (stripped from prod).
//
// The metrics matter more than they look. An earlier version of this file
// counted 8-CONNECTED components and reported "1 component, no splits" on
// regions that were rendering as visible checkerboards — a checkerboard is
// diagonally connected, so 8-connectivity cannot see it at all. Use
// 4-connected components and total boundary length: a clean four-way
// partition of this landmass has a boundary around 2,500-3,000, and anything
// past ~10,000 is visibly ragged on screen.
import fs from 'node:fs';
import { chromium } from 'playwright';

const OUT = new URL('./screenshots/', import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });
const APP_URL = process.env.APP_URL ?? 'http://localhost:5200/2026/USWealthLandCartogram';

// Thresholds are deliberately loose — they exist to catch collapse, not drift.
const MAX_BOUNDARY = 10000;
const MIN_LARGEST_SHARE = 0.9;
const MAX_AREA_ERROR = 500; // cells, out of ~836,657

const analyse = () => {
  const { label, quotas, seedCells, width, height, solveMs } = window.__wlc;
  const n = width * height;
  let boundary = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] < 0) continue;
    const x = i % width, y = (i / width) | 0;
    if (x + 1 < width && label[i + 1] >= 0 && label[i + 1] !== label[i]) boundary++;
    if (y + 1 < height && label[i + width] >= 0 && label[i + width] !== label[i]) boundary++;
  }
  const seen = new Uint8Array(n), stack = new Int32Array(n), comps = {};
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  for (let start = 0; start < n; start++) {
    const g = label[start];
    if (g < 0 || seen[start]) continue;
    let sp = 0; stack[sp++] = start; seen[start] = 1; let size = 0;
    while (sp > 0) {
      const idx = stack[--sp]; size++;
      const x = idx % width, y = (idx / width) | 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const ni = ny * width + nx;
        if (seen[ni] || label[ni] !== g) continue;
        seen[ni] = 1; stack[sp++] = ni;
      }
    }
    (comps[g] ||= []).push(size);
  }
  const areas = new Array(quotas.length).fill(0);
  for (let i = 0; i < n; i++) if (label[i] >= 0) areas[label[i]]++;
  let minShare = 1, maxComps = 0;
  for (const g of Object.keys(comps)) {
    const sizes = comps[g], total = sizes.reduce((a, b) => a + b, 0);
    minShare = Math.min(minShare, Math.max(...sizes) / total);
    maxComps = Math.max(maxComps, sizes.length);
  }
  return {
    seeds: seedCells.length,
    err: quotas.map((q, i) => q - areas[i]), boundary,
    minShare: +minShare.toFixed(3), maxComps, solveMs: Math.round(solveMs),
    seedsHeld: seedCells.every((c, i) => label[c] === i),
  };
};

/** Unclaimed land as close to a claimed border as a real cursor could hit —
 *  the most hostile placement the "open ground only" rule still permits. */
const hugEdge = () => {
  const { label, land, width, height } = window.__wlc;
  const PAD = 3; // clear of the border, so sub-pixel mouse rounding can't
                 // tip the click onto claimed ground and get it refused
  for (let i = 0; i < width * height; i++) {
    if (!land[i] || label[i] !== -1) continue;
    const x = i % width, y = (i / width) | 0;
    if (x < PAD + 1 || y < PAD + 1 || x + PAD + 1 >= width || y + PAD + 1 >= height) continue;
    let open = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = (y + dy) * width + (x + dx);
      if (!land[nb] || label[nb] >= 0) { open = false; break; }
    }
    if (!open) continue;
    for (let dy = -PAD; dy <= PAD; dy++) {
      for (let dx = -PAD; dx <= PAD; dx++) {
        if (label[(y + dy) * width + (x + dx)] >= 0) return { x, y };
      }
    }
  }
  return null;
};

/** Open land furthest from anything claimed — the "natural" next placement. */
const deepestOpen = () => {
  const { label, land, width, height } = window.__wlc;
  const n = width * height;
  const dist = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = 0; i < n; i++) if (land[i] && label[i] >= 0) { dist[i] = 0; queue[tail++] = i; }
  if (tail === 0) return { x: (width / 2) | 0, y: (height / 2) | 0 };
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];
  let best = -1, bestD = -1;
  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width, y = (idx / width) | 0;
    if (label[idx] < 0 && dist[idx] > bestD) { bestD = dist[idx]; best = idx; }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const ni = ny * width + nx;
      if (!land[ni] || dist[ni] !== -1) continue;
      dist[ni] = dist[idx] + 1;
      queue[tail++] = ni;
    }
  }
  return { x: best % width, y: (best / width) | 0 };
};

const failures = [];
const check = (tag, r) => {
  const bad = [];
  if (r.boundary > MAX_BOUNDARY) bad.push(`boundary ${r.boundary} > ${MAX_BOUNDARY} (stippled/ragged)`);
  if (r.minShare < MIN_LARGEST_SHARE) bad.push(`minShare ${r.minShare} < ${MIN_LARGEST_SHARE} (fragmented)`);
  if (!r.seedsHeld) bad.push('a group lost its own seed');
  const worst = Math.max(...r.err.map(Math.abs));
  if (worst > MAX_AREA_ERROR) bad.push(`area error ${worst} > ${MAX_AREA_ERROR} cells`);
  if (bad.length) failures.push(`${tag}: ${bad.join('; ')}`);
  console.log(
    `${bad.length ? 'FAIL' : 'ok  '} ${tag.padEnd(14)} seeds=${r.seeds} err=${JSON.stringify(r.err).padEnd(22)}` +
    ` boundary=${String(r.boundary).padStart(5)} minShare=${r.minShare} maxComps=${String(r.maxComps).padStart(3)} ${r.solveMs}ms`
  );
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.querySelector('.wlc-loading'), { timeout: 30000 });
await page.locator('.wlc-map-wrap').scrollIntoViewIfNeeded();
await page.waitForFunction(
  () => document.querySelector('.wlc-prompt')?.textContent?.includes('All four groups placed'),
  { timeout: 30000 }
);
await page.waitForTimeout(400);
check('AUTOPLAY', await page.evaluate(analyse));
await page.locator('.wlc-map-wrap').screenshot({ path: `${OUT}/autoplay.png` });

const reset = async () => {
  await page.getByRole('button', { name: /Place groups myself/i }).click();
  await page.waitForTimeout(700);
  // The canvas is GRID_WIDTH x GRID_HEIGHT (1600x950). The 130px staging strip
  // belongs to the wrapper, not the canvas, so map pixels scale straight
  // against the canvas box with no offset.
  const box = await page.locator('canvas.wlc-canvas').boundingBox();
  return async (x, y) => {
    await page.mouse.click(box.x + (x / 1600) * box.width, box.y + (y / 950) * box.height);
    await page.waitForTimeout(1700);
  };
};

// --- spread placement, with the last seed chosen in the roomiest gap -------
let click = await reset();
for (const [x, y] of [[1250, 470], [700, 340], [340, 590]]) await click(x, y);
const deep = await page.evaluate(deepestOpen);
await click(deep.x, deep.y);
check('SPREAD', await page.evaluate(analyse));
await page.locator('.wlc-map-wrap').screenshot({ path: `${OUT}/spread.png` });

// --- claimed ground must refuse a seed ------------------------------------
click = await reset();
await click(800, 450);
const before = await page.evaluate(() => window.__wlc.seedCells.length);
await click(800, 450); // straight back onto the region just created
const after = await page.evaluate(() => window.__wlc.seedCells.length);
if (before !== after) failures.push(`REFUSAL: click on claimed land was accepted (${before} -> ${after} seeds)`);
console.log(`${before === after ? 'ok  ' : 'FAIL'} REFUSAL       claimed-land click ignored (seeds stayed ${before})`);

// --- every remaining seed jammed against a claimed border -----------------
for (let i = 2; i <= 4; i++) {
  const spot = await page.evaluate(hugEdge);
  if (!spot) { failures.push(`EDGE-HUG: no legal open land found for seed ${i}`); break; }
  await click(spot.x, spot.y);
}
check('EDGE-HUG', await page.evaluate(analyse));
await page.locator('.wlc-map-wrap').screenshot({ path: `${OUT}/edge-hug.png` });

if (errors.length) failures.push(`page errors: ${JSON.stringify(errors)}`);
await browser.close();

if (failures.length) {
  console.log('\n' + failures.length + ' FAILURE(S):');
  for (const f of failures) console.log('  - ' + f);
  process.exitCode = 1;
} else {
  console.log('\nall invariants held');
}
