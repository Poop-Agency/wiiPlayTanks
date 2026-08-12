import { expect, test } from '@playwright/test';

import { waitForGame } from './helpers';

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

declare global {
  interface Window {
    /** Chemin parcouru par chaque couleur de tank, en tuiles. */
    __pathLengths?: Record<string, number>;
  }
}

/**
 * Cumule le chemin réellement parcouru par chaque tank, frame après frame.
 *
 * Et non le déplacement net entre deux relevés, qui est ce que mesurait la
 * version précédente de ce test : un tank qui patrouille peut revenir sur ses
 * pas et afficher un déplacement net proche de zéro après avoir traversé
 * l'arène. La distinction « il bouge / il ne bouge pas » demande la longueur du
 * trajet, pas la distance entre les deux extrémités.
 *
 * L'indexation par couleur suffit : le bac à sable n'en présente aucune deux
 * fois, ce que le test vérifie par ailleurs.
 */
async function watchMovement(page: Page): Promise<void> {
  await page.evaluate(() => {
    const lengths: Record<string, number> = {};
    const previous: Record<string, { x: number; y: number }> = {};
    window.__pathLengths = lengths;

    const step = (): void => {
      const world = window.__tanks?.world;
      if (world) {
        for (const tank of world.tanks) {
          const before = previous[tank.color];
          if (before) {
            lengths[tank.color] =
              (lengths[tank.color] ?? 0) + Math.hypot(tank.x - before.x, tank.y - before.y);
          }
          previous[tank.color] = { x: tank.x, y: tank.y };
        }
      }
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  });
}

test('les ennemis sont présents et se comportent selon leur couleur', async ({ page }) => {
  await page.goto('/?bac=1');
  await waitForGame(page);

  const start = await survey(page);
  const enemies = start.filter((tank) => tank.isAi);

  expect(enemies.length).toBeGreaterThanOrEqual(4);
  // Chaque couleur présente est distincte : le bac à sable montre des
  // comportements différents, pas cinq fois le même tank.
  expect(new Set(enemies.map((tank) => tank.color)).size).toBe(enemies.length);

  await watchMovement(page);
  await page.waitForTimeout(3000);

  const travelled = await page.evaluate(() => window.__pathLengths!);

  // Le brun et le vert sont des tourelles fixes : leur multiplicateur de
  // vitesse vaut zéro, ils ne parcourent donc strictement rien.
  expect(travelled['brown']).toBeCloseTo(0, 6);
  expect(travelled['green']).toBeCloseTo(0, 6);

  // Le violet est le plus rapide du bac à sable : en trois secondes il couvre
  // du terrain, qu'il traque le joueur ou qu'il patrouille.
  expect(travelled['purple']).toBeGreaterThan(3);
});

test('un ennemi finit par ouvrir le feu sur le joueur', async ({ page }) => {
  await page.goto('/?bac=1');
  await waitForGame(page);

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
  await page.goto('/?bac=1');
  await waitForGame(page);

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
