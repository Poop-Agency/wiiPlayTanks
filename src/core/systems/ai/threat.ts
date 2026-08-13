/**
 * Détection et esquive des obus entrants.
 *
 * Dans l'original, l'esquive est le privilège de deux couleurs seulement : le
 * cendre s'écarte parfois, le noir systématiquement. Toutes les autres
 * encaissent. L'ouvrir à tous les tanks mobiles paraissait plus vivant, mais
 * rendait le turquoise, le jaune et le rose bien plus retors que l'original —
 * on ne touchait plus rien de la moitié faible de la campagne. Qui esquive, et
 * avec quelle anticipation, se lit donc dans `profiles.ts`.
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
 *
 * `horizonSeconds` est l'anticipation propre au tank, et c'est **elle seule**
 * qui fait la différence entre un esquiveur et une cible. Un obus qui arrivera
 * plus tard est ignoré : le tank ne l'a pas encore « vu ». Réagir tard ne rate
 * pas l'esquive par tirage au sort, mais par manque de temps — il faut environ
 * une largeur de châssis de décalage pour sortir du couloir, et un tank lent
 * prévenu au dernier moment ne l'a pas. C'est ce qui donne au cendre son
 * « esquive parfois » sans introduire de hasard, et donc sans compromettre le
 * déterminisme du noyau.
 *
 * À zéro, la fonction rend toujours `null` : le tank encaisse.
 */
export function findEvasion(
  tank: Tank,
  shells: readonly Shell[],
  horizonSeconds: number,
): EvasionVector | null {
  if (horizonSeconds <= 0) return null;

  let closestTime = Number.POSITIVE_INFINITY;
  let evasion: EvasionVector | null = null;

  for (const shell of shells) {
    // Ses propres obus comptent **une fois armés**, et pas avant : tant que
    // l'obus chevauche encore son canon il ne peut pas le tuer, et fuir sa
    // propre bouche de tir n'aurait aucun sens.
    //
    // Passé l'armement, c'est une autre affaire : la règle du jeu veut qu'on
    // puisse se tuer avec son propre ricochet, et l'audit des morts a montré
    // des traqueurs qui tiraient vers un mur proche puis fonçaient dans l'obus
    // revenu de bande. Un tank qui ignore son propre ricochet n'est pas
    // prudent, il est aveugle.
    if (shell.ownerId === tank.id && !shell.armed) continue;

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
    if (timeToReach > horizonSeconds || timeToReach >= closestTime) continue;

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
