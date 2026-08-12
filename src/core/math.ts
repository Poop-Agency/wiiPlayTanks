/**
 * Utilitaires géométriques de la simulation.
 *
 * Tout est en unités monde : distances en tuiles, angles en radians.
 */

export const TAU = Math.PI * 2;

/** Borne une valeur dans [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Ramène un angle dans (-π, π].
 *
 * Indispensable avant toute comparaison d'angles : sans ça, passer de 359° à 1°
 * ressemble à un demi-tour de 358° au lieu d'un pas de 2°.
 */
export function normalizeAngle(angle: number): number {
  const wrapped = angle % TAU;
  if (wrapped > Math.PI) return wrapped - TAU;
  if (wrapped <= -Math.PI) return wrapped + TAU;
  return wrapped;
}

/**
 * Fait tourner `current` vers `target` d'au plus `maxDelta` radians, par le
 * chemin le plus court.
 *
 * Utilisé pour l'orientation du châssis : dans Tanks!, le tank se déplace
 * immédiatement dans la direction demandée et son corps pivote pour rattraper.
 * L'orientation est donc purement visuelle et ne freine jamais le déplacement.
 */
export function rotateToward(current: number, target: number, maxDelta: number): number {
  const difference = normalizeAngle(target - current);
  return normalizeAngle(current + clamp(difference, -maxDelta, maxDelta));
}

/**
 * Normalise un vecteur de direction si sa norme dépasse 1.
 *
 * Les entrées clavier donnent (1, 1) en diagonale, ce qui vaut √2 ≈ 1,41 : sans
 * normalisation, on se déplacerait 41 % plus vite en diagonale. Les entrées
 * analogiques d'une manette, elles, sont déjà dans le disque unité et doivent
 * être laissées telles quelles pour conserver leur dosage.
 */
export function limitToUnitDisc(x: number, y: number): { x: number; y: number } {
  const lengthSquared = x * x + y * y;
  if (lengthSquared <= 1 || lengthSquared === 0) return { x, y };

  const length = Math.sqrt(lengthSquared);
  return { x: x / length, y: y / length };
}

/** Carré de la distance entre deux points. Évite une racine carrée inutile. */
export function distanceSquared(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Interpolation linéaire. */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/**
 * Interpolation angulaire par le chemin le plus court.
 *
 * Sans elle, une tourelle qui passe de 179° à -179° traverserait tout le cadran
 * à l'écran alors qu'elle n'a bougé que de 2°.
 */
export function lerpAngle(from: number, to: number, t: number): number {
  return normalizeAngle(from + normalizeAngle(to - from) * t);
}
