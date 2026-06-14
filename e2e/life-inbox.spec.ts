import { expect, test, type Page } from '@playwright/test';

test.describe('Life Inbox ordering and priority', () => {
  test.skip(({ browserName, viewport }) => browserName !== 'chromium' || viewport?.width !== 1280);

  test.beforeEach(async ({ page }) => {
    await resetPlanner(page);
  });

  test('shows newly added Life Inbox items at the top by default', async ({ page }) => {
    await addReadyItem(page, 'First inbox item');
    await addReadyItem(page, 'Second inbox item');

    await expectReadyTitles(page, ['Second inbox item', 'First inbox item']);
  });

  test('toggles priority on and off and persists the state', async ({ page }) => {
    await addReadyItem(page, 'Priority toggle item');
    await closeAddModal(page);

    await page.getByRole('button', { name: 'Mark Priority toggle item as prioritised' }).click();
    await expect(page.getByRole('button', { name: 'Remove priority from Priority toggle item' })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => getStoredPriority(page, 'Priority toggle item')).toBe(true);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Remove priority from Priority toggle item' })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Remove priority from Priority toggle item' }).click();
    await expect(page.getByRole('button', { name: 'Mark Priority toggle item as prioritised' })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => getStoredPriority(page, 'Priority toggle item')).toBe(false);
  });

  test('sorts by last added without moving priority items out of chronological order', async ({ page }) => {
    await seedLifeInboxBlocks(page);
    await page.reload();

    await expectReadyTitles(page, [
      'Newest regular',
      'Newest priority',
      'Older priority',
      'Legacy no priority field',
    ]);
  });

  test('sorts prioritised items first with newest-first order inside each group', async ({ page }) => {
    await seedLifeInboxBlocks(page);
    await page.reload();

    await page.getByRole('button', { name: 'Prioritised' }).click();

    await expectReadyTitles(page, [
      'Newest priority',
      'Older priority',
      'Newest regular',
      'Legacy no priority field',
    ]);
  });
});

const resetPlanner = async (page: Page) => {
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
};

const addReadyItem = async (page: Page, title: string) => {
  if (await page.getByRole('dialog').count() === 0) {
    await page.getByRole('button', { name: '+ Add to Planner' }).click();
  }

  const input = page.getByPlaceholder('Example: Book dentist appointment next Tuesday');
  await input.fill(title);
  await page.getByRole('button', { name: 'Add to Ready to schedule' }).click();
  await expect(page.locator('[data-tour="ready-item"]').filter({ hasText: title })).toBeVisible();
};

const closeAddModal = async (page: Page) => {
  if (await page.getByRole('dialog').count() > 0) {
    await page.mouse.click(8, 8);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
};

const expectReadyTitles = async (page: Page, expectedTitles: string[]) => {
  await expect.poll(() => getReadyTitles(page)).toEqual(expectedTitles);
};

const getReadyTitles = async (page: Page) => (
  page.locator('[data-tour="ready-item"] .ready-item-title').allTextContents()
);

const getStoredPriority = async (page: Page, title: string) => (
  page.evaluate(async (blockTitle) => {
    const openPlannerDb = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlannerDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const db = await openPlannerDb();
    const blocks = await new Promise<StoredBlock[]>((resolve, reject) => {
      const request = db.transaction('blocks', 'readonly').objectStore('blocks').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as StoredBlock[]);
    });
    db.close();
    const block = blocks.find(item => item.title === blockTitle);
    return block?.isPrioritised === true;
  }, title)
);

const seedLifeInboxBlocks = async (page: Page) => {
  await page.evaluate(async () => {
    const openPlannerDb = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('PlannerDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    const makeBlock = ({
      id,
      title,
      createdAt,
      isPrioritised,
    }: {
      id: string;
      title: string;
      createdAt: number;
      isPrioritised?: boolean;
    }) => ({
      id,
      title,
      durationMinutes: 30,
      date: undefined,
      startTime: undefined,
      endTime: undefined,
      isScheduled: false,
      isBaseEvent: false,
      isHidden: false,
      ...(isPrioritised === undefined ? {} : { isPrioritised }),
      sourceType: 'manual',
      travelEnabled: false,
      travelBeforeMinutes: 60,
      travelAfterMinutes: 60,
      features: {},
      createdAt,
      updatedAt: createdAt,
    });

    const db = await openPlannerDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('blocks', 'readwrite');
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();

      const store = transaction.objectStore('blocks');
      store.put(makeBlock({ id: 'legacy-no-priority', title: 'Legacy no priority field', createdAt: 1000 }));
      store.put(makeBlock({ id: 'older-priority', title: 'Older priority', createdAt: 2000, isPrioritised: true }));
      store.put(makeBlock({ id: 'newest-priority', title: 'Newest priority', createdAt: 3000, isPrioritised: true }));
      store.put(makeBlock({ id: 'newest-regular', title: 'Newest regular', createdAt: 4000, isPrioritised: false }));
    });

    db.close();
  });
};

interface StoredBlock {
  id: string;
  title: string;
  isPrioritised?: boolean;
  createdAt: number;
}
