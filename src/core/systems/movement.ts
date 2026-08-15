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
import { profileOf } from './ai/profiles.js';
import type { InputCommand, Tank, World } from '../state.js';

/** Applique l'intention d'un tick à un tank. */
export function applyMovement(world: World, tank: Tank, input: InputCommand): void {
  const profile = profileOf(tank.color);

  // La tourelle du joueur suit le pointeur sans inertie — son profil déclare
  // une vitesse de rotation infinie, que `rotateToward` traite comme un
  // alignement immédiat. Les tanks de l'IA, eux, mettent un temps mesurable à
  // se retourner, et c'est ce délai qui rend leurs tirs esquivables.
  tank.turretAngle = rotateToward(
    tank.turretAngle,
    input.aim,
    profile.turretRateRadiansPerSecond * DT,
  );

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

    const step = TUNING.tank.speedTilesPerSecond * profile.speedMultiplier * DT;
    const half = TUNING.tank.sizeTiles / 2;

    // X d'abord, puis Y avec le X déjà résolu : c'est cet enchaînement qui
    // produit le glissement. Tester les deux axes ensemble rejetterait le
    // déplacement entier dès qu'un seul des deux est bloqué.
    const originX = tank.x;
    tank.x = sweepAxis(world.grid, tank.x, tank.y, half, blocksTank, 'x', direction.x * step);
    if (!clearOfOtherTanks(world, tank, 'x', direction.x * step)) tank.x = originX;

    const originY = tank.y;
    tank.y = sweepAxis(world.grid, tank.x, tank.y, half, blocksTank, 'y', direction.y * step);
    if (!clearOfOtherTanks(world, tank, 'y', direction.y * step)) tank.y = originY;
  }
}

/** Les tanks vivants que celui-ci chevauche à sa position courante. */
function tanksOverlapping(world: World, tank: Tank): Tank[] {
  const size = TUNING.tank.sizeTiles;
  const found: Tank[] = [];

  for (const other of world.tanks) {
    if (other.id === tank.id || !other.alive) continue;
    if (Math.abs(other.x - tank.x) < size && Math.abs(other.y - tank.y) < size) found.push(other);
  }

  return found;
}

/**
 * La place est-elle libre pour ce tank, quitte à écarter ce qui gêne ?
 *
 * Les tanks sont des obstacles les uns pour les autres : sans ça, deux tanks de
 * l'IA qui convergent vers la même position finissent superposés, ce qui est
 * autant un défaut visuel qu'un défaut de jeu — deux tanks empilés se
 * comportent comme un seul.
 *
 * **Sauf que les tanks fixes, eux, se laissent pousser.** C'est une mécanique du
 * jeu original : « the moving tanks can push the fixed tanks around », et c'est
 * ce qui permet de faire glisser un vert le long d'un mur pour aller le miner de
 * l'autre côté. Un brun ou un vert bousculé cède donc le passage ; deux châssis
 * mobiles continuent de se bloquer l'un l'autre.
 *
 * La poussée ne se propage pas : si le tank écarté vient buter sur un mur ou sur
 * un troisième, rien ne bouge et l'axe est annulé. Une chaîne de poussées
 * ouvrirait la porte à des récursions dont le coût dépendrait du nombre de tanks
 * alignés, pour un cas de figure qu'on ne voit jamais en jeu.
 *
 * Le test est fait après chaque axe, et l'axe fautif est simplement annulé. Un
 * tank bloqué par un autre glisse donc le long de lui, exactement comme le long
 * d'un mur.
 */
function clearOfOtherTanks(world: World, tank: Tank, axis: 'x' | 'y', delta: number): boolean {
  const blockers = tanksOverlapping(world, tank);
  if (blockers.length === 0) return true;

  const half = TUNING.tank.sizeTiles / 2;
  const displaced: Array<{ tank: Tank; x: number; y: number }> = [];

  const undo = (): false => {
    for (const entry of displaced) {
      entry.tank.x = entry.x;
      entry.tank.y = entry.y;
    }
    return false;
  };

  for (const other of blockers) {
    if (profileOf(other.color).speedMultiplier !== 0) return undo();

    displaced.push({ tank: other, x: other.x, y: other.y });

    if (axis === 'x') {
      other.x = sweepAxis(world.grid, other.x, other.y, half, blocksTank, 'x', delta);
    } else {
      other.y = sweepAxis(world.grid, other.x, other.y, half, blocksTank, 'y', delta);
    }

    // Le poussé doit avoir vraiment libéré la place — ce que ce test couvre,
    // puisque le pousseur figure lui-même parmi les tanks qu'on lui compare.
    if (tanksOverlapping(world, other).length > 0) return undo();
  }

  return true;
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
