import { describe, expect, test } from 'bun:test';

import { blocksTank, tileAt } from '../src/core/grid.js';
import type { TankColor, World } from '../src/core/state.js';
import { enemiesRemaining, missionOutcome } from '../src/core/systems/mission.js';
import { TUNING } from '../src/core/tuning.js';
import { createTank, createWorld } from '../src/core/world.js';
import { loadMission } from '../src/shared/missions/load.js';
import {
  ARENA_HEIGHT_TILES,
  ARENA_WIDTH_TILES,
  MISSIONS,
  missionByNumber,
} from '../src/shared/missions/missions.js';
import { parseMission } from '../src/shared/missions/parse.js';
import type { EnemySpawn, ParsedMission, SpawnPoint } from '../src/shared/missions/parse.js';

/**
 * Ce fichier est le garde-fou du level design.
 *
 * Les dix-huit arènes écrites pour cette refonte ne sont pas des relevés du jeu
 * original — elles n'existaient nulle part. Ce qui les rend défendables, ce
 * n'est donc pas leur provenance, c'est le fait que chacune est vérifiée
 * mécaniquement : dimensions, étanchéité, effectif conforme au relevé de
 * l'ancienne version, accessibilité, distances de sécurité.
 *
 * Les deux règles vérifiées ici viennent directement de #11, où elles ont
 * coûté une demi-journée de fausse piste :
 *
 *   - un tracé trop cloisonné rend les ennemis muets, et ça ressemble à s'y
 *     méprendre à une panne d'IA ;
 *   - un ennemi placé trop près du départ tue avant que le joueur ait bougé.
 */

/* ── Effectifs relevés dans l'ancienne version ──────────────────────────────
 *
 * Transcrits depuis les listes `enemies` de l'ancienne version, telles que les
 * restitue le relevé de `docs/provenance.md`. C'est la seule donnée de
 * progression qu'elle contenait pour les vingt missions : les tracés, eux,
 * manquaient à partir de la troisième.
 *
 * La couleur `grey` y est devenue `ash`, seul renommage.
 * ────────────────────────────────────────────────────────────────────────── */
const LEGACY_ROSTERS: ReadonlyArray<readonly TankColor[]> = [
  /*  1 */ ['brown'],
  /*  2 */ ['ash'],
  /*  3 */ ['ash', 'ash', 'brown'],
  /*  4 */ ['ash', 'ash', 'brown'],
  /*  5 */ ['teal', 'teal'],
  /*  6 */ ['teal', 'teal', 'ash', 'ash'],
  /*  7 */ ['teal', 'teal', 'teal', 'teal'],
  /*  8 */ ['yellow', 'yellow', 'yellow', 'teal', 'teal'],
  /*  9 */ ['yellow', 'yellow', 'ash', 'ash', 'ash', 'ash'],
  /* 10 */ ['pink', 'pink'],
  /* 11 */ ['pink', 'pink', 'teal', 'teal', 'ash', 'ash'],
  /* 12 */ ['green', 'green', 'pink', 'pink'],
  /* 13 */ ['yellow', 'yellow', 'yellow', 'teal', 'teal', 'teal'],
  /* 14 */ ['green', 'green', 'green', 'pink', 'pink', 'pink'],
  /* 15 */ ['purple', 'purple', 'purple'],
  /* 16 */ ['purple', 'purple', 'purple', 'green', 'green'],
  /* 17 */ ['green', 'green', 'green', 'green', 'green', 'green'],
  /* 18 */ ['purple', 'purple', 'green', 'pink', 'teal', 'teal'],
  /* 19 */ Array.from({ length: 8 }, () => 'purple' as const),
  /* 20 */ ['white', 'white'],
];

/** Décompte par couleur, pour comparer deux effectifs sans dépendre de l'ordre. */
function tally(colors: readonly TankColor[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const color of colors) counts[color] = (counts[color] ?? 0) + 1;
  return counts;
}

interface ParsedEntry {
  id: number;
  name: string;
  parsed: ParsedMission;
}

/**
 * Toutes les missions, lues une fois pour toutes.
 *
 * Tableau mutable et non `ReadonlyArray` : `describe.each` refuse un tableau en
 * lecture seule.
 */
const PARSED: ParsedEntry[] = MISSIONS.map((mission) => ({
  id: mission.id,
  name: mission.name,
  parsed: parseMission(mission.grid),
}));

/**
 * Tuiles atteignables par un tank depuis un point donné.
 *
 * Propagation en quatre directions seulement : la diagonale entre deux blocs
 * qui se touchent par le coin ne passe pas, la boîte de collision du tank étant
 * plus large qu'un point.
 */
function reachableFrom(parsed: ParsedMission, origin: SpawnPoint): Set<number> {
  const { grid } = parsed;
  const index = (x: number, y: number): number => y * grid.width + x;

  const start = index(Math.floor(origin.x), Math.floor(origin.y));
  const seen = new Set<number>([start]);
  const queue: number[] = [start];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const x = current % grid.width;
    const y = Math.floor(current / grid.width);

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextY < 0 || nextX >= grid.width || nextY >= grid.height) continue;
      if (blocksTank(tileAt(grid, nextX, nextY))) continue;

      const next = index(nextX, nextY);
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return seen;
}

describe('la campagne est complète', () => {
  test('elle compte vingt missions numérotées de 1 à 20', () => {
    expect(MISSIONS).toHaveLength(20);
    expect(MISSIONS.map((mission) => mission.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
  });

  test('chaque mission porte un nom distinct', () => {
    const names = new Set(MISSIONS.map((mission) => mission.name));
    expect(names.size).toBe(MISSIONS.length);
  });

  test('la recherche par numéro suit la numérotation affichée', () => {
    expect(missionByNumber(1)?.id).toBe(1);
    expect(missionByNumber(20)?.id).toBe(20);
    expect(missionByNumber(0)).toBeUndefined();
    expect(missionByNumber(21)).toBeUndefined();
  });
});

describe.each(PARSED)('mission $id — $name', ({ parsed }) => {
  const { grid, playerSpawns, enemySpawns } = parsed;

  test("l'arène a les dimensions communes à toute la campagne", () => {
    // Dans l'original le plateau ne change jamais de taille ; seule la
    // disposition des blocs varie. L'ancienne version faisait varier les deux.
    expect(grid.width).toBe(ARENA_WIDTH_TILES);
    expect(grid.height).toBe(ARENA_HEIGHT_TILES);
  });

  test('la bordure est entièrement incassable', () => {
    // Un seul trou dans le pourtour et les obus quittent le monde : le balayage
    // ne rencontrerait plus rien à réfléchir.
    for (let x = 0; x < grid.width; x++) {
      expect(blocksTank(tileAt(grid, x, 0))).toBe(true);
      expect(blocksTank(tileAt(grid, x, grid.height - 1))).toBe(true);
    }
    for (let y = 0; y < grid.height; y++) {
      expect(blocksTank(tileAt(grid, 0, y))).toBe(true);
      expect(blocksTank(tileAt(grid, grid.width - 1, y))).toBe(true);
    }
  });

  test('elle définit un départ joueur et au moins un ennemi', () => {
    expect(playerSpawns).toHaveLength(1);
    expect(enemySpawns.length).toBeGreaterThan(0);
  });

  test('tous les ennemis sont accessibles depuis le départ joueur', () => {
    // C'est la vérification qui aurait évité la fausse piste de #11 : un
    // ennemi enfermé dans une poche ne peut ni être atteint ni atteindre, et
    // la mission devient impossible à terminer sans que rien ne le signale.
    const reachable = reachableFrom(parsed, playerSpawns[0]!);

    const unreachable = enemySpawns.filter(
      (enemy) =>
        !reachable.has(Math.floor(enemy.y) * grid.width + Math.floor(enemy.x)),
    );

    expect(unreachable).toEqual([]);
  });

  test('aucun ennemi ne se trouve à portée immédiate du départ', () => {
    // Un vert à cinq tuiles tue en deux secondes et demie, avant même que le
    // joueur ait pu bouger. La distance de sécurité vaut la portée standard de
    // détection, soit un tiers de la largeur de l'arène.
    const MINIMUM_TILES = 8;
    const spawn = playerSpawns[0]!;

    const tooClose = enemySpawns.filter(
      (enemy) => Math.hypot(enemy.x - spawn.x, enemy.y - spawn.y) < MINIMUM_TILES,
    );

    expect(tooClose).toEqual([]);
  });

  test('chaque point de départ laisse la place à un tank', () => {
    // Les tanks apparaissent au centre d'une tuile ; il faut donc que les
    // quatre tuiles qu'effleure leur boîte de collision soient libres.
    const half = TUNING.tank.sizeTiles / 2;
    const spawns: SpawnPoint[] = [...playerSpawns, ...enemySpawns];

    for (const spawn of spawns) {
      for (const [dx, dy] of [
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ] as const) {
        const kind = tileAt(grid, Math.floor(spawn.x + dx), Math.floor(spawn.y + dy));
        expect(blocksTank(kind)).toBe(false);
      }
    }
  });
});

describe('les effectifs sont ceux de la progression relevée', () => {
  test.each(MISSIONS.map((mission, index) => [mission.id, index] as const))(
    'mission %i',
    (_id, index) => {
      const spawns: EnemySpawn[] = PARSED[index]!.parsed.enemySpawns;
      expect(tally(spawns.map((enemy) => enemy.color))).toEqual(
        tally(LEGACY_ROSTERS[index]!),
      );
    },
  );

  test('les couleurs entrent en scène dans un ordre progressif', () => {
    // Vérifie que le portage n'a pas mélangé les missions : chaque couleur
    // apparaît pour la première fois à la mission où l'ancienne version la
    // faisait entrer.
    const firstAppearance = new Map<TankColor, number>();

    PARSED.forEach(({ id, parsed }) => {
      for (const enemy of parsed.enemySpawns) {
        if (!firstAppearance.has(enemy.color)) firstAppearance.set(enemy.color, id);
      }
    });

    expect(Object.fromEntries(firstAppearance)).toEqual({
      brown: 1,
      ash: 2,
      teal: 5,
      yellow: 8,
      pink: 10,
      green: 12,
      purple: 15,
      white: 20,
    });
  });
});

describe('chargement d\'une mission', () => {
  test('le monde reçoit le terrain, le joueur et les ennemis', () => {
    const { world, playerTankIds } = loadMission(MISSIONS[0]!, { playerIds: ['p1'] });

    expect(world.grid.width).toBe(ARENA_WIDTH_TILES);
    expect(playerTankIds).toHaveLength(1);
    expect(world.tanks).toHaveLength(1 + LEGACY_ROSTERS[0]!.length);

    const player = world.tanks.find((tank) => tank.id === playerTankIds[0]);
    expect(player?.playerId).toBe('p1');
    // Un tank de joueur n'a pas de mémoire d'IA : c'est ce qui le distingue.
    expect(player?.ai).toBeNull();
  });

  test('les ennemis reçoivent leur couleur et leur mémoire d\'IA', () => {
    const { world } = loadMission(MISSIONS[19]!, { playerIds: ['p1'] });
    const enemies = world.tanks.filter((tank) => tank.playerId === null);

    expect(enemies).toHaveLength(2);
    expect(enemies.every((tank) => tank.color === 'white')).toBe(true);
    expect(enemies.every((tank) => tank.ai !== null)).toBe(true);
  });

  test('la graine vaut le numéro de mission, donc deux chargements sont jumeaux', () => {
    const first = loadMission(MISSIONS[6]!, { playerIds: ['p1'] });
    const second = loadMission(MISSIONS[6]!, { playerIds: ['p1'] });

    expect(first.world.rng).toEqual(second.world.rng);
    expect(first.world.tanks).toEqual(second.world.tanks);
  });

  test('les coéquipiers apparaissent autour du départ déclaré', () => {
    // L'original est un jeu solo : ses arènes n'ont qu'un point de départ. Le
    // co-op est un ajout de cette refonte, et les places manquantes sont
    // dérivées des tuiles voisines plutôt qu'inventées sur vingt grilles.
    const { world } = loadMission(MISSIONS[0]!, { playerIds: ['p1', 'p2', 'p3', 'p4'] });
    const players = world.tanks.filter((tank) => tank.playerId !== null);

    expect(players).toHaveLength(4);

    const declared = parseMission(MISSIONS[0]!.grid).playerSpawns[0]!;
    for (const tank of players) {
      // Assez près pour hériter des garanties du départ d'origine :
      // accessibilité et distance aux ennemis.
      expect(Math.hypot(tank.x - declared.x, tank.y - declared.y)).toBeLessThanOrEqual(6);
    }
  });

  test('les coéquipiers ne se gênent pas au départ', () => {
    // Deux tanks posés sur des tuiles voisines se touchent par leurs boîtes de
    // collision : le premier qui part dans la mauvaise direction reste bloqué
    // contre son voisin, et croit à un bug de pilotage.
    for (const mission of MISSIONS) {
      const { world } = loadMission(mission, { playerIds: ['p1', 'p2', 'p3', 'p4'] });
      const players = world.tanks.filter((tank) => tank.playerId !== null);

      for (const tank of players) {
        for (const other of players) {
          if (other.id === tank.id) continue;
          expect(Math.hypot(other.x - tank.x, other.y - tank.y)).toBeGreaterThanOrEqual(
            TUNING.tank.sizeTiles * 2,
          );
        }
      }
    }
  });

  test('les places dérivées sont sur du sol libre, dans toutes les missions', () => {
    for (const mission of MISSIONS) {
      const { world } = loadMission(mission, { playerIds: ['p1', 'p2', 'p3', 'p4'] });

      for (const tank of world.tanks.filter((each) => each.playerId !== null)) {
        const kind = tileAt(world.grid, Math.floor(tank.x), Math.floor(tank.y));
        expect(blocksTank(kind)).toBe(false);
      }
    }
  });

  test('la dérivation est déterministe', () => {
    // Serveur et client chargent la même mission chacun de leur côté : deux
    // placements différents rendraient la réconciliation impossible.
    const first = loadMission(MISSIONS[8]!, { playerIds: ['p1', 'p2', 'p3'] });
    const second = loadMission(MISSIONS[8]!, { playerIds: ['p1', 'p2', 'p3'] });

    expect(first.world.tanks).toEqual(second.world.tanks);
  });

  test('les vingt missions se chargent sans erreur', () => {
    for (const mission of MISSIONS) {
      expect(() => loadMission(mission, { playerIds: ['p1'] })).not.toThrow();
    }
  });
});

describe('issue d\'une mission', () => {
  /** Monde minimal : un joueur, et le nombre d'ennemis demandé. */
  function scenario(enemies: number): World {
    const world = createWorld({ width: 9, height: 9, seed: 1 });
    createTank(world, { color: 'player', playerId: 'p1', x: 2.5, y: 2.5 });
    for (let index = 0; index < enemies; index++) {
      createTank(world, { color: 'brown', x: 5.5 + index, y: 5.5 });
    }
    return world;
  }

  test('la mission continue tant qu\'il reste un ennemi', () => {
    expect(missionOutcome(scenario(2))).toBe('playing');
  });

  test('elle est réussie quand tous les ennemis sont détruits', () => {
    const world = scenario(2);
    for (const tank of world.tanks) if (tank.playerId === null) tank.alive = false;

    expect(missionOutcome(world)).toBe('cleared');
    expect(enemiesRemaining(world)).toBe(0);
  });

  test('elle est perdue quand le joueur est détruit', () => {
    const world = scenario(2);
    world.tanks[0]!.alive = false;

    expect(missionOutcome(world)).toBe('failed');
  });

  test('en cas d\'égalité, l\'échec l\'emporte', () => {
    // Le dernier obus du joueur détruit le dernier ennemi au moment même où un
    // obus adverse l'atteint : un tank détruit reste un tank détruit.
    const world = scenario(1);
    for (const tank of world.tanks) tank.alive = false;

    expect(missionOutcome(world)).toBe('failed');
  });

  test('le décompte d\'ennemis ignore les tanks détruits', () => {
    const world = scenario(3);
    world.tanks[1]!.alive = false;

    expect(enemiesRemaining(world)).toBe(2);
  });
});
