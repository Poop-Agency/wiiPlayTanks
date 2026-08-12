import { expect, test } from '@playwright/test';

import { waitForGame } from './helpers';

/**
 * Le jeu vit entièrement dans un canevas : il n'y a pas de DOM à interroger.
 * Les vérifications passent donc par la lecture de pixels et par l'état exposé
 * sur `window.__tanks`.
 */

test('la page se charge et peint le canevas sans erreur console', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/?mission=1');
  await waitForGame(page);

  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();

  // La taille du canevas se déduit du terrain chargé, on ne la code donc pas en
  // dur. En hauteur elle dépasse le plateau : le HUD et le bandeau de
  // diagnostic ont chacun leur bande réservée, plutôt que d'être peints
  // par-dessus le jeu — superposés, ils masquaient le mur d'enceinte.
  const dimensions = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const grid = window.__tanks!.world.grid;

    return {
      width: target.width,
      height: target.height,
      boardWidth: grid.width * 32,
      boardHeight: grid.height * 32,
    };
  });

  expect(dimensions.width).toBe(dimensions.boardWidth);
  expect(dimensions.height).toBeGreaterThan(dimensions.boardHeight);
  // Des bandes, pas un second plateau.
  expect(dimensions.height).toBeLessThan(dimensions.boardHeight + 160);

  // Le canevas ne doit pas être resté transparent : au moins un pixel opaque.
  const hasPaintedPixels = await canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement;
    const context = target.getContext('2d');
    if (!context) return false;
    const { data } = context.getImageData(0, 0, target.width, target.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  });
  expect(hasPaintedPixels).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test('la simulation avance à 60 pas par seconde de temps réel', async ({ page }) => {
  // Sur le terrain d'essai sans ennemis, et non sur la campagne : un changement
  // de mission ouvre un monde neuf dont le compteur de pas repart de zéro, ce
  // qui rendrait la mesure absurde. Ce qu'on vérifie ici est la cadence de la
  // boucle, pas le déroulement d'une partie.
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  // On mesure sur le compteur de pas de la simulation et sur l'horloge du
  // navigateur, sans faire confiance à la cadence d'affichage : c'est
  // précisément l'indépendance entre les deux qui est vérifiée ici.
  const measured = await page.evaluate(async () => {
    const readTick = (): number => window.__tanks?.world.tick ?? -1;

    const startTick = readTick();
    const startMs = performance.now();

    await new Promise((resolve) => setTimeout(resolve, 2000));

    return {
      ticks: readTick() - startTick,
      seconds: (performance.now() - startMs) / 1000,
    };
  });

  const ticksPerSecond = measured.ticks / measured.seconds;

  // Marge large : un navigateur headless n'a aucune garantie de régularité, et
  // le plafond anti-spirale peut faire perdre quelques pas sur une frame lente.
  // Le bug qu'on traque produirait 144 ou 30, pas 58.
  expect(ticksPerSecond).toBeGreaterThan(50);
  expect(ticksPerSecond).toBeLessThan(70);
});

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts :
// deux `declare global` concurrents pour la même propriété ne compileraient pas.
import '../src/client/debug-bridge';
