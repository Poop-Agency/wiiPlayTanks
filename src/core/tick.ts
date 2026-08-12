/**
 * Le point d'entrée unique de la simulation.
 *
 * `tick()` est la **seule** façon de faire évoluer un `World`. Trois appelants,
 * et exactement le même code pour les trois :
 *
 *   - le serveur, qui fait autorité (#13) ;
 *   - le client, qui prédit son propre tank en attendant la confirmation (#13) ;
 *   - les tests, qui rejouent des scénarios en headless.
 *
 * Il n'existe pas de seconde implémentation de la physique. C'est ce qui rend
 * impossible la divergence entre ce qu'on ressent en solo et ce qu'on ressent
 * en ligne — l'ancienne version avait deux chemins de code distincts, et ils
 * dérivaient l'un de l'autre.
 */

import { updateMovement } from './systems/movement.js';
import type { InputCommand, World } from './state.js';

/**
 * Fréquence de simulation, en pas par seconde.
 *
 * Fixe et indépendante de la fréquence d'affichage. L'ancienne version avançait
 * d'un pas par `requestAnimationFrame`, ce qui faisait tourner le jeu 2,4× plus
 * vite sur un écran 144 Hz que sur un 60 Hz — et rendait toute notion de
 * fidélité de vitesse dénuée de sens.
 */
export const TICK_RATE = 60;

/** Durée d'un pas de simulation, en secondes. */
export const DT = 1 / TICK_RATE;

/** Convertit une durée en secondes vers un nombre de ticks, arrondi au plus proche. */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICK_RATE);
}

/**
 * Intentions des joueurs pour ce pas, indexées par identifiant de tank.
 *
 * Un tableau de paires plutôt qu'une `Map` : le monde et ses entrées doivent
 * rester sérialisables tels quels pour l'enregistrement et le rejeu.
 */
export type TickInputs = ReadonlyArray<readonly [tankId: number, input: InputCommand]>;

/**
 * Fait avancer le monde d'exactement un pas.
 *
 * Mute `world` en place. Les appelants qui ont besoin de conserver l'état
 * précédent (interpolation de rendu, réconciliation réseau) clonent avant via
 * `cloneWorld`.
 *
 * ─── Ordre des systèmes ──────────────────────────────────────────────────────
 *
 * L'ordre n'est pas anodin : il fixe l'arbitrage des cas simultanés. Il est
 * figé ici, et le test de déterminisme le verrouille.
 */
export function tick(world: World, inputs: TickInputs): void {
  // 1. Décisions de l'IA : renseigne les intentions des tanks non joueurs → #11
  const intents = new Map(inputs);

  // 2. Déplacement des tanks : résolution X puis Y, glissement le long des murs.
  updateMovement(world, intents);

  // 3. Déplacement des obus       → #8  (intégration balayée, rebonds)
  // 4. Mèches et détonations      → #9  (mines, explosions, destruction du terrain)
  // 5. Résolution des dégâts      → #8/#9 (obus↔tank, obus↔obus, explosion↔entités)

  advanceTimers(world);

  // 6. Compactage : les entités marquées mortes disparaissent ici, et seulement
  //    ici. Supprimer en cours d'itération est ce qui faisait « sauter » un obus
  //    sur deux dans l'ancienne boucle (`splice` pendant un `forEach`).
  removeExpiredExplosions(world);

  world.tick++;
}

/** Décrémente tous les compteurs temporels d'un pas. */
function advanceTimers(world: World): void {
  for (const tank of world.tanks) {
    if (tank.reloadTicks > 0) tank.reloadTicks--;
  }

  for (const mine of world.mines) {
    if (mine.fuseTicks > 0) mine.fuseTicks--;
  }

  for (const explosion of world.explosions) {
    if (explosion.ticksLeft > 0) explosion.ticksLeft--;
  }
}

/** Retire les explosions dont l'affichage est terminé. */
function removeExpiredExplosions(world: World): void {
  // Filtrage en place plutôt que réallocation : le tableau est réutilisé à
  // chaque tick, et un `filter` créerait 60 tableaux par seconde pour rien.
  let kept = 0;
  for (const explosion of world.explosions) {
    if (explosion.ticksLeft > 0) world.explosions[kept++] = explosion;
  }
  world.explosions.length = kept;
}
