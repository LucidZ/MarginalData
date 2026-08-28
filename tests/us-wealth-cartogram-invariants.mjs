// Invariant checks for the wealth-land partition (src/2026/USWealthLandCartogram).
//
// Run against a dev server:  npm run dev  &&  node tests/us-wealth-cartogram-invariants.mjs
// Reads the dev-only window.__wlc handle that App.tsx publishes.
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

const analyse = () => {
  const { label, width, height, quotas, seedCells, solveMs } = window.__wlc;
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
    err: quotas.map((q, i) => q - areas[i]), boundary,
    minShare: +minShare.toFixed(3), maxComps, solveMs: Math.round(solveMs),
    seedsHeld: seedCells.every((c, i) => label[c] === i),
  };
};
const fmt = (tag, r) => `${tag.padEnd(22)} err=${JSON.stringify(r.err).padEnd(22)} boundary=${String(r.boundary).padStart(6)} minShare=${r.minShare} maxComps=${String(r.maxComps).padStart(4)} seeds=${r.seedsHeld ? 'OK' : 'LOST'} ${r.solveMs}ms`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.querySelector('.wlc-loading'), { timeout: 30000 });
await page.locator('.wlc-map-wrap').scrollIntoViewIfNeeded();
await page.waitForFunction(() => document.querySelector('.wlc-prompt')?.textContent?.includes('All four groups placed'), { timeout: 30000 });
await page.waitForTimeout(400);
console.log(fmt('AUTOPLAY', await page.evaluate(analyse)));
await page.locator('.wlc-map-wrap').screenshot({ path: `${OUT}/30-autoplay.png` });

const scenarios = {
  'SPREAD+MIAMI': [[1245, 590], [700, 460], [340, 700], [1330, 935]],
  'COLLINEAR-TIGHT': [[1240, 560], [1255, 575], [1225, 545], [1265, 590]],
  'STACKED-SAMEISH': [[900, 600], [905, 604], [896, 597], [909, 608]],
};
for (const [name, pts] of Object.entries(scenarios)) {
  await page.getByRole('button', { name: /Place groups myself/i }).click();
  await page.waitForTimeout(700);
  const box = await page.locator('canvas.wlc-canvas').boundingBox();
  for (const [vx, vy] of pts) {
    await page.mouse.click(box.x + (vx / 1600) * box.width, box.y + (vy / 1080) * box.height);
    await page.waitForTimeout(1600);
  }
  console.log(fmt(name, await page.evaluate(analyse)));
  await page.locator('.wlc-map-wrap').screenshot({ path: `${OUT}/31-${name}.png` });
}
console.log('ERRORS ' + JSON.stringify(errors));
await browser.close();

if (process.exitCode === undefined && errors.length > 0) process.exitCode = 1;
