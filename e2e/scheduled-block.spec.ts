import { expect, test, type Locator, type Page } from '@playwright/test';

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

  test('Backspace deletes the selected block without opening the editor', async ({ page }) => {
    const block = getSeededScheduledBlock(page);

    await block.click();
    await expect(page.locator('.scheduled-block-selected')).toBeVisible();
    await page.keyboard.press('Backspace');

    await expect(getSeededScheduledBlock(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Edit Block' })).toHaveCount(0);
  });

  test('Delete deletes the selected block', async ({ page }) => {
    const block = getSeededScheduledBlock(page);

    await block.click();
    await expect(page.locator('.scheduled-block-selected')).toBeVisible();
    await page.keyboard.press('Delete');

    await expect(getSeededScheduledBlock(page)).toHaveCount(0);
  });

  test('Ctrl+B does not delete the selected block', async ({ page }) => {
    const block = getSeededScheduledBlock(page);

    await block.click();
    await page.keyboard.press('Control+B');

    await expect(getSeededScheduledBlock(page)).toHaveCount(1);
    await expect(page.locator('.scheduled-block-selected')).toBeVisible();
  });

  test('Ctrl+C copies and Ctrl+V pastes at the last clicked planner slot', async ({ page }) => {
    const sourceBlock = getSeededScheduledBlock(page);
    const sourceId = await sourceBlock.getAttribute('data-block-id');
    expect(sourceId).toBeTruthy();
    const today = await getTodayDate(page);

    await sourceBlock.click();
    await expect(page.locator('.scheduled-block-selected')).toBeVisible();
    await page.keyboard.press('Control+C');
    await page.locator(`[data-slot-date="${today}"][data-slot-time="11:00"]`).click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('Control+V');

    await expect(getSeededScheduledBlock(page)).toHaveCount(2);
    const blocks = await getStoredBlocks(page);
    const pastedBlock = blocks.find(block => block.id !== sourceId);
    expect(pastedBlock).toMatchObject({
      title: 'Tiny typography check',
      description: 'Seeded by Playwright',
      durationMinutes: 60,
      categoryId: 'e2e-category',
      date: today,
      startTime: '11:00',
      isScheduled: true,
    });
    expect(pastedBlock?.id).not.toBe(sourceId);
    await expect(page.locator('.scheduled-block-selected')).toHaveAttribute('data-block-id', pastedBlock!.id);
  });

  test('Ctrl+V falls back to a sensible visible-week slot without a clicked position', async ({ page }) => {
    const sourceBlock = getSeededScheduledBlock(page);
    const sourceId = await sourceBlock.getAttribute('data-block-id');

    await sourceBlock.click();
    await expect(page.locator('.scheduled-block-selected')).toBeVisible();
    await page.keyboard.press('Control+C');
    await page.keyboard.press('Control+V');

    await expect(getSeededScheduledBlock(page)).toHaveCount(2);
    const pastedBlock = (await getStoredBlocks(page)).find(block => block.id !== sourceId);
    expect(pastedBlock?.id).toBeTruthy();
    expect(pastedBlock?.startTime).toMatch(/^\d{2}:(00|15|30|45)$/);
    expect(pastedBlock?.date).toBeTruthy();
    await expect(page.locator('.scheduled-block-selected')).toHaveAttribute('data-block-id', pastedBlock!.id);
  });

  test('shortcuts do not delete or paste while editing text', async ({ page }) => {
    await getSeededScheduledBlock(page).dblclick();
    const titleInput = page.getByRole('dialog').locator('input').first();

    await titleInput.focus();
    await page.keyboard.press('Control+C');
    await page.keyboard.press('Control+V');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Delete');

    await expect(page.getByRole('heading', { name: 'Edit Block' })).toBeVisible();
    expect(await getStoredBlocks(page)).toHaveLength(1);
  });

  test('planner text zoom buttons resize scheduled block text and persist', async ({ page }) => {
    const title = page.locator('.scheduled-block-title').filter({ hasText: 'Tiny typography check' });
    const initialSize = await getFontSize(title);

    await page.getByRole('button', { name: 'Increase planner text' }).click();
    const increasedSize = await getFontSize(title);

    expect(increasedSize).toBeGreaterThan(initialSize);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('planner.textScale'))).toBe('1.1');

    await page.reload();
    await expect(getSeededScheduledBlock(page)).toBeVisible();
    expect(await getFontSize(page.locator('.scheduled-block-title').filter({ hasText: 'Tiny typography check' }))).toBeCloseTo(increasedSize, 1);

    await page.getByRole('button', { name: 'Decrease planner text' }).click();
    expect(await getFontSize(page.locator('.scheduled-block-title').filter({ hasText: 'Tiny typography check' }))).toBeLessThan(increasedSize);
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

interface StoredBlock {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  categoryId?: string;
  date?: string;
  startTime?: string;
  isScheduled: boolean;
  deletedAt?: number;
}

const getTodayDate = async (page: Page) => page.evaluate(() => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
});

const getStoredBlocks = async (page: Page) => page.evaluate(async () => {
  const openRequest = indexedDB.open('PlannerDB');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => resolve(openRequest.result);
  });

  const blocks = await new Promise<StoredBlock[]>((resolve, reject) => {
    const request = db.transaction('blocks', 'readonly').objectStore('blocks').getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.filter((block: StoredBlock) => !block.deletedAt));
  });

  db.close();
  return blocks;
});

const getFontSize = async (locator: Locator) => {
  await expect(locator).toBeVisible();
  const fontSize = await locator.evaluate(element => window.getComputedStyle(element).fontSize);
  return Number(fontSize.replace('px', ''));
};
