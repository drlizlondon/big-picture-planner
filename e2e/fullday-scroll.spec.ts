import { expect, test, type Page } from '@playwright/test';

/**
 * Full-day scroll access (reqs #1, #2): the grid defaults to a working window
 * (~07:00) but the whole day 00:00–23:59 is always rendered and reachable by
 * scrolling. Events outside the working window are never clipped away.
 */
test.describe('full-day scroll access', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await page.goto('?demo=1');
    await seedEdgeBlocks(page);
    await page.reload();
    await expect(page.locator('[data-fullday-grid="true"]')).toBeVisible();
  });

  test('renders the entire day in the time gutter', async ({ page }) => {
    // Full day rendered: midnight and the last hour both exist in the gutter.
    await expect(page.locator('.week-time-gutter [data-hour="0"]')).toHaveCount(1);
    await expect(page.locator('.week-time-gutter [data-hour="23"]')).toHaveCount(1);
    await expect(page.locator('.week-time-gutter').getByText('24:00')).toHaveCount(1);
  });

  test('defaults to the working window, scrolling past the small hours', async ({ page }) => {
    const shell = page.locator('.week-grid-shell');
    // The grid auto-scrolls down to the working window, so it is not parked at midnight.
    await expect.poll(async () => shell.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    // A 02:00 event exists but starts above the default viewport.
    await expect(getBlock(page, 'Early swim')).toHaveCount(1);
    await expect(getBlock(page, 'Early swim')).not.toBeInViewport();
  });

  test('a 02:00 event is reachable by scrolling to the top of the day', async ({ page }) => {
    const shell = page.locator('.week-grid-shell');
    await shell.evaluate(el => { el.scrollTop = 0; });
    await expect(getBlock(page, 'Early swim')).toBeInViewport();
  });

  test('a 23:00 event is reachable by scrolling to the end of the day', async ({ page }) => {
    const shell = page.locator('.week-grid-shell');
    await shell.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(getBlock(page, 'Late call')).toBeInViewport();
  });
});

const getBlock = (page: Page, title: string) =>
  page.locator('[data-tour="scheduled-block"]').filter({ hasText: title });

const seedEdgeBlocks = async (page: Page) => {
  const today = await page.evaluate(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });

  await page.evaluate(async (date) => {
    const openRequest = indexedDB.open('PlannerDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => resolve(openRequest.result);
    });

    const baseBlock = {
      isScheduled: true,
      isBaseEvent: false,
      isHidden: false,
      sourceType: 'manual',
      travelEnabled: false,
      travelBeforeMinutes: 0,
      travelAfterMinutes: 0,
      features: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['blocks'], 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      const store = transaction.objectStore('blocks');
      store.put({ ...baseBlock, id: 'e2e-early', title: 'Early swim', durationMinutes: 60, date, startTime: '02:00', endTime: '03:00' });
      store.put({ ...baseBlock, id: 'e2e-late', title: 'Late call', durationMinutes: 60, date, startTime: '23:00', endTime: '23:59' });
    });

    db.close();
  }, today);
};
