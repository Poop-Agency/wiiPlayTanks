import { expect, test } from '@playwright/test';

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

  await page.goto('/');

  const canvas = page.locator('#game');
  await expect(canvas).toBeVisible();

  const dimensions = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(dimensions).toEqual({ width: 800, height: 600 });

  // Le canevas ne doit pas être resté transparent : au moins un pixel opaque.
  const hasPaintedPixels = await canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('2d');
    if (!context) return false;
    const { data } = context.getImageData(0, 0, 800, 600);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  });
  expect(hasPaintedPixels).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test('la simulation avance à 60 pas par seconde de temps réel', async ({ page }) => {
  await page.goto('/');

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

declare global {
  interface Window {
    __tanks?: {
      world: { tick: number };
      rates: { ticksPerSecond: number; framesPerSecond: number };
    };
  }
}
