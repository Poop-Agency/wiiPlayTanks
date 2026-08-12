import { expect, test } from '@playwright/test';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

/**
 * Les tests unitaires vérifient déjà la physique du déplacement. Ceux-ci
 * vérifient la chaîne complète — clavier, souris, échantillonnage, simulation,
 * rendu — que rien d'autre ne couvre.
 */

/** Lit la position du tank du joueur dans l'état simulé. */
async function tankPosition(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const tank = window.__tanks?.world.tanks[0];
    if (!tank) throw new Error('aucun tank dans le monde');
    return { x: tank.x, y: tank.y, turret: tank.turretAngle };
  });
}

/** Maintient des touches enfoncées pendant une durée donnée. */
async function hold(
  page: import('@playwright/test').Page,
  keys: string[],
  milliseconds: number,
): Promise<void> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(milliseconds);
  for (const key of keys) await page.keyboard.up(key);
}

test('le clavier déplace le tank', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const before = await tankPosition(page);
  await hold(page, ['KeyW'], 700);
  const after = await tankPosition(page);

  // Le tank part vers le haut du couloir vertical dans lequel il apparaît.
  expect(after.y).toBeLessThan(before.y - 1);
});

test('le tank longe le mur au lieu de s\'y bloquer', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const before = await tankPosition(page);

  // Poussée en diagonale contre le mur de droite : l'axe X est bloqué, l'axe Y
  // doit continuer. C'est le comportement que l'ancienne version n'avait pas —
  // elle rejetait le déplacement entier et le tank se figeait contre le mur.
  await hold(page, ['KeyW', 'KeyD'], 1200);

  const after = await tankPosition(page);

  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.y).toBeLessThan(before.y - 1.5);
});

test('relâcher le focus arrête le tank', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(300);

  // Sans relâchement au blur, une touche enfoncée au moment où l'on quitte
  // l'onglet ferait filer le tank indéfiniment.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(200);

  const settled = await tankPosition(page);
  await page.waitForTimeout(400);
  const later = await tankPosition(page);

  await page.keyboard.up('KeyW');

  expect(later.y).toBeCloseTo(settled.y, 3);
});

test('la souris oriente la tourelle', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const box = await page.locator('#game').boundingBox();
  if (!box) throw new Error('canevas introuvable');

  // Le tank apparaît à droite du terrain ; on vise franchement à sa gauche.
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.waitForTimeout(150);
  const left = await tankPosition(page);

  // Viser vers la gauche donne un angle proche de ±π.
  expect(Math.abs(left.turret)).toBeGreaterThan(Math.PI / 2);

  await page.mouse.move(box.x + box.width - 10, box.y + box.height - 10);
  await page.waitForTimeout(150);
  const downRight = await tankPosition(page);

  // Vers le bas : angle positif (l'axe Y descend à l'écran).
  expect(downRight.turret).toBeGreaterThan(0);
});
