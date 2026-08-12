/**
 * Lecture des missions écrites en grille ASCII.
 *
 * Le format remplace les listes de coordonnées de blocs de l'ancienne version :
 *
 * ```ts
 * indestructibleWalls: [{ x: 6, y: 3 }, { x: 6, y: 4 }, { x: 12, y: 3 }, ...]
 * ```
 *
 * Impossible de se représenter une arène en lisant ça, impossible de relire un
 * diff, et les erreurs y passent inaperçues — la mission 2 déclarait un spawn
 * joueur en `y: 23` pour une arène de 17 blocs de haut, et personne ne l'avait vu.
 *
 * Une grille ASCII se lit d'un coup d'oeil et se relit dans un diff.
 *
 * Les 20 missions et la validation complète arrivent en #12 ; ce module fournit
 * déjà la lecture, qui est identique.
 */

import { TileKind } from '@core/state';
import type { Grid, TankColor } from '@core/state';

/** Caractère → nature de tuile. */
const TILE_SYMBOLS: Readonly<Record<string, TileKind>> = {
  '.': TileKind.Empty,
  ' ': TileKind.Empty,
  '#': TileKind.Indestructible,
  X: TileKind.Destructible,
  H: TileKind.Hole,
};

/** Caractère → couleur de tank ennemi. */
const ENEMY_SYMBOLS: Readonly<Record<string, TankColor>> = {
  b: 'brown',
  a: 'ash',
  t: 'teal',
  y: 'yellow',
  r: 'pink',
  g: 'green',
  p: 'purple',
  w: 'white',
  k: 'black',
};

/** Position au centre d'une tuile, en coordonnées monde. */
export interface SpawnPoint {
  x: number;
  y: number;
}

export interface EnemySpawn extends SpawnPoint {
  color: TankColor;
}

export interface ParsedMission {
  grid: Grid;
  /** Points de départ des joueurs, dans l'ordre des chiffres 1 à 4. */
  playerSpawns: SpawnPoint[];
  enemySpawns: EnemySpawn[];
}

/** Erreur de lecture, avec la position fautive pour rendre le diagnostic direct. */
export class MissionParseError extends Error {
  constructor(message: string) {
    super(`Mission invalide : ${message}`);
    this.name = 'MissionParseError';
  }
}

/**
 * Convertit une grille ASCII en terrain et points de départ.
 *
 * Les lignes vides en tête et en fin sont ignorées, pour que les gabarits
 * puissent être écrits sur plusieurs lignes sans artifice.
 */
export function parseMission(source: string): ParsedMission {
  const rows = source.split('\n');

  while (rows.length > 0 && rows[0]!.trim() === '') rows.shift();
  while (rows.length > 0 && rows[rows.length - 1]!.trim() === '') rows.pop();

  if (rows.length === 0) throw new MissionParseError('la grille est vide');

  const height = rows.length;
  const width = rows[0]!.length;

  // Une grille irrégulière décalerait silencieusement tout le terrain.
  const ragged = rows.findIndex((row) => row.length !== width);
  if (ragged !== -1) {
    throw new MissionParseError(
      `la ligne ${ragged + 1} fait ${rows[ragged]!.length} caractères au lieu de ${width}`,
    );
  }

  const tiles: TileKind[] = new Array<TileKind>(width * height).fill(TileKind.Empty);
  const playerSpawnsByIndex = new Map<number, SpawnPoint>();
  const enemySpawns: EnemySpawn[] = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y]!;

    for (let x = 0; x < width; x++) {
      const symbol = row[x]!;
      // Le centre de la tuile : un tank posé sur son bord toucherait le voisin.
      const spawn: SpawnPoint = { x: x + 0.5, y: y + 0.5 };

      const tile = TILE_SYMBOLS[symbol];
      if (tile !== undefined) {
        tiles[y * width + x] = tile;
        continue;
      }

      const enemyColor = ENEMY_SYMBOLS[symbol];
      if (enemyColor) {
        enemySpawns.push({ color: enemyColor, ...spawn });
        continue;
      }

      if (symbol >= '1' && symbol <= '4') {
        const index = Number(symbol);
        if (playerSpawnsByIndex.has(index)) {
          throw new MissionParseError(`le point de départ joueur ${index} est défini deux fois`);
        }
        playerSpawnsByIndex.set(index, spawn);
        continue;
      }

      throw new MissionParseError(
        `caractère « ${symbol} » inconnu en ligne ${y + 1}, colonne ${x + 1}`,
      );
    }
  }

  if (playerSpawnsByIndex.size === 0) {
    throw new MissionParseError('aucun point de départ joueur');
  }

  const playerSpawns = [...playerSpawnsByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, spawn]) => spawn);

  return { grid: { width, height, tiles }, playerSpawns, enemySpawns };
}
