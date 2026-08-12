/**
 * Construction d'un `World` à partir d'une mission.
 *
 * Ce module est le seul endroit qui sait transformer une grille ASCII en partie
 * jouable. Le client solo l'appelle pour démarrer une mission, le serveur (#13)
 * l'appellera pour ouvrir une salle — même code, donc même terrain et mêmes
 * positions de départ des deux côtés.
 */

import type { EntityId, World } from '@core/state';
import { createTank, createWorld } from '@core/world';
import type { Mission } from './missions';
import { MissionParseError, parseMission } from './parse';

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
}

export interface LoadedMission {
  world: World;
  /** Tanks des joueurs, dans l'ordre de `playerIds`. */
  playerTankIds: EntityId[];
}

/** Instancie le terrain, les joueurs et les ennemis d'une mission. */
export function loadMission(mission: Mission, options: LoadMissionOptions): LoadedMission {
  const { playerIds, seed = mission.id } = options;
  const parsed = parseMission(mission.grid);

  if (playerIds.length > parsed.playerSpawns.length) {
    throw new MissionParseError(
      `mission ${mission.id} : ${playerIds.length} joueurs pour ${parsed.playerSpawns.length} points de départ`,
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
    const spawn = parsed.playerSpawns[index]!;
    return createTank(world, { color: 'player', playerId, x: spawn.x, y: spawn.y }).id;
  });

  // Les ennemis après les joueurs : l'ordre de création fixe les identifiants,
  // et donc l'ordre de résolution des cas simultanés. Le figer ici garantit que
  // deux exécutions de la même mission se déroulent à l'identique.
  for (const enemy of parsed.enemySpawns) {
    createTank(world, { color: enemy.color, x: enemy.x, y: enemy.y });
  }

  return { world, playerTankIds };
}
