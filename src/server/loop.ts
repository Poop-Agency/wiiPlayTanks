/**
 * Boucle serveur à pas fixe.
 *
 * Elle consomme le temps réel exactement comme le client, via le même
 * {@link FixedTimestep} : c'est la condition pour que les deux comptent le même
 * nombre de pas. Une seconde implémentation ici, et le serveur avancerait de
 * 61 pas quand le client en compte 60 — la réconciliation corrigerait alors sans
 * fin un écart qui ne vient pas du réseau.
 *
 * Le pilote change, en revanche : pas de `requestAnimationFrame` côté serveur,
 * mais un minuteur.
 */

import { DT } from '@core/tick';
import { FixedTimestep } from '@shared/timestep';
import { SNAPSHOT_RATE } from '@shared/protocol';

/**
 * Période du minuteur, en millisecondes.
 *
 * Plus courte qu'un pas de simulation : `setInterval` n'est pas ponctuel, et
 * l'interroger plus souvent que nécessaire permet à l'accumulateur de rattraper
 * la dérive au lieu de la subir.
 */
const TIMER_PERIOD_MS = (DT * 1000) / 2;

export interface ServerLoopHandlers {
  /** Appelé exactement une fois par pas de simulation. */
  step(): void;
  /** Appelé à la fréquence de diffusion des instantanés. */
  broadcast(): void;
}

export interface RunningServerLoop {
  stop(): void;
}

/** Démarre la boucle. Rend de quoi l'arrêter, ce dont les tests ont besoin. */
export function startServerLoop(handlers: ServerLoopHandlers): RunningServerLoop {
  const timestep = new FixedTimestep();
  const ticksPerSnapshot = Math.round(1 / (SNAPSHOT_RATE * DT));

  let previousMs = performance.now();
  let ticksSinceSnapshot = 0;

  const timer = setInterval(() => {
    const nowMs = performance.now();
    const elapsedSeconds = (nowMs - previousMs) / 1000;
    previousMs = nowMs;

    const ticks = timestep.advance(elapsedSeconds);

    for (let index = 0; index < ticks; index++) {
      handlers.step();
      ticksSinceSnapshot++;

      // Compté en pas et non en millisecondes : la cadence de diffusion reste
      // ainsi accrochée à la simulation, y compris après un rattrapage.
      if (ticksSinceSnapshot >= ticksPerSnapshot) {
        ticksSinceSnapshot = 0;
        handlers.broadcast();
      }
    }
  }, TIMER_PERIOD_MS);

  return {
    stop(): void {
      clearInterval(timer);
    },
  };
}
