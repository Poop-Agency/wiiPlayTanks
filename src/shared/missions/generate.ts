/**
 * Missions remixées : la campagne du vrai jeu au-delà des 20 tracés fixes.
 *
 * ─── Ce que fait le vrai jeu, et pourquoi ce n'est pas 80 tracés de plus ────
 *
 * Le vrai *Wii Play: Tanks!* va jusqu'à la mission 100, mais l'immense
 * majorité de ces missions ne sont pas des arènes uniques : elles réutilisent
 * les tracés des vingt premières, avec une composition d'ennemis tirée au
 * sort à chaque partie. Seuls des paliers réguliers (30, 40, 50…) sont des
 * scènes fixes, plus difficiles — voir `docs/provenance.md` pour la source et
 * ses réserves de confiance.
 *
 * Reproduire ça à l'identique demanderait de rejouer et transcrire cent
 * missions ; personne ne l'a fait. Ce module reproduit le **mécanisme**
 * plutôt que le contenu exact : un tracé réutilisé, une composition tirée au
 * sort — mais **scellée sur le numéro de mission**, jamais sur l'horloge ou
 * une vraie source d'aléa, pour qu'une mission donnée produise toujours
 * exactement le même monde. C'est ce dont dépendent le rejeu après échec et
 * l'accord entre le serveur et le client en co-op.
 *
 * ─── Comment on remixe sans jamais inventer de géométrie non testée ────────
 *
 * Une position d'ennemi n'existe que par la lettre posée dans le texte de la
 * grille — `parseMission` n'a pas de champ de position séparé. Remixer une
 * composition sans réinventer de coordonnées revient donc à :
 *
 *   1. choisir un tracé de base parmi les missions 1-20 (déjà validées par
 *      `tests/missions.test.ts` : étanches, accessibles, dégagées) ;
 *   2. en retirer les lettres d'ennemis (le sol qu'elles couvraient était déjà
 *      vide dans `parseMission` — les murs, eux, ne bougent pas) ;
 *   3. repeupler les anciens emplacements d'ennemis en priorité, et
 *      seulement si le compte cible les dépasse, élargir à toute case vide,
 *      accessible et à distance de sécurité — les deux mêmes contrôles que
 *      les tests exercent déjà, donc la garantie tient par construction.
 *
 * Ce module est volontairement une feuille de l'arbre de dépendances : il
 * n'importe rien de `missions.ts` (à l'exception du type `Mission`, effacé à
 * la compilation) ni de `composition.ts`, pour ne jamais créer de dépendance
 * circulaire avec le fichier qui l'appelle au chargement.
 */

import type { Grid, TankColor } from '@core/state';
import { blocksTank, tileAt } from '@core/grid';
import { createRng, nextFloat, nextInt } from '@core/rng';
import type { RngState } from '@core/rng';
import { ENEMY_SYMBOLS, parseMission } from './parse';
import type { SpawnPoint } from './parse';
import type { Mission } from './missions';

/** Lettres reconnues comme un ennemi, dérivées de la table canonique. */
const ENEMY_LETTERS = new Set(Object.keys(ENEMY_SYMBOLS));

/** Couleur → lettre, l'inverse de `ENEMY_SYMBOLS`. */
const LETTER_OF_COLOR = new Map<TankColor, string>(
  Object.entries(ENEMY_SYMBOLS).map(([letter, color]) => [color, letter]),
);

/**
 * Progression des couleurs, du plus inoffensif au plus redoutable, avec le
 * numéro de mission à partir duquel chacune peut apparaître dans un remix.
 *
 * Prolonge exactement l'ordre déjà vérifié par `tests/missions.test.ts` pour
 * les missions 1-20 (brun@1 … blanc@20), avec `noir@50` ajouté d'après la
 * recherche sur le vrai jeu. Sert aussi de mesure de dangerosité pour le
 * tirage pondéré des couleurs (§ plus bas) — une seule table pour les deux
 * usages, plutôt qu'une carte de déblocage et un ordre de menace séparés qui
 * pourraient diverger.
 *
 * ⚠ Le numéro d'apparition du noir (50) est une estimation issue d'une
 * source unique, non recoupée — voir `docs/provenance.md`. Valeur à ajuster
 * si elle s'avère fausse à l'usage, pas un fait gravé.
 *
 * Exportée pour que les tests vérifient le déblocage des couleurs sur cette
 * même table plutôt que sur une copie qui pourrait diverger.
 */
export const COLOR_PROGRESSION: ReadonlyArray<readonly [color: TankColor, unlocksAtMission: number]> = [
  ['brown', 1],
  ['ash', 2],
  ['teal', 5],
  ['yellow', 8],
  ['pink', 10],
  ['green', 12],
  ['purple', 15],
  ['white', 20],
  ['black', 50],
];

/** Couleurs disponibles pour un remix donné, dans l'ordre de dangerosité. */
function unlockedColors(missionId: number): TankColor[] {
  return COLOR_PROGRESSION.filter(([, stage]) => stage <= missionId).map(([color]) => color);
}

/** Rang de dangerosité d'une couleur — sert de poids de tirage, pas de filtre. */
function dangerRank(color: TankColor): number {
  return COLOR_PROGRESSION.findIndex(([candidate]) => candidate === color);
}

/**
 * Effectif ennemi cible d'un remix (missions 21-99, hors paliers).
 *
 * ⚠ Best-effort, à régler : dérivé d'une seule source non recoupée
 * (~4 ennemis vers la mission 60, ~6 vers 80, ~8 à partir de 91). Voir
 * `docs/provenance.md`. La mission 21 démarre à 2 par continuité avec la
 * mission 20 (`white, white`), qui n'est pas un remix mais fixe le ton.
 *
 * Rampe linéaire par morceaux entre ces repères, la plus simple qui les
 * respecte tous — rien n'indique que la vraie courbe soit linéaire, mais
 * inventer une forme plus élaborée sur une seule source non vérifiée serait
 * de la précision de façade.
 */
const COUNT_ANCHORS: ReadonlyArray<readonly [mission: number, count: number]> = [
  [21, 2],
  [60, 4],
  [80, 6],
  [91, 8],
];

function targetEnemyCount(missionId: number): number {
  const first = COUNT_ANCHORS[0]!;
  if (missionId <= first[0]) return first[1];

  for (let index = 1; index < COUNT_ANCHORS.length; index++) {
    const [prevStage, prevCount] = COUNT_ANCHORS[index - 1]!;
    const [stage, count] = COUNT_ANCHORS[index]!;
    if (missionId > stage) continue;

    const ratio = (missionId - prevStage) / (stage - prevStage);
    return Math.round(prevCount + (count - prevCount) * ratio);
  }

  return COUNT_ANCHORS[COUNT_ANCHORS.length - 1]![1];
}

/* ── Manipulation de grille ──────────────────────────────────────────────── */

/** Lignes d'une grille, lignes vides de tête/fin retirées — même règle que `parseMission`. */
function rowsOf(grid: string): string[] {
  const rows = grid.split('\n');
  while (rows.length > 0 && rows[0]!.trim() === '') rows.shift();
  while (rows.length > 0 && rows[rows.length - 1]!.trim() === '') rows.pop();
  return rows;
}

/**
 * Distance de sécurité minimale au départ joueur, en tuiles.
 *
 * Un tiers de la largeur du plateau — la portée de détection standard. Dérivée
 * de la grille plutôt que codée en dur : le plateau a déjà changé de taille une
 * fois (23 × 19 → 18 × 18), et une constante fixe aurait alors couvert la
 * moitié du terrain sans que rien ne le signale.
 */
function safeDistanceFor(grid: Grid): number {
  return grid.width / 3;
}

function isSafeDistance(
  spawn: SpawnPoint,
  col: number,
  row: number,
  minimum: number,
): boolean {
  return Math.hypot(col + 0.5 - spawn.x, row + 0.5 - spawn.y) >= minimum;
}

/**
 * Tuiles accessibles depuis un point, en quatre directions.
 *
 * Réplique volontairement la fonction du même nom dans
 * `tests/missions.test.ts` : les deux vérifient indépendamment la même
 * propriété, ce qui est le rôle d'un test plutôt qu'un défaut à corriger.
 */
function reachableTiles(grid: Grid, origin: SpawnPoint): Set<number> {
  const index = (x: number, y: number): number => y * grid.width + x;
  const start = index(Math.floor(origin.x), Math.floor(origin.y));
  const seen = new Set<number>([start]);
  const queue: number[] = [start];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const x = current % grid.width;
    const y = Math.floor(current / grid.width);

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= grid.width || nextY >= grid.height) continue;
      if (blocksTank(tileAt(grid, nextX, nextY))) continue;

      const next = index(nextX, nextY);
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return seen;
}

interface Slot {
  row: number;
  col: number;
}

/** Cases vides, accessibles et à distance de sécurité — le vivier de secours. */
function safeEmptyTiles(grid: Grid, spawn: SpawnPoint, exclude: ReadonlySet<number>): Slot[] {
  const reachable = reachableTiles(grid, spawn);
  const minimum = safeDistanceFor(grid);
  const found: Slot[] = [];

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const key = row * grid.width + col;
      if (exclude.has(key)) continue;
      if (!reachable.has(key)) continue;
      if (blocksTank(tileAt(grid, col, row))) continue;
      if (!isSafeDistance(spawn, col, row, minimum)) continue;
      found.push({ row, col });
    }
  }

  return found;
}

/* ── Tirage scellé ───────────────────────────────────────────────────────── */

/** Mélange de Fisher-Yates, scellé sur `rng`. */
function seededShuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const swap = nextInt(rng, 0, index);
    [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
  }
  return copy;
}

/**
 * Tire une couleur dans le pool débloqué, pondérée par dangerosité.
 *
 * Les couleurs les plus dangereuses déjà débloquées reviennent plus souvent
 * à mesure que la campagne avance — une mission à 40 n'a pas de raison de
 * retomber aussi souvent sur du brun qu'une mission à 21.
 */
function drawColor(rng: RngState, pool: readonly TankColor[]): TankColor {
  const weights = pool.map((color) => 1 + dangerRank(color));
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  let roll = nextFloat(rng) * total;
  for (let index = 0; index < pool.length; index++) {
    roll -= weights[index]!;
    if (roll <= 0) return pool[index]!;
  }

  return pool[pool.length - 1]!;
}

/* ── Génération ───────────────────────────────────────────────────────────── */

/**
 * Compose une mission remixée, déterministe sur `missionId` seul.
 *
 * Exportée non mémoïsée : c'est `buildCampaign` qui l'appelle une fois par
 * id au chargement du module, et les tests l'appellent directement pour
 * vérifier le déterminisme sans passer par tout `MISSIONS`.
 */
export function generateRemixMission(missionId: number, basePool: readonly Mission[]): Mission {
  const rng = createRng(missionId);

  const base = basePool[nextInt(rng, 0, basePool.length - 1)]!;
  const rows = rowsOf(base.grid).map((row) => [...row]);
  const height = rows.length;
  const width = rows[0]!.length;

  // Les lettres d'ennemis de la base couvraient déjà du sol vide dans
  // `parseMission` (ni mur, ni trou) : les retirer ne change rien à la
  // géométrie, seulement au texte.
  const originalSlots: Slot[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (ENEMY_LETTERS.has(rows[row]![col]!)) {
        originalSlots.push({ row, col });
        rows[row]![col] = '.';
      }
    }
  }

  const strippedText = rows.map((row) => row.join('')).join('\n');
  const stripped = parseMission(strippedText);
  const spawn = stripped.playerSpawns[0]!;

  const count = Math.min(targetEnemyCount(missionId), width * height);
  const pool = unlockedColors(missionId);

  const excluded = new Set(originalSlots.map(({ row, col }) => row * width + col));

  // Les emplacements repris de la base sont refiltrés sur la distance de
  // sécurité : les tracés transcrits du vrai jeu posent parfois un adversaire
  // très près du départ, ce qui est leur droit — mais un remix n'a aucune
  // raison d'hériter de ce choix, qui n'a alors plus rien d'intentionnel.
  const minimum = safeDistanceFor(stripped.grid);
  let candidates = seededShuffle(
    rng,
    originalSlots.filter(({ row, col }) => isSafeDistance(spawn, col, row, minimum)),
  );
  if (candidates.length < count) {
    const extra = seededShuffle(rng, safeEmptyTiles(stripped.grid, spawn, excluded));
    candidates = candidates.concat(extra);
  }

  const chosen = candidates.slice(0, Math.min(count, candidates.length));
  for (const { row, col } of chosen) {
    rows[row]![col] = LETTER_OF_COLOR.get(drawColor(rng, pool))!;
  }

  return {
    id: missionId,
    name: `${base.name} (remix ${missionId})`,
    grid: `\n${rows.map((row) => row.join('')).join('\n')}\n`,
  };
}

/**
 * Construit la campagne complète : les missions fixes telles quelles, le
 * reste généré à la volée.
 *
 * Construit une fois, au chargement du module qui l'appelle — exactement
 * comme `MISSIONS` était déjà un tableau littéral évalué à l'import. Rien en
 * aval (`missionByNumber`, `CAMPAIGN_LENGTH`, la mémoïsation de
 * `composition.ts`) n'a besoin de savoir qu'une mission est générée plutôt
 * qu'écrite à la main.
 */
export function buildCampaign(
  handAuthored: readonly Mission[],
  milestones: readonly Mission[],
  total: number,
): readonly Mission[] {
  const fixed = new Map<number, Mission>();
  for (const mission of handAuthored) fixed.set(mission.id, mission);
  for (const mission of milestones) fixed.set(mission.id, mission);

  const campaign: Mission[] = [];
  for (let id = 1; id <= total; id++) {
    campaign.push(fixed.get(id) ?? generateRemixMission(id, handAuthored));
  }
  return campaign;
}
