import { expect, test } from '@playwright/test';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

/**
 * Co-op en ligne, deux navigateurs dans la même salle.
 *
 * ─── Ce que ces tests exigent de l'environnement ────────────────────────────
 *
 * Un serveur de jeu doit tourner sur le port 3000 (`bun run serve`), et le
 * client doit avoir été construit (`bun run build`) puisque c'est ce serveur qui
 * sert les fichiers. `playwright.config.ts` s'en charge.
 *
 * ⚠ Chromium ralentit le `requestAnimationFrame` des onglets en arrière-plan.
 * Avec deux pages ouvertes, celle qui n'a pas le dessus voit sa boucle de jeu
 * tomber à quelques images par seconde et n'envoie plus d'intentions — ce qui
 * ressemble trait pour trait à une panne réseau. Les drapeaux de lancement du
 * projet désactivent ce ralentissement.
 */

const SERVER = 'http://localhost:3000';

/**
 * Ouvre un client dans une salle et attend sa première réception.
 *
 * Ne démarre rien : c'est `startGame` qui le fait, et la distinction compte
 * depuis qu'une partie commencée ne se rejoint plus. Deux joueurs qui veulent
 * jouer ensemble doivent donc être entrés **avant** le départ.
 */
async function openClient(page: Page, room: string, name: string): Promise<void> {
  await page.goto(`${SERVER}/?enligne=1&salon=${room}&nom=${name}`);

  await page.waitForFunction(
    () =>
      window.__tanks?.campaign?.lobby !== undefined ||
      (window.__tanks?.campaign?.enemiesLeft ?? 0) > 0,
    undefined,
    { timeout: 10_000 },
  );
}

/**
 * Lance la partie depuis le salon, et attend qu'elle tourne vraiment.
 *
 * ⚠ `enemiesLeft > 0` ne suffit pas : une mission commence par une **annonce de
 * trois secondes** pendant laquelle les ennemis sont déjà en place mais où la
 * simulation est figée. Les tests qui mesuraient un déplacement juste après ce
 * point tombaient dans un monde immobile et lisaient zéro. Ils passaient tant
 * que la machine était assez lente pour que l'annonce s'achève entre-temps — un
 * test dont le résultat dépend de la vitesse de la machine ne vaut rien.
 */
async function startGame(page: Page): Promise<void> {
  if (await page.evaluate(() => window.__tanks?.campaign?.lobby !== undefined)) {
    await page.bringToFront();
    await page.keyboard.press('Enter');
  }

  await waitPlaying(page);
}

/** Attend que la simulation tourne — ni salon, ni annonce de mission. */
async function waitPlaying(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tanks?.campaign?.phase === 'playing', undefined, {
    timeout: 15_000,
  });
  await page.waitForFunction(() => (window.__tanks?.campaign?.enemiesLeft ?? 0) > 0, undefined, {
    timeout: 15_000,
  });
}

/**
 * Deux clients assis dans la même partie.
 *
 * Ils entrent **tous les deux avant le départ** : une partie commencée ne se
 * rejoint plus, le retardataire devient spectateur.
 */
async function openSeatedPair(
  alpha: Page,
  beta: Page,
  room: string,
): Promise<void> {
  await openClient(alpha, room, 'Alpha');
  await openClient(beta, room, 'Beta');
  await startGame(alpha);
  await waitPlaying(beta);
}

/** Positions des tanks de joueurs, telles que cette page les connaît. */
async function playerTanks(page: Page) {
  return page.evaluate(() =>
    window
      .__tanks!.world.tanks.filter((tank) => tank.playerId !== null)
      .map((tank) => ({ id: tank.id, x: tank.x, y: tank.y }))
      .sort((left, right) => left.id - right.id),
  );
}

/** Salle distincte par test : les tests tournent en parallèle sur un serveur unique. */
let counter = 0;
const uniqueRoom = (): string => `e2e-${Date.now()}-${counter++}`;

test('la connexion n\'affiche jamais un faux bandeau d\'échec', async ({ browser }) => {
  // Régression : tant qu'aucun instantané n'est encore arrivé, le monde local
  // est un monde d'attente sans le moindre tank. `missionOutcome` y lisait
  // « aucun joueur vivant » et affichait « TANK DÉTRUIT » avant même que la
  // connexion se termine — systématique au premier chargement d'un client co-op.
  const room = uniqueRoom();
  const page = await browser.newPage();

  await page.goto(`${SERVER}/?enligne=1&salon=${room}&nom=Alpha`);

  // Fenêtre d'observation courte, volontairement avant que la connexion soit
  // établie : c'est exactement l'instant où le faux bandeau apparaissait.
  for (let attempt = 0; attempt < 20; attempt++) {
    const outcome = await page.evaluate(() => window.__tanks?.campaign?.outcome);
    expect(outcome).not.toBe('failed');
    if (outcome !== undefined) break;
    await page.waitForTimeout(20);
  }

  // Le salon n'a plus de départ automatique : sans appuyer sur Entrée, la
  // partie resterait en attente indéfiniment.
  await page.waitForFunction(() => window.__tanks?.campaign?.lobby !== undefined, undefined, {
    timeout: 10_000,
  });
  expect(await page.evaluate(() => window.__tanks!.campaign!.outcome)).toBe('playing');

  await page.bringToFront();
  await page.keyboard.press('Enter');

  await page.waitForFunction(() => (window.__tanks?.campaign?.enemiesLeft ?? 0) > 0, undefined, {
    timeout: 15_000,
  });
  expect(await page.evaluate(() => window.__tanks!.campaign!.outcome)).toBe('playing');

  await page.close();
});

test('deux joueurs partagent la même partie', async ({ browser }) => {
  const room = uniqueRoom();
  const alpha = await browser.newPage();
  const beta = await browser.newPage();

  await openSeatedPair(alpha, beta, room);

  // Chacun voit l'autre dans son HUD.
  await expect
    .poll(() => alpha.evaluate(() => window.__tanks?.campaign?.teammates))
    .toEqual(['Beta']);
  await expect
    .poll(() => beta.evaluate(() => window.__tanks?.campaign?.teammates))
    .toEqual(['Alpha']);

  // Deux tanks de joueurs, à des positions distinctes, dans les deux mondes.
  const seenByAlpha = await playerTanks(alpha);
  const seenByBeta = await playerTanks(beta);

  expect(seenByAlpha).toHaveLength(2);
  expect(seenByBeta).toHaveLength(2);
  expect(seenByAlpha[0]!.id).not.toBe(seenByAlpha[1]!.id);

  await alpha.close();
  await beta.close();
});

test('le déplacement d\'un joueur est vu par l\'autre', async ({ browser }) => {
  const room = uniqueRoom();
  const alpha = await browser.newPage();
  const beta = await browser.newPage();

  await openSeatedPair(alpha, beta, room);
  await alpha.bringToFront();

  const before = (await playerTanks(beta))[0]!;

  // Vers le haut : les coéquipiers apparaissent côte à côte, et partir vers son
  // voisin ne mesurerait qu'une collision entre tanks.
  await alpha.keyboard.down('ArrowUp');
  await alpha.waitForTimeout(1000);
  await alpha.keyboard.up('ArrowUp');
  await alpha.waitForTimeout(300);

  const after = (await playerTanks(beta))[0]!;

  // Une seconde à environ 3,3 tuiles par seconde. La marge est large : ce qu'on
  // vérifie est que le mouvement traverse le serveur, pas sa vitesse — elle a
  // ses propres tests.
  expect(before.y - after.y).toBeGreaterThan(1.5);
  expect(before.x).toBeCloseTo(after.x, 3);

  await alpha.close();
  await beta.close();
});

test('le tank local répond immédiatement, sans attendre le serveur', async ({ browser }) => {
  const room = uniqueRoom();
  const alpha = await browser.newPage();
  await openClient(alpha, room, 'Alpha');
  await startGame(alpha);
  await alpha.bringToFront();

  // Trois images après l'appui : sans prédiction locale, il ne se serait encore
  // rien passé — l'aller-retour vers le serveur dure plus longtemps que ça.
  const moved = await alpha.evaluate(async () => {
    const own = (): number => {
      const world = window.__tanks!.world;
      return world.tanks.find((tank) => tank.playerId !== null)?.y ?? 0;
    };

    const before = own();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));

    for (let frame = 0; frame < 3; frame++) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }

    const after = own();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
    return before - after;
  });

  expect(moved).toBeGreaterThan(0);

  await alpha.close();
});

test('la déconnexion d\'un joueur ne perturbe ni l\'IA ni les autres', async ({ browser }) => {
  const room = uniqueRoom();
  const alpha = await browser.newPage();
  const beta = await browser.newPage();

  await openSeatedPair(alpha, beta, room);
  await beta.bringToFront();

  const enemiesBefore = await beta.evaluate(() => window.__tanks!.campaign!.enemiesLeft);
  const tickBefore = await beta.evaluate(() => window.__tanks!.world.tick);

  await alpha.close();

  // Le coéquipier reste annoncé, mais hors ligne : une coupure de quelques
  // secondes est banale, et le retirer aussitôt de la liste laisserait croire
  // qu'il a quitté la partie. Son siège lui est gardé — la disparition
  // définitive après le délai de grâce a son propre test unitaire.
  await expect
    .poll(() => beta.evaluate(() => window.__tanks?.campaign?.teammates), { timeout: 10_000 })
    .toEqual(['Alpha (hors ligne)']);

  await beta.waitForTimeout(600);

  // L'ancienne version désignait `player1` maître de l'IA : sa déconnexion
  // arrêtait net les ennemis. Ici l'IA appartient au serveur.

  expect(await beta.evaluate(() => window.__tanks!.world.tick)).toBeGreaterThan(tickBefore + 20);
  expect(await beta.evaluate(() => window.__tanks!.campaign!.enemiesLeft)).toBe(enemiesBefore);

  await beta.close();
});

test('deux salons différents ne se mélangent pas', async ({ browser }) => {
  const alpha = await browser.newPage();
  const beta = await browser.newPage();

  await openClient(alpha, uniqueRoom(), 'Alpha');
  await openClient(beta, uniqueRoom(), 'Beta');
  await startGame(alpha);
  await startGame(beta);

  expect(await alpha.evaluate(() => window.__tanks?.campaign?.teammates)).toEqual([]);
  expect(await playerTanks(alpha)).toHaveLength(1);
  expect(await playerTanks(beta)).toHaveLength(1);

  await alpha.close();
  await beta.close();
});

test('un arrivant en cours de partie regarde, puis entre quand on l\'accepte', async ({
  browser,
}) => {
  const room = uniqueRoom();
  const alpha = await browser.newPage();
  const beta = await browser.newPage();

  await openClient(alpha, room, 'Alpha');
  await startGame(alpha);

  // Beta arrive après le départ : il n'a pas de tank, et il le sait.
  await openClient(beta, room, 'Beta');
  await expect.poll(() => beta.evaluate(() => window.__tanks?.campaign?.spectating)).toBe(true);
  expect(await playerTanks(beta)).toHaveLength(1);

  // Alpha, lui, le voit attendre — et c'est à lui de décider.
  await expect
    .poll(() => alpha.evaluate(() => window.__tanks?.campaign?.spectators?.map((p) => p.name)))
    .toEqual(['Beta']);

  const admit = alpha.locator('.salon-attente-ligne button');
  await expect(admit).toBeVisible();
  await admit.click();

  // Le siège lui est accordé : il n'est plus spectateur, et l'invite disparaît
  // de l'écran d'Alpha.
  //
  // Le test s'arrête ici volontairement. L'installation effective a lieu au
  // chargement de la mission suivante, et l'atteindre depuis un navigateur
  // supposerait de nettoyer une arène au jugé — long, et surtout dépendant de
  // l'adresse au tir. C'est un test unitaire dans `netcode.test.ts`.
  await expect.poll(() => beta.evaluate(() => window.__tanks?.campaign?.spectating)).toBe(false);
  await expect(admit).toHaveCount(0);

  await alpha.close();
  await beta.close();
});
