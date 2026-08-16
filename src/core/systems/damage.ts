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

import { DT } from '../tick.js';
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

/**
 * Abat un tank, et crédite son auteur s'il y en a un.
 *
 * Le tableau des scores ne compte que les **ennemis** détruits : ni le tir
 * fratricide, ni le suicide. L'un et l'autre arrivent en co-op, et les compter
 * — même en négatif — ferait du tableau un sujet de dispute plutôt qu'un repère.
 *
 * @param killerId tireur ou poseur de mine, `null` si la mort n'a pas d'auteur
 */
export function killTank(world: World, victim: Tank, killerId: EntityId | null): void {
  victim.alive = false;

  if (killerId === null || killerId === victim.id) return;
  // Un tank piloté par un joueur n'est pas une prise.
  if (victim.playerId !== null) return;

  const killer = world.tanks.find((tank) => tank.id === killerId);
  if (killer) killer.kills++;
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
        killTank(world, tank, shell.ownerId);
        doomed.add(shell.id);
        break;
      }
    }
  }
}

/**
 * Obus contre obus : les deux explosent.
 *
 * Règle de l'original, et elle change la façon de jouer : un tir qui arrive de
 * face n'oblige pas à s'écarter, on peut l'**abattre**. C'est la seule parade
 * d'un tank acculé, et c'est ce dont se sert `interceptionAngle` dans l'IA.
 *
 * L'ancienne version tentait déjà ce comportement, mais collectait des indices
 * de tableau qu'elle invalidait ensuite en supprimant les éléments un à un.
 * On travaille ici sur des identifiants, qui restent valides quoi qu'il arrive.
 */
export function resolveShellShellHits(world: World, doomed: Set<EntityId>): void {
  const contact = TUNING.shell.radiusTiles * 2;

  for (let i = 0; i < world.shells.length; i++) {
    const first = world.shells[i]!;
    if (doomed.has(first.id)) continue;

    for (let j = i + 1; j < world.shells.length; j++) {
      const second = world.shells[j]!;
      if (doomed.has(second.id)) continue;

      // Deux obus d'un même tireur ne se gênent pas tant que l'un des deux est
      // encore au canon : le rose en garde trois en vol, tirés à la file, et
      // les faire se détruire à la sortie lui retirerait son arme.
      if (first.ownerId === second.ownerId && !(first.armed && second.armed)) continue;

      // Test **balayé**, et non ponctuel. Deux obus rapides qui se croisent de
      // face se rapprochent de 0,3 tuile par pas pour un rayon cumulé de 0,19 :
      // comparer les seules positions les laissait se traverser un pas sur deux,
      // et l'interception ne marchait qu'une fois sur deux sans qu'on voie
      // pourquoi.
      const closing = Math.hypot(first.vx - second.vx, first.vy - second.vy) * DT;

      if (Math.hypot(first.x - second.x, first.y - second.y) < contact + closing) {
        doomed.add(first.id);
        doomed.add(second.id);
        break;
      }
    }
  }
}
