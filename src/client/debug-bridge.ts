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
import type { Tuning } from '@core/tuning';
import type { CampaignView } from './session';

/** Cadences mesurées, pour vérifier que la simulation reste indépendante de l'écran. */
export interface RateProbe {
  ticks: number;
  frames: number;
  ticksPerSecond: number;
  framesPerSecond: number;
  windowStartMs: number;
}

export interface TanksDebugBridge {
  /**
   * Monde en cours.
   *
   * Réaffecté à chaque changement de mission : la campagne enchaîne des mondes
   * distincts, elle n'en recycle pas un seul. Un test qui garde une référence
   * d'un pas sur l'autre observerait donc la mission précédente.
   */
  world: World;
  rates: RateProbe;
  /**
   * Table de réglages vivante. Les tests s'y réfèrent plutôt que de recopier
   * des valeurs, et le panneau de calibration (#10) l'éditera en place.
   */
  tuning: Tuning;
  /** État de la campagne. Absent en mode bac à sable. */
  campaign?: CampaignView;
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
