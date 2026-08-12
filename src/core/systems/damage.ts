/**
 * Résolution des impacts.
 *
 * Une règle unique et sans nuance, reprise de l'original : **un obus tue en un
 * coup**, quel que soit le tank touché — ennemi, coéquipier, ou celui qui l'a
 * tiré.
 *
 * Comme dans `shells.ts`, rien n'est retiré pendant le parcours : on marque, et
 * le compactage a lieu en fin de pas.
 */

import { TUNING } from '../tuning.js';
import type { EntityId, Shell, Tank, World } from '../state.js';

/**
 * Distance du centre d'un cercle au point le plus proche d'une boîte.
 *
 * Le tank est une AABB, l'obus un disque : les comparer par distance entre
 * centres — ce que faisait l'ancienne version avec un rayon unique déduit de
 * `max(largeur, hauteur)` — donne une zone de touche circulaire nettement plus
 * large que le tank aux quatre coins.
 */
function circleOverlapsBox(
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

/** Un obus peut-il toucher ce tank ? */
function canHit(shell: Shell, tank: Tank): boolean {
  if (!tank.alive) return false;
  // Un obus qui n'a pas encore quitté son canon ne tue pas son tireur.
  if (tank.id === shell.ownerId && !shell.armed) return false;
  return true;
}

/** Obus contre tanks. Un obus qui touche est consommé. */
export function resolveShellTankHits(world: World, doomed: Set<EntityId>): void {
  const shellRadius = TUNING.shell.radiusTiles;
  const tankHalf = TUNING.tank.sizeTiles / 2;

  for (const shell of world.shells) {
    if (doomed.has(shell.id)) continue;

    for (const tank of world.tanks) {
      if (!canHit(shell, tank)) continue;

      if (circleOverlapsBox(shell.x, shell.y, shellRadius, tank.x, tank.y, tankHalf)) {
        tank.alive = false;
        doomed.add(shell.id);
        break;
      }
    }
  }
}

/**
 * Obus contre obus : les deux explosent.
 *
 * L'ancienne version tentait déjà ce comportement, mais collectait des indices
 * de tableau qu'elle invalidait ensuite en supprimant les éléments un à un.
 * On travaille ici sur des identifiants, qui restent valides quoi qu'il arrive.
 */
export function resolveShellShellHits(world: World, doomed: Set<EntityId>): void {
  const radius = TUNING.shell.radiusTiles;
  const contactSquared = (radius * 2) * (radius * 2);

  for (let i = 0; i < world.shells.length; i++) {
    const first = world.shells[i]!;
    if (doomed.has(first.id)) continue;

    for (let j = i + 1; j < world.shells.length; j++) {
      const second = world.shells[j]!;
      if (doomed.has(second.id)) continue;

      const dx = first.x - second.x;
      const dy = first.y - second.y;

      if (dx * dx + dy * dy < contactSquared) {
        doomed.add(first.id);
        doomed.add(second.id);
        break;
      }
    }
  }
}
