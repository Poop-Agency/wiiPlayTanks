import { expect, test } from '@playwright/test';

/**
 * Vérification minimale de la chaîne complète : Vite sert la page, le module
 * TypeScript s'exécute, le canevas est dimensionné et quelque chose y est
 * réellement peint.
 *
 * Le jeu vivant dans un canevas, on ne peut pas s'appuyer sur le DOM : la seule
 * preuve qu'il « marche » est de lire les pixels.
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
    const { data } = context.getImageData(0, 0, element.clientWidth || 800, 600);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) return true;
    }
    return false;
  });
  expect(hasPaintedPixels).toBe(true);

  expect(consoleErrors).toEqual([]);
});
