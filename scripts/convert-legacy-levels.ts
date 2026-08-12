/**
 * Conversion des missions de l'ancienne version vers le format en grille ASCII.
 *
 * Script **à usage unique**, conservé comme pièce de provenance : il montre que
 * les tracés portés dans `src/shared/missions/missions.ts` viennent bien des
 * données de `legacy/src/level.ts` et n'ont pas été retranscrits à la main.
 *
 *     bun run scripts/convert-legacy-levels.ts
 *
 * Il écrit son relevé sur la sortie standard : un inventaire de ce que chaque
 * mission contient réellement, puis la grille ASCII de celles qui ont un tracé.
 *
 * ⚠ Ce que la conversion a révélé — voir l'inventaire en tête de
 * `src/shared/missions/missions.ts` : **deux missions sur vingt seulement**
 * portent une géométrie. Les dix-huit autres déclarent `walls: []` et, pour
 * quinze d'entre elles, des ennemis sans coordonnées.
 */

import { getCurrentLevel, getTotalLevels, goToLevel } from '../legacy/src/level.js';
import type { BlockPosition, Enemy, Level } from '../legacy/src/level.js';

const BLOCK_SIZE = 32;

/** Couleur ancienne → couleur actuelle. Seul `grey` a été renommé. */
const COLOR_SYMBOLS: Readonly<Record<Enemy['type'], string>> = {
  brown: 'b',
  grey: 'a',
  teal: 't',
  yellow: 'y',
  pink: 'r',
  green: 'g',
  purple: 'p',
  white: 'w',
};

interface Placement {
  x: number;
  y: number;
  symbol: string;
  label: string;
}

/** Dimensions du niveau, en blocs. L'ancien code les stockait en pixels. */
function dimensionsInBlocks(level: Level): { width: number; height: number } {
  return {
    width: Math.round((level.dimensions?.width ?? 800) / BLOCK_SIZE),
    height: Math.round((level.dimensions?.height ?? 600) / BLOCK_SIZE),
  };
}

/** Position d'un ennemi en blocs, quelle que soit la façon dont elle était écrite. */
function enemyPlacement(enemy: Enemy, index: number): Placement | null {
  const symbol = COLOR_SYMBOLS[enemy.type];
  const label = `ennemi ${index + 1} (${enemy.type})`;

  if (enemy.blockX !== undefined && enemy.blockY !== undefined) {
    return { x: enemy.blockX, y: enemy.blockY, symbol, label };
  }

  // Certaines missions donnaient des pixels, d'autres `null` — ce dernier cas
  // signifiait, d'après le commentaire d'origine, « pas créé ».
  if (enemy.x !== null && enemy.y !== null) {
    return {
      x: Math.floor(enemy.x / BLOCK_SIZE),
      y: Math.floor(enemy.y / BLOCK_SIZE),
      symbol,
      label,
    };
  }

  return null;
}

/** Rend la grille ASCII et la liste des anomalies rencontrées. */
function convert(level: Level): { grid: string; problems: string[] } {
  const { width, height } = dimensionsInBlocks(level);
  const problems: string[] = [];

  const rows: string[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.',
    ),
  );

  /** Écrit un symbole, en signalant tout ce qui sort du cadre ou se superpose. */
  const place = ({ x, y, symbol, label }: Placement): void => {
    if (x < 0 || x >= width || y < 0 || y >= height) {
      problems.push(`${label} hors limites en (${x}, ${y}) — arène ${width}×${height}`);
      return;
    }

    const previous = rows[y]![x]!;
    if (previous !== '.' && previous !== '#') {
      problems.push(`${label} se superpose à « ${previous} » en (${x}, ${y})`);
    }
    if (previous === '#' && symbol !== '#' && symbol !== 'X') {
      problems.push(`${label} posé sur la bordure en (${x}, ${y})`);
    }

    rows[y]![x] = symbol;
  };

  const walls = (list: BlockPosition[] | undefined, symbol: string, kind: string): void => {
    for (const block of list ?? []) {
      place({ x: block.x, y: block.y, symbol, label: `bloc ${kind}` });
    }
  };

  walls(level.indestructibleWalls, '#', 'incassable');
  walls(level.destructibleWalls, 'X', 'cassable');

  if (level.playerSpawn) {
    place({ ...level.playerSpawn, symbol: '1', label: 'départ joueur' });
  } else {
    problems.push('aucun point de départ joueur');
  }

  level.enemies.forEach((enemy, index) => {
    const placement = enemyPlacement(enemy, index);
    if (placement) place(placement);
    else problems.push(`ennemi ${index + 1} (${enemy.type}) sans coordonnées — jamais créé`);
  });

  return { grid: rows.map((row) => row.join('')).join('\n'), problems };
}

for (let number = 1; number <= getTotalLevels(); number++) {
  goToLevel(number);
  const level = getCurrentLevel();
  const { width, height } = dimensionsInBlocks(level);
  const blocks = (level.indestructibleWalls?.length ?? 0) + (level.destructibleWalls?.length ?? 0);
  const { grid, problems } = convert(level);

  const roster = level.enemies.map((enemy) => enemy.type).join(', ');
  console.log(`\n═══ Mission ${number} — ${width}×${height} blocs, ${blocks} posés`);
  console.log(`    effectif : ${roster || '(aucun)'}`);

  for (const problem of problems) console.log(`    ⚠ ${problem}`);

  // Une arène sans un seul bloc n'a pas de tracé à porter : l'afficher
  // n'apprendrait rien de plus que ses dimensions.
  if (blocks > 0) console.log(`\n${grid}`);
}
