import { expect, test, type Page } from '@playwright/test';

/**
 * The block editor's primary time fields are Start, End and Duration, kept in
 * sync: changing Start moves End (keeping duration), changing End updates
 * Duration, changing Duration moves End. Duration is shown human-readable.
 */
test.describe('block editor time fields', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await page.goto('?demo=1');
    await seedScheduledBlock(page);
    await page.reload();
    await expect(getBlock(page)).toBeVisible();
    await getBlock(page).dblclick();
    await expect(page.getByRole('heading', { name: 'Edit Block' })).toBeVisible();
  });

  test('start, end and duration stay in sync', async ({ page }) => {
    const dialog = page.getByRole('dialog');
    const start = dialog.locator('input[type="time"]').nth(0);
    const end = dialog.locator('input[type="time"]').nth(1);
    const durationSelect = dialog.locator('select').filter({ has: page.locator('option[value="120"]') });

    await expect(start).toHaveValue('09:00');
    await expect(end).toHaveValue('10:00');

    // Changing Duration updates End.
    await durationSelect.selectOption('120');
    await expect(end).toHaveValue('11:00');

    // Changing End updates Duration (shown human-readable).
    await end.fill('10:30');
    await expect(dialog.locator('[data-testid="duration-readout"]')).toHaveText('1 hour 30 minutes');

    // Changing Start moves End, keeping the duration.
    await start.fill('08:00');
    await expect(end).toHaveValue('09:30');
  });

  test('duration is shown human-readable, not a raw minute count', async ({ page }) => {
    // 60 minutes reads as "1 hour", never "60".
    await expect(page.getByRole('dialog').locator('[data-testid="duration-readout"]')).toHaveText('1 hour');
  });
});

const getBlock = (page: Page) =>
  page.locator('[data-tour="scheduled-block"]').filter({ hasText: 'Edit me' });

const seedScheduledBlock = async (page: Page) => {
  await page.waitForSelector('[data-fullday-grid="true"]', { timeout: 15000 });
  await page.evaluate(async () => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const openRequest = indexedDB.open('PlannerDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => resolve(openRequest.result);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['blocks'], 'readwrite');
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      tx.objectStore('blocks').put({
        id: 'editor-time-block', title: 'Edit me', durationMinutes: 60,
        date: today, startTime: '09:00', endTime: '10:00', isScheduled: true,
        isBaseEvent: false, isHidden: false, sourceType: 'manual',
        travelEnabled: false, travelBeforeMinutes: 0, travelAfterMinutes: 0,
        features: {}, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    db.close();
  });
};
