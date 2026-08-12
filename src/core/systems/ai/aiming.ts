/**
 * Visée avec rebonds.
 *
 * C'est **la** mécanique signature de Tanks! : un tank ennemi ne tire pas
 * seulement quand il vous voit, il calcule une trajectoire qui vous atteint
 * après un ou deux ricochets — donc à travers un mur.
 *
 * L'ancienne version ne faisait rien de tout ça : elle visait en ligne droite
 * et ajoutait du bruit aléatoire (`targetAngle += (Math.random() - 0.5) *
 * accuracy`). Un ennemi derrière un mur était donc totalement inoffensif, ce
 * qui retire au jeu l'essentiel de sa tension.
 */

import { blocksShell, raycastGrid } from '../../grid.js';
import { TAU } from '../../math.js';
import { TUNING } from '../../tuning.js';
import type { Grid } from '../../state.js';

/** Segment de trajectoire prévue, entre deux rebonds. */
export interface TraceSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Longueur maximale d'une trajectoire explorée, en tuiles. */
const MAX_TRACE_DISTANCE = 40;

/**
 * Nombre de directions échantillonnées lors de la recherche d'un angle.
 *
 * 180 donne un pas de 2°, largement sous le cône d'erreur du profil le plus
 * précis (le vert, à 0,05 rad ≈ 2,9°). Aller plus fin coûterait sans rien
 * apporter de perceptible.
 */
const ANGLE_SAMPLES = 180;

/**
 * Trace la trajectoire prévue d'un obus, rebonds compris.
 *
 * Le projectile est traité comme un point — voir la note de `raycastGrid`.
 */
export function traceShellPath(
  grid: Grid,
  originX: number,
  originY: number,
  angle: number,
  bounces: number,
  maxDistance = MAX_TRACE_DISTANCE,
): TraceSegment[] {
  const segments: TraceSegment[] = [];

  let x = originX;
  let y = originY;
  let dirX = Math.cos(angle);
  let dirY = Math.sin(angle);
  let budget = maxDistance;

  for (let leg = 0; leg <= bounces; leg++) {
    if (budget <= 0) break;

    const hit = raycastGrid(grid, x, y, dirX, dirY, budget, blocksShell);
    const travelled = hit ? hit.distance : budget;

    const endX = x + dirX * travelled;
    const endY = y + dirY * travelled;
    segments.push({ x0: x, y0: y, x1: endX, y1: endY });

    if (!hit) break;

    budget -= travelled;

    // On repart très légèrement en retrait du mur, sinon le rayon suivant
    // repartirait depuis l'intérieur de la tuile qu'on vient de toucher.
    const nudge = 1e-4;
    x = endX + hit.normalX * nudge;
    y = endY + hit.normalY * nudge;

    if (hit.normalX !== 0) dirX = -dirX;
    if (hit.normalY !== 0) dirY = -dirY;
  }

  return segments;
}

/** Distance du point (px, py) au segment, avec la distance parcourue jusqu'au projeté. */
function distanceToSegment(
  segment: TraceSegment,
  px: number,
  py: number,
): { distance: number; travelled: number } {
  const dx = segment.x1 - segment.x0;
  const dy = segment.y1 - segment.y0;
  const lengthSquared = dx * dx + dy * dy;

  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - segment.x0) * dx + (py - segment.y0) * dy) / lengthSquared));

  const nearestX = segment.x0 + dx * t;
  const nearestY = segment.y0 + dy * t;

  return {
    distance: Math.hypot(px - nearestX, py - nearestY),
    travelled: t * Math.sqrt(lengthSquared),
  };
}

/**
 * La trajectoire passe-t-elle assez près d'un point ?
 *
 * @param ignoreBefore distance en deçà de laquelle on ne compte pas les
 *        passages — sert à ne pas considérer qu'un tank se touche lui-même au
 *        moment où l'obus quitte son canon
 * @returns la distance parcourue jusqu'au point, ou `null`
 */
export function pathReaches(
  segments: readonly TraceSegment[],
  px: number,
  py: number,
  tolerance: number,
  ignoreBefore = 0,
): number | null {
  let travelledBefore = 0;

  for (const segment of segments) {
    const { distance, travelled } = distanceToSegment(segment, px, py);
    const total = travelledBefore + travelled;

    if (distance <= tolerance && total >= ignoreBefore) return total;

    travelledBefore += Math.hypot(segment.x1 - segment.x0, segment.y1 - segment.y0);
  }

  return null;
}

/** Un tank à éviter lors de la vérification de sécurité du tir. */
export interface AimObstacle {
  x: number;
  y: number;
}

export interface FiringSolutionOptions {
  /** Rebonds que le tireur est autorisé à envisager. */
  bounces: number;
  /**
   * Tanks à ne pas toucher : le tireur lui-même et ses alliés.
   *
   * Sans ce contrôle, les profils à deux rebonds se suicident en boucle — la
   * trajectoire la plus courte vers une cible proche repasse très souvent par
   * le point de départ.
   */
  avoid: readonly AimObstacle[];
  /** Rayon de touche, en tuiles. */
  hitRadius: number;
}

/**
 * Cherche un angle de tir atteignant la cible.
 *
 * Procède en deux temps, parce que la ligne droite est de loin le cas le plus
 * fréquent et coûte un seul lancer de rayon :
 *
 *   1. tir direct, si la cible est dégagée ;
 *   2. sinon, balayage angulaire à la recherche d'une solution avec rebonds.
 *
 * Parmi les solutions trouvées, on retient **la plus courte** : c'est celle qui
 * laisse le moins de temps à la cible pour s'écarter.
 *
 * @returns l'angle retenu, ou `null` si aucune trajectoire sûre n'aboutit
 */
export function findFiringSolution(
  grid: Grid,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  options: FiringSolutionOptions,
): number | null {
  const directAngle = Math.atan2(targetY - fromY, targetX - fromX);

  if (isSolutionValid(grid, fromX, fromY, targetX, targetY, directAngle, 0, options)) {
    return directAngle;
  }

  if (options.bounces <= 0) return null;

  let bestAngle: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let sample = 0; sample < ANGLE_SAMPLES; sample++) {
    const angle = (sample / ANGLE_SAMPLES) * TAU;
    const reach = solutionDistance(
      grid,
      fromX,
      fromY,
      targetX,
      targetY,
      angle,
      options.bounces,
      options,
    );

    if (reach !== null && reach < bestDistance) {
      bestDistance = reach;
      bestAngle = angle;
    }
  }

  return bestAngle;
}

/**
 * Distance à parcourir pour atteindre la cible par cet angle, si la trajectoire
 * est à la fois efficace et sûre.
 */
function solutionDistance(
  grid: Grid,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  angle: number,
  bounces: number,
  options: FiringSolutionOptions,
): number | null {
  const path = traceShellPath(grid, fromX, fromY, angle, bounces);

  const reach = pathReaches(path, targetX, targetY, options.hitRadius);
  if (reach === null) return null;

  // Un obus qui reviendrait sur le tireur ou sur un allié **avant** d'atteindre
  // la cible est disqualifié. Ce qu'il fait ensuite n'a plus d'importance :
  // il aura déjà explosé sur la cible.
  const muzzleClearance = TUNING.tank.sizeTiles;
  for (const obstacle of options.avoid) {
    const friendly = pathReaches(
      path,
      obstacle.x,
      obstacle.y,
      options.hitRadius,
      muzzleClearance,
    );
    if (friendly !== null && friendly < reach) return null;
  }

  return reach;
}

/** Variante booléenne, pour le cas du tir direct. */
function isSolutionValid(
  grid: Grid,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  angle: number,
  bounces: number,
  options: FiringSolutionOptions,
): boolean {
  return (
    solutionDistance(grid, fromX, fromY, targetX, targetY, angle, bounces, options) !== null
  );
}
