/**
 * Détection et esquive des obus entrants.
 *
 * Sans cela, un tank ennemi encaisse passivement tout ce qu'on lui envoie, ce
 * qui rend les missions triviales dès qu'on a compris les angles. Dans
 * l'original, les tanks mobiles se décalent quand un obus arrive sur eux.
 */

import { TUNING } from '../../tuning.js';
import type { Shell, Tank } from '../../state.js';

/**
 * Largeur du couloir considéré comme menaçant, en tuiles.
 *
 * Dérivée de la taille du tank plutôt que réglable à part : un obus est
 * menaçant s'il passe dans l'emprise du châssis, pas à une distance arbitraire.
 * L'anticipation, elle, se règle — voir `TUNING.ai.evasionHorizonSeconds`.
 *
 * Une fonction et non une constante de module : `const X = TUNING.…` fige la
 * valeur au chargement, et le panneau de calibration aurait beau modifier la
 * taille du châssis, ce couloir-ci serait resté à sa valeur de départ. Un test
 * de garde interdit désormais cette forme.
 */
function threatCorridorTiles(): number {
  return TUNING.tank.sizeTiles;
}

/** Direction dans laquelle s'écarter, ou `null` si rien ne menace. */
export interface EvasionVector {
  x: number;
  y: number;
}

/**
 * Cherche l'obus le plus pressant et rend la direction pour s'en écarter.
 *
 * On ne considère que la trajectoire **actuelle** de l'obus, sans ses rebonds à
 * venir : anticiper un ricochet donnerait à l'IA une prescience que le joueur
 * n'a pas, et rendrait les tanks agaçants plutôt que vivants.
 */
export function findEvasion(tank: Tank, shells: readonly Shell[]): EvasionVector | null {
  let closestTime = Number.POSITIVE_INFINITY;
  let evasion: EvasionVector | null = null;

  for (const shell of shells) {
    // Un tank n'esquive pas ses propres obus : ils partent de lui.
    if (shell.ownerId === tank.id) continue;

    const speed = Math.hypot(shell.vx, shell.vy);
    if (speed === 0) continue;

    const dirX = shell.vx / speed;
    const dirY = shell.vy / speed;

    // Projection du tank sur l'axe de l'obus.
    const toTankX = tank.x - shell.x;
    const toTankY = tank.y - shell.y;
    const along = toTankX * dirX + toTankY * dirY;

    // Derrière l'obus, ou trop loin devant pour être une menace immédiate.
    if (along <= 0) continue;
    const timeToReach = along / speed;
    if (timeToReach > TUNING.ai.evasionHorizonSeconds || timeToReach >= closestTime) continue;

    // Écart latéral : l'obus passe-t-il assez près pour toucher ?
    const lateral = toTankX * -dirY + toTankY * dirX;
    if (Math.abs(lateral) > threatCorridorTiles()) continue;

    closestTime = timeToReach;
    // On s'écarte perpendiculairement, du côté où l'on est déjà. Fuir dans
    // l'axe de l'obus serait perdu d'avance : il va bien plus vite.
    const side = lateral >= 0 ? 1 : -1;
    evasion = { x: -dirY * side, y: dirX * side };
  }

  return evasion;
}
