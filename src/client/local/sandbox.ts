/**
 * Terrain d'essai.
 *
 * Provisoire : les 20 vraies missions arrivent en #12, portées depuis les
 * tracés de `legacy/src/level.ts`. Celui-ci existe pour éprouver le pilotage —
 * il réunit volontairement les situations qui mettent le mouvement en défaut :
 * couloirs d'une tuile, angles rentrants, diagonales à longer, culs-de-sac, et
 * un trou qu'on doit pouvoir contourner.
 */

import type { World } from '@core/state';
import { allocateEntityId, createWorld } from '@core/world';
import { parseMission } from '@shared/missions/parse';

const SANDBOX = `
#########################
#.......................#
#.###.#####.#####.#####.#
#.#...#...........#...#.#
#.#.###.#######.###.#.#.#
#...#...#XXXXX#...#...#.#
#.###.#.#HHHHH#.#.#.###.#
#.....#.#HHHHH#.#.#.....#
#.###.#.#XXXXX#.#.#.###.#
#.#...#.........#...#..1#
#.#.#########.#########.#
#...#.................#.#
#.#########.#########.#.#
#.......................#
#########################
`;

/** Construit le monde d'essai et rend l'identifiant du tank du joueur. */
export function createSandbox(): { world: World; playerTankId: number } {
  const mission = parseMission(SANDBOX);
  const spawn = mission.playerSpawns[0]!;

  const world = createWorld({
    width: mission.grid.width,
    height: mission.grid.height,
    seed: 1,
  });
  world.grid = mission.grid;

  const playerTankId = allocateEntityId(world);
  world.tanks.push({
    id: playerTankId,
    color: 'player',
    playerId: 'local',
    x: spawn.x,
    y: spawn.y,
    bodyAngle: 0,
    turretAngle: 0,
    alive: true,
    activeShells: 0,
    activeMines: 0,
    reloadTicks: 0,
  });

  return { world, playerTankId };
}
