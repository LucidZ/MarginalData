import { test, expect } from '@playwright/test';
import { goToStory, scrollToStep, screenshotViz } from './helpers';

const STEPS = [
  'Your first dollar',
  'Crossing into 12%',
  'A bigger jump: 22%',
  '24%: barely worse than 22%',
  'Even at 32%, the effective rate stays low',
];

test.describe('Marginal Tax', () => {
  test('all steps render and viz is visible', async ({ page }) => {
    await goToStory(page, 'marginal-tax');
    await expect(page.locator('h1, h2').first()).toBeVisible();

    for (let i = 0; i < STEPS.length; i++) {
      await scrollToStep(page, i);

      const svg = page.locator('.scrolly-viz svg').first();
      await expect(svg).toBeVisible();

      await screenshotViz(page, `marginal-tax-step-${i}`);
    }
  });

  test('key step headlines are present', async ({ page }) => {
    await goToStory(page, 'marginal-tax');

    await scrollToStep(page, 0);
    await expect(page.locator('[data-step="0"] h2')).toContainText('first dollar');

    await scrollToStep(page, STEPS.length - 1);
    await expect(page.locator(`[data-step="${STEPS.length - 1}"] h2`)).toContainText('32%');
  });
});
