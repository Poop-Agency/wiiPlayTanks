/**
 * Calques de débogage : boîtes de collision, trajectoires prévues, rayons de souffle.
 *
 * Ils lisent le `World` réel et non un instantané interpolé. C'est une entorse
 * assumée à la règle « le rendu ne voit que des instantanés », et elle est
 * volontaire : ces calques servent précisément à vérifier ce que la simulation
 * fait, pas ce qu'on en montre. Une boîte de collision interpolée, décalée d'une
 * fraction de pas par rapport à celle qui décide réellement des impacts, ne
 * prouverait rien.
 *
 * Ils ne modifient jamais l'état — le module n'appelle que des lectures.
 */

import { blocksTank, tileAt } from '@core/grid';
import type { World } from '@core/state';
import { traceShellPath } from '@core/systems/ai/aiming';
import { TILE_SIZE_PX, TUNING } from '@core/tuning';
import type { DebugOptions } from '../../ui/tuning-panel';

const COLORS = {
  hitbox: 'rgba(120, 220, 255, 0.9)',
  hitboxSolid: 'rgba(255, 120, 120, 0.55)',
  trajectory: 'rgba(255, 220, 90, 0.9)',
  trajectorySpent: 'rgba(255, 120, 60, 0.75)',
  blast: 'rgba(255, 120, 60, 0.85)',
};

/** Trace un cercle en coordonnées monde. */
function strokeCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusTiles: number,
): void {
  ctx.beginPath();
  ctx.arc(x * TILE_SIZE_PX, y * TILE_SIZE_PX, radiusTiles * TILE_SIZE_PX, 0, Math.PI * 2);
  ctx.stroke();
}

/**
 * Dessine les calques demandés.
 *
 * Le contexte doit déjà être translaté sur l'origine du plateau : c'est le
 * renderer qui détient cette transformation, ce module n'en connaît rien.
 */
export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  world: World,
  options: Readonly<DebugOptions>,
): void {
  ctx.save();
  ctx.lineWidth = 1;

  if (options.hitboxes) drawHitboxes(ctx, world);
  if (options.trajectories) drawTrajectories(ctx, world);
  if (options.blastRadii) drawBlastRadii(ctx, world);

  ctx.restore();
}

/**
 * Boîtes des tanks, cercles des obus et des mines, et tuiles solides.
 *
 * Le châssis tourne à l'écran mais sa boîte reste alignée aux axes, comme dans
 * l'original : c'est exactement ce que ce calque rend visible.
 */
function drawHitboxes(ctx: CanvasRenderingContext2D, world: World): void {
  const half = TUNING.tank.sizeTiles / 2;

  ctx.strokeStyle = COLORS.hitboxSolid;
  for (let y = 0; y < world.grid.height; y++) {
    for (let x = 0; x < world.grid.width; x++) {
      if (!blocksTank(tileAt(world.grid, x, y))) continue;
      ctx.strokeRect(x * TILE_SIZE_PX + 0.5, y * TILE_SIZE_PX + 0.5, TILE_SIZE_PX - 1, TILE_SIZE_PX - 1);
    }
  }

  ctx.strokeStyle = COLORS.hitbox;

  for (const tank of world.tanks) {
    if (!tank.alive) continue;
    ctx.strokeRect(
      (tank.x - half) * TILE_SIZE_PX,
      (tank.y - half) * TILE_SIZE_PX,
      TUNING.tank.sizeTiles * TILE_SIZE_PX,
      TUNING.tank.sizeTiles * TILE_SIZE_PX,
    );
  }

  for (const shell of world.shells) {
    strokeCircle(ctx, shell.x, shell.y, TUNING.shell.radiusTiles);
  }

  for (const mine of world.mines) {
    strokeCircle(ctx, mine.x, mine.y, TUNING.mine.radiusTiles);
  }
}

/**
 * Chemin que chaque obus en vol suivra, rebonds restants compris.
 *
 * Le tracé réutilise `traceShellPath`, c'est-à-dire **exactement** la fonction
 * dont l'IA se sert pour chercher ses angles. Ce calque montre donc ce que les
 * ennemis calculent, et pas une seconde implémentation qui pourrait en diverger.
 */
function drawTrajectories(ctx: CanvasRenderingContext2D, world: World): void {
  // Plus épais que les boîtes de collision : c'est la ligne qu'on suit du
  // regard pour vérifier un angle, et un trait d'un pixel se perd sur le bois
  // clair du plateau.
  ctx.lineWidth = 2;

  for (const shell of world.shells) {
    const angle = Math.atan2(shell.vy, shell.vx);
    const segments = traceShellPath(world.grid, shell.x, shell.y, angle, shell.bouncesLeft);

    segments.forEach((segment, index) => {
      // Le dernier tronçon est celui après lequel l'obus n'a plus de rebond :
      // c'est là qu'il explosera, d'où la couleur distincte.
      ctx.strokeStyle = index === segments.length - 1 ? COLORS.trajectorySpent : COLORS.trajectory;

      ctx.beginPath();
      ctx.moveTo(segment.x0 * TILE_SIZE_PX, segment.y0 * TILE_SIZE_PX);
      ctx.lineTo(segment.x1 * TILE_SIZE_PX, segment.y1 * TILE_SIZE_PX);
      ctx.stroke();
    });
  }
}

/** Portée du souffle de chaque mine, à comparer aux blocs qu'elle emportera. */
function drawBlastRadii(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLORS.blast;
  ctx.setLineDash([6, 4]);

  for (const mine of world.mines) {
    strokeCircle(ctx, mine.x, mine.y, TUNING.mine.blastRadiusTiles);
  }

  ctx.setLineDash([]);
}
