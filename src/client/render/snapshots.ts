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

export interface RenderSnapshot {
  tick: number;
  tanks: TankView[];
  shells: ShellView[];
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
  };
}
