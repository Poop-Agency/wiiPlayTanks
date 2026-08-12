/**
 * Instantanés de rendu et interpolation.
 *
 * La simulation avance par pas de 1/60 s, l'écran rafraîchit à sa propre
 * cadence. Dessiner directement le dernier état simulé produirait des saccades
 * sur un écran 144 Hz. On interpole donc entre les deux derniers pas.
 *
 * On extrait un instantané léger plutôt que de cloner le monde entier à chaque
 * pas : seules les grandeurs continues ont besoin d'être interpolées, et un
 * `structuredClone` par tick serait du gaspillage pur.
 *
 * Cette même structure servira en multijoueur (#13) à interpoler les entités
 * distantes avec un retard d'environ 100 ms.
 */

import { lerp, lerpAngle } from '@core/math';
import type { ShellKind, TankColor, World } from '@core/state';
import { TICK_RATE } from '@core/tick';
import { TUNING } from '@core/tuning';

export interface TankView {
  id: number;
  color: TankColor;
  x: number;
  y: number;
  bodyAngle: number;
  turretAngle: number;
  alive: boolean;
}

export interface ShellView {
  id: number;
  kind: ShellKind;
  x: number;
  y: number;
  /** Orientation du déplacement, pour dessiner un missile dans son axe. */
  heading: number;
}

export interface MineView {
  id: number;
  x: number;
  y: number;
  /** Avancement de la mèche, de 0 (fraîchement posée) à 1 (imminente). */
  urgency: number;
  /** Voyant allumé ou éteint. Le clignotement s'accélère avec l'urgence. */
  blinkOn: boolean;
}

export interface ExplosionView {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Avancement de l'animation, de 0 (naissance) à 1 (fin). */
  progress: number;
}

export interface RenderSnapshot {
  tick: number;
  tanks: TankView[];
  shells: ShellView[];
  mines: MineView[];
  explosions: ExplosionView[];
}

/**
 * Période de clignotement d'une mine, en ticks, selon l'urgence.
 *
 * Elle se resserre à mesure que la mèche se consume : c'est le seul indice
 * donné au joueur pour savoir s'il a encore le temps de passer.
 */
function blinkPeriod(urgency: number): number {
  return Math.max(3, Math.round(24 - 21 * urgency));
}

/** Extrait d'un monde ce qui est nécessaire au rendu. */
export function captureSnapshot(world: World): RenderSnapshot {
  return {
    tick: world.tick,
    tanks: world.tanks.map((tank) => ({
      id: tank.id,
      color: tank.color,
      x: tank.x,
      y: tank.y,
      bodyAngle: tank.bodyAngle,
      turretAngle: tank.turretAngle,
      alive: tank.alive,
    })),
    shells: world.shells.map((shell) => ({
      id: shell.id,
      kind: shell.kind,
      x: shell.x,
      y: shell.y,
      heading: Math.atan2(shell.vy, shell.vx),
    })),

    mines: world.mines.map((mine) => {
      // L'urgence se déduit du réglage courant de la mèche : une mine posée
      // reste lisible même si la durée a changé entre-temps.
      const total = Math.max(1, Math.round(TUNING.mine.fuseSeconds * TICK_RATE));
      const urgency = Math.min(1, Math.max(0, 1 - mine.fuseTicks / total));

      return {
        id: mine.id,
        x: mine.x,
        y: mine.y,
        urgency,
        blinkOn: Math.floor(mine.fuseTicks / blinkPeriod(urgency)) % 2 === 0,
      };
    }),

    explosions: world.explosions.map((explosion) => ({
      id: explosion.id,
      x: explosion.x,
      y: explosion.y,
      radius: explosion.radius,
      progress: 1 - explosion.ticksLeft / Math.max(1, explosion.totalTicks),
    })),
  };
}

/**
 * Interpole deux instantanés successifs.
 *
 * Les entités absentes de `previous` — celles qui viennent d'apparaître — sont
 * reprises telles quelles depuis `current` : les faire surgir depuis une
 * position d'origine arbitraire produirait un glissement fantôme.
 */
export function interpolateSnapshots(
  previous: RenderSnapshot,
  current: RenderSnapshot,
  alpha: number,
): RenderSnapshot {
  const tanksById = new Map(previous.tanks.map((tank) => [tank.id, tank]));
  const shellsById = new Map(previous.shells.map((shell) => [shell.id, shell]));

  return {
    tick: current.tick,

    tanks: current.tanks.map((tank) => {
      const before = tanksById.get(tank.id);
      if (!before) return tank;

      return {
        ...tank,
        x: lerp(before.x, tank.x, alpha),
        y: lerp(before.y, tank.y, alpha),
        // Interpolation angulaire par le chemin le plus court : sinon une
        // tourelle passant de 179° à -179° traverserait tout le cadran.
        bodyAngle: lerpAngle(before.bodyAngle, tank.bodyAngle, alpha),
        turretAngle: lerpAngle(before.turretAngle, tank.turretAngle, alpha),
      };
    }),

    shells: current.shells.map((shell) => {
      const before = shellsById.get(shell.id);
      if (!before) return shell;

      return {
        ...shell,
        x: lerp(before.x, shell.x, alpha),
        y: lerp(before.y, shell.y, alpha),
        heading: lerpAngle(before.heading, shell.heading, alpha),
      };
    }),

    // Mines et explosions ne sont pas interpolées : les mines ne bougent pas,
    // et lisser l'avancement d'une explosion qui dure vingt pas n'apporterait
    // rien de perceptible.
    mines: current.mines,
    explosions: current.explosions,
  };
}
