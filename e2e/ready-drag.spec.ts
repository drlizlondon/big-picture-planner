import { expect, test } from '@playwright/test';

test.describe('ready item scheduling', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await page.goto('?demo=1');
    await page.evaluate(async () => {
      localStorage.clear();
      localStorage.setItem('bpp_tour_v2', '1');
      sessionStorage.clear();

      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('PlannerDB');
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      });
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ready to schedule (0)' })).toBeVisible();
  });

  test('drags a Ready to schedule item onto a week slot', async ({ page }) => {
    const title = `Drag ready item ${Date.now()}`;
    const today = await getTodayDate(page);

    await page.getByRole('button', { name: '+ Add to Planner' }).click();
    await page.getByPlaceholder('Example: Book dentist appointment next Tuesday').fill(title);
    await page.getByRole('button', { name: 'Add to Ready to schedule' }).click();

    const readyItem = page.locator('[data-tour="ready-item"]').filter({ hasText: title });
    await expect(readyItem).toBeVisible();

    // The add modal stays open for rapid entry; close it before dragging to the grid.
    await page.mouse.click(8, 8);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const targetSlot = page.locator(`[data-slot-date="${today}"][data-slot-time="11:00"]`);
    await dragReadyItemToSlot(page, readyItem, targetSlot);

    const scheduledBlock = page.locator('[data-tour="scheduled-block"]').filter({ hasText: title });
    await expect(readyItem).toHaveCount(0);
    await expect(scheduledBlock).toBeVisible();
    await expect(scheduledBlock).toHaveAttribute('title', new RegExp(`Date: ${today}[\\s\\S]*Time: 11:00 - 11:30`));
  });
});

const getTodayDate = async (page: import('@playwright/test').Page) => (
  page.evaluate(() => {
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  })
);

const dragReadyItemToSlot = async (
  page: import('@playwright/test').Page,
  readyItem: import('@playwright/test').Locator,
  targetSlot: import('@playwright/test').Locator,
) => {
  const readyBox = await readyItem.boundingBox();
  const slotBox = await targetSlot.boundingBox();
  expect(readyBox).not.toBeNull();
  expect(slotBox).not.toBeNull();

  await page.mouse.move(readyBox!.x + 20, readyBox!.y + readyBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(readyBox!.x + 80, readyBox!.y + readyBox!.height / 2, { steps: 6 });
  await page.mouse.move(slotBox!.x + slotBox!.width / 2, slotBox!.y + slotBox!.height / 2, { steps: 24 });
  await page.mouse.up();
};
