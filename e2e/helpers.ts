/**
 * Utilitaires partagés par les tests bout-en-bout.
 *
 * Ce fichier n'est pas collecté par Playwright : seuls les `*.spec.ts` le sont.
 */

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

/**
 * Attend que le jeu soit réellement démarré.
 *
 * ⚠ À utiliser après chaque `goto`, à la place d'un délai fixe.
 *
 * Le point d'entrée n'est qu'un aiguillage : il charge le moteur par un
 * `import()` différé, pour que l'écran-titre n'entraîne pas le jeu avec lui.
 * Le démarrage est donc **asynchrone**, et sa durée dépend du serveur qui sert
 * le module — instantané une fois construit, sensiblement plus long au premier
 * passage en développement.
 *
 * Les tests attendaient trois cents millisecondes. Ça a suffi tant que le
 * démarrage était synchrone ; le jour où il a cessé de l'être, neuf tests ont
 * échoué d'un coup sur un `window.__tanks` encore indéfini.
 */
export async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tanks !== undefined, undefined, { timeout: 15_000 });

  // Quelques pas de simulation, pour que l'état observé ne soit pas celui de la
  // toute première frame.
  await page.waitForFunction(() => (window.__tanks?.world.tick ?? 0) > 3, undefined, {
    timeout: 15_000,
  });
}

/** Ouvre une page et attend que le jeu tourne. */
export async function openGame(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await waitForGame(page);
}
