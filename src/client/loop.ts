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
 * Cadence d'affichage visée, en images par seconde.
 *
 * La simulation tourne à 60 Hz quoi qu'il arrive ; au-delà, les images
 * supplémentaires ne montrent rien de plus que de l'interpolation entre deux
 * pas déjà calculés. Sur un écran à 144 Hz, c'était deux images sur trois de
 * travail — dessin du plateau, des tanks, du HUD — pour un gain nul, et
 * autant de budget en moins quand une frame devient coûteuse.
 */
const TARGET_FPS = 60;
const TARGET_FRAME_SECONDS = 1 / TARGET_FPS;

/**
 * Marge de tolérance sur le seuil, en secondes.
 *
 * Un écran à 60 Hz ne livre jamais exactement 16,667 ms : sans marge, une
 * image sur deux tomberait juste sous le seuil et l'affichage s'effondrerait
 * à 30 Hz — l'inverse exact de ce qu'on cherche.
 */
const FRAME_TOLERANCE_SECONDS = 0.002;

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

  /** Temps écoulé depuis la dernière image dessinée, en secondes. */
  let sinceRenderSeconds = 0;

  const frame = (nowMs: number): void => {
    if (!running) return;

    // La première frame ne mesure aucun intervalle : on l'utilise seulement
    // pour poser l'origine des temps.
    const elapsedSeconds = previousMs === null ? 0 : (nowMs - previousMs) / 1000;
    previousMs = nowMs;

    // La simulation, elle, n'est jamais sautée : c'est `FixedTimestep` qui
    // décide du nombre de pas, et il consomme le temps réel intégralement.
    const ticks = timestep.advance(elapsedSeconds);
    for (let i = 0; i < ticks; i++) {
      handlers.update();
    }

    sinceRenderSeconds += elapsedSeconds;

    if (sinceRenderSeconds + FRAME_TOLERANCE_SECONDS >= TARGET_FRAME_SECONDS) {
      // On retranche la période au lieu de remettre à zéro : sur un écran dont
      // la fréquence n'est pas un multiple de 60 — 144 Hz, soit 2,4 images par
      // image visée — le reste conservé fait alterner les intervalles de 2 et
      // 3 images, ce qui donne bien 60 en moyenne. Une remise à zéro
      // arrondirait à 3 et plafonnerait à 48.
      sinceRenderSeconds -= TARGET_FRAME_SECONDS;

      // Écran plus lent que la cadence visée, ou frame coûteuse : le reste
      // n'a plus de sens et s'accumulerait en dérive. On dessine chaque image
      // disponible, ce qui est déjà le mieux possible.
      if (sinceRenderSeconds > TARGET_FRAME_SECONDS) sinceRenderSeconds = 0;

      handlers.render(timestep.alpha);
    }

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
