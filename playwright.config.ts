import { defineConfig, devices } from '@playwright/test';

/**
 * Le jeu se dessine intégralement dans un canevas : il n'y a pas de DOM à
 * interroger. Les tests bout-en-bout travaillent donc par capture d'écran et
 * par inspection de l'état exposé sur `window` en mode debug.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});
