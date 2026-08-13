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

/**
 * Longueur maximale d'une trajectoire explorée, en tuiles.
 *
 * Le plafond valait 40, et il **mordait** : sur un plateau 18 × 18, un tir à
 * deux bandes atteint couramment cette longueur, et la trajectoire était
 * tronquée avant d'avoir pu revenir sur la cible. Le vert, seul à planifier
 * deux rebonds, en était la première victime. Quatre-vingt-dix tuiles laissent
 * la place à trois tronçons de diagonale complète.
 */
const MAX_TRACE_DISTANCE = 90;

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

/**
 * Distance minimale entre la trajectoire et un point, sans seuil.
 *
 * `pathReaches` répond « oui ou non, à telle distance parcourue » ; celle-ci
 * répond « de combien on rate ». C'est ce qu'il faut pour **affiner** un angle :
 * un tir validé peut passer à une demi-boîte du centre, et le cône d'erreur
 * s'ajoute par-dessus. Le vert, dont toute la valeur tient dans la précision de
 * ses ricochets, ratait pour cette seule raison.
 */
export function pathMissDistance(
  segments: readonly TraceSegment[],
  px: number,
  py: number,
  ignoreBefore = 0,
): number {
  let travelledBefore = 0;
  let best = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const { distance, travelled } = distanceToSegment(segment, px, py);
    if (travelledBefore + travelled >= ignoreBefore) best = Math.min(best, distance);
    travelledBefore += Math.hypot(segment.x1 - segment.x0, segment.y1 - segment.y0);
  }

  return best;
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

  // Balayage grossier, noté à l'**écart** et non en tout ou rien.
  //
  // Ne retenir que les angles qui touchent déjà condamnait les tirs longs : à
  // 2° d'écart entre deux échantillons, deux trajectoires voisines arrivent à
  // une tuile l'une de l'autre au bout d'un trajet à deux bandes, et une cible
  // de 0,78 tuile passe entre les deux. Les six verts de la mission 17 n'ont
  // ainsi jamais tiré un seul obus — non par prudence, mais parce qu'aucun
  // échantillon ne tombait dessus.
  //
  // On garde donc la **pente** : chaque minimum local d'écart est un angle
  // prometteur, qu'on affine ensuite au dixième de degré.
  const misses = new Float64Array(ANGLE_SAMPLES);
  for (let sample = 0; sample < ANGLE_SAMPLES; sample++) {
    const angle = (sample / ANGLE_SAMPLES) * TAU;
    misses[sample] = pathMissDistance(
      traceShellPath(grid, fromX, fromY, angle, options.bounces),
      targetX,
      targetY,
      TUNING.tank.sizeTiles,
    );
  }

  const candidates: number[] = [];
  for (let sample = 0; sample < ANGLE_SAMPLES; sample++) {
    const previous = misses[(sample - 1 + ANGLE_SAMPLES) % ANGLE_SAMPLES]!;
    const next = misses[(sample + 1) % ANGLE_SAMPLES]!;
    if (misses[sample]! <= previous && misses[sample]! <= next) candidates.push(sample);
  }

  candidates.sort((a, b) => misses[a]! - misses[b]!);

  let bestAngle: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const sample of candidates.slice(0, MAX_REFINED_CANDIDATES)) {
    const refined = refineAngle(
      grid,
      fromX,
      fromY,
      targetX,
      targetY,
      (sample / ANGLE_SAMPLES) * TAU,
      options,
    );
    if (refined === null) continue;

    // Entre deux solutions valides, la plus courte : c'est celle qui laisse le
    // moins de temps à la cible pour s'écarter.
    const reach = solutionDistance(
      grid,
      fromX,
      fromY,
      targetX,
      targetY,
      refined,
      options.bounces,
      options,
    );
    if (reach !== null && reach < bestDistance) {
      bestDistance = reach;
      bestAngle = refined;
    }
  }

  return bestAngle;
}

/**
 * Nombre de minima locaux affinés avant d'abandonner.
 *
 * Les candidats sont triés par écart croissant : les premiers sont de loin les
 * plus prometteurs. Quatre suffisent, et bornent le coût du raffinement à une
 * fraction du balayage lui-même.
 */
const MAX_REFINED_CANDIDATES = 4;

/**
 * Nombre de sous-angles essayés de part et d'autre d'un angle grossier.
 *
 * Le balayage principal échantillonne tous les 2°. Vingt et un sous-angles
 * ramènent le pas à un dixième de degré, ce qui recentre le tir sur le milieu
 * de la cible au lieu de le laisser frôler son bord.
 */
const REFINE_STEPS = 21;

/**
 * Cherche, autour d'un angle grossier, celui qui passe le plus près du centre.
 *
 * Rend `null` si aucun sous-angle ne donne de trajectoire à la fois touchante et
 * sûre — le minimum local n'était alors qu'un passage à côté.
 */
function refineAngle(
  grid: Grid,
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  coarse: number,
  options: FiringSolutionOptions,
): number | null {
  const span = TAU / ANGLE_SAMPLES;
  let bestAngle: number | null = null;
  let bestMiss = Number.POSITIVE_INFINITY;

  for (let step = 0; step < REFINE_STEPS; step++) {
    const angle = coarse - span + (step / (REFINE_STEPS - 1)) * span * 2;
    if (
      solutionDistance(grid, fromX, fromY, targetX, targetY, angle, options.bounces, options) ===
      null
    ) {
      continue;
    }

    const miss = pathMissDistance(
      traceShellPath(grid, fromX, fromY, angle, options.bounces),
      targetX,
      targetY,
      TUNING.tank.sizeTiles,
    );

    if (miss < bestMiss) {
      bestMiss = miss;
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
