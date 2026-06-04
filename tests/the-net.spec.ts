import { test, expect } from '@playwright/test';
import { goToStory, scrollToStep, screenshotViz } from './helpers';

const STEPS = [
  'Payday',
  'Taxes come first',
  'The mortgage and cars',
  'Healthcare, childcare, subscriptions',
  'Groceries, gas, utilities',
  'The only truly flexible layer',
  "Let's organize this",
  'The gap: $45',
  'Month 2',
  'Month after month',
];

test.describe('The Net', () => {
  test('all steps render and viz is visible', async ({ page }) => {
    await goToStory(page, 'the-net');
    await expect(page.locator('h1')).toContainText('The Net');

    for (let i = 0; i < STEPS.length; i++) {
      await scrollToStep(page, i);

      const svg = page.locator('.scrolly-viz svg').first();
      await expect(svg).toBeVisible();

      await screenshotViz(page, `the-net-step-${i}`);
    }
  });

  test('key step headlines are present', async ({ page }) => {
    await goToStory(page, 'the-net');

    await scrollToStep(page, 0);
    await expect(page.locator('[data-step="0"] h2')).toContainText('Payday');

    await scrollToStep(page, 7);
    await expect(page.locator('[data-step="7"] h2')).toContainText('gap');

    await scrollToStep(page, STEPS.length - 1);
    await expect(page.locator(`[data-step="${STEPS.length - 1}"] h2`)).toContainText('Month after month');
  });
});
