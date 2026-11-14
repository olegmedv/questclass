import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env['CI']);

/**
 * e2e suite: Chromium on a phone (390×844) and a desktop (1440×900) viewport.
 * Global setup starts the built API and SPA on a temporary DATA_DIR (see global-setup.ts).
 * Screenshot baselines live in __screenshots__ and are made only in the Linux Playwright
 * container (`pnpm e2e:update`).
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: '.output/results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // A missing baseline fails in CI instead of being written there.
  updateSnapshots: CI ? 'none' : 'missing',
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: '.output/report' }]]
    : [['list']],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    locale: 'ru-RU',
    timezoneId: 'Europe/Kaliningrad',
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
});
