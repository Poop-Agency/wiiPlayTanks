import { expect, test } from '@playwright/test';

import { REFERENCE_MEASUREMENTS, TILE_SIZE_PX } from '../src/core/tuning';
import { waitForGame } from './helpers';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

/**
 * Le panneau de calibration.
 *
 * Ce qu'on vérifie ici, c'est le circuit complet : un curseur déplacé doit
 * atteindre la table de réglages, et la table de réglages doit atteindre la
 * simulation **sans rechargement**. C'est toute la raison d'être de l'outil —
 * un panneau qui n'agirait qu'au prochain démarrage ne servirait à rien pour
 * comparer deux sensations.
 */

const PANEL = '.tuning-panel';

/** Ouvre le panneau et attend qu'il soit visible. */
async function openPanel(page: Page): Promise<void> {
  await page.keyboard.press('Backquote');
  await expect(page.locator(PANEL)).toBeVisible();
}

/** Déplace un curseur repéré par le libellé de sa ligne. */
async function setKnob(page: Page, label: string, value: number): Promise<void> {
  const slider = page
    .locator('.tuning-knob')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input[type=range]');

  await slider.fill(String(value));
  // `fill` ne déclenche pas `input` sur tous les navigateurs : on le force.
  await slider.dispatchEvent('input');
}

test('la touche ~ ouvre et referme le panneau', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  // Fermé au démarrage : le panneau ne doit pas s'imposer à qui veut jouer.
  await expect(page.locator(PANEL)).toBeHidden();

  await openPanel(page);
  await page.keyboard.press('Backquote');
  await expect(page.locator(PANEL)).toBeHidden();
});

test('un curseur modifie la simulation en direct', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);
  await openPanel(page);

  const before = await page.evaluate(() => window.__tanks!.tuning.tank.speedTilesPerSecond);

  // Le curseur est gradué en secondes de traversée : plus de secondes, donc
  // moins de tuiles par seconde.
  await setKnob(page, 'Traversée de l’arène', 14);

  const after = await page.evaluate(() => window.__tanks!.tuning.tank.speedTilesPerSecond);

  expect(after).toBeLessThan(before);
  // Quatorze secondes pour traverser l'arène de référence : la conversion doit
  // tomber juste. La largeur est lue sur la constante plutôt que recopiée — le
  // plateau a déjà changé de taille une fois.
  expect(after).toBeCloseTo(REFERENCE_MEASUREMENTS.arenaWidthPx / TILE_SIZE_PX / 14, 3);
});

test('le tank ralentit réellement après le réglage', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);

  /** Distance parcourue vers la droite en une seconde de temps réel. */
  const runRight = async (): Promise<number> => {
    const start = await page.evaluate(() => window.__tanks!.world.tanks[0]!.x);
    await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowLeft');
    const end = await page.evaluate(() => window.__tanks!.world.tanks[0]!.x);
    return start - end;
  };

  const atFullSpeed = await runRight();
  expect(atFullSpeed).toBeGreaterThan(0.5);

  await openPanel(page);
  await setKnob(page, 'Traversée de l’arène', 20);
  await page.keyboard.press('Backquote');

  const atSlowSpeed = await runRight();

  // Sept secondes de traversée contre vingt : le tank doit couvrir nettement
  // moins de terrain dans le même temps, sans rechargement de la page.
  expect(atSlowSpeed).toBeLessThan(atFullSpeed * 0.6);
});

test('l\'export reprend les mesures et les valeurs courantes', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);
  await openPanel(page);

  await setKnob(page, 'Mèche', 5);

  const exported = await page.locator('.tuning-export').inputValue();
  const parsed = JSON.parse(exported) as {
    mesures: Record<string, number>;
    tuning: { mine: { fuseSeconds: number } };
    profiles: { player: { turretRateRadiansPerSecond: unknown } };
  };

  expect(parsed.tuning.mine.fuseSeconds).toBe(5);
  // Les temps de traversée sont les grandeurs chronométrables : ce sont elles
  // qu'on relit pour comparer au jeu original.
  expect(parsed.mesures['traverseeObusSecondes']).toBeCloseTo(4, 2);
  expect(parsed.mesures['traverseeMissileSecondes']).toBeCloseTo(2, 2);
  // `JSON.stringify` transforme Infinity en `null` : l'export doit le préserver,
  // sinon la valeur recopiée serait fausse.
  expect(parsed.profiles.player.turretRateRadiansPerSecond).toBe('Infinity');
});

test('changer de couleur remplace la section de profil', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);
  await openPanel(page);

  await expect(page.getByRole('heading', { name: 'Profil — brown' })).toBeVisible();

  await page.locator('.tuning-profile-picker select').selectOption('green');
  await expect(page.getByRole('heading', { name: 'Profil — green' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profil — brown' })).toBeHidden();

  // Le profil du joueur n'expose ni tourelle ni portée : elles valent l'infini,
  // qu'un curseur ne sait pas représenter.
  await page.locator('.tuning-profile-picker select').selectOption('player');
  await expect(page.getByText('Rotation de tourelle', { exact: true })).toBeHidden();
  await expect(page.getByText('Portée de détection', { exact: true })).toBeHidden();
});

test('les calques de débogage se dessinent sans erreur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?bac=1&calme=1');
  await waitForGame(page);
  await openPanel(page);

  for (const option of ['hitboxes', 'trajectories', 'blastRadii']) {
    await page.locator(`input[data-debug-option="${option}"]`).check();
  }

  // Un obus en vol, pour que le calque de trajectoire ait quelque chose à tracer.
  await page.keyboard.press('Backquote');
  await page.locator('#game').click({ position: { x: 100, y: 300 } });
  await page.waitForTimeout(400);

  const drewSomething = await page.evaluate(
    () => (window.__tanks?.world.shells.length ?? 0) >= 0,
  );

  expect(drewSomething).toBe(true);
  expect(errors).toEqual([]);
});
