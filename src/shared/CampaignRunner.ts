/**
 * Orchestration d'une campagne : enchaîne les missions, gère la réserve de tanks.
 *
 * ─── Pourquoi dans `shared/` ────────────────────────────────────────────────
 *
 * Parce que le serveur (#13) et le client solo doivent enchaîner les missions
 * **exactement** de la même façon. Une seconde implémentation côté serveur, et
 * les deux dériveraient — c'est précisément le défaut de l'ancienne version,
 * qui avait deux chemins de code pour le solo et l'en-ligne.
 *
 * Répartition des rôles, inchangée :
 *
 *   - `core/systems/mission.ts` **juge** l'issue d'un monde (lecture pure) ;
 *   - `shared/campaign.ts` **décide** de la suite (réducteur pur) ;
 *   - cette classe **orchestre** : elle tient le monde courant, compte le temps
 *     mort entre deux missions, et charge la suivante.
 *
 * Elle ne connaît ni le rendu, ni le réseau, ni les entrées : elle reçoit des
 * intentions déjà formées et fait avancer un monde.
 */

import type { EntityId, InputCommand, Tank, World } from '@core/state';
import { missionOutcome } from '@core/systems/mission';
import type { MissionOutcome } from '@core/systems/mission';
import { secondsToTicks, tick } from '@core/tick';
import type { TickInputs } from '@core/tick';
import { advanceCampaign, startCampaign } from './campaign';
import type { CampaignState } from './campaign';
import { loadMission } from './missions/load';
import { missionByNumber } from './missions/missions';

/**
 * Temps mort après une mission réussie, en secondes.
 *
 * La simulation continue d'avancer pendant ce délai : l'explosion du dernier
 * ennemi doit se jouer entièrement, sinon la mission se coupe sur une image
 * figée et le coup gagnant n'est jamais vu.
 */
const CLEARED_PAUSE_SECONDS = 1.6;

/** Temps mort après un échec. Un peu plus long : il y a une mauvaise nouvelle à lire. */
const FAILED_PAUSE_SECONDS = 2.2;

export interface CampaignRunnerOptions {
  /** Joueurs présents au départ, dans l'ordre des sièges. */
  playerIds: readonly string[];
  /** Mission de départ, à partir de 1. */
  startingMission?: number;
}

export class CampaignRunner {
  #state: CampaignState;
  #world: World;
  /** Tank de chaque joueur dans le monde courant. */
  #tankByPlayer = new Map<string, EntityId>();

  readonly #playerIds: string[];

  /**
   * Pas restants avant de charger la mission suivante.
   *
   * Un décompte plutôt qu'une date : la transition reste ainsi indépendante de
   * la fréquence d'affichage, comme le reste de la simulation.
   */
  #pauseTicks = 0;

  constructor({ playerIds, startingMission = 1 }: CampaignRunnerOptions) {
    this.#playerIds = [...playerIds];
    this.#state = startCampaign(startingMission);
    this.#world = this.#openMission();
  }

  get world(): World {
    return this.#world;
  }

  get campaign(): CampaignState {
    return this.#state;
  }

  /** Issue de la mission en cours, recalculée à la demande. */
  get outcome(): MissionOutcome {
    return missionOutcome(this.#world);
  }

  /** Joueurs installés, dans l'ordre des sièges. */
  get playerIds(): readonly string[] {
    return this.#playerIds;
  }

  tankOf(playerId: string): Tank | undefined {
    const id = this.#tankByPlayer.get(playerId);
    return id === undefined ? undefined : this.#world.tanks.find((tank) => tank.id === id);
  }

  tankIdOf(playerId: string): EntityId | undefined {
    return this.#tankByPlayer.get(playerId);
  }

  /**
   * Installe un joueur en cours de partie.
   *
   * Le co-op se joue en arrivée libre : un nouveau venu reçoit un tank tout de
   * suite plutôt que d'attendre la mission suivante. S'il était déjà là, on ne
   * fait que rendre son siège.
   */
  addPlayer(playerId: string): EntityId | undefined {
    const existing = this.#tankByPlayer.get(playerId);
    if (existing !== undefined) return existing;

    this.#playerIds.push(playerId);
    // Rouvrir la mission est le seul moyen d'obtenir un point de départ valide
    // et un monde cohérent : les positions de départ appartiennent à la mission.
    this.#world = this.#openMission();
    return this.#tankByPlayer.get(playerId);
  }

  /** Retire un joueur et son tank. Les autres et l'IA continuent sans interruption. */
  removePlayer(playerId: string): void {
    const tankId = this.#tankByPlayer.get(playerId);
    this.#tankByPlayer.delete(playerId);

    const index = this.#playerIds.indexOf(playerId);
    if (index !== -1) this.#playerIds.splice(index, 1);

    if (tankId === undefined) return;
    this.#world.tanks = this.#world.tanks.filter((tank) => tank.id !== tankId);
  }

  /** Recommence la campagne depuis la première mission. */
  restart(): void {
    this.#state = startCampaign();
    this.#pauseTicks = 0;
    this.#world = this.#openMission();
  }

  /**
   * Avance d'un pas, et enchaîne les missions le moment venu.
   *
   * @param inputs intentions des joueurs pour ce pas, par identifiant de tank
   */
  step(inputs: TickInputs): void {
    tick(this.#world, inputs);

    // Campagne terminée : le monde continue de tourner en toile de fond, mais
    // plus aucune transition n'est déclenchée.
    if (this.#state.status !== 'playing') return;

    if (this.#pauseTicks > 0) {
      this.#pauseTicks--;
      if (this.#pauseTicks === 0) this.#resolve();
      return;
    }

    const outcome = missionOutcome(this.#world);
    if (outcome === 'playing') return;

    this.#pauseTicks = secondsToTicks(
      outcome === 'cleared' ? CLEARED_PAUSE_SECONDS : FAILED_PAUSE_SECONDS,
    );
  }

  /** Construit les entrées d'un pas à partir des intentions par joueur. */
  inputsFor(byPlayer: ReadonlyMap<string, InputCommand>): TickInputs {
    const inputs: Array<readonly [EntityId, InputCommand]> = [];

    for (const [playerId, input] of byPlayer) {
      const tankId = this.#tankByPlayer.get(playerId);
      if (tankId !== undefined) inputs.push([tankId, input]);
    }

    return inputs;
  }

  /* ── Enchaînement ────────────────────────────────────────────────────── */

  /** Applique l'issue de la mission écoulée et ouvre la suivante s'il y en a une. */
  #resolve(): void {
    this.#state = advanceCampaign(this.#state, missionOutcome(this.#world));
    if (this.#state.status === 'playing') this.#world = this.#openMission();
  }

  /** Charge la mission courante dans un monde neuf. */
  #openMission(): World {
    const mission = missionByNumber(this.#state.mission);
    if (!mission) throw new Error(`Mission ${this.#state.mission} inexistante`);

    const { world, playerTankIds } = loadMission(mission, { playerIds: this.#playerIds });

    this.#tankByPlayer = new Map(
      this.#playerIds.map((playerId, index) => [playerId, playerTankIds[index]!]),
    );

    return world;
  }
}
