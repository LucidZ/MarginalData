import { chromium } from 'playwright-core';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5175/MarginalData/2026/voter-affiliation');
  
  // Wait for chart to render
  await page.waitForSelector('.va-tern-edge-label');
  
  // Take screenshot
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-lucas-code-MarginalData/8d6a6c38-d4a4-42f1-922e-762af0f79f0c/scratchpad/ternary.png' });
  
  console.log('Screenshot saved');
  await browser.close();
})();
