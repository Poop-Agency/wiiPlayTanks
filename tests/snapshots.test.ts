import { describe, expect, test } from 'bun:test';

import { normalizeAngle } from '../src/core/math.js';
import { captureSnapshot, interpolateSnapshots } from '../src/client/render/snapshots.js';
import type { RenderSnapshot } from '../src/client/render/snapshots.js';
import type { World } from '../src/core/state.js';
import { createTank, createWorld } from '../src/core/world.js';

/**
 * L'interpolation existe parce que la simulation avance à 60 Hz alors que
 * l'écran peut rafraîchir à 144 : dessiner directement le dernier état simulé
 * produirait des saccades visibles.
 */

function worldWithTank(x: number, y: number, angles = { body: 0, turret: 0 }): World {
  const world = createWorld({ width: 10, height: 10, seed: 1 });
  const tank = createTank(world, { color: 'player', playerId: 'p1', x, y });
  tank.bodyAngle = angles.body;
  tank.turretAngle = angles.turret;
  return world;
}

describe('capture', () => {
  test("l'instantané ne retient que ce qui sert au rendu", () => {
    const snapshot = captureSnapshot(worldWithTank(2, 3));
    const tank = snapshot.tanks[0]!;

    expect(Object.keys(tank).sort()).toEqual([
      'alive',
      'bodyAngle',
      'color',
      'id',
      'turretAngle',
      'visible',
      'x',
      'y',
    ]);
  });

  test("l'instantané est détaché du monde", () => {
    // Sinon le rendu observerait l'état en cours de modification, et
    // l'interpolation comparerait un état à lui-même.
    const world = worldWithTank(2, 3);
    const snapshot = captureSnapshot(world);

    world.tanks[0]!.x = 99;
    expect(snapshot.tanks[0]!.x).toBe(2);
  });
});

describe('interpolation', () => {
  const previous = captureSnapshot(worldWithTank(0, 0));
  const current = captureSnapshot(worldWithTank(4, 8));

  test('alpha 0 rend l\'état précédent, alpha 1 le courant', () => {
    expect(interpolateSnapshots(previous, current, 0).tanks[0]!.x).toBeCloseTo(0, 9);
    expect(interpolateSnapshots(previous, current, 1).tanks[0]!.x).toBeCloseTo(4, 9);
  });

  test('alpha intermédiaire place le tank entre les deux', () => {
    const view = interpolateSnapshots(previous, current, 0.25).tanks[0]!;
    expect(view.x).toBeCloseTo(1, 9);
    expect(view.y).toBeCloseTo(2, 9);
  });

  test('les angles passent par le chemin le plus court', () => {
    // De 179° à -179° : 2° de rotation, pas 358°. Sans ça, la tourelle
    // traverserait tout le cadran à l'écran sur un simple franchissement.
    const from = captureSnapshot(worldWithTank(0, 0, { body: 0, turret: (179 * Math.PI) / 180 }));
    const to = captureSnapshot(worldWithTank(0, 0, { body: 0, turret: (-179 * Math.PI) / 180 }));

    const midway = interpolateSnapshots(from, to, 0.5).tanks[0]!.turretAngle;

    // Le milieu du chemin court est à 180°, soit ±π une fois normalisé.
    expect(Math.abs(normalizeAngle(midway))).toBeCloseTo(Math.PI, 6);
  });

  test('une entité qui vient d\'apparaître est prise telle quelle', () => {
    // La faire glisser depuis une position d'origine inventée produirait un
    // fantôme traversant l'écran au moment du spawn.
    const empty: RenderSnapshot = { tick: 0, tanks: [], shells: [], mines: [], explosions: [] };
    const view = interpolateSnapshots(empty, current, 0.5).tanks[0]!;

    expect(view.x).toBe(4);
    expect(view.y).toBe(8);
  });

  test('l\'instantané courant n\'est pas modifié par l\'interpolation', () => {
    interpolateSnapshots(previous, current, 0.5);
    expect(current.tanks[0]!.x).toBe(4);
  });
});
