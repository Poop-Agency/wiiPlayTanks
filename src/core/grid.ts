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
