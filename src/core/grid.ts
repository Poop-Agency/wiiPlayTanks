/**
 * Requêtes de collision sur la grille du terrain.
 *
 * L'ancienne version bouclait sur la liste complète des murs à chaque tentative
 * de déplacement. Ici, une boîte ne teste que les tuiles qu'elle recouvre
 * réellement — au plus quatre pour un tank — quelle que soit la taille du
 * niveau.
 */

import { TileKind } from './state.js';
import type { Grid } from './state.js';

/**
 * Nature de la tuile aux coordonnées données.
 *
 * Hors de la grille, on répond « incassable » : le monde est clos, et cette
 * convention évite d'avoir à tester les bornes partout ailleurs.
 */
export function tileAt(grid: Grid, tileX: number, tileY: number): TileKind {
  if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) {
    return TileKind.Indestructible;
  }
  return grid.tiles[tileY * grid.width + tileX] ?? TileKind.Indestructible;
}

/** Remplace la tuile aux coordonnées données. Ignore les coordonnées hors grille. */
export function setTile(grid: Grid, tileX: number, tileY: number, kind: TileKind): void {
  if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) return;
  grid.tiles[tileY * grid.width + tileX] = kind;
}

/**
 * Une tuile bloque-t-elle un tank ?
 *
 * Les trous bloquent les tanks mais pas les obus : c'est la seule différence
 * entre les deux tables, et c'est ce qui justifie deux prédicats distincts
 * plutôt qu'un booléen « solide » unique.
 */
export function blocksTank(kind: TileKind): boolean {
  return kind !== TileKind.Empty;
}

/** Une tuile bloque-t-elle un obus ? Les obus survolent les trous. */
export function blocksShell(kind: TileKind): boolean {
  return kind === TileKind.Indestructible || kind === TileKind.Destructible;
}

/** Prédicat de solidité, pour choisir la table applicable à une entité. */
export type SolidityTest = (kind: TileKind) => boolean;

/**
 * Une boîte alignée aux axes recouvre-t-elle une tuile solide ?
 *
 * La boîte est décrite par son centre et son demi-côté. Seules les tuiles
 * effectivement touchées sont visitées.
 */
export function boxOverlapsSolid(
  grid: Grid,
  centerX: number,
  centerY: number,
  halfSize: number,
  isSolid: SolidityTest,
): boolean {
  const minTileX = Math.floor(centerX - halfSize);
  const maxTileX = Math.floor(centerX + halfSize);
  const minTileY = Math.floor(centerY - halfSize);
  const maxTileY = Math.floor(centerY + halfSize);

  for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      if (isSolid(tileAt(grid, tileX, tileY))) return true;
    }
  }

  return false;
}

/**
 * Marge laissée entre une boîte et le mur contre lequel on la plaque.
 *
 * Sans elle, le bord de la boîte tomberait exactement sur la frontière de
 * tuile ; `Math.floor` la rattacherait alors à la tuile solide et le tank
 * serait considéré comme encastré au tick suivant.
 */
const CONTACT_EPSILON = 1e-6;

/**
 * Déplace une boîte le long d'un seul axe, en la plaquant contre le premier
 * obstacle rencontré.
 *
 * ─── Pourquoi un seul axe à la fois ───────────────────────────────────────────
 *
 * C'est ce qui produit le *glissement le long des murs* caractéristique de
 * Tanks! : poussé en diagonale contre un mur vertical, le tank voit son
 * déplacement horizontal refusé mais son déplacement vertical accepté, donc il
 * longe le mur. L'ancienne version testait le déplacement complet d'un bloc et
 * le rejetait entièrement — le tank se collait au mur et s'arrêtait net.
 *
 * @returns la nouvelle coordonnée sur l'axe considéré
 */
export function sweepAxis(
  grid: Grid,
  centerX: number,
  centerY: number,
  halfSize: number,
  isSolid: SolidityTest,
  axis: 'x' | 'y',
  delta: number,
): number {
  const origin = axis === 'x' ? centerX : centerY;
  if (delta === 0) return origin;

  const target = origin + delta;
  const targetX = axis === 'x' ? target : centerX;
  const targetY = axis === 'x' ? centerY : target;

  if (!boxOverlapsSolid(grid, targetX, targetY, halfSize, isSolid)) {
    return target;
  }

  // Bloqué : on plaque la boîte contre la face de la tuile qui l'arrête.
  // Le pas d'un tank étant très inférieur à une tuile, il ne peut pénétrer
  // qu'une seule rangée par pas, et cette frontière est donc la bonne.
  const snapped =
    delta > 0
      ? Math.floor(target + halfSize) - halfSize - CONTACT_EPSILON
      : Math.floor(target - halfSize) + 1 + halfSize + CONTACT_EPSILON;

  // Si le calage ferait reculer la boîte — cas d'un chevauchement préexistant,
  // par exemple après la destruction d'un mur sous un tank — on préfère ne pas
  // bouger plutôt que de la téléporter.
  if (delta > 0) return snapped > origin ? snapped : origin;
  return snapped < origin ? snapped : origin;
}

/* ── Balayage continu ─────────────────────────────────────────────────────── */

/** Impact trouvé par un balayage continu. */
export interface SweepHit {
  /** Fraction du déplacement parcourue avant l'impact, dans [0, 1]. */
  time: number;
  /** Normale de la face touchée : -1, 0 ou 1 sur chaque axe. */
  normalX: number;
  normalY: number;
}

/**
 * Deux impacts séparés de moins que cette fraction sont considérés simultanés.
 *
 * C'est ce qui permet de détecter un coin : deux tuiles perpendiculaires
 * touchées au même instant doivent réfléchir **les deux** axes. Les traiter
 * l'une après l'autre renverrait l'obus d'où il vient.
 */
const SIMULTANEOUS_HIT_TOLERANCE = 1e-9;

/**
 * Instant d'entrée d'une boîte mobile dans une tuile, par la méthode des
 * tranches (« slab method »).
 *
 * La tuile est dilatée du demi-côté de la boîte, ce qui ramène le problème au
 * déplacement d'un point — c'est la construction de Minkowski.
 *
 * ─── Arêtes internes ─────────────────────────────────────────────────────────
 *
 * Une face n'est une vraie surface de collision que si la tuile située de
 * l'autre côté est franchissable. Le long d'un mur plat, la face gauche de
 * chaque tuile est enfouie dans la tuile précédente : elle n'existe pas
 * physiquement.
 *
 * Sans ce masquage, un obus tiré à 45° contre un mur plat atteint la face
 * supérieure de la tuile et la face gauche de sa voisine **au même instant**.
 * Les deux normales se cumulent, l'obus repart d'où il vient au lieu de
 * ricocher. C'est le piège classique des grilles de tuiles, et il ne se
 * manifeste qu'aux angles où les deux entrées coïncident — typiquement 45°.
 *
 * @returns l'instant d'entrée et l'entrée par axe, ou `null` s'il n'y a pas
 *          d'impact dans ce pas
 */
function sweepAgainstTile(
  grid: Grid,
  isSolid: SolidityTest,
  centerX: number,
  centerY: number,
  halfSize: number,
  dx: number,
  dy: number,
  tileX: number,
  tileY: number,
): { time: number; entryX: number; entryY: number } | null {
  const minX = tileX - halfSize;
  const maxX = tileX + 1 + halfSize;
  const minY = tileY - halfSize;
  const maxY = tileY + 1 + halfSize;

  let entryX: number;
  let exitX: number;
  if (dx === 0) {
    // Aucun déplacement sur cet axe : soit on est déjà dans la tranche pour
    // toujours, soit on n'y entrera jamais.
    if (centerX <= minX || centerX >= maxX) return null;
    entryX = Number.NEGATIVE_INFINITY;
    exitX = Number.POSITIVE_INFINITY;
  } else {
    const first = (minX - centerX) / dx;
    const second = (maxX - centerX) / dx;
    entryX = Math.min(first, second);
    exitX = Math.max(first, second);

    // La face abordée sur cet axe est-elle une vraie surface ?
    const neighbour = dx > 0 ? tileX - 1 : tileX + 1;
    if (isSolid(tileAt(grid, neighbour, tileY))) {
      entryX = Number.NEGATIVE_INFINITY;
    }
  }

  let entryY: number;
  let exitY: number;
  if (dy === 0) {
    if (centerY <= minY || centerY >= maxY) return null;
    entryY = Number.NEGATIVE_INFINITY;
    exitY = Number.POSITIVE_INFINITY;
  } else {
    const first = (minY - centerY) / dy;
    const second = (maxY - centerY) / dy;
    entryY = Math.min(first, second);
    exitY = Math.max(first, second);

    const neighbour = dy > 0 ? tileY - 1 : tileY + 1;
    if (isSolid(tileAt(grid, tileX, neighbour))) {
      entryY = Number.NEGATIVE_INFINITY;
    }
  }

  const entry = Math.max(entryX, entryY);
  const exit = Math.min(exitX, exitY);

  // Les tranches ne se recouvrent pas, ou l'impact est hors du pas courant.
  if (entry > exit || exit <= 0 || entry > 1) return null;

  // Entrée à l'infini négatif : toutes les faces abordées sont internes, la
  // tuile est enfouie dans le mur et ne peut rien arrêter.
  // Entrée négative finie : chevauchement préexistant, l'appelant s'en occupe
  // (un obus né dans un mur est détruit plutôt que réfléchi au hasard).
  if (entry < 0) return null;

  return { time: entry, entryX, entryY };
}

/**
 * Trouve le **premier** obstacle rencontré par une boîte au cours d'un
 * déplacement, et la normale de la face touchée.
 *
 * ─── Pourquoi un balayage plutôt qu'un test après coup ───────────────────────
 *
 * L'ancienne version déplaçait l'obus (`this.x += this.dx`) puis testait la
 * collision. Deux conséquences :
 *
 *   - un obus rapide pouvait traverser un mur entre deux pas ;
 *   - une fois l'obus **dans** le mur, il fallait deviner par quelle face il
 *     était entré. Le code comparait les quatre chevauchements et retenait le
 *     plus petit — ce qui est faux dans les coins et faux dès que la
 *     pénétration est profonde, d'où les rebonds erratiques.
 *
 * Le balayage donne l'instant et la face exacts, sans avoir à deviner. Il rend
 * aussi la physique insensible à la vitesse, ce qui compte puisque le panneau
 * de calibration (#10) permettra de la modifier.
 */
export function sweepBoxAgainstGrid(
  grid: Grid,
  centerX: number,
  centerY: number,
  halfSize: number,
  dx: number,
  dy: number,
  isSolid: SolidityTest,
): SweepHit | null {
  if (dx === 0 && dy === 0) return null;

  // Phase large : uniquement les tuiles que le trajet peut atteindre.
  const minTileX = Math.floor(Math.min(centerX, centerX + dx) - halfSize);
  const maxTileX = Math.floor(Math.max(centerX, centerX + dx) + halfSize);
  const minTileY = Math.floor(Math.min(centerY, centerY + dy) - halfSize);
  const maxTileY = Math.floor(Math.max(centerY, centerY + dy) + halfSize);

  let earliest = Number.POSITIVE_INFINITY;
  let normalX = 0;
  let normalY = 0;

  for (let tileY = minTileY; tileY <= maxTileY; tileY++) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX++) {
      if (!isSolid(tileAt(grid, tileX, tileY))) continue;

      const hit = sweepAgainstTile(
        grid,
        isSolid,
        centerX,
        centerY,
        halfSize,
        dx,
        dy,
        tileX,
        tileY,
      );
      if (!hit) continue;

      if (hit.time < earliest - SIMULTANEOUS_HIT_TOLERANCE) {
        // Impact strictement plus précoce : il remplace les précédents.
        earliest = hit.time;
        normalX = 0;
        normalY = 0;
      } else if (hit.time > earliest + SIMULTANEOUS_HIT_TOLERANCE) {
        continue;
      }

      // Impact simultané : on cumule les normales. Un obus qui entre dans un
      // angle rentrant touche deux tuiles au même instant et doit repartir
      // dans la direction opposée, pas le long du mur.
      if (hit.entryX > hit.entryY + SIMULTANEOUS_HIT_TOLERANCE) {
        normalX = dx > 0 ? -1 : 1;
      } else if (hit.entryY > hit.entryX + SIMULTANEOUS_HIT_TOLERANCE) {
        normalY = dy > 0 ? -1 : 1;
      } else {
        // Coin frappé exactement : les deux axes entrent en même temps.
        normalX = dx > 0 ? -1 : 1;
        normalY = dy > 0 ? -1 : 1;
      }
    }
  }

  if (!Number.isFinite(earliest)) return null;
  return { time: earliest, normalX, normalY };
}

/* ── Lancer de rayon ──────────────────────────────────────────────────────── */

/** Premier obstacle rencontré par un rayon. */
export interface RayHit {
  /** Distance parcourue jusqu'à l'impact, en tuiles. */
  distance: number;
  normalX: number;
  normalY: number;
}

/**
 * Premier obstacle sur le trajet d'un rayon, par parcours de grille (DDA).
 *
 * Ne visite que les tuiles réellement traversées, là où
 * {@link sweepBoxAgainstGrid} examine toute la boîte englobante du déplacement.
 * Sur un rayon de vingt tuiles en diagonale, cela fait une quarantaine de
 * tuiles au lieu de quatre cents — ce qui rend abordable la recherche d'angle
 * de tir de l'IA, qui en lance des centaines.
 *
 * Le projectile est traité comme un **point** : c'est une prédiction, et chaque
 * profil de tank applique de toute façon son propre cône d'erreur. La physique
 * réelle des obus, elle, reste le balayage exact de `sweepBoxAgainstGrid`.
 *
 * @param dirX composante X d'une direction **normalisée**
 * @param dirY composante Y d'une direction **normalisée**
 */
export function raycastGrid(
  grid: Grid,
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  maxDistance: number,
  isSolid: SolidityTest,
): RayHit | null {
  let tileX = Math.floor(originX);
  let tileY = Math.floor(originY);

  // Origine déjà dans un mur : impact immédiat, sans normale exploitable.
  if (isSolid(tileAt(grid, tileX, tileY))) {
    return { distance: 0, normalX: 0, normalY: 0 };
  }

  const stepX = dirX >= 0 ? 1 : -1;
  const stepY = dirY >= 0 ? 1 : -1;

  // Distance parcourue pour franchir une tuile entière sur chaque axe.
  const spanX = dirX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dirX);
  const spanY = dirY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dirY);

  // Distance jusqu'à la première frontière de tuile sur chaque axe.
  let nextX =
    dirX === 0
      ? Number.POSITIVE_INFINITY
      : (dirX > 0 ? tileX + 1 - originX : originX - tileX) * spanX;
  let nextY =
    dirY === 0
      ? Number.POSITIVE_INFINITY
      : (dirY > 0 ? tileY + 1 - originY : originY - tileY) * spanY;

  // Garde-fou : une direction non normalisée ou dégénérée ne doit pas boucler.
  const maxSteps = 4 * (grid.width + grid.height);

  for (let step = 0; step < maxSteps; step++) {
    let distance: number;
    let normalX = 0;
    let normalY = 0;

    if (nextX < nextY) {
      distance = nextX;
      tileX += stepX;
      nextX += spanX;
      normalX = -stepX;
    } else {
      distance = nextY;
      tileY += stepY;
      nextY += spanY;
      normalY = -stepY;
    }

    if (distance > maxDistance) return null;
    if (isSolid(tileAt(grid, tileX, tileY))) return { distance, normalX, normalY };
  }

  return null;
}
