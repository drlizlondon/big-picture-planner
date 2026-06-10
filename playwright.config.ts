import { defineConfig, devices } from '@playwright/test';

/**
 * E2E responsive tests for the planner + onboarding demo.
 *
 * Runs against a PRODUCTION preview build (no React StrictMode double-mount),
 * across real device descriptors. iPhone/iPad projects use WebKit (the Safari
 * engine); Pixel/Desktop use Chromium — so this exercises both Safari-like and
 * Chrome-like mobile behaviour.
 *
 * One-time setup:  npm i -D @playwright/test && npx playwright install
 * Run:             npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/planner/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  use: {
    baseURL: 'http://localhost:4173/planner/',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'iPhone SE',          use: { ...devices['iPhone SE'] } },
    { name: 'iPhone 13 Mini',     use: { ...devices['iPhone 13 Mini'] } },
    { name: 'iPhone 15 Pro',      use: { ...devices['iPhone 15 Pro'] } },
    { name: 'iPhone 15 Pro Max',  use: { ...devices['iPhone 15 Pro Max'] } },
    { name: 'Pixel 7',            use: { ...devices['Pixel 7'] } },
    { name: 'iPad Mini',          use: { ...devices['iPad Mini'] } },
    { name: 'Desktop',            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
