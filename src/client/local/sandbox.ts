/**
 * Terrain d'essai.
 *
 * Provisoire : les 20 vraies missions arrivent en #12, portées depuis les
 * tracés de `legacy/src/level.ts`. Celui-ci existe pour éprouver les
 * mécaniques, et réunit volontairement les situations qui les mettent en
 * défaut :
 *
 *   - couloirs d'une tuile de large, angles rentrants et culs-de-sac, pour le
 *     glissement et l'étanchéité des murs ;
 *   - un puits de trous, que les tanks contournent mais que les obus survolent ;
 *   - quatre **barrières cassables** placées en travers de couloirs, dont une à
 *     cinq tuiles du point de départ : le seul moyen de passer est d'y poser
 *     une mine.
 */

import type { World } from '@core/state';
import { createTank, createWorld } from '@core/world';
import { parseMission } from '@shared/missions/parse';

const SANDBOX = `
#########################
#.......................#
#.###.#####.#####.#####.#
#.#.......X.......X...#.#
#.#.#####.#.#####.#.#.#.#
#...#...#.#.#HHH#.#.#...#
#.###.#.#.#.#HHH#.#.#.#.#
#.....#.#.#.#HHH#.#...#.#
#.#####.#.#.#####.#####.#
#.......#.X.......X....1#
#.#####.#.#######.#####.#
#.....#.#.........#.....#
#.###.#.###########.###.#
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

  const player = createTank(world, {
    color: 'player',
    playerId: 'local',
    x: spawn.x,
    y: spawn.y,
  });

  return { world, playerTankId: player.id };
}
