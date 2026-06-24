import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Cmd/Ctrl+Z and Cmd/Ctrl+Y (or Shift+Cmd+Z) undo/redo block movements.
 */
test.describe('undo / redo block movements', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await page.goto('?demo=1');
    await seedScheduledBlock(page);
    await page.reload();
    await expect(getBlock(page)).toBeVisible();
  });

  test('undo restores a dragged block; redo re-applies it', async ({ page }) => {
    const today = await getToday(page);

    // Drag the 09:00 block down to a later slot (exact landing depends on snap).
    await dragToSlot(page, getBlock(page), page.locator(`[data-slot-date="${today}"][data-slot-time="11:00"]`));
    await expect.poll(() => storedStart(page)).not.toBe('09:00');
    const movedStart = await storedStart(page);

    // Undo → back to 09:00.
    await page.keyboard.press('Control+z');
    await expect.poll(() => storedStart(page)).toBe('09:00');

    // Redo → the moved position again.
    await page.keyboard.press('Control+y');
    await expect.poll(() => storedStart(page)).toBe(movedStart);
  });
});

const getBlock = (page: Page) =>
  page.locator('[data-tour="scheduled-block"]').filter({ hasText: 'Move me' });

const getToday = (page: Page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

const storedStart = (page: Page) => page.evaluate(async () => {
  const openRequest = indexedDB.open('PlannerDB');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => resolve(openRequest.result);
  });
  const block = await new Promise<{ startTime?: string }>((resolve, reject) => {
    const r = db.transaction('blocks', 'readonly').objectStore('blocks').get('undo-redo-block');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => resolve(r.result);
  });
  db.close();
  return block?.startTime;
});

const dragToSlot = async (page: Page, block: Locator, slot: Locator) => {
  const b = await block.boundingBox();
  const s = await slot.boundingBox();
  expect(b).not.toBeNull();
  expect(s).not.toBeNull();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 12);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + 40, { steps: 6 });
  await page.mouse.move(s!.x + s!.width / 2, s!.y + s!.height / 2, { steps: 24 });
  await page.mouse.up();
};

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
        id: 'undo-redo-block', title: 'Move me', durationMinutes: 60,
        date: today, startTime: '09:00', endTime: '10:00', isScheduled: true,
        isBaseEvent: false, isHidden: false, sourceType: 'manual',
        travelEnabled: false, travelBeforeMinutes: 0, travelAfterMinutes: 0,
        features: {}, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    db.close();
  });
};
