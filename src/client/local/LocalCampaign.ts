/**
 * Campagne solo.
 *
 * Enveloppe mince autour de {@link CampaignRunner}, qui vit dans `shared/` et
 * que le serveur (#13) utilise à l'identique. Ce qui reste ici est ce qui ne
 * concerne que le client : les instantanés de rendu et l'interpolation.
 *
 * Autrement dit, le mode solo n'est toujours pas un chemin de code parallèle.
 * Il enchaîne les missions avec exactement le même code que le co-op, et
 * appelle le même `tick()`.
 */

import type { InputCommand, Tank, World } from '@core/state';
import { CampaignRunner } from '@shared/CampaignRunner';
import { captureSnapshot, interpolateSnapshots } from '../render/snapshots';
import type { RenderSnapshot } from '../render/snapshots';
import { buildCampaignView } from '../session';
import type { CampaignView, Session } from '../session';

/** Identifiant du joueur local. Le co-op en attribue un par connexion. */
const LOCAL_PLAYER = 'local';

export class LocalCampaign implements Session {
  readonly #runner: CampaignRunner;

  /** Les deux derniers états, pour interpoler le rendu entre deux pas. */
  #previous: RenderSnapshot;
  #current: RenderSnapshot;

  constructor(startingMission = 1) {
    this.#runner = new CampaignRunner({ playerIds: [LOCAL_PLAYER], startingMission });
    this.#current = captureSnapshot(this.#runner.world);
    this.#previous = this.#current;
  }

  get world(): World {
    return this.#runner.world;
  }

  get playerTank(): Tank | undefined {
    return this.#runner.tankOf(LOCAL_PLAYER);
  }

  restart(): void {
    this.#runner.restart();
    this.#current = captureSnapshot(this.#runner.world);
    this.#previous = this.#current;
  }

  update(input: InputCommand): void {
    this.#previous = this.#current;

    const tankId = this.#runner.tankIdOf(LOCAL_PLAYER);
    this.#runner.step(tankId === undefined ? [] : [[tankId, input]]);

    this.#current = captureSnapshot(this.#runner.world);
  }

  view(alpha: number): RenderSnapshot {
    // Un changement de mission remplace le monde : interpoler entre deux
    // missions ferait glisser les tanks de l'ancienne arène vers la nouvelle.
    if (this.#current.tick < this.#previous.tick) return this.#current;
    return interpolateSnapshots(this.#previous, this.#current, alpha);
  }

  status(): CampaignView {
    return buildCampaignView(this.#runner.campaign, this.#runner.world, this.playerTank);
  }
}
