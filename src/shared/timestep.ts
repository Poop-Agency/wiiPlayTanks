/**
 * Cadencement à pas de temps fixe.
 *
 * La simulation avance par pas de `DT` exactement, quelle que soit la fréquence
 * qui pilote la boucle : `requestAnimationFrame` côté client, un minuteur côté
 * serveur (#13). Le rendu, lui, s'exécute à la fréquence de l'écran et interpole
 * entre le dernier état simulé et le précédent grâce au résidu `alpha`.
 *
 * Ce module vit dans `shared/` parce que **client et serveur doivent consommer
 * le temps réel de la même façon**. Une seconde implémentation côté serveur, et
 * les deux dériveraient — le serveur avancerait de 61 pas quand le client en
 * compte 60, et la réconciliation corrigerait sans fin un écart qui ne vient
 * pas du réseau.
 *
 * L'accumulateur ne touche à rien de spécifique au navigateur : c'est la partie
 * qui contient la logique délicate, et elle doit être testable en headless.
 */

import { DT } from '@core/tick.js';

/**
 * Nombre maximal de pas rattrapés en une passe.
 *
 * Sans ce plafond, un gel de l'onglet de dix secondes demanderait 600 pas d'un
 * coup ; le rattrapage prendrait plus de temps que le retard accumulé, ce qui
 * creuserait encore l'écart — la « spirale de la mort ». Au-delà du plafond, on
 * abandonne le retard : mieux vaut un saut visible qu'un blocage définitif.
 */
export const MAX_CATCHUP_TICKS = 5;

/** Durée maximale prise en compte pour une frame, en secondes. */
export const MAX_FRAME_SECONDS = MAX_CATCHUP_TICKS * DT;

export class FixedTimestep {
  /** Temps accumulé pas encore converti en pas de simulation, en secondes. */
  #accumulator = 0;

  /** Fraction de pas restante, dans [0, 1). Sert à interpoler le rendu. */
  #alpha = 0;

  /**
   * Absorbe le temps réel écoulé et rend le nombre de pas de simulation à
   * exécuter.
   *
   * @param elapsedSeconds temps écoulé depuis l'appel précédent
   * @returns nombre de pas à exécuter, entre 0 et {@link MAX_CATCHUP_TICKS}
   */
  advance(elapsedSeconds: number): number {
    // On borne l'entrée plutôt que le nombre de pas : le temps excédentaire ne
    // doit pas rester dans l'accumulateur, sinon il ressortirait à la frame
    // suivante et le rattrapage recommencerait indéfiniment.
    const clamped = Math.min(Math.max(elapsedSeconds, 0), MAX_FRAME_SECONDS);

    this.#accumulator += clamped;

    let ticks = 0;
    while (this.#accumulator >= DT) {
      this.#accumulator -= DT;
      ticks++;
    }

    this.#alpha = this.#accumulator / DT;
    return ticks;
  }

  /** Résidu d'interpolation courant, dans [0, 1). */
  get alpha(): number {
    return this.#alpha;
  }

  /** Remet l'accumulateur à zéro, par exemple au chargement d'une mission. */
  reset(): void {
    this.#accumulator = 0;
    this.#alpha = 0;
  }
}
