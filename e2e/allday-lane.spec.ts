import { expect, test, type Page } from '@playwright/test';

/**
 * All-day / multi-day events render in a sticky "all-day" lane above the time
 * grid in week/day view (they have no start time, so they can't sit in an hour
 * slot). The lane only appears when there are all-day events in view.
 */
test.describe('all-day lane', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test('shows all-day and multi-day events as chips in a lane', async ({ page }) => {
    await page.goto('?demo=1');
    await seedBlocks(page, { allDay: true });
    await page.reload();

    const lane = page.locator('[data-all-day-lane="true"]');
    await expect(lane).toBeVisible();
    await expect(lane.getByText('all-day')).toBeVisible();
    await expect(lane.getByText('Annual leave')).toBeVisible();
    // Multi-day event appears on each of its days.
    await expect(lane.getByText('Conference trip')).toHaveCount(3);
  });

  test('clicking an all-day chip opens the editor', async ({ page }) => {
    await page.goto('?demo=1');
    await seedBlocks(page, { allDay: true });
    await page.reload();

    // Scroll the grid to the top so the sticky lane chip is unambiguously clickable.
    await page.locator('.week-grid-shell').evaluate(el => { el.scrollTop = 0; });
    await page.locator('[data-all-day-lane="true"] [data-block-id="ad-1"]').click();
    await expect(page.getByRole('heading', { name: 'Edit Block' })).toBeVisible();
    await expect(page.getByRole('dialog').locator('input').first()).toHaveValue('Annual leave');
  });

  test('dragging an all-day chip to another day moves it (stays all-day)', async ({ page }) => {
    await page.goto('?demo=1');
    await seedBlocks(page, { allDay: true });
    await page.reload();

    const tomorrow = await page.evaluate(() => {
      const x = new Date(); x.setDate(x.getDate() + 1);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    });

    const chip = page.locator('[data-all-day-lane="true"] [data-block-id="ad-1"]');
    const targetCell = page.locator(`[data-allday-date="${tomorrow}"]`);
    const c = await chip.boundingBox();
    const t = await targetCell.boundingBox();
    await page.mouse.move(c!.x + c!.width / 2, c!.y + c!.height / 2);
    await page.mouse.down();
    await page.mouse.move(c!.x + 30, c!.y + c!.height / 2, { steps: 6 });
    await page.mouse.move(t!.x + t!.width / 2, t!.y + t!.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect.poll(() => page.evaluate(async () => {
      const req = indexedDB.open('PlannerDB');
      const db = await new Promise<IDBDatabase>((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
      const b = await new Promise<{ date?: string; isAllDay?: boolean }>((res, rej) => {
        const r = db.transaction('blocks', 'readonly').objectStore('blocks').get('ad-1');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      db.close();
      return b?.date;
    })).toBe(tomorrow);
  });

  test('no lane when there are no all-day events', async ({ page }) => {
    await page.goto('?demo=1');
    await seedBlocks(page, { allDay: false });
    await page.reload();

    await expect(page.locator('[data-fullday-grid]')).toBeVisible();
    await expect(page.locator('[data-all-day-lane="true"]')).toHaveCount(0);
  });
});

const seedBlocks = async (page: Page, opts: { allDay: boolean }) => {
  // Wait for the app to boot so Dexie has created the object stores.
  await page.waitForSelector('[data-fullday-grid="true"]', { timeout: 15000 });
  await page.evaluate(async (allDay) => {
    const fmt = (off: number) => {
      const x = new Date();
      x.setDate(x.getDate() + off);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    const openRequest = indexedDB.open('PlannerDB');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      openRequest.onerror = () => reject(openRequest.error);
      openRequest.onsuccess = () => resolve(openRequest.result);
    });

    const base = {
      isBaseEvent: false, isHidden: false, sourceType: 'manual',
      travelEnabled: false, travelBeforeMinutes: 0, travelAfterMinutes: 0,
      features: {}, createdAt: Date.now(), updatedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['blocks'], 'readwrite');
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      const s = tx.objectStore('blocks');
      // A timed block so the time grid always renders.
      s.put({ ...base, id: 'ad-timed', title: 'Yoga class', date: fmt(0), startTime: '09:00', endTime: '10:00', durationMinutes: 60, isScheduled: true });
      if (allDay) {
        const allDayBlock = (id: string, title: string, date: string) =>
          ({ ...base, id, title, date, durationMinutes: 0, isScheduled: true, isAllDay: true });
        s.put(allDayBlock('ad-1', 'Annual leave', fmt(0)));
        s.put(allDayBlock('ad-m1', 'Conference trip', fmt(1)));
        s.put(allDayBlock('ad-m2', 'Conference trip', fmt(2)));
        s.put(allDayBlock('ad-m3', 'Conference trip', fmt(3)));
      }
    });
    db.close();
  }, opts.allDay);
};
