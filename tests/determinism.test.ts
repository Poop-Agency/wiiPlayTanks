import { describe, expect, test } from 'bun:test';

import { createRng, nextFloat, nextInt, nextUint32 } from '../src/core/rng.js';
import { TileKind } from '../src/core/state.js';
import type { InputCommand, World } from '../src/core/state.js';
import { DT, TICK_RATE, secondsToTicks, tick } from '../src/core/tick.js';
import type { TickInputs } from '../src/core/tick.js';
import { allocateEntityId, cloneWorld, createWorld, hashWorld } from '../src/core/world.js';

/**
 * Le déterminisme n'est pas un détail de propreté : c'est ce qui permet au
 * client de prédire son propre tank et de se réconcilier avec le serveur (#13).
 * Si deux mondes partant du même état divergent, le multijoueur est
 * irrécupérable — et le bug est quasiment impossible à diagnostiquer une fois
 * en place.
 *
 * D'où ces tests, écrits avant les systèmes qu'ils protégeront.
 */

/** Monde d'essai reproductible, peuplé de quoi exercer chaque tableau d'entités. */
function makeWorld(seed = 12_345): World {
  const world = createWorld({ width: 20, height: 15, seed });

  world.tanks.push({
    id: allocateEntityId(world),
    color: 'player',
    playerId: 'p1',
    x: 3.5,
    y: 3.5,
    bodyAngle: 0,
    turretAngle: 0,
    alive: true,
    activeShells: 0,
    activeMines: 0,
    reloadTicks: 7,
  });

  world.mines.push({
    id: allocateEntityId(world),
    ownerId: 1,
    x: 5,
    y: 5,
    fuseTicks: 30,
  });

  world.explosions.push({
    id: allocateEntityId(world),
    x: 8,
    y: 8,
    radius: 2,
    ticksLeft: 3,
  });

  return world;
}

const NO_INPUTS: TickInputs = [];

describe('PRNG déterministe', () => {
  test('deux générateurs de même graine produisent la même suite', () => {
    const a = createRng(42);
    const b = createRng(42);

    const drawsA = Array.from({ length: 1000 }, () => nextUint32(a));
    const drawsB = Array.from({ length: 1000 }, () => nextUint32(b));

    expect(drawsA).toEqual(drawsB);
  });

  test('deux graines différentes divergent', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(nextUint32(a)).not.toBe(nextUint32(b));
  });

  test('nextFloat reste dans [0, 1) et couvre la plage', () => {
    const rng = createRng(7);
    let min = Infinity;
    let max = -Infinity;
    let outOfRange = 0;

    // On agrège plutôt que d'assener 50 000 assertions : un échec reste aussi
    // parlant, et la suite reste rapide.
    for (let i = 0; i < 50_000; i++) {
      const value = nextFloat(rng);
      if (value < 0 || value >= 1) outOfRange++;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    expect(outOfRange).toBe(0);

    // Sur 50 000 tirages, un générateur correct atteint les deux extrémités.
    // Un générateur coincé sur une sous-plage (état mal initialisé) échouerait ici.
    expect(min).toBeLessThan(0.001);
    expect(max).toBeGreaterThan(0.999);
  });

  test('nextInt respecte des bornes incluses', () => {
    const rng = createRng(99);
    const seen = new Set<number>();

    for (let i = 0; i < 10_000; i++) {
      const value = nextInt(rng, 3, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(6);
      seen.add(value);
    }

    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  test("une graine dégénérée ne bloque pas le générateur", () => {
    // L'état tout-à-zéro est un point fixe de xorshift : il ne produirait que
    // des zéros, en silence.
    const rng = createRng(0);
    const draws = new Set(Array.from({ length: 100 }, () => nextUint32(rng)));

    expect(draws.size).toBeGreaterThan(90);
  });
});

describe('empreinte du monde', () => {
  test('un monde et son clone ont la même empreinte', () => {
    const world = makeWorld();
    expect(hashWorld(cloneWorld(world))).toBe(hashWorld(world));
  });

  test('un aller-retour JSON préserve l\'empreinte', () => {
    const world = makeWorld();
    const revived = JSON.parse(JSON.stringify(world)) as World;

    expect(hashWorld(revived)).toBe(hashWorld(world));
  });

  test("l'empreinte ne dépend pas de l'ordre d'insertion des propriétés", () => {
    const world = makeWorld();

    // Même contenu, propriétés énumérées dans un autre ordre.
    const reordered = cloneWorld(world);
    const tank = reordered.tanks[0]!;
    reordered.tanks[0] = {
      reloadTicks: tank.reloadTicks,
      activeMines: tank.activeMines,
      activeShells: tank.activeShells,
      alive: tank.alive,
      turretAngle: tank.turretAngle,
      bodyAngle: tank.bodyAngle,
      y: tank.y,
      x: tank.x,
      playerId: tank.playerId,
      color: tank.color,
      id: tank.id,
    };

    expect(hashWorld(reordered)).toBe(hashWorld(world));
  });

  test('la moindre différence de position change l\'empreinte', () => {
    const world = makeWorld();
    const nudged = cloneWorld(world);
    nudged.tanks[0]!.x += 1e-9;

    expect(hashWorld(nudged)).not.toBe(hashWorld(world));
  });

  test('un NaN qui s\'infiltre est visible dans l\'empreinte', () => {
    // JSON.stringify transformerait NaN en `null`, masquant précisément le
    // genre de bug de physique qu'on cherche à détecter.
    const world = makeWorld();
    const broken = cloneWorld(world);
    broken.tanks[0]!.x = Number.NaN;

    expect(hashWorld(broken)).not.toBe(hashWorld(world));
  });

  test("l'état du générateur fait partie de l'empreinte", () => {
    const world = makeWorld();
    const advanced = cloneWorld(world);
    nextUint32(advanced.rng);

    expect(hashWorld(advanced)).not.toBe(hashWorld(world));
  });
});

describe('rejeu de la simulation', () => {
  test('10 000 ticks rejoués produisent la même empreinte', () => {
    const runOnce = (): number => {
      const world = makeWorld();
      for (let i = 0; i < 10_000; i++) tick(world, NO_INPUTS);
      return hashWorld(world);
    };

    expect(runOnce()).toBe(runOnce());
  });

  test('un rejeu depuis un clone à mi-parcours rattrape le même état', () => {
    const world = makeWorld();
    for (let i = 0; i < 500; i++) tick(world, NO_INPUTS);

    // Point de reprise, comme lors d'une réconciliation réseau (#13).
    const checkpoint = cloneWorld(world);

    for (let i = 0; i < 500; i++) tick(world, NO_INPUTS);
    for (let i = 0; i < 500; i++) tick(checkpoint, NO_INPUTS);

    expect(hashWorld(checkpoint)).toBe(hashWorld(world));
  });

  test('deux graines différentes donnent des mondes différents', () => {
    const a = makeWorld(1);
    const b = makeWorld(2);

    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});

describe('cadencement', () => {
  test('DT et TICK_RATE sont cohérents', () => {
    expect(TICK_RATE).toBe(60);
    expect(DT * TICK_RATE).toBeCloseTo(1, 12);
  });

  test('secondsToTicks convertit les durées de réglage', () => {
    expect(secondsToTicks(1)).toBe(60);
    expect(secondsToTicks(3)).toBe(180);
    expect(secondsToTicks(0.2)).toBe(12);
  });

  test('le compteur de ticks avance d\'exactement un par appel', () => {
    const world = makeWorld();
    tick(world, NO_INPUTS);
    expect(world.tick).toBe(1);
  });
});

describe('compteurs temporels', () => {
  test('le rechargement décroît puis se stabilise à zéro', () => {
    const world = makeWorld();
    expect(world.tanks[0]!.reloadTicks).toBe(7);

    for (let i = 0; i < 7; i++) tick(world, NO_INPUTS);
    expect(world.tanks[0]!.reloadTicks).toBe(0);

    tick(world, NO_INPUTS);
    expect(world.tanks[0]!.reloadTicks).toBe(0);
  });

  test('une explosion expirée est retirée, sans décaler les autres', () => {
    const world = makeWorld();
    world.explosions.push({
      id: allocateEntityId(world),
      x: 1,
      y: 1,
      radius: 2,
      ticksLeft: 10,
    });
    expect(world.explosions).toHaveLength(2);

    // La première expire au bout de 3 ticks, la seconde survit.
    for (let i = 0; i < 3; i++) tick(world, NO_INPUTS);

    expect(world.explosions).toHaveLength(1);
    expect(world.explosions[0]!.ticksLeft).toBe(7);
  });

  test('les mèches de mines décomptent', () => {
    const world = makeWorld();
    for (let i = 0; i < 10; i++) tick(world, NO_INPUTS);

    expect(world.mines[0]!.fuseTicks).toBe(20);
  });
});

describe('identifiants d\'entités', () => {
  test('le compteur vit dans le monde, donc un clone attribue les mêmes identifiants', () => {
    const world = makeWorld();
    const clone = cloneWorld(world);

    expect(allocateEntityId(clone)).toBe(allocateEntityId(world));
  });
});

describe('grille', () => {
  test('le monde neuf est ceinturé de blocs incassables', () => {
    const { grid } = createWorld({ width: 6, height: 4, seed: 1 });
    const at = (x: number, y: number): TileKind => grid.tiles[y * grid.width + x]!;

    expect(at(0, 0)).toBe(TileKind.Indestructible);
    expect(at(5, 3)).toBe(TileKind.Indestructible);
    expect(at(3, 0)).toBe(TileKind.Indestructible);
    expect(at(0, 2)).toBe(TileKind.Indestructible);
    expect(at(3, 2)).toBe(TileKind.Empty);
  });

  test('la grille fait exactement width × height', () => {
    const { grid } = createWorld({ width: 23, height: 18, seed: 1 });
    expect(grid.tiles).toHaveLength(23 * 18);
  });
});

// Référence non utilisée mais volontairement importée : si le type `InputCommand`
// disparaissait de l'API publique, ce fichier cesserait de compiler.
const _typeCheck: InputCommand = { moveX: 0, moveY: 0, aim: 0, fire: false, mine: false };
void _typeCheck;
