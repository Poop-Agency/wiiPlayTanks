/**
 * Point d'entrée du client.
 *
 * Assemble les quatre couches et rien de plus : entrées → simulation → rendu,
 * cadencées par la boucle à pas fixe. Aucune logique de jeu ici.
 *
 * À ce stade (#7) on peut piloter un tank dans un labyrinthe. Les tirs arrivent
 * en #8, les mines en #9, les ennemis en #11.
 */

import { TICK_RATE } from '@core/tick';
import { TUNING } from '@core/tuning';
import { exposeDebugBridge } from './debug-bridge';
import type { RateProbe } from './debug-bridge';
import { InputSampler } from './input/sampler';
import { LocalGame } from './local/LocalGame';
import { createSandbox } from './local/sandbox';
import { startGameLoop } from './loop';
import { Canvas2DRenderer } from './render/canvas2d/Canvas2DRenderer';

/**
 * Récupère le canevas.
 *
 * Passer par une fonction au type de retour explicite plutôt que par des
 * `const` en portée de module : le rétrécissement de type après un `if (!x)
 * throw` ne traverse pas les frontières de fonction.
 */
function mountCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Canevas #game introuvable dans index.html');
  return canvas;
}

const canvas = mountCanvas();
const renderer = new Canvas2DRenderer(canvas);

// `?calme=1` vide l'arène de ses ennemis. Sert aux tests bout-en-bout qui
// mesurent le déplacement ou les mines et n'ont pas à composer avec des tirs.
const peaceful = new URLSearchParams(window.location.search).has('calme');
const { world, playerTankId } = createSandbox({ withEnemies: !peaceful });
const game = new LocalGame(world, playerTankId);

renderer.resize(world.grid);

const sampler = new InputSampler(canvas, (clientX, clientY) =>
  renderer.pointerToWorld(clientX, clientY),
);

/** Diagnostic de cadence, affiché en surimpression. Sans effet sur la simulation. */
const rates: RateProbe = {
  ticks: 0,
  frames: 0,
  ticksPerSecond: 0,
  framesPerSecond: 0,
  windowStartMs: 0,
};

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

function drawOverlay(ctx: CanvasRenderingContext2D): void {
  const tank = game.playerTank;
  const shells = tank ? `${tank.activeShells}/${TUNING.tank.maxActiveShells}` : '—';
  const mines = tank ? `${tank.activeMines}/${TUNING.tank.maxActiveMines}` : '—';
  const status = tank?.alive === false ? '  — DÉTRUIT' : '';

  const lines = [
    `pas/s ${rates.ticksPerSecond} (attendu ${TICK_RATE})   frames/s ${rates.framesPerSecond}`,
    `obus ${shells}   mines ${mines}${status}`,
    'ZQSD / WASD / flèches — souris pour viser, clic gauche tirer, clic droit miner',
  ];

  // En bas de l'image : le bandeau ne doit pas masquer le terrain de jeu.
  // Provisoire — le vrai HUD arrive en #12, le panneau de réglages en #10.
  const height = 18 * lines.length + 10;
  const top = ctx.canvas.height - height - 8;

  ctx.save();
  ctx.fillStyle = 'rgba(20, 14, 8, 0.55)';
  ctx.fillRect(8, top, 400, height);

  ctx.fillStyle = '#e8dcc0';
  ctx.font = '12px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => ctx.fillText(line, 18, top + 6 + index * 18));
  ctx.restore();
}

const overlayCtx = canvas.getContext('2d');

startGameLoop({
  update(): void {
    rates.ticks++;

    // La visée se recalcule depuis la position courante du tank : un pointeur
    // immobile au-dessus d'un tank qui se déplace doit rester visé.
    const tank = game.playerTank;
    if (tank) sampler.setAimOrigin(tank.x, tank.y);

    game.update(sampler.sample());
  },

  render(alpha): void {
    rates.frames++;
    sampleRates(performance.now());

    renderer.draw(world.grid, game.view(alpha));
    if (overlayCtx) drawOverlay(overlayCtx);
  },
});

exposeDebugBridge({ world, rates, tuning: TUNING });
