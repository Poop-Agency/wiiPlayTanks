import { describe, expect, test } from 'bun:test';

import { setTile } from '../src/core/grid.js';
import { TileKind } from '../src/core/state.js';
import type { Tank, TankColor, World } from '../src/core/state.js';
import { TICK_RATE, tick } from '../src/core/tick.js';
import { findFiringSolution, pathReaches, traceShellPath } from '../src/core/systems/ai/aiming.js';
import { aimSpot } from '../src/core/systems/ai/brain.js';
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

  /* ── La fiche de référence, transcrite ────────────────────────────────────
   *
   * Une seule table, et c'est **elle** qui fait foi. Elle a remplacé les
   * valeurs de l'ancienne version, qui se présentaient comme des relevés du jeu
   * original sans qu'on puisse le vérifier — et qui la contredisaient sur six
   * couleurs. Voir `docs/provenance.md`.
   *
   * Tout est ici plutôt qu'éparpillé en assertions séparées : la fiche est un
   * document, elle se relit comme tel, et une valeur qui dérive doit sauter aux
   * yeux dans le diff.
   * ──────────────────────────────────────────────────────────────────────── */
  interface Sheet {
    vitesse: number;
    obus: number;
    rebonds: number;
    roquette: boolean;
    mines: number;
    /**
     * Anticipation d'esquive attendue.
     *
     * La fiche ne parle d'esquive que pour deux couleurs — « parfois » pour le
     * cendre, « activement » pour le noir. Les deux valeurs marquées ⚠ sont
     * déduites de leur description d'« IA avancée », pas relevées.
     */
    esquive: number;
  }

  const FICHE: Record<string, Sheet> = {
    //                vitesse  obus  rebonds  roquette  mines  esquive
    player: { vitesse: 1.0, obus: 5, rebonds: 1, roquette: false, mines: 2, esquive: 0 },
    brown: { vitesse: 0.0, obus: 1, rebonds: 1, roquette: false, mines: 0, esquive: 0 },
    ash: { vitesse: 0.7, obus: 1, rebonds: 1, roquette: false, mines: 0, esquive: 0.25 },
    teal: { vitesse: 0.7, obus: 1, rebonds: 0, roquette: true, mines: 0, esquive: 0 },
    yellow: { vitesse: 1.3, obus: 1, rebonds: 1, roquette: false, mines: 4, esquive: 0 },
    pink: { vitesse: 1.0, obus: 3, rebonds: 1, roquette: false, mines: 0, esquive: 0 },
    green: { vitesse: 0.0, obus: 2, rebonds: 2, roquette: true, mines: 0, esquive: 0 },
    purple: { vitesse: 1.3, obus: 5, rebonds: 1, roquette: false, mines: 2, esquive: 0.25 }, // ⚠
    white: { vitesse: 1.0, obus: 5, rebonds: 1, roquette: false, mines: 2, esquive: 0.6 }, // ⚠
    black: { vitesse: 1.7, obus: 2, rebonds: 0, roquette: true, mines: 2, esquive: 1 },
  };

  test.each(Object.entries(FICHE))('%s est conforme à la fiche', (color, fiche) => {
    const profile = profileOf(color as TankColor);

    expect(profile.speedMultiplier).toBe(fiche.vitesse);
    expect(profile.maxActiveShells).toBe(fiche.obus);
    expect(profile.shellBounces).toBe(fiche.rebonds);
    expect(profile.shellKind).toBe(fiche.roquette ? 'fast' : 'normal');
    expect(profile.maxActiveMines).toBe(fiche.mines);
    expect(profile.evasionSkill).toBe(fiche.esquive);
  });

  test('la moitié faible de la campagne n\'esquive pas', () => {
    // Le vrai sujet de ce test : l'esquive avait été ouverte à tous les tanks
    // mobiles, ce qui rendait le turquoise, le jaune et le rose bien plus durs
    // à toucher que dans l'original. Ce sont les couleurs des vingt premières
    // missions — celles où l'on apprend à jouer.
    for (const color of ['brown', 'teal', 'yellow', 'pink', 'green'] as const) {
      expect(profileOf(color).evasionSkill).toBe(0);
    }
  });

  test('le noir est le seul à esquiver pleinement', () => {
    const better = Object.entries(TANK_PROFILES)
      .filter(([color]) => color !== 'black')
      .filter(([, profile]) => profile.evasionSkill >= profileOf('black').evasionSkill);

    expect(better).toEqual([]);
    expect(profileOf('ash').evasionSkill).toBeGreaterThan(0);
  });

  test('le préavis d\'esquive n\'est pas un classement de dangerosité', () => {
    // Piège à relecture : `evasionSkill` est un **temps de réaction**, pas un
    // talent. Le violet est au même cran que le cendre alors qu'il est bien
    // plus dur à toucher — parce qu'il va deux fois plus vite et dégage le
    // couloir avec le même préavis. Le blanc est plus haut qu'eux deux parce
    // qu'il est plus lent que le violet, à armement identique.
    //
    // Mesuré, pas supposé : au-delà de 0,2 la courbe du violet est plate,
    // celle du blanc descend encore jusqu'à 0,6. Aligner les deux serait une
    // fausse symétrie.
    expect(profileOf('purple').evasionSkill).toBe(profileOf('ash').evasionSkill);
    expect(profileOf('white').evasionSkill).toBeGreaterThan(profileOf('purple').evasionSkill);
    expect(profileOf('white').speedMultiplier).toBeLessThan(profileOf('purple').speedMultiplier);
  });

  test('les mines de la fiche sont réellement posées', () => {
    // Le quota seul ne dit pas qui s'en sert : `mineIntervalSeconds` le dit.
    // Porter des mines et ne jamais les poser serait une capacité morte — ça a
    // été le cas du violet, du blanc et du noir jusqu'à cette passe.
    for (const [color, fiche] of Object.entries(FICHE)) {
      if (color === 'player') continue;
      expect(profileOf(color as TankColor).mineIntervalSeconds > 0).toBe(fiche.mines > 0);
    }
  });

  test('l\'ordre de dangerosité des vitesses est respecté', () => {
    // Ce qui compte pour le jeu n'est pas le chiffre exact mais le classement :
    // deux tourelles fixes, deux lents, le joueur et le blanc à sa vitesse, les
    // rapides au-dessus, et le noir seul en tête.
    const speed = (color: TankColor) => profileOf(color).speedMultiplier;

    expect(speed('brown')).toBe(speed('green'));
    expect(speed('ash')).toBe(speed('teal'));
    expect(speed('ash')).toBeLessThan(speed('player'));
    expect(speed('white')).toBe(speed('player'));
    expect(speed('yellow')).toBe(speed('purple'));
    expect(speed('purple')).toBeGreaterThan(speed('pink'));
    expect(speed('black')).toBeGreaterThan(speed('purple'));
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

  /** Nombre d'obus tirés pendant `seconds`, comptés au vol. */
  function countShots(world: World, seconds: number): number {
    let fired = 0;
    for (let i = 0; i < seconds * TICK_RATE; i++) {
      const before = world.shells.length;
      tick(world, []);
      if (world.shells.length > before) fired++;
    }
    return fired;
  }

  test('un ennemi tire de loin dès qu\'un angle s\'ouvre', () => {
    // La portée de détection ne conditionne pas le tir, seulement le
    // déplacement : un vert immobile à l'autre bout d'un couloir dégagé doit
    // ouvrir le feu. Rester muet parce que la cible est « trop loin » se lit
    // comme une panne, pas comme de la prudence.
    const world = openWorld(30, 20);
    // Vingt-trois tuiles, soit près du double de la portée de détection.
    addEnemy(world, 'green', 26, 10);
    addPlayer(world, 3, 10);

    expect(countShots(world, 15)).toBeGreaterThan(0);
  });

  test('le brun, lui, ne tire pas au-delà de sa portée', () => {
    // Seule exception, et volontaire : le brun est l'adversaire le plus faible
    // du jeu. Le laisser canarder d'un bord à l'autre de l'arène dès qu'une
    // ligne se dégage en faisait un tireur d'élite immobile.
    const range = profileOf('brown').firingRangeTiles;
    expect(range).toBeLessThan(Number.POSITIVE_INFINITY);

    const loin = openWorld(40, 20);
    addEnemy(loin, 'brown', 36, 10);
    addPlayer(loin, 3, 10);
    expect(countShots(loin, 20)).toBe(0);

    // À portée, en revanche, il tire — la limite est une portée, pas un mutisme.
    const pres = openWorld(40, 20);
    addEnemy(pres, 'brown', 3 + Math.floor(range) - 1, 10);
    addPlayer(pres, 3, 10);
    expect(countShots(pres, 20)).toBeGreaterThan(0);
  });

  test('le jaune tire peu et mine beaucoup', () => {
    // Sa force n'est pas son canon — un seul obus, comme le brun — mais sa
    // capacité à saturer une zone : quatre mines, le quota le plus élevé.
    const world = openWorld(30, 20);
    addPlayer(world, 6, 10);
    const yellow = addEnemy(world, 'yellow', 20, 10);
    const quota = profileOf('yellow').maxActiveMines;
    expect(quota).toBe(4);

    const laid = new Set<number>();

    for (let i = 0; i < 30 * TICK_RATE; i++) {
      tick(world, []);
      expect(yellow.activeMines).toBeLessThanOrEqual(quota);
      for (const mine of world.mines) laid.add(mine.id);
    }

    expect(laid.size).toBeGreaterThan(0);
  });

  test('un poseur de mines survit largement aux siennes', () => {
    // Une mine tue son poseur comme n'importe qui, et le jaune pose au plus
    // près en fonçant : il s'en fait sauter de temps en temps, comme dans le
    // vrai jeu. Ce qu'on vérifie est que ça reste l'exception — un poseur qui
    // se suicide systématiquement viderait la mission tout seul.
    let survivors = 0;
    const runs = 20;

    for (let seed = 1; seed <= runs; seed++) {
      const world = createWorld({ width: 18, height: 18, seed });
      createTank(world, { color: 'player', playerId: 'p1', x: 3.5, y: 9.5 });
      const yellow = createTank(world, { color: 'yellow', x: 14.5, y: 9.5 });

      for (let i = 0; i < 40 * TICK_RATE && yellow.alive; i++) tick(world, []);
      if (yellow.alive) survivors++;
    }

    expect(survivors).toBeGreaterThanOrEqual(runs - 2);
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

describe('comportements propres à chaque couleur', () => {
  /** Fait avancer le monde en pilotant le joueur dans une direction fixe. */
  function advanceWithPlayer(world: World, player: Tank, move: { x: number; y: number }, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
      tick(world, [[player.id, { moveX: move.x, moveY: move.y, aim: 0, fire: false, mine: false }]]);
    }
  }

  /** Monte un tireur, une cible, et la mémoire de position qui va avec. */
  function spotFor(color: TankColor, moved: { x: number; y: number }) {
    const world = openWorld(40, 40);
    const shooter = addEnemy(world, color, 20, 30);
    const target = addPlayer(world, 20, 10);

    // La cible s'est déplacée de `moved` depuis le dernier calcul de visée.
    shooter.ai!.targetLastX = target.x - moved.x;
    shooter.ai!.targetLastY = target.y - moved.y;

    return { spot: aimSpot(shooter, shooter.ai!, target, profileOf(color)), target };
  }

  test('le noir vise devant une cible qui se déplace', () => {
    // Sa signature d'après la fiche : il anticipe. Une cible qui file vers la
    // droite doit être visée à droite d'elle-même.
    const { spot, target } = spotFor('black', { x: 2, y: 0 });

    expect(spot.x).toBeGreaterThan(target.x);
    expect(spot.y).toBeCloseTo(target.y, 6);
  });

  test('une cible immobile est visée là où elle est', () => {
    // L'avance vaut zéro faute de déplacement : l'anticipation ne doit pas
    // introduire d'écart quand il n'y a rien à anticiper.
    const { spot, target } = spotFor('black', { x: 0, y: 0 });

    expect(spot.x).toBeCloseTo(target.x, 6);
    expect(spot.y).toBeCloseTo(target.y, 6);
  });

  test('les autres couleurs visent la position courante', () => {
    // Contre-épreuve : dans la même géométrie, un profil sans `leadsTarget`
    // rend exactement la position de la cible.
    for (const color of ['green', 'purple', 'teal'] as const) {
      const { spot, target } = spotFor(color, { x: 2, y: 0 });

      expect(spot.x).toBeCloseTo(target.x, 6);
      expect(spot.y).toBeCloseTo(target.y, 6);
    }
  });

  test('le gris patrouille au lieu de traquer', () => {
    // « Their turrets mildly seek the player, but their movement does not. »
    // Une version antérieure le faisait traquer, sur la foi d'un relevé plus
    // ancien ; le wiki du jeu original dit l'inverse.
    //
    // Une seule partie ne prouve rien : la patrouille est tirée au sort, et il
    // arrive qu'elle mène droit sur le joueur. Ce qui sépare un patrouilleur
    // d'un traqueur, c'est la **proportion** — le second se rapproche à tous
    // les coups. Mesuré ici : dix parties sur trente. Un traqueur donnerait
    // trente sur trente.
    //
    // Et non, on ne peut pas simplement comparer deux mondes identiques où
    // seule la position du joueur change : la graine du monde est partagée, et
    // le tir du gris y puise. Deux positions de joueur donnent deux flux
    // d'aléas différents, donc deux patrouilles différentes — même si le
    // châssis ignore parfaitement sa cible.
    const runs = 30;
    let closer = 0;

    for (let seed = 1; seed <= runs; seed++) {
      const world = createWorld({ width: 30, height: 20, seed });
      const player = addPlayer(world, 5, 10);
      const ash = addEnemy(world, 'ash', 15, 10);
      const start = Math.hypot(ash.x - player.x, ash.y - player.y);

      advance(world, 4 * TICK_RATE);
      if (Math.hypot(ash.x - player.x, ash.y - player.y) < start) closer++;
    }

    expect(closer).toBeGreaterThan(3);
    expect(closer).toBeLessThan(runs - 3);
  });

  /**
   * Distance de départ tenant dans la portée de détection du profil.
   *
   * Au-delà, le tank ne voit pas sa cible et patrouille au hasard — une
   * première version de ces tests plaçait les violets à quatorze tuiles pour
   * une portée de huit, et mesurait donc de l'errance en croyant lire une
   * tenaille.
   */
  const purpleReach = Math.floor(profileOf('purple').detectionRangeTiles) - 2;

  test('le violet contourne au lieu de charger', () => {
    // « Prendre le joueur en tenaille » : son déplacement ne doit pas être
    // colinéaire à la ligne qui le relie à sa cible.
    const world = openWorld(40, 40);
    addPlayer(world, 20, 20);
    const purple = addEnemy(world, 'purple', 20 + purpleReach, 20);
    const start = { x: purple.x, y: purple.y };

    advance(world, 2 * TICK_RATE);

    // Une charge frontale garderait y constant ; un contournement l'écarte.
    expect(Math.abs(purple.y - start.y)).toBeGreaterThan(1);
  });

  test('deux violets contournent par des côtés opposés', () => {
    // C'est ce qui fait la tenaille : partis de la même hauteur, ils prennent
    // chacun un bord. Le côté se tire de la parité de l'identifiant, donc deux
    // voisins divergent toujours.
    const world = openWorld(40, 40);
    addPlayer(world, 20, 20);
    const first = addEnemy(world, 'purple', 20 + purpleReach, 20);
    const second = addEnemy(world, 'purple', 19 + purpleReach, 20);
    const startY = 20;

    advance(world, 2 * TICK_RATE);

    // Signes opposés depuis leur hauteur de départ : l'un monte, l'autre descend.
    expect(Math.sign(first.y - startY) * Math.sign(second.y - startY)).toBe(-1);
  });

  test('le turquoise tient sa position dès qu\'il a un angle', () => {
    // Il compte sur un tir direct, sans ricochet : sa ligne de vue vaut plus
    // que sa distance. Une fois l'angle ouvert, il cesse de se replacer — mais
    // seulement tant qu'il a une cible, une cible morte le renvoyant en
    // patrouille.
    const world = openWorld(30, 20);
    const player = addPlayer(world, 6, 10);
    const teal = addEnemy(world, 'teal', 20, 10);

    // Laisse le temps au premier calcul de visée d'aboutir.
    advance(world, TICK_RATE / 2);
    expect(teal.ai!.solutionAngle).not.toBeNull();

    const held = { x: teal.x, y: teal.y };
    advance(world, TICK_RATE);

    expect(player.alive).toBe(true);
    // La distance de confort est de 6 tuiles : à 14, il ne recule pas non plus.
    expect(Math.hypot(teal.x - held.x, teal.y - held.y)).toBeLessThan(0.5);
  });
});

describe('esquive', () => {
  /** Anticipation maximale : celle du noir, seul profil à `evasionSkill: 1`. */
  const FULL_HORIZON = TUNING.ai.evasionHorizonSeconds;

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

    const evasion = findEvasion(tank, world.shells, FULL_HORIZON);

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

    expect(findEvasion(tank, world.shells, FULL_HORIZON)).toBeNull();
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

    expect(findEvasion(tank, world.shells, FULL_HORIZON)).toBeNull();
  });

  /**
   * Taux de survie d'une couleur à un obus tiré à deux tuiles, sur vingt
   * graines.
   *
   * Sans joueur dans le monde, le tank patrouille : un tank qui n'esquive pas
   * peut donc s'en sortir **par chance**, s'étant trouvé hors du couloir au bon
   * moment. D'où un taux mesuré sur plusieurs graines et non une mort unique —
   * et d'où le turquoise comme témoin, à la fois lent et incapable d'esquiver.
   *
   * Deux précautions, apprises en construisant ce harnais :
   *
   *   - **La pose de mines est neutralisée.** Sans ça, le noir sème une mine
   *     sous ses chenilles, l'obus la fait détoner et le souffle le tue à une
   *     tuile et demie : on mesurait la portée du souffle, pas l'esquive.
   *   - **La fenêtre s'arrête quand l'obus a dépassé le tank.** Laisser courir
   *     une seconde entière laissait les tanks rapides revenir se jeter dans la
   *     trajectoire pendant leur patrouille, ce qui inversait le classement.
   */
  function survivalRate(color: TankColor): number {
    /** Ticks au bout desquels l'obus a franchi l'abscisse de départ du tank. */
    const WINDOW_TICKS = 30;
    const SEEDS = 20;
    let survived = 0;

    for (let seed = 1; seed <= SEEDS; seed++) {
      const world = createWorld({ width: 30, height: 20, seed });
      const tank = addEnemy(world, color, 20, 10);
      if (tank.ai) tank.ai.mineCooldownTicks = Number.MAX_SAFE_INTEGER;

      world.shells.push({
        id: allocateEntityId(world),
        ownerId: -1,
        kind: 'normal',
        x: 18,
        y: 10,
        vx: 5,
        vy: 0,
        bouncesLeft: 1,
        armed: true,
      });

      advance(world, WINDOW_TICKS);
      if (tank.alive) survived++;
    }

    return survived / SEEDS;
  }

  test('seuls les trois derniers tanks se dégagent à tous les coups', () => {
    for (const color of ['purple', 'white', 'black'] as const) {
      expect(survivalRate(color)).toBe(1);
    }
  });

  test('une tourelle fixe encaisse toujours', () => {
    // Repère bas de l'échelle : sans déplacement, ni esquive ni chance.
    expect(survivalRate('brown')).toBe(0);
    expect(survivalRate('green')).toBe(0);
  });

  test('le turquoise, le jaune et le rose ne se dégagent que par chance', () => {
    // Le cœur de la correction : ces trois-là esquivaient parfaitement, ce qui
    // rendait la moitié faible de la campagne bien plus retorse que
    // l'original. Ils encaissent maintenant une bonne partie des obus.
    for (const color of ['teal', 'yellow', 'pink'] as const) {
      expect(survivalRate(color)).toBeLessThanOrEqual(0.8);
    }
  });

  test('le cendre esquive parfois : mieux que la chance, moins bien que le noir', () => {
    // Le turquoise sert de témoin : même vitesse que le cendre, aucune esquive.
    expect(survivalRate('ash')).toBeGreaterThan(survivalRate('teal'));
    expect(survivalRate('ash')).toBeLessThan(1);
  });

  test('un tank esquive son propre obus, mais seulement une fois armé', () => {
    // La règle du jeu veut qu'on puisse se tuer avec son propre ricochet.
    // L'IA l'ignorait, et l'audit des morts a montré des traqueurs qui tiraient
    // vers un mur proche puis fonçaient dans l'obus revenu de bande.
    //
    // Avant armement, en revanche, l'obus chevauche encore le canon : il ne peut
    // pas tuer son tireur, et fuir sa propre bouche de tir n'aurait aucun sens.
    const world = openWorld();
    const tank = addPlayer(world, 20, 10);

    const shell = {
      id: allocateEntityId(world),
      ownerId: tank.id,
      kind: 'normal' as const,
      x: 15,
      y: 10,
      vx: 5,
      vy: 0,
      bouncesLeft: 1,
      armed: false,
    };
    world.shells.push(shell);

    expect(findEvasion(tank, world.shells, FULL_HORIZON)).toBeNull();

    shell.armed = true;
    expect(findEvasion(tank, world.shells, FULL_HORIZON)).not.toBeNull();
  });
});

describe('navigation', () => {
  /** Mur plein percé d'une seule ouverture en bas. */
  function wallWithGap(world: World, x: number, gapFromY: number, kind = TileKind.Indestructible): void {
    for (let y = 0; y < world.grid.height; y++) {
      if (y >= gapFromY) continue;
      setTile(world.grid, x, y, kind);
    }
  }

  test('un traqueur contourne le mur au lieu de pousser dedans', () => {
    // Le défaut le plus visible de l'IA : elle poussait en ligne droite vers la
    // cible. Devant un mur, le système de mouvement la faisait glisser le long
    // de la paroi et elle restait collée derrière, à pousser dans le vide. Le
    // joueur se mettait à couvert et l'attaque s'arrêtait net.
    //
    // Le rose : c'est désormais le seul traqueur pur du jeu, le gris s'étant
    // rangé à la patrouille que lui prête le wiki. Sa portée de détection n'est
    // que de 8,3 tuiles, d'où le décor resserré — au-delà, il ne sait même pas
    // que le joueur existe et on ne mesurerait plus qu'une errance.
    const world = openWorld(20, 20);
    wallWithGap(world, 10, 13);
    const player = addPlayer(world, 6, 10);
    const hunter = addEnemy(world, 'pink', 13, 10);

    const start = Math.hypot(hunter.x - player.x, hunter.y - player.y);
    for (let i = 0; i < 25 * TICK_RATE && player.alive; i++) tick(world, []);

    // Il a franchi le mur : il est du même côté que le joueur.
    expect(hunter.x).toBeLessThan(10);
    expect(Math.hypot(hunter.x - player.x, hunter.y - player.y)).toBeLessThan(start);
  });

  test('sans chemin du tout, il patrouille au lieu de s\'écraser', () => {
    // Cible enfermée : pousser dans un mur se lit comme une panne. Le tank doit
    // continuer de vivre sa vie.
    const world = openWorld(20, 20);
    for (let y = 0; y < 20; y++) setTile(world.grid, 10, y, TileKind.Indestructible);
    addPlayer(world, 4, 10);
    const hunter = addEnemy(world, 'ash', 14, 10);

    const from = { x: hunter.x, y: hunter.y };
    for (let i = 0; i < 10 * TICK_RATE; i++) tick(world, []);

    expect(Math.hypot(hunter.x - from.x, hunter.y - from.y)).toBeGreaterThan(1);
  });

  test('un poseur de mines perce un mur cassable au lieu d\'en faire le tour', () => {
    // Les mines détruisent le terrain cassable, et l'IA l'ignorait : elle
    // contournait sagement une cloison de liège qu'elle pouvait ouvrir. C'est
    // pourtant la seule façon de prendre en tenaille un joueur retranché.
    const world = openWorld(20, 20);
    for (let y = 0; y < 20; y++) setTile(world.grid, 10, y, TileKind.Destructible);
    const player = addPlayer(world, 4, 10);
    addEnemy(world, 'white', 14, 10);

    const before = world.grid.tiles.filter((t) => t === TileKind.Destructible).length;
    for (let i = 0; i < 40 * TICK_RATE && player.alive; i++) tick(world, []);
    const after = world.grid.tiles.filter((t) => t === TileKind.Destructible).length;

    expect(after).toBeLessThan(before);
  });

  test('les alliés ne restent pas collés les uns aux autres', () => {
    // Tous poursuivent la même cible par le même chemin : sans rien pour les
    // séparer ils s'empilent, se masquent la ligne de tir et se tirent dessus.
    // Le turquoise en donne le cas le plus net : il garde ses distances avec le
    // joueur, donc deux turquoises convergent vers le même arc de cercle.
    const world = openWorld(30, 20);
    addPlayer(world, 14, 10);
    const a = addEnemy(world, 'teal', 20, 10);
    const b = addEnemy(world, 'teal', 20.8, 10);

    // On laisse cinq secondes de dégagement — ils partent quasiment l'un sur
    // l'autre — puis on vérifie qu'ils **restent** séparés. Sans répulsion ils
    // ne se décollaient jamais, pas même au bout de quinze secondes.
    let collés = 0;
    for (let i = 0; i < 15 * TICK_RATE; i++) {
      tick(world, []);
      if (i < 5 * TICK_RATE) continue;
      if (a.alive && b.alive && Math.hypot(a.x - b.x, a.y - b.y) < 1.5) collés++;
    }

    expect(collés).toBe(0);
  });
});

describe('interception d\'obus', () => {
  /** Envoie un obus droit sur un tank, depuis `distance` tuiles à sa gauche. */
  function tirSur(world: World, cible: Tank, distance: number): void {
    world.shells.push({
      id: allocateEntityId(world),
      ownerId: -1,
      kind: 'normal',
      x: cible.x - distance,
      y: cible.y,
      vx: TUNING.shell.normalSpeedTilesPerSecond,
      vy: 0,
      bouncesLeft: 1,
      armed: true,
    });
  }

  test('deux obus qui se rencontrent se détruisent', () => {
    // Règle de l'original, et elle manquait entièrement : un tir qui arrive de
    // face n'oblige pas à s'écarter, on peut l'abattre.
    const world = openWorld();
    const speed = TUNING.shell.normalSpeedTilesPerSecond;

    for (const [x, vx] of [[10, speed], [14, -speed]] as const) {
      world.shells.push({
        id: allocateEntityId(world),
        ownerId: -1,
        kind: 'normal',
        x,
        y: 10,
        vx,
        vy: 0,
        bouncesLeft: 1,
        armed: true,
      });
    }

    advance(world, TICK_RATE);
    expect(world.shells).toHaveLength(0);
  });

  test('deux obus du même tireur ne se gênent pas à la sortie du canon', () => {
    // Le rose en garde trois en vol : tirés à la file, ils se chevauchent au
    // canon. Les faire se détruire là lui retirerait son arme. La règle ne
    // s'applique donc entre obus d'un même tireur qu'une fois les deux armés.
    //
    // Le tireur doit exister : `updateArming` arme immédiatement tout obus
    // orphelin, ce qui rendrait le montage inopérant.
    const world = openWorld();
    const pink = addEnemy(world, 'pink', 10, 10);
    const speed = TUNING.shell.normalSpeedTilesPerSecond;

    for (let i = 0; i < 2; i++) {
      world.shells.push({
        id: allocateEntityId(world),
        ownerId: pink.id,
        kind: 'normal',
        x: 10.1,
        y: 10,
        vx: speed,
        vy: 0,
        bouncesLeft: 1,
        armed: false,
      });
    }

    advance(world, 1);
    expect(world.shells).toHaveLength(2);
    expect(pink.alive).toBe(true);
  });

  test('un tank qui ne peut pas s\'écarter abat l\'obus qui arrive', () => {
    // Un vert est immobile : l'esquive lui est structurellement interdite. Sans
    // interception il encaissait sans rien tenter, ce qui se lit comme une
    // panne alors que l'original lui laisse cette parade.
    let survit = 0;

    for (let seed = 1; seed <= 20; seed++) {
      const world = createWorld({ width: 30, height: 20, seed });
      const green = addEnemy(world, 'green', 20, 10);
      addPlayer(world, 3, 10);
      tirSur(world, green, 8);

      for (let i = 0; i < 3 * TICK_RATE && green.alive; i++) tick(world, []);
      if (green.alive) survit++;
    }

    expect(survit).toBe(20);
  });

  test('le brun est trop lent de tourelle pour se sauver ainsi', () => {
    // La parade n'est pas gratuite : il faut amener le canon sur l'obus. Le
    // brun met 3,3 s pour un quart de tour — l'adversaire le plus faible du jeu
    // le reste.
    const world = openWorld();
    const brown = addEnemy(world, 'brown', 20, 10);
    addPlayer(world, 3, 10);
    tirSur(world, brown, 8);

    for (let i = 0; i < 3 * TICK_RATE && brown.alive; i++) tick(world, []);
    expect(brown.alive).toBe(false);
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
