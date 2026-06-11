import { expect, test, type Page } from '@playwright/test';

test.describe('scheduled block interactions', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await page.goto('?demo=1');
    await seedScheduledBlock(page);
    await page.reload();
    await expect(getSeededScheduledBlock(page)).toBeVisible();
  });

  test('single click selects the block and reveals actions', async ({ page }) => {
    const block = getSeededScheduledBlock(page);

    await block.click();

    await expect(page.locator('.scheduled-block-selected')).toBeVisible();
    await expect(page.locator('button[aria-label="Edit"]')).toBeVisible();
  });

  test('double click opens the block editor', async ({ page }) => {
    await getSeededScheduledBlock(page).dblclick();

    await expect(page.getByRole('heading', { name: 'Edit Block' })).toBeVisible();
    await expect(page.getByRole('dialog').locator('input').first()).toHaveValue('Tiny typography check');
  });

  test('dragging a block does not open the editor', async ({ page }) => {
    const block = getSeededScheduledBlock(page);
    const box = await block.boundingBox();
    expect(box).not.toBeNull();

    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2 + 48, { steps: 8 });
    await page.mouse.up();

    await expect(page.getByRole('heading', { name: 'Edit Block' })).toHaveCount(0);
  });
});

const getSeededScheduledBlock = (page: Page) => (
  page.locator('[data-tour="scheduled-block"]').filter({ hasText: 'Tiny typography check' })
);

const seedScheduledBlock = async (page: Page) => {
  const today = await page.evaluate(() => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  await page.evaluate(async (date) => {
    const openRequest = indexedDB.open('PlannerDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => resolve(openRequest.result);
    });

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['blocks', 'categories'], 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      transaction.objectStore('categories').put({
        id: 'e2e-category',
        name: 'Focus',
        colorHex: '#22C55E',
        isArchived: false,
      });

      transaction.objectStore('blocks').put({
        id: 'e2e-scheduled-block',
        title: 'Tiny typography check',
        description: 'Seeded by Playwright',
        durationMinutes: 60,
        date,
        startTime: '09:00',
        endTime: '10:00',
        isScheduled: true,
        isBaseEvent: false,
        isHidden: false,
        sourceType: 'manual',
        categoryId: 'e2e-category',
        travelEnabled: false,
        travelBeforeMinutes: 60,
        travelAfterMinutes: 60,
        features: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    db.close();
  }, today);
};
