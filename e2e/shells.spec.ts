import { expect, test } from '@playwright/test';

// La déclaration de `window.__tanks` vit dans src/client/debug-bridge.ts.
import '../src/client/debug-bridge';

type Page = import('@playwright/test').Page;

/** Lit l'état des obus en vol. */
async function shells(page: Page) {
  return page.evaluate(() =>
    (window.__tanks?.world.shells ?? []).map((shell) => ({
      x: shell.x,
      y: shell.y,
      vx: shell.vx,
      vy: shell.vy,
      bouncesLeft: shell.bouncesLeft,
    })),
  );
}

/** Vise un point du canevas exprimé en fraction de sa taille. */
async function aimAt(page: Page, fractionX: number, fractionY: number): Promise<void> {
  const box = await page.locator('#game').boundingBox();
  if (!box) throw new Error('canevas introuvable');
  await page.mouse.move(box.x + box.width * fractionX, box.y + box.height * fractionY);
  await page.waitForTimeout(80);
}

test('le clic tire un obus, qui se déplace', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  expect(await shells(page)).toHaveLength(0);

  await aimAt(page, 0.05, 0.05);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(60);

  const fired = await shells(page);
  expect(fired.length).toBeGreaterThan(0);

  const first = fired[0]!;
  expect(Math.hypot(first.vx, first.vy)).toBeGreaterThan(0);

  await page.waitForTimeout(150);
  const later = await shells(page);

  // L'obus a bougé — ou déjà disparu contre un mur, ce qui reste concluant.
  if (later.length > 0) {
    expect(later[0]!.x !== first.x || later[0]!.y !== first.y).toBe(true);
  }
});

test('le quota d\'obus simultanés est respecté', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(300);

  // Lu depuis la table de réglages vivante plutôt que recopié : le panneau de
  // calibration (#10) pourra changer cette valeur sans casser le test.
  const maxShells = await page.evaluate(() => window.__tanks!.tuning.tank.maxActiveShells);

  // Tir soutenu dans le couloir vertical, le plus long trajet disponible.
  await aimAt(page, 0.96, 0.02);
  await page.mouse.down();
  await page.waitForTimeout(1600);
  await page.mouse.up();

  const inFlight = await shells(page);
  expect(inFlight.length).toBeLessThanOrEqual(maxShells);
});

test('un obus ricoche au lieu de traverser le mur', async ({ page }) => {
  await page.goto('/');
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

  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();

  const initial = await shells(page);
  expect(initial.length).toBeGreaterThan(0);
  expect(initial[0]!.bouncesLeft).toBe(1);
  expect(initial[0]!.vy).toBeGreaterThan(0);

  // L'observation se fait **dans la page**, une fois par frame : dans un
  // couloir d'une tuile de large, l'obus vit moins d'une seconde et un sondage
  // depuis Node manquerait l'instant du rebond à cause des allers-retours.
  //
  // On ne présume pas non plus *quel* mur est touché en premier : la visée à la
  // souris n'est jamais parfaitement verticale, donc le rebond peut venir d'une
  // paroi latérale aussi bien que du fond.
  const observation = await page.evaluate(async () => {
    const startMs = performance.now();
    let sawBounce = false;
    let escaped = false;

    while (performance.now() - startMs < 2500) {
      const world = window.__tanks!.world;

      for (const shell of world.shells) {
        if (shell.bouncesLeft < 1) sawBounce = true;
        if (
          shell.x < 1 ||
          shell.y < 1 ||
          shell.x > world.grid.width - 1 ||
          shell.y > world.grid.height - 1
        ) {
          escaped = true;
        }
      }

      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }

    return { sawBounce, escaped };
  });

  // Ce qui ne doit jamais arriver, quel que soit le mur touché.
  expect(observation.escaped).toBe(false);
  expect(observation.sawBounce).toBe(true);
});
