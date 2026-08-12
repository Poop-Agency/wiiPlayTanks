/**
 * Composition ennemie d'une mission.
 *
 * Lue depuis la grille ASCII, seule source de vérité : recopier les effectifs
 * dans une table à côté les ferait diverger au premier ajustement d'arène.
 *
 * Le résultat est mémoïsé. L'écran de récap entre deux missions consulte cette
 * composition à chaque image, et `parseMission` reconstruit toute la grille —
 * la refaire soixante fois par seconde pour une donnée immuable serait absurde.
 */

import type { TankColor } from '@core/state';
import { missionByNumber } from './missions';
import { parseMission } from './parse';

/** Un type d'ennemi et son effectif. */
export interface EnemyGroup {
  color: TankColor;
  count: number;
}

/**
 * Ordre d'apparition des tanks dans la campagne, du plus inoffensif au plus
 * redoutable.
 *
 * C'est l'ordre dans lequel l'original les introduit, et il sert de mesure de
 * dangerosité : le tank le plus haut dans cette liste est celui qui donne son
 * caractère à une mission — et donc sa musique.
 */
export const TANK_THREAT_ORDER: readonly TankColor[] = [
  'brown',
  'ash',
  'teal',
  'yellow',
  'pink',
  'green',
  'purple',
  'white',
  'black',
];

/** Rang de menace d'une couleur. `-1` pour un tank de joueur. */
export function threatRank(color: TankColor): number {
  return TANK_THREAT_ORDER.indexOf(color);
}

const cache = new Map<number, readonly EnemyGroup[]>();

/**
 * Ennemis d'une mission, classés du plus dangereux au moins dangereux.
 *
 * L'ordre est celui de la menace et non celui de la grille : c'est ainsi que
 * le récap se lit — on veut savoir d'abord à quoi on va se heurter.
 */
export function enemyComposition(mission: number): readonly EnemyGroup[] {
  const cached = cache.get(mission);
  if (cached) return cached;

  const definition = missionByNumber(mission);
  if (!definition) {
    cache.set(mission, []);
    return [];
  }

  const counts = new Map<TankColor, number>();
  for (const spawn of parseMission(definition.grid).enemySpawns) {
    counts.set(spawn.color, (counts.get(spawn.color) ?? 0) + 1);
  }

  const groups = [...counts.entries()]
    .map(([color, count]): EnemyGroup => ({ color, count }))
    .sort((left, right) => threatRank(right.color) - threatRank(left.color));

  cache.set(mission, groups);
  return groups;
}

/**
 * Couleur qui caractérise une mission : son ennemi le plus redoutable.
 *
 * `undefined` si la mission n'a aucun ennemi — ce qui n'arrive dans aucune des
 * vingt, mais reste possible dans une arène d'essai.
 */
export function dominantEnemy(mission: number): TankColor | undefined {
  return enemyComposition(mission)[0]?.color;
}
