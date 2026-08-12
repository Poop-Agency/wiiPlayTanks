/**
 * Tirs et trajectoire des obus.
 *
 * C'est la partie la plus caractéristique du jeu : un obus qui ricoche fait le
 * tour d'une pièce et revient vous chercher. Elle était aussi la plus cassée
 * dans l'ancienne version — trois bugs distincts, tous corrigés ici et couverts
 * par les tests.
 */

import { blocksShell, boxOverlapsSolid, sweepBoxAgainstGrid } from '../grid.js';
import { DT, secondsToTicks } from '../tick.js';
import { TUNING } from '../tuning.js';
import { allocateEntityId } from '../world.js';
import { aimErrorFor } from './ai/brain.js';
import { profileOf } from './ai/profiles.js';
import type { EntityId, InputCommand, Shell, ShellKind, Tank, World } from '../state.js';

/**
 * Nombre maximal de rebonds traités dans un même pas.
 *
 * Un obus ne parcourt qu'une fraction de tuile par pas, donc un seul rebond est
 * la règle et deux l'exception (un angle). Le plafond n'existe que pour garantir
 * la terminaison si une géométrie dégénérée piégeait l'obus.
 */
const MAX_BOUNCES_PER_TICK = 8;

/** Écart laissé entre l'obus et le mur après un rebond. */
const SEPARATION_EPSILON = 1e-6;

/** Vitesse associée à un type d'obus, en tuiles par seconde. */
export function shellSpeed(kind: ShellKind): number {
  return kind === 'fast'
    ? TUNING.shell.fastSpeedTilesPerSecond
    : TUNING.shell.normalSpeedTilesPerSecond;
}

/**
 * Fait tirer un tank, si son quota et son rechargement le permettent.
 *
 * Le type d'obus, le nombre de rebonds et le quota viennent du profil de la
 * couleur : un tank vert tire des missiles à deux rebonds, un noir des missiles
 * sans rebond, sans qu'aucun `switch` n'apparaisse ici.
 *
 * @returns l'obus créé, ou `null` si le tir a été refusé
 */
export function fireShell(world: World, tank: Tank): Shell | null {
  if (!tank.alive) return null;
  if (tank.reloadTicks > 0) return null;

  const profile = profileOf(tank.color);
  if (tank.activeShells >= profile.maxActiveShells) return null;

  const speed = shellSpeed(profile.shellKind);

  // Le cône d'erreur s'applique ici, au moment du tir, et non à l'orientation
  // de la tourelle : appliqué en continu, il ferait trembler le canon à
  // l'écran au lieu de disperser les tirs.
  const angle = tank.turretAngle + aimErrorFor(world, tank);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  // L'obus naît au bout du canon. Si ce point tombe dans un mur — canon collé
  // contre un bloc — on le fait naître au centre du tank : le faire apparaître
  // à l'intérieur du mur donnerait un rebond dans une direction arbitraire.
  const muzzle = TUNING.tank.sizeTiles * 0.55;
  const half = TUNING.shell.radiusTiles;
  let x = tank.x + dirX * muzzle;
  let y = tank.y + dirY * muzzle;

  if (boxOverlapsSolid(world.grid, x, y, half, blocksShell)) {
    x = tank.x;
    y = tank.y;
    // Même le centre du tank peut être muré après une destruction de terrain :
    // dans ce cas on refuse le tir plutôt que de créer un obus prisonnier.
    if (boxOverlapsSolid(world.grid, x, y, half, blocksShell)) return null;
  }

  const shell: Shell = {
    id: allocateEntityId(world),
    ownerId: tank.id,
    kind: profile.shellKind,
    x,
    y,
    vx: dirX * speed,
    vy: dirY * speed,
    bouncesLeft: profile.shellBounces,
    // L'obus part désarmé : il chevauche encore son tireur.
    armed: false,
  };

  world.shells.push(shell);
  tank.activeShells++;
  tank.reloadTicks = secondsToTicks(TUNING.shell.cooldownSeconds);

  return shell;
}

/** Traite les intentions de tir du pas courant. */
export function updateFiring(world: World, intents: ReadonlyMap<EntityId, InputCommand>): void {
  for (const tank of world.tanks) {
    const input = intents.get(tank.id);
    if (input?.fire) fireShell(world, tank);
  }
}

/**
 * Fait avancer un obus d'un pas, en traitant les rebonds rencontrés.
 *
 * @returns `false` si l'obus doit être détruit
 */
function advanceShell(world: World, shell: Shell): boolean {
  const half = TUNING.shell.radiusTiles;

  // Filet de sécurité : un obus qui se retrouverait dans un mur — terrain
  // reconstruit sous lui, par exemple — est détruit plutôt que de traverser.
  if (boxOverlapsSolid(world.grid, shell.x, shell.y, half, blocksShell)) return false;

  let remaining = DT;

  for (let iteration = 0; iteration < MAX_BOUNCES_PER_TICK; iteration++) {
    const dx = shell.vx * remaining;
    const dy = shell.vy * remaining;

    const hit = sweepBoxAgainstGrid(world.grid, shell.x, shell.y, half, dx, dy, blocksShell);

    if (!hit) {
      shell.x += dx;
      shell.y += dy;
      return true;
    }

    // On avance jusqu'au point de contact, puis on décolle légèrement du mur
    // pour que l'itération suivante ne redétecte pas le même impact.
    shell.x += dx * hit.time + hit.normalX * SEPARATION_EPSILON;
    shell.y += dy * hit.time + hit.normalY * SEPARATION_EPSILON;

    // Quota épuisé : l'obus explose au contact au lieu de repartir.
    if (shell.bouncesLeft <= 0) return false;
    shell.bouncesLeft--;

    // Réflexion sur la normale de la face effectivement traversée. Dans un
    // angle rentrant, les deux composantes s'inversent.
    if (hit.normalX !== 0) shell.vx = -shell.vx;
    if (hit.normalY !== 0) shell.vy = -shell.vy;

    remaining *= 1 - hit.time;
    if (remaining <= 0) return true;
  }

  return true;
}

/**
 * Arme l'obus dès qu'il a quitté son tireur.
 *
 * Tant qu'il le chevauche, il lui est inoffensif — sinon il le tuerait à la
 * sortie du canon. Une fois armé, il redevient mortel pour tout le monde,
 * tireur compris : c'est ce qui permet de se tuer avec son propre ricochet.
 */
function updateArming(world: World, shell: Shell): void {
  if (shell.armed) return;

  const owner = world.tanks.find((tank) => tank.id === shell.ownerId);
  if (!owner) {
    shell.armed = true;
    return;
  }

  const reach = TUNING.tank.sizeTiles / 2 + TUNING.shell.radiusTiles;
  const clearOfOwner =
    Math.abs(shell.x - owner.x) > reach || Math.abs(shell.y - owner.y) > reach;

  if (clearOfOwner) shell.armed = true;
}

/**
 * Fait avancer tous les obus et retire ceux qui ont fini leur course.
 *
 * Les obus condamnés sont **marqués** puis retirés en fin de passe. Modifier le
 * tableau pendant qu'on le parcourt est ce qui faisait sauter un obus sur deux
 * dans l'ancienne boucle : chaque `splice` décalait les indices restants.
 */
export function updateShells(world: World, doomed: Set<EntityId>): void {
  for (const shell of world.shells) {
    if (doomed.has(shell.id)) continue;

    if (!advanceShell(world, shell)) {
      doomed.add(shell.id);
      continue;
    }

    updateArming(world, shell);
  }
}

/** Retire les obus condamnés et rend son quota à chaque tireur. */
export function removeDoomedShells(world: World, doomed: ReadonlySet<EntityId>): void {
  if (doomed.size === 0) return;

  let kept = 0;
  for (const shell of world.shells) {
    if (doomed.has(shell.id)) {
      const owner = world.tanks.find((tank) => tank.id === shell.ownerId);
      if (owner && owner.activeShells > 0) owner.activeShells--;
      continue;
    }
    world.shells[kept++] = shell;
  }
  world.shells.length = kept;
}
