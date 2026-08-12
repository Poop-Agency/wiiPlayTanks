/**
 * Passerelle de diagnostic exposée sur `window`.
 *
 * Le jeu se dessine intégralement dans un canevas : il n'y a aucun DOM à
 * interroger, donc aucun moyen pour un test bout-en-bout de vérifier autre
 * chose que des pixels. Cette passerelle donne à Playwright un accès en lecture
 * à l'état simulé.
 *
 * Le type est déclaré ici, et ici seulement, pour que le client et les tests
 * partagent la même définition — deux `declare global` concurrents ne
 * compileraient pas.
 */

import type { World } from '@core/state';

/** Cadences mesurées, pour vérifier que la simulation reste indépendante de l'écran. */
export interface RateProbe {
  ticks: number;
  frames: number;
  ticksPerSecond: number;
  framesPerSecond: number;
  windowStartMs: number;
}

export interface TanksDebugBridge {
  world: World;
  rates: RateProbe;
}

declare global {
  interface Window {
    __tanks?: TanksDebugBridge;
  }
}

/** Publie la passerelle. Sans effet sur la simulation. */
export function exposeDebugBridge(bridge: TanksDebugBridge): void {
  window.__tanks = bridge;
}
