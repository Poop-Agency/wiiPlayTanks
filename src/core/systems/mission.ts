/**
 * Issue d'une mission.
 *
 * Volontairement une **fonction pure du monde**, et non un champ de `World`
 * mis à jour par `tick()`. Deux raisons :
 *
 *   - il n'y a rien à stocker : « tous les ennemis sont morts » et « plus aucun
 *     joueur en vie » se lisent directement dans l'état, et un champ dérivé
 *     serait une occasion de désynchronisation ;
 *   - le serveur (#13) doit pouvoir juger l'issue d'un état reçu ou rejoué sans
 *     avoir à le faire avancer d'un pas.
 */

import type { World } from '../state.js';

export type MissionOutcome =
  /** La mission continue. */
  | 'playing'
  /** Tous les ennemis sont détruits. */
  | 'cleared'
  /** Plus aucun joueur en vie. */
  | 'failed';

/** Un tank encore en jeu et piloté par un joueur. */
function livingPlayers(world: World): number {
  return world.tanks.filter((tank) => tank.alive && tank.playerId !== null).length;
}

/** Un tank encore en jeu et piloté par l'IA. */
function livingEnemies(world: World): number {
  return world.tanks.filter((tank) => tank.alive && tank.playerId === null).length;
}

/** Nombre d'ennemis restant à détruire. Sert au HUD. */
export function enemiesRemaining(world: World): number {
  return livingEnemies(world);
}

/**
 * Juge l'état courant.
 *
 * L'échec l'emporte sur la réussite en cas d'égalité : si le dernier obus du
 * joueur détruit le dernier ennemi au moment même où un obus adverse l'atteint,
 * la mission est perdue. C'est la règle de l'original — un tank détruit est un
 * tank détruit, quoi qu'il arrive au même instant.
 */
export function missionOutcome(world: World): MissionOutcome {
  if (livingPlayers(world) === 0) return 'failed';
  if (livingEnemies(world) === 0) return 'cleared';
  return 'playing';
}
