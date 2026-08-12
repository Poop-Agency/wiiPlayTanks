/**
 * Terrain d'essai.
 *
 * La campagne des vingt missions vit désormais dans `shared/missions/`. Cette
 * arène-ci lui survit avec un autre rôle : c'est le banc d'essai des tests
 * bout-en-bout, dont la géométrie est **stable par contrat**. Une mission de
 * campagne peut être retracée pour des raisons de jouabilité ; ce terrain, non,
 * sans quoi chaque retouche de level design casserait des tests de physique
 * sans aucun rapport.
 *
 * On y accède par `?bac=1`, et `?bac=1&calme=1` en retire les ennemis.
 *
 * Il réunit volontairement les situations qui mettent les mécaniques en
 * défaut :
 *
 *   - un terrain **ouvert avec des couverts épars**, et non un labyrinthe de
 *     couloirs d'une tuile : c'est la forme des arènes de l'original, et la
 *     seule qui laisse des lignes de tir et des angles de ricochet ;
 *   - des passages étroits en périphérie, pour le glissement le long des murs ;
 *   - un puits de trous, que les tanks contournent mais que les obus survolent ;
 *   - un réduit en blocs cassables au centre, qui ne s'ouvre qu'à la mine ;
 *   - quatre couleurs d'ennemis aux comportements franchement distincts.
 */

import type { InputCommand, Tank, World } from '@core/state';
import { createTank, createWorld } from '@core/world';
import { parseMission } from '@shared/missions/parse';
import type { RenderSnapshot } from '../render/snapshots';
import type { Session } from '../session';
import type { CampaignView } from '../session';
import { LocalGame } from './LocalGame';

const SANDBOX = `
#########################
#.......................#
#..####....b....####....#
#..#..#.........#..#.t..#
#.g#..#..XXXX...#..#....#
#.....#..X..X...#..#....#
#........X..X......#....#
#..###...XXXX...###.....#
#....#..........#..#....#
#....#....HH....#..#XX.1#
#.a..#....HH....#..#....#
#....####......####.....#
#.......................#
#...p...................#
#########################
`;

export interface SandboxOptions {
  /**
   * Peupler l'arène d'ennemis.
   *
   * Les tests bout-en-bout qui mesurent le déplacement ou les mines les
   * désactivent : sans ça, ils mesurent un tank qui se fait canarder pendant
   * l'expérience, et deviennent instables pour une raison sans rapport avec ce
   * qu'ils vérifient.
   */
  withEnemies?: boolean;
}

/** Construit le monde d'essai et rend l'identifiant du tank du joueur. */
export function createSandbox(options: SandboxOptions = {}): {
  world: World;
  playerTankId: number;
} {
  const withEnemies = options.withEnemies ?? true;
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

  // Cinq couleurs aux comportements franchement distincts : un brun immobile et
  // maladroit, un vert immobile mais redoutable à deux rebonds, un sarcelle aux
  // missiles rapides, un violet qui traque, et un cendre qui garde ses distances.
  if (withEnemies) {
    for (const enemy of mission.enemySpawns) {
      createTank(world, { color: enemy.color, x: enemy.x, y: enemy.y });
    }
  }

  return { world, playerTankId: player.id };
}

/**
 * Enveloppe le terrain d'essai dans une {@link Session}.
 *
 * Il n'y a ni mission, ni réserve, ni progression : `status()` rend donc `null`
 * et le HUD s'efface de lui-même. Redémarrer non plus n'a pas de sens — on
 * recharge la page.
 */
export function createSandboxSession(options: SandboxOptions = {}): Session {
  const { world, playerTankId } = createSandbox(options);
  const game = new LocalGame(world, playerTankId);

  return {
    get world(): World {
      return game.world;
    },
    get playerTank(): Tank | undefined {
      return game.playerTank;
    },
    update: (input: InputCommand): void => game.update(input),
    view: (alpha: number): RenderSnapshot => game.view(alpha),
    status: (): CampaignView | null => null,
    restart: (): void => {},
  };
}
