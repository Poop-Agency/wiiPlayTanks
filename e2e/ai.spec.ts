import { expect, test } from '@playwright/test';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

async function survey(page: Page) {
  return page.evaluate(() => {
    const world = window.__tanks!.world;
    return world.tanks.map((tank) => ({
      color: tank.color,
      x: tank.x,
      y: tank.y,
      alive: tank.alive,
      hasSolution: tank.ai?.solutionAngle !== null && tank.ai !== null,
      isAi: tank.playerId === null,
    }));
  });
}

test('les ennemis sont présents et se comportent selon leur couleur', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  const start = await survey(page);
  const enemies = start.filter((tank) => tank.isAi);

  expect(enemies.length).toBeGreaterThanOrEqual(4);
  // Chaque couleur présente est distincte : le bac à sable montre des
  // comportements différents, pas cinq fois le même tank.
  expect(new Set(enemies.map((tank) => tank.color)).size).toBe(enemies.length);

  await page.waitForTimeout(3000);
  const later = await survey(page);

  const moved = (color: string): number => {
    const before = start.find((tank) => tank.color === color)!;
    const after = later.find((tank) => tank.color === color)!;
    return Math.hypot(after.x - before.x, after.y - before.y);
  };

  // Le brun et le vert sont des tourelles fixes.
  expect(moved('brown')).toBeCloseTo(0, 6);
  expect(moved('green')).toBeCloseTo(0, 6);

  // Le violet traque : il parcourt une vraie distance.
  expect(moved('purple')).toBeGreaterThan(1);
});

test('un ennemi finit par ouvrir le feu sur le joueur', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  // Observation frame par frame dans la page : un obus traverse l'arène en
  // quelques secondes et un sondage depuis Node manquerait la fenêtre.
  const observed = await page.evaluate(async () => {
    const startMs = performance.now();
    let sawEnemyShell = false;
    let sawSolution = false;

    while (performance.now() - startMs < 8000 && !sawEnemyShell) {
      const world = window.__tanks!.world;

      for (const tank of world.tanks) {
        if (tank.playerId === null && tank.ai?.solutionAngle != null) sawSolution = true;
      }

      for (const shell of world.shells) {
        const owner = world.tanks.find((tank) => tank.id === shell.ownerId);
        if (owner && owner.playerId === null) sawEnemyShell = true;
      }

      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }

    return { sawEnemyShell, sawSolution };
  });

  expect(observed.sawSolution).toBe(true);
  expect(observed.sawEnemyShell).toBe(true);
});

test('les tanks ne se superposent jamais', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  // Deux tanks empilés se comportent comme un seul et sont illisibles à
  // l'écran. Ils sont des obstacles les uns pour les autres.
  const overlaps = await page.evaluate(async () => {
    const startMs = performance.now();
    let worst = Number.POSITIVE_INFINITY;

    while (performance.now() - startMs < 5000) {
      const tanks = window.__tanks!.world.tanks.filter((tank) => tank.alive);

      for (let i = 0; i < tanks.length; i++) {
        for (let j = i + 1; j < tanks.length; j++) {
          const a = tanks[i]!;
          const b = tanks[j]!;
          worst = Math.min(worst, Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)));
        }
      }

      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }

    return worst;
  });

  // La séparation la plus faible observée doit rester au moins de la taille
  // d'un tank, à la tolérance de résolution près.
  expect(overlaps).toBeGreaterThan(0.7);
});
