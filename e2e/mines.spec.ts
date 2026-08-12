import { expect, test } from '@playwright/test';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

/** Résumé de l'état du monde utile aux mines. */
async function survey(page: Page) {
  return page.evaluate(() => {
    const world = window.__tanks!.world;
    return {
      tankX: world.tanks[0]!.x,
      tankAlive: world.tanks[0]!.alive,
      mines: world.mines.length,
      explosions: world.explosions.length,
      // TileKind.Destructible === 2
      destructibles: world.grid.tiles.filter((tile) => tile === 2).length,
      gridVersion: world.grid.version,
    };
  });
}

async function hold(page: Page, keys: string[], milliseconds: number): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  for (const key of keys) await page.keyboard.up(key);
}

test('un clic droit bref pose bien une mine', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForTimeout(300);

  expect((await survey(page)).mines).toBe(0);

  // Un clic dure une dizaine de millisecondes, la simulation n'échantillonne
  // que toutes les seize. Sans verrouillage des appuis brefs dans
  // l'échantillonneur, cette pression tomberait entre deux pas et serait
  // perdue — un geste sur deux resterait sans effet.
  await page.mouse.click(300, 300, { button: 'right' });
  await page.waitForTimeout(100);

  expect((await survey(page)).mines).toBe(1);
});

test('la mine perce la barrière cassable et ouvre le passage', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForTimeout(300);

  const start = await survey(page);

  // Une paire de blocs cassables ferme le couloir à gauche du point de départ :
  // le tank vient s'y plaquer et ne peut pas aller plus loin.
  await hold(page, ['KeyA'], 1500);
  const blocked = await survey(page);
  expect(blocked.tankX).toBeLessThan(start.tankX);

  // Poser la mine, puis se replier vers le haut : le couloir est trop étroit
  // pour sortir du rayon de souffle en reculant simplement.
  await page.mouse.click(300, 300, { button: 'right' });
  await page.waitForTimeout(100);
  expect((await survey(page)).mines).toBe(1);

  await hold(page, ['KeyW'], 1600);

  // Attendre la détonation.
  let detonated = false;
  for (let attempt = 0; attempt < 80 && !detonated; attempt++) {
    await page.waitForTimeout(60);
    detonated = (await survey(page)).mines === 0;
  }
  expect(detonated).toBe(true);

  const after = await survey(page);

  // Un bloc cassable en moins, et la grille signale son changement pour que le
  // cache de terrain du rendu se reconstruise.
  expect(after.destructibles).toBeLessThan(start.destructibles);
  expect(after.gridVersion).toBeGreaterThan(start.gridVersion);

  // Le tank s'était éloigné : il a survécu à sa propre mine.
  expect(after.tankAlive).toBe(true);

  // Et le passage est désormais franchissable : on redescend puis on traverse.
  await hold(page, ['KeyS'], 1600);
  await hold(page, ['KeyA'], 2000);
  const through = await survey(page);
  expect(through.tankX).toBeLessThan(blocked.tankX - 0.5);
});

test('rester sur sa propre mine est fatal', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForTimeout(300);

  await page.mouse.click(300, 300, { button: 'right' });
  await page.waitForTimeout(100);
  expect((await survey(page)).mines).toBe(1);

  // On ne bouge pas. Dans l'original comme ici, la mine ne fait pas de
  // distinction entre son poseur et les autres.
  let killed = false;
  for (let attempt = 0; attempt < 100 && !killed; attempt++) {
    await page.waitForTimeout(60);
    killed = !(await survey(page)).tankAlive;
  }

  expect(killed).toBe(true);
});
