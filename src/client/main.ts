/**
 * Point d'entrée du client.
 *
 * À ce stade (issue #6) il n'y a pas encore de gameplay : ce qui tourne ici est
 * la boucle à pas fixe, et l'affichage sert de vérification visuelle.
 *
 * Le compteur de pas par seconde doit rester collé à 60 quelle que soit la
 * fréquence de l'écran. C'est exactement ce que l'ancienne version ne faisait
 * pas : elle avançait d'un pas par frame, donc 144 pas par seconde sur un écran
 * 144 Hz. Ouvrir cette page sur un écran haute fréquence est le test à l'oeil
 * nu de la correction.
 *
 * Le rendu du terrain arrive en #7.
 */

import { TICK_RATE, tick } from '@core/tick';
import type { TickInputs } from '@core/tick';
import { createWorld } from '@core/world';
import { startGameLoop } from './loop';

/**
 * Récupère le canevas et son contexte.
 *
 * Passer par une fonction au type de retour explicite plutôt que par des
 * `const` en portée de module : le rétrécissement de type après un `if (!x)
 * throw` ne traverse pas les frontières de fonction, et tous les usages dans
 * `render()` redeviendraient nullables.
 */
function mountCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Canevas #game introuvable dans index.html');

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible : le navigateur ne supporte pas Canvas');

  return { canvas, ctx };
}

const { canvas, ctx } = mountCanvas();

canvas.width = 800;
canvas.height = 600;

const world = createWorld({ width: 25, height: 19, seed: 1 });
const NO_INPUTS: TickInputs = [];

/** Mesure séparée des deux cadences, pour rendre l'écart visible s'il réapparaît. */
const rates = {
  ticks: 0,
  frames: 0,
  ticksPerSecond: 0,
  framesPerSecond: 0,
  windowStartMs: 0,
};

/**
 * Le seul endroit du client autorisé à lire l'horloge murale : la mesure de
 * diagnostic. La simulation, elle, ne connaît que `world.tick`.
 */
function sampleRates(nowMs: number): void {
  if (rates.windowStartMs === 0) rates.windowStartMs = nowMs;

  const elapsed = nowMs - rates.windowStartMs;
  if (elapsed < 1000) return;

  rates.ticksPerSecond = Math.round((rates.ticks * 1000) / elapsed);
  rates.framesPerSecond = Math.round((rates.frames * 1000) / elapsed);
  rates.ticks = 0;
  rates.frames = 0;
  rates.windowStartMs = nowMs;
}

function render(alpha: number): void {
  rates.frames++;
  sampleRates(performance.now());

  ctx.fillStyle = '#2b2118';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#d8c9a8';
  ctx.font = '14px ui-monospace, monospace';
  ctx.textAlign = 'left';

  const lines = [
    `pas de simulation   ${world.tick}`,
    `pas / seconde       ${rates.ticksPerSecond} (attendu ${TICK_RATE})`,
    `frames / seconde    ${rates.framesPerSecond}`,
    `résidu alpha        ${alpha.toFixed(3)}`,
    `grille              ${world.grid.width} × ${world.grid.height} tuiles`,
  ];

  lines.forEach((line, index) => {
    ctx.fillText(line, 24, 40 + index * 22);
  });

  ctx.fillStyle = '#6f6350';
  ctx.fillText(
    'La cadence de simulation doit rester à 60 quelle que soit celle de l’écran.',
    24,
    40 + lines.length * 22 + 16,
  );
}

startGameLoop({
  update(): void {
    rates.ticks++;
    tick(world, NO_INPUTS);
  },
  render,
});

// Exposé pour les tests bout-en-bout, qui n'ont aucun DOM à interroger : le jeu
// vit entièrement dans le canevas.
declare global {
  interface Window {
    __tanks?: { world: typeof world; rates: typeof rates };
  }
}
window.__tanks = { world, rates };
