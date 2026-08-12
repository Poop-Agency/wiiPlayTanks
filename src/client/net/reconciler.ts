/**
 * Prédiction locale et réconciliation.
 *
 * ─── Le problème ────────────────────────────────────────────────────────────
 *
 * Le serveur fait autorité, mais il est à 30 ou 80 ms. Attendre sa réponse pour
 * bouger rendrait le tank pâteux — c'est exactement la sensation qu'on cherche
 * à éviter, et la fidélité du pilotage est la première chose qu'on remarque.
 *
 * ─── La réponse ─────────────────────────────────────────────────────────────
 *
 * Le client applique son intention **immédiatement** sur une copie locale du
 * monde, et garde en mémoire tout ce que le serveur n'a pas encore confirmé.
 * À chaque instantané reçu, il jette sa copie, adopte l'état serveur, puis
 * **rejoue** les intentions non confirmées par-dessus. Le tank local retombe
 * ainsi sur une position cohérente avec l'autorité, sans jamais avoir attendu.
 *
 * ─── Ce qui est prédit, et ce qui ne l'est pas ──────────────────────────────
 *
 * **Seul le tank local.** Le rejeu fait tourner `tick()` complet, IA comprise,
 * mais les intentions des autres joueurs sont inconnues du client : leurs tanks
 * finissent donc à des positions inventées. C'est sans conséquence, parce que
 * rien de ce qui est prédit n'est affiché pour eux — ils sont interpolés depuis
 * les instantanés reçus, avec un retard assumé (voir `NetworkSession`).
 *
 * Coût du rejeu : au plus une dizaine de pas, vingt fois par seconde. Le passage
 * par `tick()` plutôt que par une intégration allégée est délibéré — une
 * seconde implémentation du déplacement dériverait de la première, et c'est
 * précisément le défaut qu'on a passé huit issues à éliminer.
 */

import type { EntityId, InputCommand, World } from '@core/state';
import { tick } from '@core/tick';

/** Une intention émise, en attente de confirmation. */
interface PendingInput {
  seq: number;
  input: InputCommand;
}

/**
 * Plafond d'intentions conservées.
 *
 * À 60 Hz, cinquante pas font plus de huit cents millisecondes : au-delà, c'est
 * que le serveur ne répond plus, et rejouer une seconde entière de simulation
 * à chaque instantané coûterait plus que ça ne corrigerait.
 */
const MAX_PENDING = 50;

export class Reconciler {
  #world: World | null = null;
  #pending: PendingInput[] = [];
  #localTankId: EntityId | null = null;

  /** Monde prédit, ou `null` avant le premier instantané. */
  get world(): World | null {
    return this.#world;
  }

  /** Tank piloté, tel que désigné par le serveur. */
  get localTankId(): EntityId | null {
    return this.#localTankId;
  }

  /** Intentions encore non confirmées. Sert aux tests et au diagnostic. */
  get pendingCount(): number {
    return this.#pending.length;
  }

  /**
   * Applique une intention locale sans attendre le serveur.
   *
   * L'intention est mémorisée même quand aucun monde n'est encore arrivé : elle
   * sera rejouée sur le premier instantané, et le tank ne perdra pas les
   * premières fractions de seconde de la partie.
   */
  predict(seq: number, input: InputCommand): void {
    this.#pending.push({ seq, input });
    if (this.#pending.length > MAX_PENDING) this.#pending.shift();

    if (this.#world && this.#localTankId !== null) {
      tick(this.#world, [[this.#localTankId, input]]);
    }
  }

  /**
   * Adopte l'état du serveur, puis rejoue ce qu'il n'a pas encore vu.
   *
   * @param authoritative monde reçu — pris tel quel, il vient d'être désérialisé
   * @param ack dernier `seq` que le serveur a appliqué
   * @param localTankId tank du joueur, `null` s'il n'en a pas encore
   */
  reconcile(authoritative: World, ack: number, localTankId: EntityId | null): void {
    this.#localTankId = localTankId;
    this.#world = authoritative;

    // Tout ce que le serveur a déjà pris en compte est dans l'état reçu :
    // le rejouer ferait avancer le tank deux fois.
    this.#pending = this.#pending.filter((entry) => entry.seq > ack);

    if (localTankId === null) return;

    for (const { input } of this.#pending) {
      tick(this.#world, [[localTankId, input]]);
    }
  }

  /** Oublie tout. Appelé à la déconnexion, pour ne pas rejouer une partie morte. */
  reset(): void {
    this.#world = null;
    this.#pending = [];
    this.#localTankId = null;
  }
}
