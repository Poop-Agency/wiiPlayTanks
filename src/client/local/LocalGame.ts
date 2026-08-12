/**
 * Partie solo.
 *
 * Point important d'architecture : **ce n'est pas un chemin de code parallèle**.
 * `LocalGame` possède un `World` et appelle le même `tick()` que le serveur
 * appellera (#13). Le mode solo ne peut donc pas diverger du mode en ligne —
 * l'ancienne version avait deux implémentations distinctes, et elles avaient
 * dérivé l'une de l'autre.
 *
 * Quand le multijoueur arrivera, la seule différence sera l'origine des
 * intentions : lues localement ici, reçues par le réseau là-bas.
 */

import type { InputCommand, Tank, World } from '@core/state';
import { tick } from '@core/tick';
import type { TickInputs } from '@core/tick';
import { captureSnapshot, interpolateSnapshots } from '../render/snapshots';
import type { RenderSnapshot } from '../render/snapshots';

export class LocalGame {
  readonly #world: World;
  readonly #playerTankId: number;

  /** Les deux derniers états, pour interpoler le rendu entre deux pas. */
  #previous: RenderSnapshot;
  #current: RenderSnapshot;

  constructor(world: World, playerTankId: number) {
    this.#world = world;
    this.#playerTankId = playerTankId;
    this.#current = captureSnapshot(world);
    this.#previous = this.#current;
  }

  get world(): World {
    return this.#world;
  }

  get playerTank(): Tank | undefined {
    return this.#world.tanks.find((tank) => tank.id === this.#playerTankId);
  }

  /** Avance la simulation d'un pas avec l'intention du joueur. */
  update(input: InputCommand): void {
    const inputs: TickInputs = [[this.#playerTankId, input]];

    this.#previous = this.#current;
    tick(this.#world, inputs);
    this.#current = captureSnapshot(this.#world);
  }

  /**
   * État à dessiner pour la frame courante.
   *
   * @param alpha résidu d'interpolation fourni par la boucle à pas fixe
   */
  view(alpha: number): RenderSnapshot {
    return interpolateSnapshots(this.#previous, this.#current, alpha);
  }
}
