/**
 * Boucle de jeu du client.
 *
 * Seule `startGameLoop` connaît le navigateur ; tout le cadencement vit dans
 * {@link FixedTimestep}, partagé avec le serveur (#13).
 */

import { FixedTimestep } from '@shared/timestep';

export { FixedTimestep, MAX_CATCHUP_TICKS, MAX_FRAME_SECONDS } from '@shared/timestep';

/** Ce qu'une boucle de jeu doit fournir. */
export interface GameLoopHandlers {
  /** Appelé exactement une fois par pas de simulation. */
  update(): void;
  /** Appelé une fois par frame d'affichage, avec le résidu d'interpolation. */
  render(alpha: number): void;
}

/** Contrôle d'une boucle démarrée. */
export interface RunningGameLoop {
  stop(): void;
}

/**
 * Démarre la boucle sur `requestAnimationFrame`.
 *
 * Seule cette fonction connaît le navigateur ; toute la logique de cadencement
 * vit dans {@link FixedTimestep}.
 */
export function startGameLoop(handlers: GameLoopHandlers): RunningGameLoop {
  const timestep = new FixedTimestep();
  let previousMs: number | null = null;
  let frameHandle = 0;
  let running = true;

  const frame = (nowMs: number): void => {
    if (!running) return;

    // La première frame ne mesure aucun intervalle : on l'utilise seulement
    // pour poser l'origine des temps.
    const elapsedSeconds = previousMs === null ? 0 : (nowMs - previousMs) / 1000;
    previousMs = nowMs;

    const ticks = timestep.advance(elapsedSeconds);
    for (let i = 0; i < ticks; i++) {
      handlers.update();
    }

    handlers.render(timestep.alpha);
    frameHandle = requestAnimationFrame(frame);
  };

  frameHandle = requestAnimationFrame(frame);

  return {
    stop(): void {
      running = false;
      cancelAnimationFrame(frameHandle);
    },
  };
}
