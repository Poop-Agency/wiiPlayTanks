/**
 * Campagne solo : enchaîne les missions, gère la réserve de tanks.
 *
 * Répartition des rôles, volontairement stricte :
 *
 *   - `core/systems/mission.ts` **juge** l'issue d'un monde (pure lecture) ;
 *   - `shared/campaign.ts` **décide** de la suite (réducteur pur) ;
 *   - cette classe **orchestre** : elle tient le monde courant, compte le temps
 *     mort entre deux missions, et charge la suivante.
 *
 * Rien de ce qui est décidé ici n'est propre au solo. Quand le serveur arrivera
 * (#13), il tiendra exactement le même rôle d'orchestrateur avec les deux mêmes
 * modules en dessous — seule la provenance des intentions changera.
 */

import type { InputCommand, Tank, World } from '@core/state';
import { enemiesRemaining, missionOutcome } from '@core/systems/mission';
import type { MissionOutcome } from '@core/systems/mission';
import { secondsToTicks } from '@core/tick';
import { TUNING } from '@core/tuning';
import { CAMPAIGN_LENGTH, advanceCampaign, startCampaign } from '@shared/campaign';
import type { CampaignState, CampaignStatus } from '@shared/campaign';
import { loadMission } from '@shared/missions/load';
import { missionByNumber } from '@shared/missions/missions';
import type { RenderSnapshot } from '../render/snapshots';
import type { Session } from '../session';
import { LocalGame } from './LocalGame';

/** Identifiant du joueur local. Le multijoueur en attribuera un par connexion. */
const LOCAL_PLAYER = 'local';

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

/** Tout ce que le HUD et les tests ont besoin de savoir. Recalculé à chaque pas. */
export interface CampaignView {
  mission: number;
  missionName: string;
  totalMissions: number;
  /** Tanks en réserve. */
  spares: number;
  /** Tentative en cours sur cette mission, à partir de 1. */
  attempt: number;
  status: CampaignStatus;
  /** Issue de la mission en cours. */
  outcome: MissionOutcome;
  enemiesLeft: number;

  activeShells: number;
  maxShells: number;
  activeMines: number;
  maxMines: number;
  playerAlive: boolean;
}

export class LocalCampaign implements Session {
  #state: CampaignState;
  #game: LocalGame;

  /**
   * Pas restants avant de charger la mission suivante.
   *
   * Zéro tant que la mission est en cours. Passer par un décompte plutôt que
   * par une date rend la transition indépendante de la fréquence d'affichage,
   * comme le reste de la simulation.
   */
  #pauseTicks = 0;

  constructor(startingMission = 1) {
    this.#state = startCampaign(startingMission);
    this.#game = this.#openMission();
  }

  get world(): World {
    return this.#game.world;
  }

  get playerTank(): Tank | undefined {
    return this.#game.playerTank;
  }

  /** Reprend la campagne depuis la première mission. */
  restart(): void {
    this.#state = startCampaign();
    this.#pauseTicks = 0;
    this.#game = this.#openMission();
  }

  /** Avance d'un pas de simulation, et enchaîne les missions le moment venu. */
  update(input: InputCommand): void {
    this.#game.update(input);

    // Campagne terminée : le monde continue de tourner en toile de fond, mais
    // plus aucune transition n'est déclenchée.
    if (this.#state.status !== 'playing') return;

    if (this.#pauseTicks > 0) {
      this.#pauseTicks--;
      if (this.#pauseTicks === 0) this.#resolve();
      return;
    }

    const outcome = missionOutcome(this.#game.world);
    if (outcome === 'playing') return;

    this.#pauseTicks = secondsToTicks(
      outcome === 'cleared' ? CLEARED_PAUSE_SECONDS : FAILED_PAUSE_SECONDS,
    );
  }

  view(alpha: number): RenderSnapshot {
    return this.#game.view(alpha);
  }

  /** Instantané lisible de la campagne. Sans effet sur la simulation. */
  status(): CampaignView {
    const tank = this.#game.playerTank;
    const mission = missionByNumber(this.#state.mission);

    return {
      mission: this.#state.mission,
      missionName: mission?.name ?? '—',
      totalMissions: CAMPAIGN_LENGTH,
      spares: this.#state.spares,
      attempt: this.#state.attempt,
      status: this.#state.status,
      // Pendant le temps mort la mission est jugée, mais pas encore résolue :
      // c'est ce qui permet au HUD d'afficher le bandeau au bon moment.
      outcome: missionOutcome(this.#game.world),
      enemiesLeft: enemiesRemaining(this.#game.world),

      activeShells: tank?.activeShells ?? 0,
      maxShells: TUNING.tank.maxActiveShells,
      activeMines: tank?.activeMines ?? 0,
      maxMines: TUNING.tank.maxActiveMines,
      playerAlive: tank?.alive ?? false,
    };
  }

  /* ── Enchaînement ────────────────────────────────────────────────────── */

  /** Applique l'issue de la mission écoulée et ouvre la suivante s'il y en a une. */
  #resolve(): void {
    this.#state = advanceCampaign(this.#state, missionOutcome(this.#game.world));
    if (this.#state.status === 'playing') this.#game = this.#openMission();
  }

  /** Charge la mission courante dans un monde neuf. */
  #openMission(): LocalGame {
    const mission = missionByNumber(this.#state.mission);
    if (!mission) throw new Error(`Mission ${this.#state.mission} inexistante`);

    const { world, playerTankIds } = loadMission(mission, { playerIds: [LOCAL_PLAYER] });
    return new LocalGame(world, playerTankIds[0]!);
  }
}
