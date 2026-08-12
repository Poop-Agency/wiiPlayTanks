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
import type { TankColor, World } from '@core/state';

export interface TankView {
  id: number;
  color: TankColor;
  x: number;
  y: number;
  bodyAngle: number;
  turretAngle: number;
  alive: boolean;
}

export interface RenderSnapshot {
  tick: number;
  tanks: TankView[];
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
  const previousById = new Map(previous.tanks.map((tank) => [tank.id, tank]));

  return {
    tick: current.tick,
    tanks: current.tanks.map((tank) => {
      const before = previousById.get(tank.id);
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
  };
}
