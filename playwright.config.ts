import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '5173';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Cap workers locally — past 4 workers the demo Vite dev server's HMR
  // socket and the shared seed state start to race on cross-project runs.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? 'github' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  // Only auto-boot the dev server when running against localhost
  webServer: BASE_URL.includes('localhost')
    ? {
        command: 'npm run dev',
        url: BASE_URL,
        timeout: 60_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
