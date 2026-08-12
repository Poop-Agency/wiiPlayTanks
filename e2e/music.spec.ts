import { expect, test } from '@playwright/test';

import { waitForGame } from './helpers';

/**
 * Musique de fond et récap d'avant-round.
 *
 * ⚠ Ces tests doivent passer **avec ou sans** fichiers dans `public/musique/` :
 * le dépôt n'en fournit aucun, mais une installation locale en a. Ils portent
 * donc sur ce qui vaut dans les deux cas — la mission visée, l'absence
 * d'erreur, et le fait qu'un fichier manquant ne soit pas redemandé sans fin.
 */

/** Débloque l'audio : les navigateurs refusent de jouer sans geste préalable. */
async function gesture(page: import('@playwright/test').Page): Promise<void> {
  await page.mouse.click(450, 400);
  await page.waitForTimeout(400);
}

test('la musique vise la mission affichée, sans erreur', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?mission=5');
  await waitForGame(page);
  await gesture(page);

  await expect.poll(() => page.evaluate(() => window.__tanks?.music?.state.mission)).toBe(5);

  // Le morceau joue, ou il est absent — jamais les deux, jamais ni l'un ni
  // l'autre en silence inexpliqué.
  const state = await page.evaluate(() => window.__tanks!.music!.state);
  expect(state.playing || state.missing.length > 0).toBe(true);

  // Et dans tous les cas, la simulation continue.
  const before = await page.evaluate(() => window.__tanks!.world.tick);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tanks!.world.tick)).toBeGreaterThan(before);

  expect(consoleErrors).toEqual([]);
});

test('un fichier introuvable n\'est pas redemandé sans fin', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/musique/')) urls.push(request.url());
  });

  await page.goto('/?mission=4');
  await waitForGame(page);
  await gesture(page);
  await page.waitForTimeout(1200);

  // `playForMission` est appelé à chaque pas de simulation. Sans la mémoire des
  // fichiers absents, ce serait soixante requêtes par seconde. On compte les
  // URL distinctes : un fichier présent peut légitimement être récupéré en
  // plusieurs morceaux.
  expect(new Set(urls).size).toBeLessThanOrEqual(2);
});

test('le récap annonce les ennemis du round suivant', async ({ page }) => {
  await page.goto('/?mission=1');
  await waitForGame(page);

  // Mission vidée : le temps mort qui suit affiche le récap de la mission 2.
  await page.evaluate(() => {
    for (const tank of window.__tanks!.world.tanks) {
      if (tank.playerId === null) tank.alive = false;
    }
  });

  // D'abord la fin de manche, monde figé.
  await expect
    .poll(() => page.evaluate(() => window.__tanks?.campaign?.phase), { timeout: 10_000 })
    .toBe('ending');
  expect(await page.evaluate(() => window.__tanks!.campaign!.outcome)).toBe('cleared');

  // Puis l'annonce du round suivant, qui est bien celui d'après et non celui
  // qu'on vient de finir. Le récap lui-même est peint dans le canevas ; ce
  // qu'on verrouille ici, c'est la phase et la mission qu'il décrit.
  await expect
    .poll(() => page.evaluate(() => window.__tanks?.campaign?.phase), { timeout: 10_000 })
    .toBe('briefing');
  expect(await page.evaluate(() => window.__tanks!.campaign!.mission)).toBe(2);

  // La simulation reste figée pendant l'annonce : on ne joue pas à l'aveugle
  // derrière le panneau.
  const frozen = await page.evaluate(async () => {
    const before = window.__tanks!.world.tick;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return window.__tanks!.world.tick === before;
  });
  expect(frozen).toBe(true);

  // Puis tout repart.
  await expect
    .poll(() => page.evaluate(() => window.__tanks?.campaign?.phase), { timeout: 10_000 })
    .toBe('playing');
});

test('l\'annonce d\'ouverture a sa musique, même déclenchée avant le premier geste', async ({
  page,
}) => {
  // Une partie s'ouvre sur son annonce, donc *avant* que le joueur n'ait rien
  // touché — or le navigateur interdit tout son tant qu'il n'y a pas eu de
  // geste. Sans rattrapage au déblocage, cette annonce-là serait la seule à
  // rester muette.
  await page.goto('/?mission=1');
  await page.waitForFunction(() => window.__tanks !== undefined, undefined, { timeout: 15_000 });

  await expect.poll(() => page.evaluate(() => window.__tanks?.campaign?.phase)).toBe('briefing');
  expect(await page.evaluate(() => window.__tanks!.music!.state.lastJingle)).toBeNull();

  await page.mouse.click(450, 300);

  const state = await page.evaluate(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return window.__tanks!.music!.state;
  });

  // Le fichier n'est pas fourni avec le dépôt : on n'exige la ponctuation que
  // s'il est effectivement là.
  const absent = state.missing.some((url) => url.includes('Start'));
  if (!absent) expect(state.lastJingle).toBe('interlude');
});
