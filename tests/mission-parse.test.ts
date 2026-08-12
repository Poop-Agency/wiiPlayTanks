import { describe, expect, test } from 'bun:test';

import { tileAt } from '../src/core/grid.js';
import { TileKind } from '../src/core/state.js';
import { MissionParseError, parseMission } from '../src/shared/missions/parse.js';

/**
 * Le format ASCII existe pour rendre les erreurs de level design visibles.
 * L'ancien format (listes de `{x, y}`) laissait passer un point de départ en
 * `y: 23` sur une arène de 17 blocs de haut sans que personne ne le remarque.
 */

describe('lecture d\'une grille', () => {
  const SIMPLE = `
#####
#1.X#
#.H.#
#..b#
#####
`;

  test('les dimensions se déduisent de la grille', () => {
    const { grid } = parseMission(SIMPLE);
    expect(grid.width).toBe(5);
    expect(grid.height).toBe(5);
    expect(grid.tiles).toHaveLength(25);
  });

  test('chaque symbole donne la bonne nature de tuile', () => {
    const { grid } = parseMission(SIMPLE);

    expect(tileAt(grid, 0, 0)).toBe(TileKind.Indestructible);
    expect(tileAt(grid, 3, 1)).toBe(TileKind.Destructible);
    expect(tileAt(grid, 2, 2)).toBe(TileKind.Hole);
    expect(tileAt(grid, 2, 1)).toBe(TileKind.Empty);
  });

  test('les points de départ tombent au centre de leur tuile', () => {
    const { playerSpawns } = parseMission(SIMPLE);

    // Sur un bord de tuile, un tank mordrait déjà sur la tuile voisine.
    expect(playerSpawns).toEqual([{ x: 1.5, y: 1.5 }]);
  });

  test('une case de départ est du sol libre, pas un mur', () => {
    const { grid } = parseMission(SIMPLE);
    expect(tileAt(grid, 1, 1)).toBe(TileKind.Empty);
    expect(tileAt(grid, 3, 3)).toBe(TileKind.Empty);
  });

  test('les ennemis sont relevés avec leur couleur', () => {
    const { enemySpawns } = parseMission(SIMPLE);
    expect(enemySpawns).toEqual([{ color: 'brown', x: 3.5, y: 3.5 }]);
  });

  test('les lignes vides autour de la grille sont ignorées', () => {
    const withPadding = parseMission('\n\n###\n#1#\n###\n\n');
    expect(withPadding.grid.height).toBe(3);
  });

  test('les points de départ sont rendus dans l\'ordre des chiffres', () => {
    const { playerSpawns } = parseMission(['#####', '#3.1#', '#.2.#', '#####'].join('\n'));

    expect(playerSpawns).toEqual([
      { x: 3.5, y: 1.5 },
      { x: 2.5, y: 2.5 },
      { x: 1.5, y: 1.5 },
    ]);
  });

  test('les neuf couleurs d\'ennemis sont reconnues', () => {
    const { enemySpawns } = parseMission(['###########', '#batyrgpwk#', '#....1....#', '###########'].join('\n'));

    expect(enemySpawns.map((spawn) => spawn.color)).toEqual([
      'brown',
      'ash',
      'teal',
      'yellow',
      'pink',
      'green',
      'purple',
      'white',
      'black',
    ]);
  });
});

describe('détection des grilles invalides', () => {
  test('une grille irrégulière est rejetée, avec le numéro de ligne', () => {
    // Sans ce contrôle, tout le terrain serait décalé en silence à partir de la
    // ligne fautive.
    expect(() => parseMission(['#####', '#1..#', '#..#', '#####'].join('\n'))).toThrow(
      /ligne 3/,
    );
  });

  test('un caractère inconnu est rejeté, avec sa position', () => {
    expect(() => parseMission(['#####', '#1?.#', '#####'].join('\n'))).toThrow(
      /« \? ».*ligne 2, colonne 3/,
    );
  });

  test('une grille sans point de départ joueur est rejetée', () => {
    expect(() => parseMission(['#####', '#...#', '#####'].join('\n'))).toThrow(
      MissionParseError,
    );
  });

  test('un point de départ dupliqué est rejeté', () => {
    expect(() => parseMission(['#####', '#1.1#', '#####'].join('\n'))).toThrow(/deux fois/);
  });

  test('une grille vide est rejetée', () => {
    expect(() => parseMission('   \n\n  ')).toThrow(MissionParseError);
  });
});
