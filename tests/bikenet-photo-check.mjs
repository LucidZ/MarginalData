// Smoke-check the Boulder BikeNet preview's Mapillary photo panel (local file, needs network).
// node tests/bikenet-photo-check.mjs <boulder-versions.html> <screenshot_dir>
import { chromium } from 'playwright';
import path from 'node:path';

const [file, outDir] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto('file://' + path.resolve(file));

const waitPhoto = async () => {
  await page.waitForFunction(() => {
    const t = document.getElementById('ph-img').textContent;
    return document.querySelector('#ph-img img')?.complete || /No Mapillary|failed|No Mapillary token/.test(t);
  }, null, { timeout: 20000 });
  return page.evaluate(() => ({
    title: document.getElementById('ph-title').textContent,
    meta: document.getElementById('ph-meta').textContent || document.getElementById('ph-img').textContent,
    n: document.getElementById('ph-n').textContent,
  }));
};

for (let i = 0; i < 10; i++) {
  await page.click(`#fixlist li:nth-child(${i + 1})`);
  const r = await waitPhoto();
  console.log(`fix ${i + 1}:`, r.title, '|', r.meta, '|', r.n);
  if (i === 0) {
    await page.screenshot({ path: `${outDir}/fix1.png` });
    await page.click('#ph-flip');
    const f = await waitPhoto();
    console.log('  flipped:', f.meta, '|', f.n);
    await page.screenshot({ path: `${outDir}/fix1-flip.png` });
  }
}
await page.click('#l_crashes');
await page.click('#vbtns button[data-v="v2"]');
await page.click('#fixlist li:nth-child(1)');
console.log('v2 fix 1:', (await waitPhoto()).title);
await page.screenshot({ path: `${outDir}/v2-fix1.png` });
await browser.close();
