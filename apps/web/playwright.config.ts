import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  reporter: [
    ['list'],
    [
      'html',
      { outputFolder: resolve(__dirname, '../../qa-artifacts/playwright-report'), open: 'never' },
    ],
  ],
  outputDir: resolve(__dirname, '../../qa-artifacts/test-results'),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
});
