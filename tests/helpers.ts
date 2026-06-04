import { Page } from '@playwright/test';
import * as fs from 'fs';

export const STORY_ROUTES = {
  'the-net': '/#/financial-literacy/the-net',
  'marginal-tax': '/#/financial-literacy/marginal-tax',
} as const;

export type StoryName = keyof typeof STORY_ROUTES;

/** Navigate to a story and wait for it to hydrate. */
export async function goToStory(page: Page, story: StoryName) {
  await page.goto(STORY_ROUTES[story]);
  await page.waitForSelector('.scrolly-container');
}

/**
 * Scroll a step into view and wait for D3 transitions to settle.
 * The IntersectionObserver fires at 40% visibility; scrollIntoViewIfNeeded
 * centers the element, reliably satisfying that threshold.
 */
export async function scrollToStep(page: Page, stepIndex: number) {
  const step = page.locator(`[data-step="${stepIndex}"]`);
  await step.scrollIntoViewIfNeeded();
  // D3 transitions run 600ms; 800ms gives a comfortable buffer
  await page.waitForTimeout(800);
}

/** Screenshot the sticky viz panel and save to tests/screenshots/<name>.png */
export async function screenshotViz(page: Page, name: string) {
  fs.mkdirSync('tests/screenshots', { recursive: true });
  const viz = page.locator('.scrolly-viz').first();
  return viz.screenshot({ path: `tests/screenshots/${name}.png` });
}
