/**
 * Déplacement des tanks autour des obstacles.
 *
 * Sans ça, un ennemi qui « traque » le joueur se contente de pousser dans sa
 * direction en ligne droite. Face à un mur, le système de mouvement le fait
 * glisser le long de la paroi, et il finit collé derrière à pousser dans le
 * vide — le joueur se met à couvert et l'attaque s'arrête net, ce qui n'arrive
 * jamais dans l'original.
 *
 * La solution est un **champ de distance** : une propagation en largeur depuis
 * la case de la cible, sur les cases franchissables. Chaque tank n'a plus qu'à
 * descendre la pente. C'est ce qui lui fait contourner un obstacle plutôt que
 * de s'y écraser, et ce qui lui fait choisir la bonne ouverture quand il y en a
 * deux.
 *
 * ─── Déterminisme ────────────────────────────────────────────────────────────
 *
 * Tout est calculé à partir de la grille et des positions, sans tirage
 * aléatoire, sans horloge et sans état conservé entre deux pas. Deux
 * simulations parties de la même graine produisent exactement les mêmes
 * chemins, ce dont dépendent le rejeu et l'accord serveur/client.
 *
 * ─── Coût ────────────────────────────────────────────────────────────────────
 *
 * Une propagation couvre 324 cases sur un plateau 18 × 18. Refaite pour chaque
 * tank à chaque pas, cela reste très en deçà de ce que coûte déjà la recherche
 * d'angle de tir, qui lance des centaines de rayons. On ne met donc rien en
 * cache : un cache aurait besoin d'être invalidé par la grille, par les mines
 * et par la position de la cible, et une invalidation ratée se paierait en
 * divergence réseau — bien plus cher que le calcul lui-même.
 */

import { blocksTank, boxOverlapsSolid, tileAt } from '../../grid.js';
import { TileKind } from '../../state.js';
import { TUNING } from '../../tuning.js';
import type { Grid, Mine, World } from '../../state.js';

/** Marque une case jamais atteinte par la propagation. */
const UNREACHABLE = -1;

/**
 * Pas d'échantillonnage du test de vue directe, en tuiles.
 *
 * Une demi-tuile : assez fin pour qu'un bloc isolé ne passe jamais entre deux
 * points de sonde, assez large pour que le test reste bon marché.
 */
const LINE_STEP_TILES = 0.5;

/** Voisinage à quatre directions, celui qui définit la connexité du plateau. */
const NEIGHBOURS_4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Voisinage à huit directions, pour choisir la case vers laquelle se diriger.
 *
 * La propagation, elle, reste à quatre directions : c'est la connexité que
 * `tests/missions.test.ts` vérifie sur chaque tracé, et s'en écarter ferait
 * emprunter à l'IA des diagonales entre deux blocs en coin que le système de
 * mouvement refuserait ensuite.
 */
const NEIGHBOURS_8: readonly (readonly [number, number])[] = [
  ...NEIGHBOURS_4,
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** Champ de distance : nombre de cases jusqu'à la cible, ou `UNREACHABLE`. */
export interface FlowField {
  width: number;
  height: number;
  distance: Int32Array;
}

/**
 * Une case est-elle franchissable par un châssis centré dessus ?
 *
 * On teste la boîte entière et non le seul centre : un tank fait 0,78 tuile de
 * large, si bien qu'il ne passe pas dans une case dont un voisin est plein
 * lorsqu'il est mal centré. Tester le centre seul produisait des chemins que le
 * tank n'arrivait pas à suivre, et il restait coincé à l'entrée.
 */
function tileIsFree(grid: Grid, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) return false;
  return !blocksTank(tileAt(grid, tileX, tileY));
}

/**
 * Une mine vivante rend-elle cette case mortelle ?
 *
 * Les cases dans le souffle d'une mine encore amorcée sont retirées du champ,
 * ce qui fait **contourner** la mine au lieu de la traverser. C'est ce qui
 * manquait le plus : un poseur fuyait bien sa propre mine tant qu'il était dans
 * le rayon de fuite, puis la traque le ramenait droit dessus avant la fin de la
 * mèche. Il mourait sur ses propres pieds, à répétition.
 */
function tileIsMined(mines: readonly Mine[], tileX: number, tileY: number): boolean {
  if (mines.length === 0) return false;

  // Depuis le centre de la case, et avec la demi-boîte du tank en marge : un
  // châssis dont le bord touche le souffle meurt comme s'il était au centre.
  const centreX = tileX + 0.5;
  const centreY = tileY + 0.5;
  const lethal = TUNING.mine.blastRadiusTiles + TUNING.tank.sizeTiles / 2;

  for (const mine of mines) {
    if (Math.hypot(mine.x - centreX, mine.y - centreY) <= lethal) return true;
  }

  return false;
}

/**
 * Champ de distance depuis une position, en cases.
 *
 * `mines` peut être vide : c'est ce qu'on fait en second essai quand une mine
 * bouche le seul passage, auquel cas mieux vaut un chemin risqué que pas de
 * chemin du tout.
 */
export function buildFlowField(
  grid: Grid,
  fromX: number,
  fromY: number,
  mines: readonly Mine[] = [],
): FlowField {
  const { width, height } = grid;
  const distance = new Int32Array(width * height).fill(UNREACHABLE);

  const startX = Math.floor(fromX);
  const startY = Math.floor(fromY);
  if (!tileIsFree(grid, startX, startY)) {
    return { width, height, distance };
  }

  // File circulaire dimensionnée une fois : chaque case entre au plus une fois.
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  distance[startY * width + startX] = 0;
  queue[tail++] = startY * width + startX;

  while (head < tail) {
    const index = queue[head++]!;
    const x = index % width;
    const y = (index - x) / width;
    const next = distance[index]! + 1;

    for (const [dx, dy] of NEIGHBOURS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (!tileIsFree(grid, nx, ny)) continue;

      const neighbour = ny * width + nx;
      if (distance[neighbour] !== UNREACHABLE) continue;
      if (tileIsMined(mines, nx, ny)) continue;

      distance[neighbour] = next;
      queue[tail++] = neighbour;
    }
  }

  return { width, height, distance };
}

/** Distance d'une case à la cible, ou `null` si elle n'est pas atteignable. */
function distanceAt(field: FlowField, tileX: number, tileY: number): number | null {
  if (tileX < 0 || tileY < 0 || tileX >= field.width || tileY >= field.height) return null;
  const value = field.distance[tileY * field.width + tileX]!;
  return value === UNREACHABLE ? null : value;
}

/**
 * Le tank peut-il sortir d'un rayon mortel centré sur lui, à temps ?
 *
 * Question posée avant de poser une mine, et la seule qui vaille. On sondait
 * auparavant **un seul point** droit devant, à distance de souffle : un point
 * libre ne dit pourtant rien de la possibilité de s'y rendre, et un tank
 * ballotté contre une paroi voyait sa direction changer à chaque pas. Il posait
 * sa mine, n'allait nulle part, et sautait avec.
 *
 * La propagation, elle, répond exactement : existe-t-il une case **joignable**
 * en `budgetTiles` déplacements qui soit hors du souffle ? Le compte en cases à
 * quatre directions surestime le trajet réel — le tank coupe en diagonale —
 * donc la réponse penche du côté prudent.
 */
export function canReachSafety(
  grid: Grid,
  fromX: number,
  fromY: number,
  lethalRadius: number,
  budgetTiles: number,
): boolean {
  const field = buildFlowField(grid, fromX, fromY);

  for (let tileY = 0; tileY < field.height; tileY++) {
    for (let tileX = 0; tileX < field.width; tileX++) {
      const steps = field.distance[tileY * field.width + tileX]!;
      if (steps === UNREACHABLE || steps > budgetTiles) continue;
      if (Math.hypot(tileX + 0.5 - fromX, tileY + 0.5 - fromY) > lethalRadius) return true;
    }
  }

  return false;
}

/**
 * Combien de cases gagnerait-on à faire sauter ce bloc cassable ?
 *
 * Rend le raccourci, en cases, ou `0` si le bloc n'ouvre rien. `Infinity` quand
 * la cible était **injoignable** et devient joignable : c'est le cas qui compte
 * le plus, celui d'une arène coupée en deux par un mur de liège.
 *
 * C'est ce qui permet à un poseur de mines de percer au lieu de faire le tour :
 * il ne mine pas n'importe quel bloc à sa portée, seulement celui qui raccourcit
 * réellement son chemin.
 */
export function breachGain(
  grid: Grid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tileX: number,
  tileY: number,
): number {
  if (tileAt(grid, tileX, tileY) !== TileKind.Destructible) return 0;

  const before = distanceAt(buildFlowField(grid, toX, toY), Math.floor(fromX), Math.floor(fromY));

  // La grille est copiée le temps du calcul : rien ne doit être modifié dans
  // l'état du monde par une simple réflexion de l'IA.
  const opened: Grid = { ...grid, tiles: [...grid.tiles] };
  opened.tiles[tileY * grid.width + tileX] = TileKind.Empty;
  const after = distanceAt(buildFlowField(opened, toX, toY), Math.floor(fromX), Math.floor(fromY));

  if (after === null) return 0;
  if (before === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, before - after);
}

/**
 * La cible est-elle en vue directe, sans obstacle sur le segment ?
 *
 * Quand c'est le cas — et c'est le cas la plupart du temps en terrain ouvert —
 * on garde la ligne droite : elle est plus fluide qu'un chemin en escalier
 * entre centres de cases, et c'est le mouvement qu'avaient les tanks avant que
 * la navigation existe. Le champ de distance n'intervient que lorsqu'il y a
 * réellement quelque chose à contourner.
 */
export function hasClearPath(
  grid: Grid,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length === 0) return true;

  const half = TUNING.tank.sizeTiles / 2;
  const steps = Math.ceil(length / LINE_STEP_TILES);

  for (let step = 1; step <= steps; step++) {
    const t = (step / steps) * length;
    if (boxOverlapsSolid(grid, fromX + (dx / length) * t, fromY + (dy / length) * t, half, blocksTank)) {
      return false;
    }
  }

  return true;
}

/**
 * Direction à suivre pour rejoindre `(toX, toY)` en contournant les obstacles.
 *
 * Rend `null` s'il n'existe aucun chemin — à l'appelant de décider quoi faire
 * alors, en général reprendre sa patrouille plutôt que de pousser dans un mur.
 *
 * `detoured` dit si la direction rendue vient d'un contournement ou de la
 * simple ligne droite. Ça compte pour les styles qui déforment leur approche :
 * obliquer a du sens à découvert, jamais dans le couloir qu'on est en train de
 * suivre.
 *
 * Les mines vivantes sont d'abord traitées comme des obstacles. Si elles
 * coupent le seul passage, on recommence sans elles : traverser un souffle est
 * mauvais, rester planté est pire, et le tank a de toute façon `findMineEscape`
 * pour se rattraper.
 */
export function navigationHeading(
  world: World,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number; detoured: boolean } | null {
  if (hasClearPath(world.grid, fromX, fromY, toX, toY)) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const length = Math.hypot(dx, dy);
    return length === 0 ? null : { x: dx / length, y: dy / length, detoured: false };
  }

  const tileX = Math.floor(fromX);
  const tileY = Math.floor(fromY);

  for (const mines of [world.mines, [] as readonly Mine[]]) {
    const field = buildFlowField(world.grid, toX, toY, mines);
    const here = distanceAt(field, tileX, tileY);
    if (here === null) continue;

    let bestX = 0;
    let bestY = 0;
    let best = here;

    for (const [dx, dy] of NEIGHBOURS_8) {
      // Une diagonale ne se prend que si les deux cases orthogonales qui la
      // bordent sont libres : sinon le tank essaie de passer par le coin de
      // deux blocs, et le système de mouvement l'y bloque.
      if (dx !== 0 && dy !== 0) {
        if (!tileIsFree(world.grid, tileX + dx, tileY) || !tileIsFree(world.grid, tileX, tileY + dy)) {
          continue;
        }
      }

      const value = distanceAt(field, tileX + dx, tileY + dy);
      if (value === null || value >= best) continue;

      best = value;
      bestX = dx;
      bestY = dy;
    }

    if (bestX === 0 && bestY === 0) continue;

    // On vise le **centre** de la case retenue, et non la direction brute : un
    // tank engagé de travers dans un couloir se recentre en avançant au lieu de
    // racler la paroi.
    const aimX = tileX + bestX + 0.5 - fromX;
    const aimY = tileY + bestY + 0.5 - fromY;
    const length = Math.hypot(aimX, aimY);
    if (length === 0) continue;

    return { x: aimX / length, y: aimY / length, detoured: true };
  }

  return null;
}
