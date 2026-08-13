import { expect, test } from '@playwright/test';

/**
 * Déroulement de la campagne dans le navigateur.
 *
 * Ces tests court-circuitent le combat : ils marquent directement des tanks
 * comme détruits à travers la passerelle de diagnostic. C'est délibéré — ce
 * qu'on vérifie ici est l'**enchaînement** (temps mort, réserve, reprise,
 * fin de partie), pas la physique, qui a ses propres tests. Piloter un vrai duel
 * rendrait ces vérifications lentes et probabilistes.
 */

/** État de campagne publié par le client. */
async function campaign(page: import('@playwright/test').Page) {
  return page.evaluate(() => window.__tanks?.campaign);
}

/** Marque comme détruits les tanks correspondant au prédicat. */
async function destroy(page: import('@playwright/test').Page, side: 'player' | 'enemies') {
  await page.evaluate((which) => {
    const world = window.__tanks!.world;
    for (const tank of world.tanks) {
      const isPlayer = tank.playerId !== null;
      if (which === 'player' ? isPlayer : !isPlayer) tank.alive = false;
    }
  }, side);
}

test('la campagne démarre sur la première mission', async ({ page }) => {
  await page.goto('/?mission=1');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  const view = await campaign(page);

  expect(view?.mission).toBe(1);
  expect(view?.missionName).toBe('Champ de tir');
  expect(view?.totalMissions).toBe(100);
  expect(view?.spares).toBe(3);
  expect(view?.status).toBe('playing');
  // La première mission n'oppose qu'un tank brun, comme dans le relevé de
  // progression de l'ancienne version.
  expect(view?.enemiesLeft).toBe(1);
});

test('on peut ouvrir directement une mission donnée', async ({ page }) => {
  await page.goto('/?mission=17');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  const view = await campaign(page);

  expect(view?.mission).toBe(17);
  // Six tanks verts : c'est l'effectif relevé pour cette mission.
  expect(view?.enemiesLeft).toBe(6);
});

test('un numéro de mission hors bornes retombe dans la campagne', async ({ page }) => {
  // 99 est désormais une mission valide (remixée) : le hors-bornes se teste
  // au-delà des cent missions de la campagne étendue.
  await page.goto('/?mission=999');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  expect((await campaign(page))?.mission).toBe(100);
});

test('une mission remixée (au-delà de 20) se charge et s\'annonce', async ({ page }) => {
  await page.goto('/?mission=47');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  const view = await campaign(page);
  expect(view?.mission).toBe(47);
  // Pas de nom fixe à vérifier ici : c'est une mission générée. Ce qui compte
  // est qu'elle porte au moins un ennemi et se charge sans erreur.
  expect(view?.enemiesLeft).toBeGreaterThan(0);
});

test('le palier 50 charge le tank noir', async ({ page }) => {
  await page.goto('/?mission=50');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  const hasBlackTank = await page.evaluate(
    () => window.__tanks!.world.tanks.some((tank) => tank.playerId === null && tank.color === 'black'),
  );
  expect(hasBlackTank).toBe(true);
});

test('détruire tous les ennemis fait passer à la mission suivante', async ({ page }) => {
  await page.goto('/?mission=1');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  await destroy(page, 'enemies');

  // Le bandeau de réussite s'affiche avant le changement de monde : la
  // simulation continue de tourner pendant le temps mort pour que l'explosion
  // du dernier ennemi se joue entièrement.
  await page.waitForFunction(() => window.__tanks?.campaign?.outcome === 'cleared');

  await page.waitForFunction(() => window.__tanks?.campaign?.mission === 2, undefined, {
    timeout: 10_000,
  });

  const view = await campaign(page);
  expect(view?.missionName).toBe('Deux barrages');
  expect(view?.attempt).toBe(1);
  // Aucun tank offert avant la cinquième mission.
  expect(view?.spares).toBe(3);

  // Le terrain affiché doit avoir suivi : les deux missions commencent à la
  // version 0, et un cache indexé sur ce seul numéro garderait l'arène
  // précédente à l'écran.
  const painted = await page.locator('#game').evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext('2d')!;
    const { data } = context.getImageData(0, 0, target.width, target.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += data[i]!;
    return sum;
  });
  expect(painted).toBeGreaterThan(0);
});

test('vider la centième mission fait basculer la campagne en victoire', async ({ page }) => {
  // Vérifie le câblage de bout en bout jusqu'à la vraie fin — sans simuler
  // les cent missions à la suite, ce que les tests unitaires couvrent déjà
  // pour chacune des cent définitions, en une fraction du temps.
  await page.goto('/?mission=100');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  await destroy(page, 'enemies');

  await page.waitForFunction(() => window.__tanks?.campaign?.status === 'victory', undefined, {
    timeout: 10_000,
  });

  expect((await campaign(page))?.mission).toBe(100);
});

test('perdre son tank consomme la réserve et rejoue la mission', async ({ page }) => {
  await page.goto('/?mission=4');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  await destroy(page, 'player');

  await page.waitForFunction(() => window.__tanks?.campaign?.attempt === 2, undefined, {
    timeout: 10_000,
  });

  const view = await campaign(page);
  expect(view?.mission).toBe(4);
  expect(view?.spares).toBe(2);
  expect(view?.status).toBe('playing');
  expect(view?.playerAlive).toBe(true);
});

test('la réserve épuisée termine la partie, et Entrée la reprend', async ({ page }) => {
  await page.goto('/?mission=2');
  await page.waitForFunction(() => window.__tanks?.campaign !== undefined);

  // Trois tanks de réserve : le quatrième échec est celui de trop.
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.waitForFunction(() => window.__tanks?.campaign?.playerAlive === true, undefined, {
      timeout: 10_000,
    });
    await destroy(page, 'player');

    await page.waitForFunction(
      (expected) => {
        const view = window.__tanks?.campaign;
        return view?.attempt === expected || view?.status === 'gameOver';
      },
      attempt + 1,
      { timeout: 10_000 },
    );
  }

  const over = await campaign(page);
  expect(over?.status).toBe('gameOver');
  expect(over?.spares).toBe(0);
  // La mission où la partie s'arrête reste affichée.
  expect(over?.mission).toBe(2);

  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__tanks?.campaign?.status === 'playing');

  const restarted = await campaign(page);
  expect(restarted?.mission).toBe(1);
  expect(restarted?.spares).toBe(3);
});

test('le terrain d\'essai n\'a pas de campagne', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForFunction(() => (window.__tanks?.world.tick ?? 0) > 10);

  expect(await campaign(page)).toBeUndefined();
});

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts :
// deux `declare global` concurrents pour la même propriété ne compileraient pas.
import '../src/client/debug-bridge';
