/**
 * Déplacement des tanks.
 *
 * Deux principes, tous deux repris du jeu original :
 *
 * 1. **La boîte de collision ne tourne pas.** Le châssis pivote à l'écran, mais
 *    la hitbox reste une AABB. C'est ce qui rend les passages étroits prévisibles :
 *    si le tank entre dans un couloir, il y entre quelle que soit son orientation.
 *
 * 2. **Le déplacement est résolu axe par axe.** C'est de là que vient le
 *    glissement le long des murs, et c'est ce qui manquait à l'ancienne version.
 */

import { blocksTank, sweepAxis } from '../grid.js';
import { limitToUnitDisc, rotateToward } from '../math.js';
import { DT } from '../tick.js';
import { TUNING } from '../tuning.js';
import type { InputCommand, Tank, World } from '../state.js';

/**
 * Vitesse de déplacement d'un tank, en tuiles par seconde.
 *
 * Le multiplicateur par couleur arrive avec les profils d'IA (#11) ; d'ici là,
 * tous les tanks avancent à la vitesse de référence du joueur.
 */
function speedOf(_tank: Tank): number {
  return TUNING.tank.speedTilesPerSecond;
}

/** Applique l'intention d'un tick à un tank. */
export function applyMovement(world: World, tank: Tank, input: InputCommand): void {
  // La tourelle suit la visée sans inertie : elle est pointée, pas pilotée.
  tank.turretAngle = input.aim;

  if (!tank.alive) return;

  const direction = limitToUnitDisc(input.moveX, input.moveY);
  const isMoving = direction.x !== 0 || direction.y !== 0;

  if (isMoving) {
    // Le châssis s'oriente vers la direction demandée, mais n'a aucune
    // influence sur le déplacement : le tank part immédiatement, le corps
    // rattrape. C'est ce qui donne au pilotage sa réactivité.
    tank.bodyAngle = rotateToward(
      tank.bodyAngle,
      Math.atan2(direction.y, direction.x),
      TUNING.tank.turnRateRadiansPerSecond * DT,
    );

    const step = speedOf(tank) * DT;
    const half = TUNING.tank.sizeTiles / 2;

    // X d'abord, puis Y avec le X déjà résolu : c'est cet enchaînement qui
    // produit le glissement. Tester les deux axes ensemble rejetterait le
    // déplacement entier dès qu'un seul des deux est bloqué.
    tank.x = sweepAxis(world.grid, tank.x, tank.y, half, blocksTank, 'x', direction.x * step);
    tank.y = sweepAxis(world.grid, tank.x, tank.y, half, blocksTank, 'y', direction.y * step);
  }
}

/**
 * Fait avancer tous les tanks d'un pas.
 *
 * Les tanks sans intention pour ce tick — ceux de l'IA tant que #11 n'est pas
 * là, ou un joueur dont le paquet s'est perdu — restent simplement immobiles.
 */
export function updateMovement(
  world: World,
  intents: ReadonlyMap<number, InputCommand>,
): void {
  for (const tank of world.tanks) {
    const input = intents.get(tank.id);
    if (input) applyMovement(world, tank, input);
  }
}
