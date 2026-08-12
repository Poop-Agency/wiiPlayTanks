import { expect, test } from '@playwright/test';

import { waitForGame } from './helpers';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

/**
 * Écran-titre, effets et son.
 *
 * Ce qui se vérifie ici, ce n'est pas que le jeu soit joli — aucun test ne le
 * dira. C'est que les finitions n'aient **aucune incidence sur la simulation** :
 * pas de particule dans l'état, pas d'erreur console, et le déterminisme
 * intact. Le reste relève du regard.
 */

test('l\'écran-titre s\'affiche et ne démarre rien', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'TANKS!' })).toBeVisible();

  // Rien ne tourne derrière : le moteur n'est même pas chargé tant qu'aucun
  // mode n'est choisi.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__tanks)).toBeUndefined();
});

test('l\'écran-titre lance la campagne', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Commencer la campagne' }).click();

  await page.waitForFunction(() => window.__tanks?.campaign !== undefined, undefined, {
    timeout: 10_000,
  });

  expect(await page.evaluate(() => window.__tanks!.campaign!.mission)).toBe(1);
});

test('l\'écran-titre permet de reprendre à une mission choisie', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Numéro de mission').fill('12');
  await page.getByRole('button', { name: 'Aller' }).click();

  await page.waitForFunction(() => window.__tanks?.campaign !== undefined, undefined, {
    timeout: 10_000,
  });

  expect(await page.evaluate(() => window.__tanks!.campaign!.mission)).toBe(12);
});

test('les effets ne laissent aucune trace dans l\'état simulé', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?bac=1');
  await waitForGame(page);

  // De quoi produire des traces de chenilles, des tirs, des mines et des
  // explosions — donc toutes les familles de particules.
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  await page.locator('#game').click({ position: { x: 200, y: 300 } });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(1200);

  // Le monde ne contient que les quatre familles d'entités connues. Une
  // particule qui s'y serait glissée ferait diverger le hachage entre deux
  // clients, et le test de déterminisme le dirait — mais autant le voir ici.
  const shape = await page.evaluate(() => Object.keys(window.__tanks!.world).sort());
  expect(shape).toEqual([
    'explosions',
    'grid',
    'mines',
    'nextEntityId',
    'rng',
    'shells',
    'tanks',
    'tick',
  ]);

  expect(errors).toEqual([]);
});

test('le son se coupe et se rappelle d\'une partie à l\'autre', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  // Un geste d'abord : les navigateurs refusent d'ouvrir un contexte audio sans.
  await page.locator('#game').click({ position: { x: 400, y: 400 } });
  await page.keyboard.press('KeyM');

  const stored = await page.evaluate(() => localStorage.getItem('tanks.audio'));
  expect(stored).toBeTruthy();
  expect(JSON.parse(stored!) as { muted: boolean }).toMatchObject({ muted: true });

  // Le réglage survit au rechargement : c'est tout l'intérêt de le persister.
  await page.reload();
  await page.waitForFunction(() => window.__tanks !== undefined);

  const afterReload = await page.evaluate(() => localStorage.getItem('tanks.audio'));
  expect(JSON.parse(afterReload!) as { muted: boolean }).toMatchObject({ muted: true });
});

test('une épave reste visible là où le tank est tombé', async ({ page }) => {
  await page.goto('/?bac=1');
  await waitForGame(page);

  // Dans l'original, un tank touché s'aplatit au sol plutôt que de disparaître :
  // l'épave dit au joueur où le coup est parti.
  await page.evaluate(() => {
    const tank = window.__tanks!.world.tanks.find((each) => each.playerId === null);
    if (tank) tank.alive = false;
  });
  await page.waitForTimeout(300);

  const wrecks = await page.evaluate(
    () => window.__tanks!.world.tanks.filter((tank) => !tank.alive).length,
  );

  // Le tank détruit reste dans l'état : c'est le rendu qui l'écrase, pas la
  // simulation qui l'efface.
  expect(wrecks).toBeGreaterThan(0);
});
