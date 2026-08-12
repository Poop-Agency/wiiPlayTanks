import { expect, test } from '@playwright/test';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

/**
 * Relevé continu des obus, alimenté à chaque frame **dans la page**.
 *
 * ─── Pourquoi un relevé plutôt qu'un sondage ────────────────────────────────
 *
 * Un obus vit ici moins d'une seconde et demie : tiré vers le bas du couloir,
 * il rebondit au fond et remonte tuer son tireur. Lire `world.shells` après le
 * tir revient donc à parier que l'aller-retour Node↔navigateur tiendra dans
 * cette fenêtre — vrai en moyenne, faux dès qu'un worker Playwright est
 * chargé. Le relevé, lui, est armé **avant** le tir et ne peut rien manquer.
 *
 * ─── Pourquoi l'arène sans ennemis ──────────────────────────────────────────
 *
 * Le relevé ne distingue pas le tireur. Un missile sarcelle, qui naît déjà à
 * `bouncesLeft: 0`, satisferait à lui seul l'assertion de rebond : le test
 * passerait sans que l'obus du joueur ait ricoché. Toutes les vérifications de
 * ce fichier tournent donc sur `?calme=1`.
 */
interface ShellSample {
  x: number;
  y: number;
  vx: number;
  vy: number;
  bouncesLeft: number;
}

interface ShellProbe {
  /** Un échantillon par obus et par frame, dans l'ordre. Borné. */
  samples: ShellSample[];
  /** Plus grand nombre d'obus vus simultanément. */
  peakInFlight: number;
  /** Un obus est sorti du terrain — ce qui ne doit jamais arriver. */
  escaped: boolean;
}

declare global {
  interface Window {
    __shellProbe?: ShellProbe;
  }
}

/** Nombre d'échantillons au-delà duquel le relevé cesse d'accumuler. */
const SAMPLE_LIMIT = 4000;

/** Arme le relevé. À appeler avant de tirer. */
async function watchShells(page: Page): Promise<void> {
  await page.evaluate((limit) => {
    const probe: ShellProbe = { samples: [], peakInFlight: 0, escaped: false };
    window.__shellProbe = probe;

    const step = (): void => {
      const world = window.__tanks?.world;
      if (world) {
        probe.peakInFlight = Math.max(probe.peakInFlight, world.shells.length);

        for (const shell of world.shells) {
          const { width, height } = world.grid;
          if (shell.x < 1 || shell.y < 1 || shell.x > width - 1 || shell.y > height - 1) {
            probe.escaped = true;
          }

          if (probe.samples.length < limit) {
            probe.samples.push({
              x: shell.x,
              y: shell.y,
              vx: shell.vx,
              vy: shell.vy,
              bouncesLeft: shell.bouncesLeft,
            });
          }
        }
      }
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }, SAMPLE_LIMIT);
}

/** Lit le relevé. */
async function readProbe(page: Page): Promise<ShellProbe> {
  return page.evaluate(() => window.__shellProbe!);
}

/** Vise un point du canevas exprimé en fraction de sa taille. */
async function aimAt(page: Page, fractionX: number, fractionY: number): Promise<void> {
  const box = await page.locator('#game').boundingBox();
  if (!box) throw new Error('canevas introuvable');
  await page.mouse.move(box.x + box.width * fractionX, box.y + box.height * fractionY);
  await page.waitForTimeout(80);
}

test('le clic tire un obus, qui se déplace', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForTimeout(300);

  await watchShells(page);
  expect((await readProbe(page)).samples).toHaveLength(0);

  await aimAt(page, 0.05, 0.05);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(400);

  const { samples } = await readProbe(page);

  expect(samples.length).toBeGreaterThan(0);
  // Un obus immobile serait un obus qui n'a pas reçu sa vitesse au tir.
  expect(samples.every((sample) => Math.hypot(sample.vx, sample.vy) > 0)).toBe(true);

  // Il s'est réellement déplacé : deux positions distinctes au moins.
  const positions = new Set(samples.map((sample) => `${sample.x},${sample.y}`));
  expect(positions.size).toBeGreaterThan(1);
});

test('le quota d\'obus simultanés est respecté', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForTimeout(300);

  // Lu depuis la table de réglages vivante plutôt que recopié : le panneau de
  // calibration (#10) pourra changer cette valeur sans casser le test.
  const maxShells = await page.evaluate(() => window.__tanks!.tuning.tank.maxActiveShells);

  await watchShells(page);

  // Tir soutenu dans le couloir vertical, le plus long trajet disponible.
  await aimAt(page, 0.96, 0.02);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();

  const { peakInFlight } = await readProbe(page);

  // Les deux bornes comptent. Sans la borne basse, un tir qui ne partirait
  // jamais satisferait le test : c'est le plafond qu'on vérifie, pas le vide.
  expect(peakInFlight).toBeGreaterThan(1);
  expect(peakInFlight).toBeLessThanOrEqual(maxShells);
});

test('un obus ricoche au lieu de traverser le mur', async ({ page }) => {
  await page.goto('/?bac=1&calme=1');
  await page.waitForTimeout(300);

  // Visée strictement verticale, calculée depuis la position réelle du tank.
  //
  // Viser « en bas à droite » à vue de nez ferait dériver l'obus vers la paroi
  // latérale : le couloir ne fait qu'une tuile de large, les deux murs seraient
  // touchés à une frame d'intervalle, et la fenêtre pendant laquelle le rebond
  // est observable durerait un seul pas de simulation.
  const box = await page.locator('#game').boundingBox();
  if (!box) throw new Error('canevas introuvable');

  const tankX = await page.evaluate(() => window.__tanks!.world.tanks[0]!.x);
  const scale = box.width / (await page.evaluate(() => window.__tanks!.world.grid.width));

  await page.mouse.move(box.x + tankX * scale, box.y + box.height - 2);
  await page.waitForTimeout(80);

  await watchShells(page);

  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();

  await page.waitForTimeout(2500);

  const { samples, escaped } = await readProbe(page);

  // Descendu avec son rebond intact, puis observé après l'avoir consommé. On ne
  // présume pas *quel* mur est touché en premier : la visée à la souris n'est
  // jamais parfaitement verticale, donc le rebond peut venir d'une paroi
  // latérale aussi bien que du fond.
  expect(samples.some((sample) => sample.bouncesLeft >= 1 && sample.vy > 0)).toBe(true);
  expect(samples.some((sample) => sample.bouncesLeft < 1)).toBe(true);

  // Ce qui ne doit jamais arriver, quel que soit le mur touché.
  expect(escaped).toBe(false);
});
