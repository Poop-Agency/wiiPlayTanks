import { describe, expect, test } from 'bun:test';

import { blocksShell, setTile, sweepBoxAgainstGrid } from '../src/core/grid.js';
import { TileKind } from '../src/core/state.js';
import type { InputCommand, Shell, Tank, World } from '../src/core/state.js';
import { TICK_RATE, tick } from '../src/core/tick.js';
import type { TickInputs } from '../src/core/tick.js';
import { fireShell, shellSpeed } from '../src/core/systems/shells.js';
import { REFERENCE_MEASUREMENTS, TILE_SIZE_PX, TUNING } from '../src/core/tuning.js';
import { allocateEntityId, createTank, createWorld, hashWorld } from '../src/core/world.js';

function openWorld(width = 40, height = 30): World {
  return createWorld({ width, height, seed: 1 });
}

/**
 * Tank piloté par un joueur.
 *
 * `playerId` est explicite : un tank sans joueur est repris par l'IA, qui
 * l'enverrait esquiver les obus qu'on lui tire dessus — ce qui n'est pas ce
 * qu'on veut mesurer ici.
 */
function addTank(world: World, x: number, y: number, turretAngle = 0): Tank {
  const tank = createTank(world, { color: 'player', playerId: 'p1', x, y, angle: turretAngle });
  tank.bodyAngle = 0;
  return tank;
}

/** Pose un obus directement, sans passer par un tank — pour tester la trajectoire seule. */
function addShell(world: World, options: Partial<Shell> & { x: number; y: number }): Shell {
  const shell: Shell = {
    id: allocateEntityId(world),
    ownerId: -1,
    kind: 'normal',
    vx: 0,
    vy: 0,
    bouncesLeft: 1,
    armed: true,
    ...options,
  };
  world.shells.push(shell);
  return shell;
}

function input(overrides: Partial<InputCommand> = {}): InputCommand {
  return { moveX: 0, moveY: 0, aim: 0, fire: false, mine: false, ...overrides };
}

const NO_INPUTS: TickInputs = [];

function advance(world: World, ticks: number, inputs: TickInputs = NO_INPUTS): void {
  for (let i = 0; i < ticks; i++) tick(world, inputs);
}

describe('vitesse des obus — conformité à la mesure de référence', () => {
  test('un obus normal traverse l\'arène de référence dans le temps mesuré', () => {
    // Fait observable relevé sur le jeu original : un obus parcourt 736 px en 4 s.
    const distanceTiles = REFERENCE_MEASUREMENTS.arenaWidthPx / TILE_SIZE_PX;
    const expectedTicks = REFERENCE_MEASUREMENTS.shellCrossingSeconds * TICK_RATE;

    const world = openWorld(Math.ceil(distanceTiles) + 8, 10);
    const shell = addShell(world, {
      x: 2,
      y: 5,
      vx: shellSpeed('normal'),
      // Beaucoup de rebonds : on mesure la distance parcourue, pas la survie.
      bouncesLeft: 999,
    });
    const startX = shell.x;

    let ticks = 0;
    while (shell.x - startX < distanceTiles && ticks < expectedTicks * 3) {
      advance(world, 1);
      ticks++;
    }

    expect(Math.abs(ticks - expectedTicks)).toBeLessThanOrEqual(1);
  });

  test('un missile va exactement deux fois plus vite', () => {
    expect(shellSpeed('fast')).toBeCloseTo(shellSpeed('normal') * 2, 9);
  });
});

describe('rebonds', () => {
  test('un obus à 30° sur un mur horizontal repart à -30°, module conservé', () => {
    const world = openWorld(30, 20);
    for (let x = 1; x < 29; x++) setTile(world.grid, x, 10, TileKind.Indestructible);

    const angle = Math.PI / 6;
    const speed = shellSpeed('normal');
    const shell = addShell(world, {
      x: 15,
      y: 8,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });

    advance(world, 120);

    expect(world.shells).toHaveLength(1);
    // Composante horizontale inchangée, verticale inversée.
    expect(shell.vx).toBeCloseTo(Math.cos(angle) * speed, 9);
    expect(shell.vy).toBeCloseTo(-Math.sin(angle) * speed, 9);
    // Le module est conservé : un rebond ne freine pas.
    expect(Math.hypot(shell.vx, shell.vy)).toBeCloseTo(speed, 9);
  });

  test('un obus vertical sur un mur horizontal repart exactement à l\'opposé', () => {
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) setTile(world.grid, x, 10, TileKind.Indestructible);

    const speed = shellSpeed('normal');
    const shell = addShell(world, { x: 5.5, y: 5, vy: speed, bouncesLeft: 1 });

    advance(world, 120);

    expect(shell.vy).toBeCloseTo(-speed, 9);
    expect(shell.vx).toBeCloseTo(0, 9);
  });

  test('à 45° contre un mur plat, seule la composante perpendiculaire s\'inverse', () => {
    // Non-régression d'un bug d'arêtes internes. Chaque tuile étant testée
    // isolément, la face gauche de la tuile voisine — enfouie dans le mur, donc
    // inexistante — était traitée comme une vraie surface. À 45°, elle est
    // atteinte exactement en même temps que la face supérieure : les deux
    // normales se cumulaient et l'obus repartait d'où il venait.
    //
    // Le symptôme ne se manifeste qu'aux angles où les deux entrées coïncident,
    // ce qui le rend indétectable avec des tirs à 30° ou perpendiculaires.
    const world = openWorld(24, 14);
    const speed = shellSpeed('normal');

    const shell = addShell(world, {
      x: 2.5,
      y: 11.5,
      vx: speed * Math.SQRT1_2,
      vy: -speed * Math.SQRT1_2,
      bouncesLeft: 5,
    });

    // Jusqu'au premier contact avec la bordure supérieure.
    while (world.shells.length > 0 && shell.vy < 0) advance(world, 1);

    expect(world.shells).toHaveLength(1);
    // La composante horizontale doit être intacte : l'obus continue vers la
    // droite. Si elle s'était inversée, il reviendrait sur ses pas.
    expect(shell.vx).toBeCloseTo(speed * Math.SQRT1_2, 6);
    expect(shell.vy).toBeCloseTo(speed * Math.SQRT1_2, 6);
  });

  test('à 45° dans chaque coin, l\'obus longe le billard sans revenir sur ses pas', () => {
    // Les quatre diagonales contre les quatre bordures, pour couvrir les
    // combinaisons de signes du masquage d'arêtes.
    const speed = shellSpeed('normal');

    for (const [dirX, dirY] of [
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      // Point de départ volontairement asymétrique : depuis le centre, les
      // distances aux quatre bordures seraient égales et l'obus atteindrait
      // deux murs au même instant — un vrai coin, où l'inversion des deux
      // composantes est le comportement attendu (cas couvert par le test
      // suivant).
      const world = openWorld(20, 20);
      const shell = addShell(world, {
        x: 6.5,
        y: 11.5,
        vx: dirX * speed * Math.SQRT1_2,
        vy: dirY * speed * Math.SQRT1_2,
        bouncesLeft: 3,
      });

      const initialVx = shell.vx;
      const initialVy = shell.vy;

      while (world.shells.length > 0 && shell.vx === initialVx && shell.vy === initialVy) {
        advance(world, 1);
      }

      expect(world.shells).toHaveLength(1);
      // Exactement une composante a changé de signe, jamais les deux.
      const flippedX = shell.vx !== initialVx;
      const flippedY = shell.vy !== initialVy;
      expect(flippedX !== flippedY).toBe(true);
    }
  });

  test('un angle rentrant inverse les deux composantes', () => {
    // Deux murs perpendiculaires touchés au même instant : l'obus doit repartir
    // d'où il vient. Les traiter l'un après l'autre le renverrait le long du mur.
    const world = openWorld(20, 20);
    for (let x = 10; x < 19; x++) setTile(world.grid, x, 10, TileKind.Indestructible);
    for (let y = 10; y < 19; y++) setTile(world.grid, 10, y, TileKind.Indestructible);

    const speed = shellSpeed('normal');
    const shell = addShell(world, {
      x: 8,
      y: 8,
      // Trajectoire à 45° visant exactement le sommet du coin en (10, 10).
      vx: speed * Math.SQRT1_2,
      vy: speed * Math.SQRT1_2,
      bouncesLeft: 5,
    });

    advance(world, 120);

    expect(shell.vx).toBeLessThan(0);
    expect(shell.vy).toBeLessThan(0);
  });

  test('un obus rebondit indéfiniment entre deux murs si son quota le permet', () => {
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) {
      setTile(world.grid, x, 5, TileKind.Indestructible);
      setTile(world.grid, x, 12, TileKind.Indestructible);
    }

    const shell = addShell(world, {
      x: 10.5,
      y: 8,
      vy: shellSpeed('normal'),
      bouncesLeft: 50,
    });

    advance(world, 600);

    expect(world.shells).toHaveLength(1);
    // Il est resté confiné entre les deux murs.
    expect(shell.y).toBeGreaterThan(5);
    expect(shell.y).toBeLessThan(13);
  });
});

describe('quota de rebonds', () => {
  /** Compte les pas avant disparition d'un obus tiré verticalement dans un couloir. */
  function ticksUntilGone(bounces: number, kind: 'normal' | 'fast' = 'normal'): number {
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) {
      setTile(world.grid, x, 5, TileKind.Indestructible);
      setTile(world.grid, x, 14, TileKind.Indestructible);
    }
    addShell(world, { x: 10.5, y: 9, vy: shellSpeed(kind), bouncesLeft: bounces, kind });

    let ticks = 0;
    while (world.shells.length > 0 && ticks < 5000) {
      advance(world, 1);
      ticks++;
    }
    return ticks;
  }

  test('un missile (0 rebond) explose au premier contact', () => {
    // Il ne doit jamais faire demi-tour : la distance parcourue reste celle
    // d'un aller simple.
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) setTile(world.grid, x, 14, TileKind.Indestructible);
    addShell(world, { x: 10.5, y: 9, vy: shellSpeed('fast'), bouncesLeft: 0, kind: 'fast' });

    let maxY = 0;
    while (world.shells.length > 0) {
      advance(world, 1);
      const shell = world.shells[0];
      if (shell) maxY = Math.max(maxY, shell.y);
    }

    expect(maxY).toBeLessThan(14);
  });

  test('plus le quota est élevé, plus l\'obus vit longtemps', () => {
    const zero = ticksUntilGone(0);
    const one = ticksUntilGone(1);
    const two = ticksUntilGone(2);

    expect(one).toBeGreaterThan(zero);
    expect(two).toBeGreaterThan(one);

    // Chaque rebond supplémentaire ajoute un aller-retour de longueur constante.
    expect(two - one).toBeCloseTo(one - zero, -1);
  });

  test('un obus normal survit à un rebond et meurt au second contact', () => {
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) {
      setTile(world.grid, x, 5, TileKind.Indestructible);
      setTile(world.grid, x, 14, TileKind.Indestructible);
    }
    const shell = addShell(world, { x: 10.5, y: 9, vy: shellSpeed('normal'), bouncesLeft: 1 });

    // Premier contact : il rebondit.
    while (world.shells.length > 0 && shell.vy > 0) advance(world, 1);
    expect(world.shells).toHaveLength(1);
    expect(shell.bouncesLeft).toBe(0);

    // Second contact : il disparaît.
    while (world.shells.length > 0) advance(world, 1);
    expect(world.shells).toHaveLength(0);
  });
});

describe('étanchéité — aucun obus ne traverse un mur', () => {
  test('balayage sur 360 angles contre un mur d\'une seule tuile d\'épaisseur', () => {
    // Un seul angle qui passerait rendrait le jeu injouable, et ce genre de
    // trou est indétectable à la main. On teste au double de la vitesse la plus
    // rapide du jeu, pour garder de la marge quand le panneau de calibration
    // (#10) permettra de l'augmenter.
    const speed = shellSpeed('fast') * 2;
    const escapes: number[] = [];

    for (let degrees = 0; degrees < 360; degrees++) {
      const radians = (degrees * Math.PI) / 180;
      const world = createWorld({ width: 9, height: 9, seed: 1 });

      addShell(world, {
        x: 4.5,
        y: 4.5,
        vx: Math.cos(radians) * speed,
        vy: Math.sin(radians) * speed,
        bouncesLeft: 200,
      });

      advance(world, 400);

      const shell = world.shells[0];
      if (!shell) continue; // détruit : acceptable, jamais échappé

      const inside = shell.x > 1 && shell.x < 8 && shell.y > 1 && shell.y < 8;
      if (!inside) escapes.push(degrees);
    }

    expect(escapes).toEqual([]);
  });

  test('un obus ne franchit pas un mur isolé au milieu de sa trajectoire', () => {
    const world = openWorld(30, 10);
    for (let y = 1; y < 9; y++) setTile(world.grid, 15, y, TileKind.Indestructible);

    const shell = addShell(world, {
      x: 5,
      y: 5,
      vx: shellSpeed('fast'),
      bouncesLeft: 1,
    });

    advance(world, 200);

    // Qu'il ait rebondi ou disparu, il n'a jamais dépassé le mur.
    if (world.shells.length > 0) expect(shell.x).toBeLessThan(15);
  });

  test('un obus survole un trou sans rebondir', () => {
    const world = openWorld(30, 10);
    for (let y = 1; y < 9; y++) setTile(world.grid, 15, y, TileKind.Hole);

    const shell = addShell(world, { x: 5, y: 5, vx: shellSpeed('normal'), bouncesLeft: 1 });
    advance(world, 200);

    expect(shell.x).toBeGreaterThan(15);
    expect(shell.vx).toBeGreaterThan(0);
  });
});

describe('balayage — cas de base', () => {
  test('aucun impact signalé sur un trajet libre', () => {
    const world = openWorld(10, 10);
    expect(sweepBoxAgainstGrid(world.grid, 5, 5, 0.1, 0.2, 0, blocksShell)).toBeNull();
  });

  test('l\'instant d\'impact correspond à la distance restante', () => {
    const world = openWorld(10, 10);
    setTile(world.grid, 7, 5, TileKind.Indestructible);

    // Depuis x = 5 avec un rayon de 0,1, la face de la tuile est à 6,9 : il
    // reste 1,9 à parcourir sur un déplacement de 3,8, soit la moitié.
    const hit = sweepBoxAgainstGrid(world.grid, 5, 5.5, 0.1, 3.8, 0, blocksShell);

    expect(hit).not.toBeNull();
    expect(hit!.time).toBeCloseTo(0.5, 6);
    expect(hit!.normalX).toBe(-1);
    expect(hit!.normalY).toBe(0);
  });

  test('un déplacement nul ne produit aucun impact', () => {
    const world = openWorld(10, 10);
    expect(sweepBoxAgainstGrid(world.grid, 5, 5, 0.1, 0, 0, blocksShell)).toBeNull();
  });
});

describe('tir', () => {
  test('le tir respecte le quota d\'obus simultanés', () => {
    const world = openWorld(40, 30);
    const tank = addTank(world, 20, 15);

    for (let i = 0; i < TUNING.tank.maxActiveShells + 3; i++) {
      tank.reloadTicks = 0;
      fireShell(world, tank);
    }

    expect(world.shells).toHaveLength(TUNING.tank.maxActiveShells);
    expect(tank.activeShells).toBe(TUNING.tank.maxActiveShells);
  });

  test('le quota est rendu quand un obus disparaît', () => {
    const world = openWorld(12, 12);
    const tank = addTank(world, 6, 6);

    fireShell(world, tank);
    expect(tank.activeShells).toBe(1);

    // L'obus finit par heurter la bordure deux fois et disparaître.
    advance(world, 600);

    expect(world.shells).toHaveLength(0);
    expect(tank.activeShells).toBe(0);
  });

  test('le rechargement impose un délai entre deux tirs', () => {
    const world = openWorld(40, 30);
    const tank = addTank(world, 20, 15);

    expect(fireShell(world, tank)).not.toBeNull();
    expect(fireShell(world, tank)).toBeNull();

    advance(world, tank.reloadTicks + 1);
    expect(fireShell(world, tank)).not.toBeNull();
  });

  test('un tank mort ne tire pas', () => {
    const world = openWorld(40, 30);
    const tank = addTank(world, 20, 15);
    tank.alive = false;

    expect(fireShell(world, tank)).toBeNull();
  });

  test('l\'obus part dans la direction de la tourelle, pas du châssis', () => {
    const world = openWorld(40, 30);
    const tank = addTank(world, 20, 15, Math.PI / 2);
    tank.bodyAngle = 0;

    const shell = fireShell(world, tank);

    expect(shell).not.toBeNull();
    expect(shell!.vy).toBeGreaterThan(0);
    expect(Math.abs(shell!.vx)).toBeLessThan(1e-9);
  });

  test('canon collé contre un mur, l\'obus ne naît pas dans le mur', () => {
    const world = openWorld(20, 20);
    for (let y = 1; y < 19; y++) setTile(world.grid, 10, y, TileKind.Indestructible);

    // Tank plaqué contre le mur, canon pointé dedans.
    const tank = addTank(world, 10 - TUNING.tank.sizeTiles / 2 - 0.01, 10, 0);
    const shell = fireShell(world, tank);

    expect(shell).not.toBeNull();
    expect(shell!.x).toBeLessThan(10);

    // Et il ne traverse pas non plus au pas suivant.
    advance(world, 5);
    const survivor = world.shells[0];
    if (survivor) expect(survivor.x).toBeLessThan(10);
  });

  test('la touche de tir déclenche le tir via le cycle normal', () => {
    const world = openWorld(40, 30);
    const tank = addTank(world, 20, 15);

    advance(world, 1, [[tank.id, input({ fire: true })]]);

    expect(world.shells).toHaveLength(1);
  });
});

describe('impacts', () => {
  test('un obus tue un tank en un seul coup', () => {
    const world = openWorld(40, 20);
    const target = addTank(world, 20, 10);
    addShell(world, { x: 15, y: 10, vx: shellSpeed('normal') });

    advance(world, 120);

    expect(target.alive).toBe(false);
    expect(world.shells).toHaveLength(0);
  });

  test('un obus ne tue pas son tireur à la sortie du canon', () => {
    const world = openWorld(40, 30);
    const tank = addTank(world, 20, 15);

    fireShell(world, tank);
    advance(world, 3);

    expect(tank.alive).toBe(true);
  });

  test('on peut se tuer soi-même avec son propre ricochet', () => {
    // Le comportement signature du jeu : l'obus reste mortel pour son tireur
    // une fois qu'il a quitté le canon.
    const world = openWorld(20, 20);
    for (let x = 1; x < 19; x++) setTile(world.grid, x, 5, TileKind.Indestructible);

    // Tank visant le mur droit au-dessus de lui.
    const tank = addTank(world, 10.5, 10, -Math.PI / 2);
    fireShell(world, tank);

    advance(world, 300);

    expect(tank.alive).toBe(false);
  });

  test('deux obus qui se croisent s\'annulent', () => {
    const world = openWorld(40, 20);
    const speed = shellSpeed('normal');

    addShell(world, { x: 15, y: 10, vx: speed });
    addShell(world, { x: 25, y: 10, vx: -speed });

    advance(world, 120);

    expect(world.shells).toHaveLength(0);
  });

  test('un obus ne touche pas un tank déjà détruit', () => {
    const world = openWorld(40, 20);
    const target = addTank(world, 20, 10);
    target.alive = false;

    const shell = addShell(world, { x: 15, y: 10, vx: shellSpeed('normal'), bouncesLeft: 5 });
    // Assez de temps pour dépasser la cible quelle que soit la vitesse : celle-ci
    // se déduit de la largeur du plateau, qui a déjà changé une fois.
    advance(world, 90);

    // Il a traversé sans être consommé.
    expect(world.shells).toHaveLength(1);
    expect(shell.x).toBeGreaterThan(20);
  });

  test('la zone de touche épouse la boîte du tank, pas un cercle circonscrit', () => {
    // L'ancienne version comparait la distance entre centres à un rayon déduit
    // de max(largeur, hauteur), ce qui rendait les tanks touchables bien
    // au-delà de leurs coins.
    const world = openWorld(40, 20);
    const target = addTank(world, 20, 10);

    // Passe au ras du coin, en dehors de la boîte.
    const clearance = TUNING.tank.sizeTiles / 2 + TUNING.shell.radiusTiles + 0.02;
    addShell(world, { x: 15, y: 10 + clearance, vx: shellSpeed('normal'), bouncesLeft: 5 });

    advance(world, 60);

    expect(target.alive).toBe(true);
  });
});

describe('robustesse du parcours', () => {
  test('la disparition simultanée de plusieurs obus n\'en fait sauter aucun', () => {
    // Le bug le plus insidieux de l'ancienne boucle : `splice` pendant un
    // `forEach` décalait les indices, donc l'obus suivant n'était ni déplacé ni
    // testé pour ce pas.
    const world = openWorld(60, 20);
    const speed = shellSpeed('normal');

    // Cinq paires frontales, qui s'annuleront toutes au même pas.
    for (let pair = 0; pair < 5; pair++) {
      const y = 3 + pair * 3;
      addShell(world, { x: 29, y, vx: speed });
      addShell(world, { x: 31, y, vx: -speed });
    }
    // Plus un obus isolé, qui doit survivre et avoir avancé normalement.
    const survivor = addShell(world, { x: 5, y: 18, vx: speed, bouncesLeft: 9 });
    const startX = survivor.x;

    advance(world, 30);

    expect(world.shells).toHaveLength(1);
    expect(world.shells[0]!.id).toBe(survivor.id);
    expect(survivor.x - startX).toBeCloseTo((speed * 30) / TICK_RATE, 6);
  });

  test('la trajectoire est déterministe', () => {
    const build = (): World => {
      const world = openWorld(20, 20);
      for (let x = 1; x < 19; x++) setTile(world.grid, x, 5, TileKind.Indestructible);
      for (let y = 1; y < 19; y++) setTile(world.grid, 14, y, TileKind.Indestructible);

      const speed = shellSpeed('normal');
      addShell(world, {
        x: 8,
        y: 10,
        vx: speed * 0.8,
        vy: -speed * 0.6,
        bouncesLeft: 20,
      });
      return world;
    };

    const a = build();
    const b = build();
    advance(a, 900);
    advance(b, 900);

    expect(hashWorld(a)).toBe(hashWorld(b));
  });
});
