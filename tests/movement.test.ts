import { describe, expect, test } from 'bun:test';

import { blocksShell, blocksTank, boxOverlapsSolid, setTile, tileAt } from '../src/core/grid.js';
import { normalizeAngle, rotateToward } from '../src/core/math.js';
import { TileKind } from '../src/core/state.js';
import type { InputCommand, Tank, World } from '../src/core/state.js';
import { TICK_RATE, tick } from '../src/core/tick.js';
import type { TickInputs } from '../src/core/tick.js';
import { REFERENCE_MEASUREMENTS, TILE_SIZE_PX, TUNING } from '../src/core/tuning.js';
import { allocateEntityId, createWorld } from '../src/core/world.js';

/** Monde ouvert, sans obstacle intérieur, pour mesurer sans interférence. */
function openWorld(width = 40, height = 20): World {
  return createWorld({ width, height, seed: 1 });
}

function addTank(world: World, x: number, y: number): Tank {
  const tank: Tank = {
    id: allocateEntityId(world),
    color: 'player',
    playerId: 'p1',
    x,
    y,
    bodyAngle: 0,
    turretAngle: 0,
    alive: true,
    activeShells: 0,
    activeMines: 0,
    reloadTicks: 0,
  };
  world.tanks.push(tank);
  return tank;
}

function input(overrides: Partial<InputCommand> = {}): InputCommand {
  return { moveX: 0, moveY: 0, aim: 0, fire: false, mine: false, ...overrides };
}

/** Fait avancer le monde de `ticks` pas avec la même intention à chaque pas. */
function run(world: World, tankId: number, command: InputCommand, ticks: number): void {
  const inputs: TickInputs = [[tankId, command]];
  for (let i = 0; i < ticks; i++) tick(world, inputs);
}

describe('grille', () => {
  test('hors limites est considéré comme incassable', () => {
    const world = openWorld(10, 10);
    expect(tileAt(world.grid, -1, 5)).toBe(TileKind.Indestructible);
    expect(tileAt(world.grid, 10, 5)).toBe(TileKind.Indestructible);
    expect(tileAt(world.grid, 5, -1)).toBe(TileKind.Indestructible);
    expect(tileAt(world.grid, 5, 10)).toBe(TileKind.Indestructible);
  });

  test('les trous arrêtent les tanks mais laissent passer les obus', () => {
    expect(blocksTank(TileKind.Hole)).toBe(true);
    expect(blocksShell(TileKind.Hole)).toBe(false);

    // Les deux types de blocs arrêtent tout le monde.
    for (const kind of [TileKind.Indestructible, TileKind.Destructible] as const) {
      expect(blocksTank(kind)).toBe(true);
      expect(blocksShell(kind)).toBe(true);
    }

    expect(blocksTank(TileKind.Empty)).toBe(false);
    expect(blocksShell(TileKind.Empty)).toBe(false);
  });

  test('une boîte ne détecte que les tuiles qu\'elle recouvre vraiment', () => {
    const world = openWorld(10, 10);
    setTile(world.grid, 5, 5, TileKind.Indestructible);

    const half = 0.4;
    // Centrée sur la tuile voisine : les bords ne se touchent pas.
    expect(boxOverlapsSolid(world.grid, 4.5, 5.5, half, blocksTank)).toBe(false);
    // Décalée juste assez pour mordre sur la tuile solide.
    expect(boxOverlapsSolid(world.grid, 4.95, 5.5, half, blocksTank)).toBe(true);
  });
});

describe('vitesse de déplacement — conformité à la mesure de référence', () => {
  test('le tank traverse l\'arène de référence dans le temps mesuré', () => {
    // Fait observable relevé sur le jeu original : le tank du joueur parcourt
    // 736 px en 7 s. C'est de cette mesure que dérive toute la vitesse du jeu.
    const distanceTiles = REFERENCE_MEASUREMENTS.arenaWidthPx / TILE_SIZE_PX;
    const expectedTicks = REFERENCE_MEASUREMENTS.tankCrossingSeconds * TICK_RATE;

    const world = openWorld(Math.ceil(distanceTiles) + 8, 12);
    const tank = addTank(world, 2, 6);
    const startX = tank.x;

    let ticks = 0;
    const command = input({ moveX: 1 });
    while (tank.x - startX < distanceTiles && ticks < expectedTicks * 3) {
      run(world, tank.id, command, 1);
      ticks++;
    }

    expect(Math.abs(ticks - expectedTicks)).toBeLessThanOrEqual(1);
  });

  test('la diagonale ne va pas plus vite que la ligne droite', () => {
    // Sans normalisation, une entrée clavier (1, 1) donnerait √2 ≈ 1,41 fois la
    // vitesse nominale — le bug de « strafe diagonal » classique.
    const straight = openWorld();
    const straightTank = addTank(straight, 5, 10);
    run(straight, straightTank.id, input({ moveX: 1 }), 60);
    const straightDistance = straightTank.x - 5;

    const diagonal = openWorld();
    const diagonalTank = addTank(diagonal, 5, 10);
    run(diagonal, diagonalTank.id, input({ moveX: 1, moveY: 1 }), 60);
    const diagonalDistance = Math.hypot(diagonalTank.x - 5, diagonalTank.y - 10);

    expect(diagonalDistance).toBeCloseTo(straightDistance, 6);
  });

  test('une entrée analogique partielle conserve son dosage', () => {
    // Une manette poussée à moitié doit avancer à moitié : on ne normalise que
    // ce qui déborde du disque unité.
    const world = openWorld();
    const tank = addTank(world, 5, 10);
    run(world, tank.id, input({ moveX: 0.5 }), 60);

    const expected = (TUNING.tank.speedTilesPerSecond * 0.5 * 60) / TICK_RATE;
    expect(tank.x - 5).toBeCloseTo(expected, 6);
  });
});

describe('glissement le long des murs', () => {
  test('poussé en diagonale contre un mur vertical, le tank longe le mur', () => {
    const world = openWorld(20, 20);
    // Mur vertical complet en x = 8.
    for (let y = 1; y < 19; y++) setTile(world.grid, 8, y, TileKind.Indestructible);

    const tank = addTank(world, 7.4, 10);
    const startY = tank.y;

    run(world, tank.id, input({ moveX: 1, moveY: 1 }), 30);

    // L'axe bloqué n'avance pas...
    expect(tank.x).toBeLessThan(8);
    // ...mais l'axe libre, si. C'est tout l'objet de la résolution axe par axe :
    // l'ancienne version rejetait le déplacement entier et le tank se figeait.
    expect(tank.y).toBeGreaterThan(startY + 0.5);
  });

  test('poussé en diagonale contre un mur horizontal, le tank longe le mur', () => {
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) setTile(world.grid, x, 8, TileKind.Indestructible);

    const tank = addTank(world, 10, 7.4);
    const startX = tank.x;

    run(world, tank.id, input({ moveX: 1, moveY: 1 }), 30);

    expect(tank.y).toBeLessThan(8);
    expect(tank.x).toBeGreaterThan(startX + 0.5);
  });

  test('un coin rentrant arrête les deux axes', () => {
    const world = openWorld(20, 20);
    for (let y = 1; y < 19; y++) setTile(world.grid, 8, y, TileKind.Indestructible);
    for (let x = 1; x < 19; x++) setTile(world.grid, x, 8, TileKind.Indestructible);

    const tank = addTank(world, 7.4, 7.4);
    run(world, tank.id, input({ moveX: 1, moveY: 1 }), 60);

    expect(tank.x).toBeLessThan(8);
    expect(tank.y).toBeLessThan(8);
  });

  test('le tank se plaque contre le mur, sans laisser d\'interstice', () => {
    const world = openWorld(20, 20);
    for (let y = 1; y < 19; y++) setTile(world.grid, 8, y, TileKind.Indestructible);

    const tank = addTank(world, 5, 10);
    run(world, tank.id, input({ moveX: 1 }), 200);

    // Rejeter simplement le pas laisserait un jeu pouvant atteindre une frame
    // de déplacement ; on cale donc la boîte contre la face de la tuile.
    const expectedX = 8 - TUNING.tank.sizeTiles / 2;
    expect(tank.x).toBeCloseTo(expectedX, 4);
  });
});

describe('étanchéité des murs', () => {
  test('aucune direction ne permet de traverser la bordure', () => {
    // Balayage sur 360 directions : un seul angle qui passe suffirait à rendre
    // le jeu injouable, et ce genre de trou est indétectable à la main.
    const escapes: number[] = [];

    for (let degrees = 0; degrees < 360; degrees++) {
      const radians = (degrees * Math.PI) / 180;
      const world = openWorld(12, 12);
      const tank = addTank(world, 6, 6);

      run(world, tank.id, input({ moveX: Math.cos(radians), moveY: Math.sin(radians) }), 600);

      const half = TUNING.tank.sizeTiles / 2;
      const inside =
        tank.x - half >= 1 - 1e-3 &&
        tank.y - half >= 1 - 1e-3 &&
        tank.x + half <= 11 + 1e-3 &&
        tank.y + half <= 11 + 1e-3;

      if (!inside) escapes.push(degrees);
    }

    expect(escapes).toEqual([]);
  });

  test('un tank ne peut pas entrer sur un trou', () => {
    const world = openWorld(20, 20);
    for (let y = 1; y < 19; y++) setTile(world.grid, 8, y, TileKind.Hole);

    const tank = addTank(world, 5, 10);
    run(world, tank.id, input({ moveX: 1 }), 200);

    expect(tank.x).toBeLessThan(8);
  });
});

describe('orientation', () => {
  test('la tourelle suit la visée sans inertie', () => {
    const world = openWorld();
    const tank = addTank(world, 5, 5);

    run(world, tank.id, input({ aim: 1.234 }), 1);
    expect(tank.turretAngle).toBeCloseTo(1.234, 9);
  });

  test('le châssis pivote progressivement, sans freiner le déplacement', () => {
    const world = openWorld();
    const tank = addTank(world, 5, 10);
    tank.bodyAngle = Math.PI; // orienté à l'opposé de la direction demandée

    // Un seul pas : le corps n'a pas eu le temps de se retourner...
    run(world, tank.id, input({ moveX: 1 }), 1);
    expect(Math.abs(normalizeAngle(tank.bodyAngle))).toBeGreaterThan(0.1);

    // ...et pourtant le tank a déjà avancé à pleine vitesse. Dans Tanks!, on
    // part immédiatement dans la direction demandée ; le corps rattrape.
    expect(tank.x).toBeCloseTo(5 + TUNING.tank.speedTilesPerSecond / TICK_RATE, 6);
  });

  test('le châssis finit par s\'aligner sur la direction du déplacement', () => {
    const world = openWorld();
    const tank = addTank(world, 5, 10);
    tank.bodyAngle = Math.PI;

    run(world, tank.id, input({ moveX: 1 }), 60);
    expect(Math.abs(normalizeAngle(tank.bodyAngle))).toBeLessThan(1e-6);
  });

  test('rotateToward passe par le chemin le plus court', () => {
    // De 175° vers -175° : 10° dans le sens positif, pas 350° dans l'autre.
    const from = (175 * Math.PI) / 180;
    const to = (-175 * Math.PI) / 180;
    const stepped = rotateToward(from, to, (2 * Math.PI) / 180);

    expect(normalizeAngle(stepped - from)).toBeCloseTo((2 * Math.PI) / 180, 9);
  });

  test('un tank mort ne bouge plus mais garde une tourelle lisible', () => {
    const world = openWorld();
    const tank = addTank(world, 5, 10);
    tank.alive = false;

    run(world, tank.id, input({ moveX: 1, aim: 0.5 }), 60);

    expect(tank.x).toBe(5);
    expect(tank.turretAngle).toBeCloseTo(0.5, 9);
  });
});

describe('déterminisme du mouvement', () => {
  test('deux mondes recevant les mêmes intentions restent identiques', () => {
    const build = (): { world: World; id: number } => {
      const world = openWorld(20, 20);
      for (let y = 1; y < 19; y++) setTile(world.grid, 8, y, TileKind.Indestructible);
      const tank = addTank(world, 5, 10);
      return { world, id: tank.id };
    };

    const a = build();
    const b = build();

    // Suite d'intentions variée mais reproductible.
    for (let i = 0; i < 600; i++) {
      const command = input({
        moveX: Math.cos(i / 17),
        moveY: Math.sin(i / 23),
        aim: i / 11,
      });
      run(a.world, a.id, command, 1);
      run(b.world, b.id, command, 1);
    }

    expect(a.world.tanks[0]).toEqual(b.world.tanks[0]!);
  });
});
