import { defineConfig, devices } from '@playwright/test';

/**
 * Le jeu se dessine intégralement dans un canevas : il n'y a pas de DOM à
 * interroger. Les tests bout-en-bout travaillent donc par capture d'écran et
 * par inspection de l'état exposé sur `window` en mode debug.
 *
 * Deux serveurs sont démarrés :
 *
 *   - **Vite**, sur 5173, pour le solo et le terrain d'essai ;
 *   - **le serveur de jeu**, sur 3000, pour le co-op (#13). Il sert lui-même
 *     `dist/`, d'où la construction préalable.
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

    launchOptions: {
      /**
       * Chromium ralentit `requestAnimationFrame` dans les onglets en
       * arrière-plan. Les tests de co-op ouvrent deux pages : sans ces
       * drapeaux, celle qui n'a pas le dessus tombe à quelques images par
       * seconde et cesse d'émettre des intentions — ce qui ressemble trait pour
       * trait à une panne réseau, et fait échouer les tests pour une raison qui
       * n'a rien à voir avec le jeu.
       */
      args: [
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'bun run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      // Le serveur de jeu sert `dist/` : il faut donc construire avant.
      command: 'bun run build && bun run serve',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
