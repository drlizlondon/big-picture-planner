import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd());
const landingPath = path.join(repoRoot, 'landing/index.html');
const supabaseRef = 'ovdrrltrhctwvtngjiaw';
const authStorageKey = `sb-${supabaseRef}-auth-token`;

test.describe('public access journey', () => {
  test('landing page has an access-code route in the primary nav', async ({ page }) => {
    await openLanding(page);

    const codeLink = page.getByRole('link', { name: 'I have a code' });
    await expect(codeLink).toBeVisible();
    await expect(codeLink).toHaveAttribute('href', '/planner/?access=code&src=landing_nav');
  });

  test('landing page gives returning users a clear login route', async ({ page }) => {
    await openLanding(page);

    const navLogin = page.getByRole('link', { name: 'Log in' }).first();
    await expect(navLogin).toBeVisible();
    await expect(navLogin).toHaveAttribute('href', '/planner/sign-in?src=landing_nav_login');
    await expect(page.getByText('Already have an account?').first()).toBeVisible();
    await expect(page.getByText('Like Tetris for your real life.')).toBeVisible();
    await expect(page.getByText('ADHD')).toHaveCount(0);
  });

  test('I have a code opens the app access flow', async ({ page }) => {
    await openLanding(page);

    await page.getByRole('link', { name: 'I have a code' }).click();

    await expect(page).toHaveURL(/\/planner\/\?access=code&src=landing_nav$/);
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    await expect(page.getByText('If you have an access code, sign in first')).toBeVisible();
  });

  test('unauthenticated users see that code entry comes after sign-in', async ({ page }) => {
    await page.goto('?access=code&src=e2e');

    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    await expect(page.getByText('then enter it on the next screen')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try demo' })).toHaveAttribute('href', '/planner/?demo=1&src=signin');
    await expect(page.getByRole('link', { name: 'Back to landing / request access' })).toHaveAttribute('href', '/#request');
  });

  test('signed-in users without access see generic access-code copy', async ({ page }) => {
    await mockSignedInNoAccess(page);

    await page.goto('?access=code&src=e2e');

    await expect(page.getByRole('heading', { name: 'Enter your access code' })).toBeVisible();
    await expect(page.getByText('Codes may be for trial, friend/family, tester, press, or founder access.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expect(page.getByText('Founder Access code')).toHaveCount(0);
    await expect(page.getByText('Unlock Founding Access')).toHaveCount(0);
  });

  test('demo path still works and offers access next steps', async ({ page }) => {
    await page.goto('?demo=1&src=e2e');

    await expect(page.locator('[data-tour="add-button"]').first()).toBeAttached({ timeout: 10_000 });
    await expect(page.getByText("You're in demo mode")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Have a code? Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request access' })).toHaveAttribute('href', '/#request');
  });
});

const openLanding = async (page: Page) => {
  const html = await fs.readFile(landingPath, 'utf8');
  await page.route('http://localhost:4173/', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: html,
  }));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.goto('http://localhost:4173/');
};

const mockSignedInNoAccess = async (page: Page) => {
  await page.route(`https://${supabaseRef}.supabase.co/rest/v1/rpc/get_my_access`, route => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'No access for e2e user' }),
  }));

  await page.addInitScript(({ key }) => {
    const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_at: futureExpiry,
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'tester@example.com',
        email_confirmed_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    }));
  }, { key: authStorageKey });
};
