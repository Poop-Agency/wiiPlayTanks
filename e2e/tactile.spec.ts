import { devices, expect, test } from '@playwright/test';

import { waitForGame } from './helpers';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

/**
 * Commandes tactiles.
 *
 * Rien ne remplace un vrai téléphone pour juger de l'ergonomie, mais la chaîne
 * — geste, échantillonnage, simulation — se vérifie ici.
 *
 * Deux points fragiles, et ce sont eux que ces tests gardent : le plateau ne
 * doit répondre à aucun contact du doigt (au doigt, `button` vaut toujours
 * zéro, donc sans filtre chaque effleurement partirait en coup), et la visée
 * doit **rester** après relâchement — c'est ce qui permet de pointer puis de
 * tirer avec le même pouce.
 */

/**
 * Téléphone tenu à l'horizontale.
 *
 * `isMobile` est ce qui fait basculer `pointer: coarse`, dont dépend
 * l'apparition des commandes ; `hasTouch` seul ne suffit pas.
 */
test.use({
  ...devices['Pixel 5 landscape'],
  isMobile: true,
  hasTouch: true,
});

type Page = import('@playwright/test').Page;

/** Position, orientation du canon et compte d'obus du tank du joueur. */
async function state(page: Page) {
  return page.evaluate(() => {
    const world = window.__tanks!.world;
    const tank = world.tanks[0]!;
    return { x: tank.x, y: tank.y, turret: tank.turretAngle, shells: world.shells.length };
  });
}

/**
 * Rejoue une suite de gestes au doigt.
 *
 * Playwright ne sait pas glisser au tactile — `touchscreen` ne propose que le
 * tap. On émet donc les `PointerEvent` nous-mêmes, avec le `pointerType` qui
 * distingue le doigt de la souris et qui est précisément ce que le code teste.
 */
async function touchDrag(
  page: Page,
  selector: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  holdMs: number,
): Promise<void> {
  await page.evaluate(
    ({ selector, from }) => {
      const target = document.querySelector(selector)!;
      const bounds = target.getBoundingClientRect();
      const options = {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + from.x,
        clientY: bounds.top + from.y,
      };
      target.dispatchEvent(new PointerEvent('pointerdown', options));
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          ...options,
          clientX: bounds.left + from.x,
          clientY: bounds.top + from.y,
        }),
      );
    },
    { selector, from },
  );

  await page.evaluate(
    ({ selector, to }) => {
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          bubbles: true,
          clientX: bounds.left + to.x,
          clientY: bounds.top + to.y,
        }),
      );
    },
    { selector, to },
  );

  await page.waitForTimeout(holdMs);

  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', bubbles: true }),
    );
  });
}

test('les commandes tactiles apparaissent sur un écran au doigt', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  await expect(page.locator('.touch-stick--move')).toBeAttached();
  await expect(page.locator('.touch-stick--aim')).toBeAttached();
  await expect(page.locator('.touch-button--fire')).toBeVisible();
  await expect(page.locator('.touch-button--mine')).toBeVisible();
});

test('le stick gauche déplace le tank', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  const before = await state(page);

  // Pouce posé au milieu de la zone, puis poussé vers le haut bien au-delà du
  // rayon de saturation : la consigne doit être plein nord.
  await touchDrag(page, '.touch-stick--move', { x: 100, y: 140 }, { x: 100, y: 20 }, 700);

  const after = await state(page);
  expect(after.y).toBeLessThan(before.y - 1);
});

test('le stick droit oriente le canon, et la visée reste après relâchement', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  // Poussé plein sud : dans le repère du monde, l'axe Y descend, donc l'angle
  // attendu est +π/2.
  await touchDrag(page, '.touch-stick--aim', { x: 100, y: 60 }, { x: 100, y: 160 }, 250);

  const aimed = await state(page);
  expect(Math.sin(aimed.turret)).toBeCloseTo(1, 2);

  // Le pouce est relâché depuis la fin du glissement : le canon ne doit pas
  // s'être recentré entre-temps.
  await page.waitForTimeout(400);
  expect((await state(page)).turret).toBeCloseTo(aimed.turret, 6);
});

test('toucher le plateau ne fait rien', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  const before = await state(page);
  expect(before.shells).toBe(0);

  // Un geste franc et maintenu sur le plateau : ni obus, ni canon qui pivote.
  await touchDrag(page, '#game', { x: 60, y: 60 }, { x: 260, y: 200 }, 500);

  const after = await state(page);
  expect(after.shells).toBe(0);
  expect(after.turret).toBeCloseTo(before.turret, 6);
});

test('le bouton de tir tire', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  expect((await state(page)).shells).toBe(0);

  const fire = page.locator('.touch-button--fire');
  await fire.dispatchEvent('pointerdown', { pointerId: 2, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', { pointerId: 2, pointerType: 'touch', bubbles: true }),
    );
  });

  expect((await state(page)).shells).toBeGreaterThan(0);
});
