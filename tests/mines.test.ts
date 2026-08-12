import { describe, expect, test } from 'bun:test';

import { setTile, tileAt } from '../src/core/grid.js';
import { TileKind } from '../src/core/state.js';
import type { InputCommand, Mine, Tank, World } from '../src/core/state.js';
import { TICK_RATE, secondsToTicks, tick } from '../src/core/tick.js';
import type { TickInputs } from '../src/core/tick.js';
import { layMine } from '../src/core/systems/mines.js';
import { shellSpeed } from '../src/core/systems/shells.js';
import { TUNING } from '../src/core/tuning.js';
import { allocateEntityId, createTank, createWorld, hashWorld } from '../src/core/world.js';

/**
 * Les mines n'existaient nulle part dans le projet, alors qu'elles sont le seul
 * moyen d'ouvrir un passage dans un bloc cassable — donc la clé de plusieurs
 * missions de l'original.
 */

function openWorld(width = 30, height = 20): World {
  return createWorld({ width, height, seed: 1 });
}

function addTank(world: World, x: number, y: number): Tank {
  return createTank(world, { color: 'player', playerId: 'p1', x, y });
}

/** Pose une mine directement, sans passer par un tank ni par les quotas. */
function addMine(world: World, x: number, y: number, fuseTicks = 30): Mine {
  const mine: Mine = { id: allocateEntityId(world), ownerId: -1, x, y, fuseTicks };
  world.mines.push(mine);
  return mine;
}

function input(overrides: Partial<InputCommand> = {}): InputCommand {
  return { moveX: 0, moveY: 0, aim: 0, fire: false, mine: false, ...overrides };
}

function advance(world: World, ticks: number, inputs: TickInputs = []): void {
  for (let i = 0; i < ticks; i++) tick(world, inputs);
}

const FUSE_TICKS = secondsToTicks(TUNING.mine.fuseSeconds);

describe('pose', () => {
  test('la touche pose une mine à la position du tank', () => {
    const world = openWorld();
    const tank = addTank(world, 10.25, 7.75);

    advance(world, 1, [[tank.id, input({ mine: true })]]);

    expect(world.mines).toHaveLength(1);
    expect(world.mines[0]).toMatchObject({ x: 10.25, y: 7.75, ownerId: tank.id });
  });

  test('le quota de mines simultanées est respecté', () => {
    const world = openWorld();
    const tank = addTank(world, 10, 10);

    for (let i = 0; i < TUNING.tank.maxActiveMines + 3; i++) {
      tank.mineReloadTicks = 0;
      layMine(world, tank);
    }

    expect(world.mines).toHaveLength(TUNING.tank.maxActiveMines);
    expect(tank.activeMines).toBe(TUNING.tank.maxActiveMines);
  });

  test('maintenir la touche ne vide pas le stock en deux pas', () => {
    // Sans délai de pose, une touche maintenue déclencherait une pose par tick.
    const world = openWorld();
    const tank = addTank(world, 10, 10);

    advance(world, 3, [[tank.id, input({ mine: true })]]);

    expect(world.mines).toHaveLength(1);
  });

  test('le délai écoulé, une deuxième mine peut être posée', () => {
    const world = openWorld();
    const tank = addTank(world, 10, 10);

    const held: TickInputs = [[tank.id, input({ mine: true })]];
    advance(world, 1, held);
    advance(world, secondsToTicks(TUNING.mine.cooldownSeconds) + 1, held);

    expect(world.mines).toHaveLength(2);
  });

  test('le quota est rendu après la détonation', () => {
    const world = openWorld();
    const tank = addTank(world, 10, 10);
    layMine(world, tank);
    expect(tank.activeMines).toBe(1);

    advance(world, FUSE_TICKS + 2);

    expect(world.mines).toHaveLength(0);
    expect(tank.activeMines).toBe(0);
  });

  test('un tank mort ne pose pas de mine', () => {
    const world = openWorld();
    const tank = addTank(world, 10, 10);
    tank.alive = false;

    expect(layMine(world, tank)).toBeNull();
  });
});

describe('mèche', () => {
  test('la mine explose à la fin de sa mèche, pas avant', () => {
    const world = openWorld();
    addMine(world, 10, 10, FUSE_TICKS);

    advance(world, FUSE_TICKS - 1);
    expect(world.mines).toHaveLength(1);

    advance(world, 2);
    expect(world.mines).toHaveLength(0);
  });

  test('la durée correspond au réglage', () => {
    const world = openWorld();
    const tank = addTank(world, 10, 10);
    layMine(world, tank);

    let ticks = 0;
    while (world.mines.length > 0 && ticks < 1000) {
      advance(world, 1);
      ticks++;
    }

    expect(ticks / TICK_RATE).toBeCloseTo(TUNING.mine.fuseSeconds, 1);
  });

  test('une explosion apparaît et vit sa durée complète', () => {
    const world = openWorld();
    addMine(world, 10, 10, 1);

    advance(world, 1);
    expect(world.explosions).toHaveLength(1);

    const duration = secondsToTicks(TUNING.mine.blastDurationSeconds);
    advance(world, duration - 1);
    expect(world.explosions).toHaveLength(1);

    advance(world, 2);
    expect(world.explosions).toHaveLength(0);
  });
});

describe('destruction du terrain', () => {
  test('les blocs cassables du rayon disparaissent, les incassables restent', () => {
    const world = openWorld();

    // Un mur mixte traversant le rayon de l'explosion.
    for (let y = 8; y <= 12; y++) setTile(world.grid, 10, y, TileKind.Destructible);
    setTile(world.grid, 11, 10, TileKind.Indestructible);

    addMine(world, 10.5, 10.5, 1);
    advance(world, 2);

    expect(tileAt(world.grid, 10, 10)).toBe(TileKind.Empty);
    expect(tileAt(world.grid, 10, 9)).toBe(TileKind.Empty);
    expect(tileAt(world.grid, 10, 11)).toBe(TileKind.Empty);
    // L'incassable est à portée, et pourtant intact.
    expect(tileAt(world.grid, 11, 10)).toBe(TileKind.Indestructible);
  });

  test('les blocs hors du rayon sont épargnés', () => {
    const world = openWorld();
    const farAway = Math.ceil(TUNING.mine.blastRadiusTiles) + 3;
    setTile(world.grid, 10 + farAway, 10, TileKind.Destructible);

    addMine(world, 10.5, 10.5, 1);
    advance(world, 2);

    expect(tileAt(world.grid, 10 + farAway, 10)).toBe(TileKind.Destructible);
  });

  test('la version de la grille change, pour invalider le cache de rendu', () => {
    const world = openWorld();
    setTile(world.grid, 10, 10, TileKind.Destructible);
    const before = world.grid.version;

    addMine(world, 10.5, 10.5, 1);
    advance(world, 2);

    expect(world.grid.version).toBeGreaterThan(before);
  });

  test('une explosion sans rien à détruire ne change pas la version', () => {
    const world = openWorld();
    const before = world.grid.version;

    addMine(world, 10.5, 10.5, 1);
    advance(world, 2);

    expect(world.grid.version).toBe(before);
  });

  test('la brèche ouverte laisse passer un obus, qui n\'y rebondit plus', () => {
    const world = openWorld(30, 12);
    for (let y = 1; y < 11; y++) setTile(world.grid, 15, y, TileKind.Destructible);

    // On perce le mur à hauteur de la trajectoire.
    addMine(world, 15.5, 6.5, 1);
    advance(world, 3);
    expect(tileAt(world.grid, 15, 6)).toBe(TileKind.Empty);

    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: 5,
      y: 6.5,
      vx: shellSpeed('normal'),
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });

    advance(world, 150);

    const shell = world.shells[0];
    expect(shell).toBeDefined();
    expect(shell!.x).toBeGreaterThan(16);
    expect(shell!.vx).toBeGreaterThan(0);
  });

  test('la brèche laisse passer un tank', () => {
    const world = openWorld(30, 12);
    for (let y = 1; y < 11; y++) setTile(world.grid, 15, y, TileKind.Destructible);

    const tank = addTank(world, 13, 6.5);
    addMine(world, 15.5, 6.5, 1);
    advance(world, 3);

    advance(world, 200, [[tank.id, input({ moveX: 1 })]]);

    expect(tank.x).toBeGreaterThan(16);
  });
});

describe('effets sur les entités', () => {
  test('le poseur meurt s\'il reste sur sa propre mine', () => {
    const world = openWorld();
    const tank = addTank(world, 10, 10);
    layMine(world, tank);

    advance(world, FUSE_TICKS + 2);

    expect(tank.alive).toBe(false);
  });

  test('s\'éloigner à temps sauve le poseur', () => {
    const world = openWorld(40, 20);
    const tank = addTank(world, 10, 10);
    layMine(world, tank);

    advance(world, FUSE_TICKS + 2, [[tank.id, input({ moveX: 1 })]]);

    expect(tank.alive).toBe(true);
    expect(tank.x).toBeGreaterThan(10 + TUNING.mine.blastRadiusTiles);
  });

  test('un tank hors du rayon survit', () => {
    const world = openWorld();
    const survivor = addTank(world, 10 + TUNING.mine.blastRadiusTiles + 2, 10);

    addMine(world, 10, 10, 1);
    advance(world, 2);

    expect(survivor.alive).toBe(true);
  });

  test('un obus pris dans le souffle est détruit', () => {
    const world = openWorld();
    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: 10.5,
      y: 10,
      vx: 0,
      vy: 0,
      bouncesLeft: 5,
      armed: true,
    });

    addMine(world, 10, 10, 1);
    advance(world, 2);

    expect(world.shells).toHaveLength(0);
  });

  test('un obus qui touche une mine la fait détoner immédiatement', () => {
    // Permet de désamorcer un piège à distance, sans attendre la mèche.
    const world = openWorld(40, 20);
    const mine = addMine(world, 20, 10, 9999);

    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: 15,
      y: 10,
      vx: shellSpeed('normal'),
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });

    advance(world, 120);

    expect(world.mines.find((m) => m.id === mine.id)).toBeUndefined();
    expect(world.shells).toHaveLength(0);
  });
});

describe('réactions en chaîne', () => {
  test('une mine en amorce toutes les autres à portée', () => {
    const world = openWorld(40, 20);
    const step = TUNING.mine.blastRadiusTiles * 0.8;

    addMine(world, 10, 10, 1);
    addMine(world, 10 + step, 10, 9999);
    addMine(world, 10 + step * 2, 10, 9999);
    addMine(world, 10 + step * 3, 10, 9999);

    advance(world, 2);

    // La cascade se propage entièrement dans le même pas.
    expect(world.mines).toHaveLength(0);
    expect(world.explosions).toHaveLength(4);
  });

  test('la chaîne s\'arrête là où l\'espacement dépasse le rayon', () => {
    const world = openWorld(60, 20);
    const near = TUNING.mine.blastRadiusTiles * 0.8;
    const far = TUNING.mine.blastRadiusTiles * 3;

    addMine(world, 10, 10, 1);
    addMine(world, 10 + near, 10, 9999);
    const isolated = addMine(world, 10 + near + far, 10, 9999);

    advance(world, 2);

    expect(world.mines).toHaveLength(1);
    expect(world.mines[0]!.id).toBe(isolated.id);
  });

  test('deux mines qui s\'amorcent mutuellement ne bouclent pas', () => {
    // Chaque mine est marquée avant d'entrer dans la file, donc elle ne peut
    // pas y être empilée deux fois — c'est ce qui garantit la terminaison.
    const world = openWorld();
    addMine(world, 10, 10, 1);
    addMine(world, 10.2, 10, 1);

    advance(world, 2);

    expect(world.mines).toHaveLength(0);
    expect(world.explosions).toHaveLength(2);
  });

  test('une chaîne perce un mur sur toute sa longueur', () => {
    const world = openWorld(40, 20);
    for (let y = 4; y <= 16; y++) setTile(world.grid, 20, y, TileKind.Destructible);

    const step = TUNING.mine.blastRadiusTiles * 0.8;
    addMine(world, 20.5, 7, 1);
    addMine(world, 20.5, 7 + step, 9999);
    addMine(world, 20.5, 7 + step * 2, 9999);

    advance(world, 2);

    let opened = 0;
    for (let y = 4; y <= 16; y++) {
      if (tileAt(world.grid, 20, y) === TileKind.Empty) opened++;
    }

    // Bien plus large que ce qu'une mine seule aurait ouvert.
    expect(opened).toBeGreaterThan(TUNING.mine.blastRadiusTiles * 2);
  });
});

describe('déterminisme', () => {
  test('une cascade rejouée produit la même empreinte', () => {
    const build = (): World => {
      const world = openWorld(40, 20);
      for (let y = 4; y <= 16; y++) setTile(world.grid, 20, y, TileKind.Destructible);
      for (let x = 14; x <= 26; x++) setTile(world.grid, x, 12, TileKind.Destructible);

      const step = TUNING.mine.blastRadiusTiles * 0.7;
      addMine(world, 20.5, 8, 20);
      addMine(world, 20.5, 8 + step, 9999);
      addMine(world, 20.5 + step, 8 + step * 2, 9999);
      addTank(world, 25, 15);
      return world;
    };

    const a = build();
    const b = build();
    advance(a, 300);
    advance(b, 300);

    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
