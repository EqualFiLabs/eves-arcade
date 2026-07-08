import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Headless software-GL renders slower than real GPUs; fights take ~20-30s to
  // reach KO, so the global timeout gives room for KO + result flow + replay.
  timeout: 120_000,
  reporter: 'list',
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Desktop: runs the full gameplay suite (landscape playability).
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /orientation\.spec\.ts|mobile-touch\.spec\.ts/,
    },
    {
      // Mobile portrait: only the orientation gate (Req 7.3).
      name: 'mobile-portrait',
      testMatch: /orientation\.spec\.ts/,
      use: {
        viewport: { width: 414, height: 896 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      // Mobile landscape: touch overlay zone dispatch (Req 6.3, 6.5).
      name: 'mobile-landscape',
      testMatch: /mobile-touch\.spec\.ts/,
      use: {
        viewport: { width: 896, height: 414 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
});
