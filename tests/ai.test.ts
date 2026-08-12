import { describe, expect, test } from 'bun:test';

import { setTile } from '../src/core/grid.js';
import { TileKind } from '../src/core/state.js';
import type { Tank, TankColor, World } from '../src/core/state.js';
import { TICK_RATE, tick } from '../src/core/tick.js';
import { findFiringSolution, pathReaches, traceShellPath } from '../src/core/systems/ai/aiming.js';
import { TANK_PROFILES, profileOf } from '../src/core/systems/ai/profiles.js';
import { findEvasion } from '../src/core/systems/ai/threat.js';
import { TUNING } from '../src/core/tuning.js';
import { allocateEntityId, createTank, createWorld, hashWorld } from '../src/core/world.js';

/**
 * La visée avec rebonds est la mécanique signature du jeu : un ennemi vous
 * atteint **derrière un mur**. L'ancienne version visait en ligne droite avec
 * du bruit aléatoire, ce qui rendait tout ennemi masqué parfaitement inoffensif.
 */

function openWorld(width = 30, height = 20): World {
  return createWorld({ width, height, seed: 1 });
}

function addPlayer(world: World, x: number, y: number): Tank {
  return createTank(world, { color: 'player', playerId: 'p1', x, y });
}

function addEnemy(world: World, color: TankColor, x: number, y: number): Tank {
  return createTank(world, { color, x, y });
}

function advance(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) tick(world, []);
}

/** Mur vertical complet, avec une ouverture optionnelle. */
function verticalWall(world: World, x: number, fromY: number, toY: number): void {
  for (let y = fromY; y <= toY; y++) setTile(world.grid, x, y, TileKind.Indestructible);
}

describe('profils — conformité aux relevés', () => {
  test('les neuf couleurs et le joueur sont définis', () => {
    const colors: TankColor[] = [
      'player',
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

    for (const color of colors) {
      expect(TANK_PROFILES[color]).toBeDefined();
    }
  });

  test('les multiplicateurs de vitesse correspondent aux valeurs relevées', () => {
    // Relevés sur le jeu original — voir docs/provenance.md.
    expect(profileOf('brown').speedMultiplier).toBe(0);
    expect(profileOf('green').speedMultiplier).toBe(0);
    expect(profileOf('ash').speedMultiplier).toBe(0.5);
    expect(profileOf('teal').speedMultiplier).toBe(0.5);
    expect(profileOf('pink').speedMultiplier).toBe(1);
    expect(profileOf('white').speedMultiplier).toBe(1);
    expect(profileOf('yellow').speedMultiplier).toBe(1.5);
    expect(profileOf('purple').speedMultiplier).toBe(1.5);
    expect(profileOf('black').speedMultiplier).toBe(2);
  });

  test('les armements correspondent aux valeurs relevées', () => {
    // Relevés sur le jeu original : obus simultanés, ricochets, vitesse.
    const expected: Partial<Record<TankColor, [shells: number, bounces: number, fast: boolean]>> = {
      brown: [1, 1, false],
      ash: [1, 1, false],
      teal: [1, 0, true],
      yellow: [1, 1, false],
      pink: [3, 1, false],
      green: [2, 2, true],
      purple: [5, 1, false],
      white: [5, 1, false],
      black: [3, 0, true],
    };

    for (const [color, [shells, bounces, fast]] of Object.entries(expected)) {
      const profile = profileOf(color as TankColor);
      expect(profile.maxActiveShells).toBe(shells);
      expect(profile.shellBounces).toBe(bounces);
      expect(profile.shellKind).toBe(fast ? 'fast' : 'normal');
    }
  });

  test('la tourelle du joueur suit le pointeur sans inertie', () => {
    expect(profileOf('player').turretRateRadiansPerSecond).toBe(Number.POSITIVE_INFINITY);
  });

  test('les tourelles ennemies tournent à vitesse finie et ordonnée', () => {
    // Le brun est le plus lent, le noir le plus rapide — comme dans les relevés.
    const brown = profileOf('brown').turretRateRadiansPerSecond;
    const black = profileOf('black').turretRateRadiansPerSecond;

    expect(brown).toBeGreaterThan(0);
    expect(Number.isFinite(black)).toBe(true);
    expect(black).toBeGreaterThan(brown);
  });

  test('seul le tank blanc est invisible', () => {
    const invisible = Object.entries(TANK_PROFILES)
      .filter(([, profile]) => profile.invisible)
      .map(([color]) => color);

    expect(invisible).toEqual(['white']);
  });

  test('un missile ne planifie jamais de rebond', () => {
    // Chercher un angle à rebonds pour un projectile qui n'en fait aucun
    // n'aurait aucun sens.
    for (const color of ['teal', 'black'] as const) {
      const profile = profileOf(color);
      expect(profile.shellBounces).toBe(0);
      expect(profile.plannedBounces).toBe(0);
    }
  });
});

describe('tracé de trajectoire', () => {
  test('sans obstacle, la trajectoire est un seul segment', () => {
    const world = openWorld(40, 40);
    const path = traceShellPath(world.grid, 20, 20, 0, 1, 10);

    expect(path).toHaveLength(1);
    expect(path[0]!.x1).toBeCloseTo(30, 6);
  });

  test('un rebond produit deux segments et inverse la direction', () => {
    const world = openWorld(20, 20);
    const path = traceShellPath(world.grid, 10, 10, 0, 1);

    expect(path).toHaveLength(2);
    // Le premier segment va vers la droite, le second revient.
    expect(path[0]!.x1).toBeGreaterThan(path[0]!.x0);
    expect(path[1]!.x1).toBeLessThan(path[1]!.x0);
  });

  test('le nombre de segments ne dépasse jamais le quota de rebonds', () => {
    const world = openWorld(20, 20);
    expect(traceShellPath(world.grid, 10, 10, 0.7, 0).length).toBeLessThanOrEqual(1);
    expect(traceShellPath(world.grid, 10, 10, 0.7, 2).length).toBeLessThanOrEqual(3);
  });

  test('un point sur le trajet est détecté, un point à côté ne l\'est pas', () => {
    const path = [{ x0: 0, y0: 0, x1: 10, y1: 0 }];

    expect(pathReaches(path, 5, 0.1, 0.5)).toBeCloseTo(5, 6);
    expect(pathReaches(path, 5, 3, 0.5)).toBeNull();
  });
});

describe('recherche d\'angle de tir', () => {
  const hitRadius = TUNING.tank.sizeTiles / 2;

  test('en vue directe, l\'angle trouvé pointe vers la cible', () => {
    const world = openWorld(30, 20);
    const angle = findFiringSolution(world.grid, 5, 10, 20, 10, {
      bounces: 1,
      avoid: [],
      hitRadius,
    });

    expect(angle).not.toBeNull();
    expect(Math.abs(angle!)).toBeLessThan(0.05);
  });

  test('derrière un mur, une solution à un rebond est trouvée', () => {
    // Mur partiel : il masque la ligne droite mais laisse un passage par le
    // haut, atteignable en rebondissant sur la bordure.
    const world = openWorld(30, 20);
    verticalWall(world.grid ? world : world, 15, 6, 19);

    const angle = findFiringSolution(world.grid, 8, 12, 22, 12, {
      bounces: 1,
      avoid: [],
      hitRadius,
    });

    expect(angle).not.toBeNull();

    // Et la trajectoire trouvée atteint bien la cible.
    const path = traceShellPath(world.grid, 8, 12, angle!, 1);
    expect(pathReaches(path, 22, 12, hitRadius)).not.toBeNull();
  });

  test('sans rebond autorisé, aucune solution derrière un mur', () => {
    const world = openWorld(30, 20);
    verticalWall(world, 15, 1, 18);

    const angle = findFiringSolution(world.grid, 8, 10, 22, 10, {
      bounces: 0,
      avoid: [],
      hitRadius,
    });

    expect(angle).toBeNull();
  });

  test('le tireur ne se disqualifie pas lui-même à la sortie du canon', () => {
    // Le tireur figure toujours dans sa propre liste d'évitement. Sans marge au
    // départ, chaque tir serait rejeté au motif qu'il passe sur le tireur —
    // c'est-à-dire au moment où il quitte son canon.
    const world = openWorld(30, 20);

    const angle = findFiringSolution(world.grid, 5, 10, 25, 10, {
      bounces: 0,
      avoid: [{ x: 5, y: 10 }],
      hitRadius,
    });

    expect(angle).not.toBeNull();
  });

  test('une trajectoire qui repasse sur le tireur plus loin est écartée', () => {
    // Le cas que la marge de sortie ne doit pas masquer : l'obus revient sur
    // son tireur après avoir parcouru du chemin. Sans ce contrôle, les profils
    // à deux rebonds se suicideraient en boucle.
    const world = openWorld(30, 20);

    // Tir vers la droite, la cible est au-delà du mur du fond : la seule
    // trajectoire possible rebondit et revient droit sur le point de départ.
    const shooter = { x: 5, y: 10 };
    const angle = findFiringSolution(world.grid, shooter.x, shooter.y, 28.5, 10, {
      bounces: 2,
      avoid: [shooter],
      hitRadius,
    });

    if (angle !== null) {
      // Si une solution est retenue, elle ne doit pas repasser sur le tireur
      // avant d'atteindre la cible.
      const path = traceShellPath(world.grid, shooter.x, shooter.y, angle, 2);
      const backOnShooter = pathReaches(
        path,
        shooter.x,
        shooter.y,
        hitRadius,
        TUNING.tank.sizeTiles,
      );
      const onTarget = pathReaches(path, 28.5, 10, hitRadius);

      expect(backOnShooter === null || backOnShooter > onTarget!).toBe(true);
    }
  });

  test('un allié sur la trajectoire écarte la solution', () => {
    const world = openWorld(30, 20);

    const withoutAlly = findFiringSolution(world.grid, 5, 10, 25, 10, {
      bounces: 0,
      avoid: [],
      hitRadius,
    });
    expect(withoutAlly).not.toBeNull();

    const withAlly = findFiringSolution(world.grid, 5, 10, 25, 10, {
      bounces: 0,
      avoid: [{ x: 15, y: 10 }],
      hitRadius,
    });
    expect(withAlly).toBeNull();
  });
});

describe('comportement en jeu', () => {
  test('un tank brun oriente sa tourelle et tire vers le joueur', () => {
    // On vérifie le mécanisme, pas la chance : le brun a le plus large cône
    // d'erreur du jeu (0,8 rad) et la cadence la plus lente, si bien qu'il rate
    // souvent. Ce qui doit être garanti, c'est qu'il vise et qu'il tire.
    const world = openWorld(30, 20);
    const player = addPlayer(world, 14, 10);
    const brown = addEnemy(world, 'brown', 20, 10);

    let fired = 0;
    let towardsPlayer = 0;

    for (let i = 0; i < 40 * TICK_RATE; i++) {
      const before = world.shells.length;
      tick(world, []);
      if (world.shells.length > before) {
        fired++;
        const shell = world.shells[world.shells.length - 1]!;
        // Le joueur est à gauche : un tir sensé part vers la gauche.
        if (shell.vx < 0) towardsPlayer++;
      }
    }

    expect(fired).toBeGreaterThan(0);
    expect(towardsPlayer).toBe(fired);
    // La tourelle a bien pivoté depuis son orientation initiale (vers la droite).
    expect(Math.abs(brown.turretAngle)).toBeGreaterThan(2);
  });

  test('un tank vert touche un joueur masqué par un mur', () => {
    // Le comportement signature du jeu, et ce qui manquait entièrement à
    // l'ancienne version : le vert est immobile, mais c'est le tireur d'élite —
    // missiles à deux rebonds et cône d'erreur de 0,05 rad. Aucune ligne droite
    // ne relie les deux tanks ; la seule façon de toucher est de ricocher.
    const world = openWorld(30, 20);
    verticalWall(world, 15, 7, 12);

    const player = addPlayer(world, 8, 10);
    // Placé dans la portée de détection du profil (12,5 tuiles).
    addEnemy(world, 'green', 19, 10);

    // Ligne de vue directe effectivement coupée.
    expect(
      findFiringSolution(world.grid, 19, 10, player.x, player.y, {
        bounces: 0,
        avoid: [],
        hitRadius: TUNING.tank.sizeTiles / 2,
      }),
    ).toBeNull();

    advance(world, 30 * TICK_RATE);

    expect(player.alive).toBe(false);
  });

  test('un ennemi ne se tue pas avec son propre tir', () => {
    // Deux profils à rebonds, longuement laissés à eux-mêmes dans un espace
    // clos : aucun ne doit finir par s'auto-détruire.
    for (const color of ['green', 'ash'] as const) {
      const world = openWorld(16, 12);
      addPlayer(world, 3, 6);
      const enemy = addEnemy(world, color, 12, 6);

      advance(world, 40 * TICK_RATE);

      expect(enemy.alive).toBe(true);
    }
  });

  test('les tanks immobiles ne bougent jamais', () => {
    const world = openWorld(30, 20);
    addPlayer(world, 5, 10);

    const brown = addEnemy(world, 'brown', 20, 10);
    const green = addEnemy(world, 'green', 20, 15);
    const origins = [
      { x: brown.x, y: brown.y },
      { x: green.x, y: green.y },
    ];

    advance(world, 20 * TICK_RATE);

    expect({ x: brown.x, y: brown.y }).toEqual(origins[0]!);
    expect({ x: green.x, y: green.y }).toEqual(origins[1]!);
  });

  test('un tank mobile se déplace', () => {
    const world = openWorld(40, 30);
    addPlayer(world, 5, 15);
    const purple = addEnemy(world, 'purple', 30, 15);
    const start = { x: purple.x, y: purple.y };

    advance(world, 5 * TICK_RATE);

    expect(Math.hypot(purple.x - start.x, purple.y - start.y)).toBeGreaterThan(1);
  });

  test('les tanks de l\'IA ne se tirent pas dessus entre eux', () => {
    const world = openWorld(30, 20);
    // Pas de joueur du tout : sans cible, personne ne doit ouvrir le feu.
    const first = addEnemy(world, 'purple', 10, 10);
    const second = addEnemy(world, 'pink', 20, 10);

    advance(world, 20 * TICK_RATE);

    expect(first.alive).toBe(true);
    expect(second.alive).toBe(true);
    expect(world.shells).toHaveLength(0);
  });

  test('un ennemi hors de portée ne réagit pas', () => {
    const world = openWorld(60, 20);
    const brown = addEnemy(world, 'brown', 55, 10);
    // Très au-delà de la portée de détection du profil.
    addPlayer(world, 3, 10);

    advance(world, 10 * TICK_RATE);

    expect(brown.ai!.solutionAngle).toBeNull();
    expect(world.shells).toHaveLength(0);
  });

  test('respecte le quota d\'obus simultanés de son profil', () => {
    const world = openWorld(40, 30);
    addPlayer(world, 8, 15);
    const purple = addEnemy(world, 'purple', 30, 15);

    for (let i = 0; i < 20 * TICK_RATE; i++) {
      tick(world, []);
      expect(purple.activeShells).toBeLessThanOrEqual(profileOf('purple').maxActiveShells);
    }
  });
});

describe('esquive', () => {
  test('un obus qui arrive de face déclenche un écart perpendiculaire', () => {
    const world = openWorld();
    const tank = addPlayer(world, 20, 10);

    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: 15,
      y: 10,
      vx: 5,
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });

    const evasion = findEvasion(tank, world.shells);

    expect(evasion).not.toBeNull();
    // Perpendiculaire à un obus horizontal : uniquement vertical.
    expect(Math.abs(evasion!.x)).toBeLessThan(1e-9);
    expect(Math.abs(evasion!.y)).toBeCloseTo(1, 6);
  });

  test('un obus qui s\'éloigne ne déclenche rien', () => {
    const world = openWorld();
    const tank = addPlayer(world, 20, 10);

    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: 25,
      y: 10,
      vx: 5,
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });

    expect(findEvasion(tank, world.shells)).toBeNull();
  });

  test('un obus qui passe largement à côté ne déclenche rien', () => {
    const world = openWorld();
    const tank = addPlayer(world, 20, 10);

    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: 15,
      y: 16,
      vx: 5,
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });

    expect(findEvasion(tank, world.shells)).toBeNull();
  });

  test('un tank n\'esquive pas son propre obus', () => {
    const world = openWorld();
    const tank = addPlayer(world, 20, 10);

    world.shells.push({
      id: allocateEntityId(world),
      ownerId: tank.id,
      kind: 'normal',
      x: 15,
      y: 10,
      vx: 5,
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });

    expect(findEvasion(tank, world.shells)).toBeNull();
  });
});

describe('déterminisme de l\'IA', () => {
  test('une bataille rejouée depuis la même graine est identique', () => {
    // L'IA tire au sort ses directions de patrouille et son cône d'erreur.
    // Sans le PRNG du monde, chaque rejeu divergerait et la réconciliation
    // réseau (#13) serait impossible.
    const build = (): World => {
      const world = createWorld({ width: 30, height: 20, seed: 4242 });
      setTile(world.grid, 15, 9, TileKind.Indestructible);
      setTile(world.grid, 15, 10, TileKind.Indestructible);

      addPlayer(world, 6, 10);
      addEnemy(world, 'purple', 24, 6);
      addEnemy(world, 'green', 24, 14);
      addEnemy(world, 'yellow', 20, 10);
      return world;
    };

    const a = build();
    const b = build();
    advance(a, 20 * TICK_RATE);
    advance(b, 20 * TICK_RATE);

    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  test('la mémoire de l\'IA survit à un aller-retour de sérialisation', () => {
    const world = openWorld();
    addPlayer(world, 5, 10);
    addEnemy(world, 'purple', 20, 10);
    advance(world, 120);

    const revived = JSON.parse(JSON.stringify(world)) as World;
    expect(hashWorld(revived)).toBe(hashWorld(world));

    advance(world, 120);
    advance(revived, 120);
    expect(hashWorld(revived)).toBe(hashWorld(world));
  });
});
