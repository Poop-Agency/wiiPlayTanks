/**
 * Construction d'un `World` à partir d'une mission.
 *
 * Ce module est le seul endroit qui sait transformer une grille ASCII en partie
 * jouable. Le client solo l'appelle pour démarrer une mission, le serveur (#13)
 * l'appellera pour ouvrir une salle — même code, donc même terrain et mêmes
 * positions de départ des deux côtés.
 */

import { blocksTank, tileAt } from '@core/grid';
import { PLAYER_SEAT_COLORS } from '@core/state';
import type { EntityId, Grid, World } from '@core/state';
import { createTank, createWorld } from '@core/world';
import type { Mission } from './missions';
import { MissionParseError, parseMission } from './parse';
import type { SpawnPoint } from './parse';

export interface LoadMissionOptions {
  /**
   * Identifiants des joueurs à installer, dans l'ordre des départs `1` à `4`.
   * Un seul en solo.
   */
  playerIds: readonly string[];
  /**
   * Graine du générateur pseudo-aléatoire.
   *
   * Par défaut le numéro de mission : rejouer une mission perdue rejoue
   * exactement la même partie, ce qui rend les échecs analysables et les
   * comportements reproductibles d'une tentative à l'autre.
   */
  seed?: number;
  /**
   * Rangs, dans la liste d'ennemis de la mission, de ceux qu'il ne faut pas
   * réinstaller.
   *
   * Sert à la variante « les ennemis abattus ne reviennent pas » : on recharge
   * la même arène en sautant ceux déjà détruits, ce qui fait de chaque tentative
   * un progrès. Le rang plutôt que l'identifiant, parce que les identifiants
   * d'entités sont réattribués à chaque chargement.
   */
  skipEnemies?: ReadonlySet<number>;
}

export interface LoadedMission {
  world: World;
  /** Tanks des joueurs, dans l'ordre de `playerIds`. */
  playerTankIds: EntityId[];
  /**
   * Rang dans la liste d'ennemis de la mission, pour chaque tank ennemi
   * installé. C'est ce qui permet de retenir *lesquels* ont été abattus, et non
   * seulement combien.
   */
  enemyRankByTankId: ReadonlyMap<EntityId, number>;
}

/**
 * Complète les points de départ manquants par des tuiles voisines du premier.
 *
 * ─── Pourquoi dériver plutôt que déclarer ───────────────────────────────────
 *
 * L'original est un jeu solo : ses arènes n'ont qu'un point de départ, et les
 * vingt grilles le reflètent. Le co-op est un ajout de cette refonte, pas une
 * caractéristique du jeu de référence — dessiner à la main trois départs de
 * plus sur vingt arènes reviendrait à inventer vingt fois une donnée que
 * personne n'a mesurée, avec vingt occasions de placer un coéquipier dans un
 * mur ou sous le nez d'un tank vert.
 *
 * Les coéquipiers apparaissent donc **autour** du départ d'origine : c'est le
 * comportement attendu d'un co-op, et ça hérite gratuitement des vérifications
 * déjà faites sur ce point de départ — accessibilité et distance aux ennemis.
 *
 * Le parcours en largeur est déterministe, ordre des voisins compris : deux
 * chargements de la même mission placent les mêmes joueurs aux mêmes tuiles,
 * serveur et client compris. `parseMission` accepte toujours `2`, `3` et `4`
 * si une arène veut fixer ses départs explicitement.
 */
function deriveSpawns(grid: Grid, known: readonly SpawnPoint[], needed: number): SpawnPoint[] {
  const spawns = [...known];
  if (spawns.length >= needed) return spawns;

  const origin = spawns[0]!;
  const start = { x: Math.floor(origin.x), y: Math.floor(origin.y) };

  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];

  while (queue.length > 0 && spawns.length < needed) {
    const current = queue.shift()!;

    // Ordre fixe, et sans diagonale : la boîte du tank ne passe pas entre deux
    // blocs qui se touchent par le coin.
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;

      if (seen.has(key)) continue;
      seen.add(key);

      if (blocksTank(tileAt(grid, x, y))) continue;
      queue.push({ x, y });

      if (spawns.length >= needed) continue;

      const candidate: SpawnPoint = { x: x + 0.5, y: y + 0.5 };
      if (isCrowded(candidate, spawns)) continue;

      spawns.push(candidate);
    }
  }

  return spawns;
}

/**
 * Écart minimal entre deux places de départ, en tuiles.
 *
 * Sans cette contrainte, le parcours en largeur prend les tuiles voisines
 * immédiates et les coéquipiers apparaissent collés les uns aux autres : les
 * boîtes de collision se touchent, et le premier qui veut partir dans la
 * mauvaise direction reste bloqué contre son voisin.
 */
const MIN_SPAWN_SEPARATION_TILES = 2;

function isCrowded(candidate: SpawnPoint, taken: readonly SpawnPoint[]): boolean {
  return taken.some(
    (spawn) =>
      Math.hypot(spawn.x - candidate.x, spawn.y - candidate.y) < MIN_SPAWN_SEPARATION_TILES,
  );
}

/** Instancie le terrain, les joueurs et les ennemis d'une mission. */
export function loadMission(mission: Mission, options: LoadMissionOptions): LoadedMission {
  const { playerIds, seed = mission.id, skipEnemies } = options;
  const parsed = parseMission(mission.grid);

  const playerSpawns = deriveSpawns(parsed.grid, parsed.playerSpawns, playerIds.length);

  if (playerIds.length > playerSpawns.length) {
    throw new MissionParseError(
      `mission ${mission.id} : ${playerIds.length} joueurs, et pas assez de place autour du départ`,
    );
  }

  const world = createWorld({
    width: parsed.grid.width,
    height: parsed.grid.height,
    seed,
  });
  // La grille lue remplace celle, vide, qu'a créée `createWorld`.
  world.grid = parsed.grid;

  const playerTankIds = playerIds.map((playerId, index) => {
    const spawn = playerSpawns[index]!;
    // Une couleur par siège, dans l'ordre d'arrivée : c'est ce qui distingue
    // les coéquipiers à l'écran en co-op. `PLAYER_SEAT_COLORS` ne couvre que
    // 4 sièges, la limite du salon ([shared/protocol.ts](../protocol.ts)).
    const color = PLAYER_SEAT_COLORS[index] ?? 'player';
    return createTank(world, { color, playerId, x: spawn.x, y: spawn.y }).id;
  });

  // Les ennemis après les joueurs : l'ordre de création fixe les identifiants,
  // et donc l'ordre de résolution des cas simultanés. Le figer ici garantit que
  // deux exécutions de la même mission se déroulent à l'identique.
  //
  // Sauter un ennemi ne décale pas les rangs de ceux qui restent : c'est
  // l'index dans `enemySpawns` qui fait foi, pas l'ordre de création. Sans quoi
  // la mémoire d'une tentative désignerait quelqu'un d'autre à la suivante.
  const enemyRankByTankId = new Map<EntityId, number>();

  parsed.enemySpawns.forEach((enemy, rank) => {
    if (skipEnemies?.has(rank)) return;
    const tank = createTank(world, { color: enemy.color, x: enemy.x, y: enemy.y });
    enemyRankByTankId.set(tank.id, rank);
  });

  return { world, playerTankIds, enemyRankByTankId };
}
