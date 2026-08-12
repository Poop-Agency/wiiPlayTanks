/**
 * Mines, explosions et destruction du terrain.
 *
 * Les mines n'existaient nulle part dans le projet — ni dans la copie locale,
 * ni sur `origin/main`. C'est pourtant le seul moyen d'ouvrir un passage dans
 * un bloc cassable, donc un pilier du level design de l'original : plusieurs
 * missions ne sont franchissables qu'en perçant un mur.
 *
 * Le terrain distinguait déjà cassable et incassable côté `origin/main`, et
 * exposait un `destroyWallsInRadius()` que personne n'appelait. C'est ce
 * chaînon manquant.
 */

import { setTile, tileAt } from '../grid.js';
import { TileKind } from '../state.js';
import { secondsToTicks } from '../tick.js';
import { TUNING } from '../tuning.js';
import { allocateEntityId } from '../world.js';
import type { EntityId, InputCommand, Mine, Tank, World } from '../state.js';

/**
 * Pose une mine, si le quota et le délai le permettent.
 *
 * @returns la mine posée, ou `null` si la pose a été refusée
 */
export function layMine(world: World, tank: Tank): Mine | null {
  if (!tank.alive) return null;
  if (tank.mineReloadTicks > 0) return null;
  if (tank.activeMines >= TUNING.tank.maxActiveMines) return null;

  const mine: Mine = {
    id: allocateEntityId(world),
    ownerId: tank.id,
    x: tank.x,
    y: tank.y,
    fuseTicks: secondsToTicks(TUNING.mine.fuseSeconds),
  };

  world.mines.push(mine);
  tank.activeMines++;
  tank.mineReloadTicks = secondsToTicks(TUNING.mine.cooldownSeconds);

  return mine;
}

/** Traite les intentions de pose du pas courant. */
export function updateMineLaying(
  world: World,
  intents: ReadonlyMap<EntityId, InputCommand>,
): void {
  for (const tank of world.tanks) {
    const input = intents.get(tank.id);
    if (input?.mine) layMine(world, tank);
  }
}

/** Distance du centre d'un cercle au point le plus proche d'une boîte. */
function circleReachesBox(
  circleX: number,
  circleY: number,
  radius: number,
  boxX: number,
  boxY: number,
  boxHalf: number,
): boolean {
  const nearestX = Math.max(boxX - boxHalf, Math.min(circleX, boxX + boxHalf));
  const nearestY = Math.max(boxY - boxHalf, Math.min(circleY, boxY + boxHalf));

  const dx = circleX - nearestX;
  const dy = circleY - nearestY;

  return dx * dx + dy * dy < radius * radius;
}

/**
 * Détruit les blocs cassables dans le rayon du souffle.
 *
 * Le rayon se mesure jusqu'au **centre** de chaque tuile : une tuile n'est
 * emportée que si le souffle l'atteint franchement, pas si elle l'effleure par
 * un coin. Sans ça, une explosion ouvrirait des brèches en escalier aux angles.
 */
function destroyTerrain(world: World, centerX: number, centerY: number, radius: number): void {
  const minTileX = Math.max(0, Math.floor(centerX - radius));
  const maxTileX = Math.min(world.grid.width - 1, Math.floor(centerX + radius));
  const minTileY = Math.max(0, Math.floor(centerY - radius));
  const maxTileY = Math.min(world.grid.height - 1, Math.floor(centerY + radius));

  let changed = false;

  for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      if (tileAt(world.grid, tileX, tileY) !== TileKind.Destructible) continue;

      const dx = tileX + 0.5 - centerX;
      const dy = tileY + 0.5 - centerY;
      if (dx * dx + dy * dy > radius * radius) continue;

      setTile(world.grid, tileX, tileY, TileKind.Empty);
      changed = true;
    }
  }

  // Signale au rendu de reconstruire son cache de terrain, et informe les
  // clients distants (#13) que la grille a changé.
  if (changed) world.grid.version++;
}

/**
 * Fait exploser une mine : terrain, tanks, obus, et mines voisines.
 *
 * @param chain file des mines à faire détoner ensuite
 */
function detonate(
  world: World,
  mine: Mine,
  doomed: Set<EntityId>,
  chain: Mine[],
): void {
  const radius = TUNING.mine.blastRadiusTiles;

  const duration = secondsToTicks(TUNING.mine.blastDurationSeconds);
  world.explosions.push({
    id: allocateEntityId(world),
    x: mine.x,
    y: mine.y,
    radius,
    ticksLeft: duration,
    totalTicks: duration,
  });

  destroyTerrain(world, mine.x, mine.y, radius);

  // Tanks — y compris celui qui a posé la mine. Rester à côté de sa propre
  // mine est mortel, exactement comme dans l'original.
  const tankHalf = TUNING.tank.sizeTiles / 2;
  for (const tank of world.tanks) {
    if (!tank.alive) continue;
    if (circleReachesBox(mine.x, mine.y, radius, tank.x, tank.y, tankHalf)) {
      tank.alive = false;
    }
  }

  // Obus pris dans le souffle.
  for (const shell of world.shells) {
    if (doomed.has(shell.id)) continue;
    const dx = shell.x - mine.x;
    const dy = shell.y - mine.y;
    if (dx * dx + dy * dy < radius * radius) doomed.add(shell.id);
  }

  // Mines voisines : réaction en chaîne. Chaque mine ne détone qu'une fois,
  // puisqu'elle est marquée avant d'être empilée — c'est ce qui garantit la
  // terminaison de la cascade.
  for (const other of world.mines) {
    if (other.id === mine.id || doomed.has(other.id)) continue;
    const dx = other.x - mine.x;
    const dy = other.y - mine.y;
    if (dx * dx + dy * dy < radius * radius) {
      doomed.add(other.id);
      chain.push(other);
    }
  }
}

/**
 * Décompte les mèches et traite les détonations du pas.
 *
 * @param doomedShells obus déjà condamnés ce pas, pour ne pas les recompter
 */
export function updateMines(world: World, doomed: Set<EntityId>): void {
  const chain: Mine[] = [];
  const shellRadius = TUNING.shell.radiusTiles;
  const mineRadius = TUNING.mine.radiusTiles;

  for (const mine of world.mines) {
    if (doomed.has(mine.id)) continue;

    if (mine.fuseTicks > 0) mine.fuseTicks--;

    // Une mine touchée par un obus explose immédiatement, sans attendre sa
    // mèche : c'est ce qui permet de désamorcer un piège à distance.
    let struck = false;
    for (const shell of world.shells) {
      if (doomed.has(shell.id)) continue;
      const dx = shell.x - mine.x;
      const dy = shell.y - mine.y;
      const contact = shellRadius + mineRadius;
      if (dx * dx + dy * dy < contact * contact) {
        doomed.add(shell.id);
        struck = true;
        break;
      }
    }

    if (mine.fuseTicks <= 0 || struck) {
      doomed.add(mine.id);
      chain.push(mine);
    }
  }

  // Cascade. La file ne peut que se vider : une mine est marquée condamnée
  // avant d'y entrer, donc jamais empilée deux fois.
  while (chain.length > 0) {
    detonate(world, chain.shift()!, doomed, chain);
  }
}

/** Retire les mines détonées et rend son quota à chaque poseur. */
export function removeDoomedMines(world: World, doomed: ReadonlySet<EntityId>): void {
  if (doomed.size === 0) return;

  let kept = 0;
  for (const mine of world.mines) {
    if (doomed.has(mine.id)) {
      const owner = world.tanks.find((tank) => tank.id === mine.ownerId);
      if (owner && owner.activeMines > 0) owner.activeMines--;
      continue;
    }
    world.mines[kept++] = mine;
  }
  world.mines.length = kept;
}
