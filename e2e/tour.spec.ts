import { test, expect } from '@playwright/test';

/**
 * The demo + onboarding tour must render correctly and stay on-screen at every
 * device size. Runs once per device project defined in playwright.config.ts.
 */

test('demo renders ungated and the planner loads', async ({ page }) => {
  await page.goto('?demo=1');
  // Demo mode bypasses sign-in; the add control (sidebar button or mobile FAB)
  // must be present.
  await expect(page.locator('[data-tour="add-button"]').first()).toBeAttached({ timeout: 10_000 });
  // Sign-in wall must NOT be showing.
  await expect(page.getByText('Sign in to access')).toHaveCount(0);
});

test('tour card fits the viewport and never causes horizontal scroll', async ({ page }) => {
  await page.goto('?tour=1&demo=1');

  const card = page.locator('.tour-card');
  await expect(card).toBeVisible({ timeout: 12_000 });

  const vp = page.viewportSize()!;
  const box = (await card.boundingBox())!;
  expect(box, 'tour card has a bounding box').not.toBeNull();

  // Card fully within the viewport (1px tolerance)
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);

  // Card width respects min(90vw, 360px)
  expect(box.width).toBeLessThanOrEqual(Math.min(360, vp.width * 0.9) + 1);

  // Primary control (skip text) is visible — i.e. the footer isn't clipped
  await expect(page.getByText('Skip, replay in Settings')).toBeVisible();

  // No horizontal scrolling anywhere on the page
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'no horizontal overflow').toBeLessThanOrEqual(1);
});

test('app shell fits the viewport height (no 100vh overflow)', async ({ page }) => {
  await page.goto('?demo=1');
  const root = page.locator('.app-shell-root');
  await expect(root).toBeVisible({ timeout: 10_000 });
  const vp = page.viewportSize()!;
  const h = await root.evaluate((el) => el.getBoundingClientRect().height);
  // Root should not exceed the viewport height (allow a few px for rounding)
  expect(h).toBeLessThanOrEqual(vp.height + 2);
});
