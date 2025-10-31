import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'line',
  use: {
    baseURL: process.env["TEST_TARGET"] ?? 'http://localhost:8000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: "setup",
      testDir: ".",
      testMatch: /.*\.setup\.ts/
    },
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
     command: `${path.resolve(import.meta.dirname, "start_server.sh")}`,
     url:  process.env["TEST_TARGET"] ?? 'http://127.0.0.1:8000',
     reuseExistingServer: true,
     stdout: 'pipe',
      stderr: 'pipe',
  },
});
