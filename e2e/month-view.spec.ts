import { expect, test, type Page } from '@playwright/test';

/**
 * Month view: monthly header range, month-stepping arrows, click-to-edit,
 * double-click-day to open day view, and drag-between-days keeping the time.
 */
test.describe('month view', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await page.goto('?demo=1');
    await page.evaluate(async () => {
      localStorage.clear();
      localStorage.setItem('bpp_tour_v2', '1');
      localStorage.setItem('bpp_tour_v2_demo', '1');
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('PlannerDB');
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      });
    });
    await page.reload();
    // Wait for the app (and Dexie schema) to be ready before any raw IndexedDB seeding.
    await expect(page.locator('[data-tour="week-grid"]')).toBeVisible();
  });

  test('header shows the month and arrows step by month', async ({ page }) => {
    await switchToMonth(page);
    const range = page.locator('.planner-week-range-desktop');
    const start = await range.textContent();
    expect(start).toMatch(/^[A-Z][a-z]+ \d{4}$/); // e.g. "June 2026"

    // Scope to the header nav (the side-panel mini-calendar also has month arrows).
    const headerNav = page.locator('.planner-week-nav');
    await headerNav.getByRole('button', { name: 'Next month' }).click();
    await expect(range).not.toHaveText(start ?? '');
    await headerNav.getByRole('button', { name: 'Previous month' }).click();
    await expect(range).toHaveText(start ?? '');
  });

  test('clicking a month event opens the editor; double-clicking a day opens day view', async ({ page }) => {
    const date = await seedTimedBlock(page, 'Dentist', '09:00', 60);
    await switchToMonth(page);

    await page.locator('[data-month-block]').filter({ hasText: 'Dentist' }).click();
    await expect(page.getByRole('heading', { name: 'Edit Block' })).toBeVisible();
    await expect(page.getByRole('dialog').locator('input').first()).toHaveValue('Dentist');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Double-click an empty day cell (a block would absorb the dblclick).
    await page.locator(`[data-month-date="${shiftDate(date, 1)}"]`).dblclick();
    // Day view renders a single day column.
    await expect(page.locator('.day-column')).toHaveCount(1);
  });

  test('dragging a block to another day keeps its time', async ({ page }) => {
    const date = await seedTimedBlock(page, 'Gym session', '09:00', 60);
    const target = shiftDate(date, -2); // an earlier day in the same month grid
    await switchToMonth(page);

    const block = page.locator('[data-month-block]').filter({ hasText: 'Gym session' });
    const targetCell = page.locator(`[data-month-date="${target}"]`);
    const b = await block.boundingBox();
    const t = await targetCell.boundingBox();
    expect(b).not.toBeNull();
    expect(t).not.toBeNull();

    await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
    await page.mouse.down();
    await page.mouse.move(b!.x + 30, b!.y + b!.height / 2, { steps: 6 });
    await page.mouse.move(t!.x + t!.width / 2, t!.y + t!.height / 2, { steps: 24 });
    await page.mouse.up();

    // The day changes; the time of day is retained.
    await expect.poll(async () => (await getBlock(page, 'gym'))?.date).toBe(target);
    const moved = await getBlock(page, 'gym');
    expect(moved?.startTime).toBe('09:00');
    expect(moved?.endTime).toBe('10:00');
  });
});

const switchToMonth = async (page: Page) => {
  // Set the persisted view mode and reload (the AppShell reads it on mount).
  // The Day/Week/Month toggle itself is pre-existing; these tests exercise the
  // new month header / arrows / interactions.
  await page.evaluate(() => localStorage.setItem('planner.viewMode', 'month'));
  await page.reload();
  await expect(page.locator('[data-month-date]').first()).toBeVisible();
};

const getTodayParts = () => {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
};

/** A date string mid-month (the 10th of the current month) so shifts stay in-grid. */
const seedTimedBlock = async (page: Page, title: string, startTime: string, durationMinutes: number): Promise<string> => {
  const { y, m } = getTodayParts();
  const date = `${y}-${String(m + 1).padStart(2, '0')}-10`;
  const endH = String(Number(startTime.slice(0, 2)) + Math.floor(durationMinutes / 60)).padStart(2, '0');
  const endTime = `${endH}:${startTime.slice(3)}`;
  await page.evaluate(async ({ title, date, startTime, endTime, durationMinutes }) => {
    const open = indexedDB.open('PlannerDB');
    const db = await new Promise<IDBDatabase>((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction('blocks', 'readwrite');
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
      tx.objectStore('blocks').put({
        id: `mvtest-${title.replace(/\s+/g, '-')}`, title, durationMinutes,
        date, startTime, endTime, isScheduled: true, isBaseEvent: false, isHidden: false,
        sourceType: 'manual', travelEnabled: false, travelBeforeMinutes: 0, travelAfterMinutes: 0,
        features: {}, createdAt: Date.now(), updatedAt: Date.now(),
      });
    });
    db.close();
  }, { title, date, startTime, endTime, durationMinutes });
  await page.reload();
  return date;
};

const shiftDate = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const nd = new Date(y, m - 1, d + days);
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
};

interface StoredBlock { id: string; title: string; date?: string; startTime?: string; endTime?: string; }
const getBlock = async (page: Page, titleNeedle: string): Promise<StoredBlock | undefined> => page.evaluate(async (needle) => {
  const open = indexedDB.open('PlannerDB');
  const db = await new Promise<IDBDatabase>((res, rej) => { open.onsuccess = () => res(open.result); open.onerror = () => rej(open.error); });
  const all = await new Promise<StoredBlock[]>((res, rej) => {
    const rq = db.transaction('blocks', 'readonly').objectStore('blocks').getAll();
    rq.onsuccess = () => res(rq.result as StoredBlock[]); rq.onerror = () => rej(rq.error);
  });
  db.close();
  return all.find(b => b.title.toLowerCase().includes(needle));
}, titleNeedle);
