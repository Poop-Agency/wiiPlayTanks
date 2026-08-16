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
import { DEFAULT_CAMPAIGN_SETTINGS, advanceCampaign, startCampaign } from './campaign';
import type { CampaignSettings, CampaignState } from './campaign';
import { loadMission } from './missions/load';
import { missionByNumber } from './missions/missions';

/**
 * Temps mort après une mission réussie, en secondes.
 *
 * Le monde est **figé** pendant ce délai : plus un tank ne bouge, plus un obus
 * n'avance. C'est ce que fait l'original, et c'est indispensable — sans ça, un
 * obus encore en vol après la victoire pouvait tuer le joueur pendant le temps
 * mort, et l'issue recalculée à la fin renvoyait alors sur la mission qu'on
 * venait de gagner.
 */
const CLEARED_PAUSE_SECONDS = 2;

/** Temps mort après un échec. Le monde y est figé de la même façon. */
const FAILED_PAUSE_SECONDS = 2.2;

/**
 * Durée de l'annonce qui précède une mission, en secondes.
 *
 * La mission est déjà chargée mais reste figée : on montre les ennemis qui
 * attendent, puis tout démarre d'un coup — le monde et sa musique ensemble.
 */
const BRIEFING_SECONDS = 3;

/**
 * Où en est le runner dans le cycle d'une mission.
 *
 * `ending` et `briefing` figent tous deux la simulation, mais ne montrent pas
 * la même chose : le premier conclut la mission écoulée, le second annonce
 * celle qui vient.
 */
export type CampaignPhase = 'playing' | 'ending' | 'briefing';

export interface CampaignRunnerOptions {
  /** Joueurs présents au départ, dans l'ordre des sièges. */
  playerIds: readonly string[];
  /** Mission de départ, à partir de 1. */
  startingMission?: number;
  /** Variantes de règles. Par défaut, celles du jeu original. */
  settings?: CampaignSettings;
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

  #phase: CampaignPhase = 'playing';

  /**
   * Ennemis détruits par chaque joueur depuis le début de la partie.
   *
   * Le compteur du tank, lui, appartient au monde et disparaît avec lui à
   * chaque mission. On replie donc ici ce qu'il portait avant de le jeter, et
   * le score affiché est la somme des deux — voir {@link scores}.
   *
   * Indexé par identifiant de joueur et non par tank : c'est le seul des deux
   * qui survit à une mission, à une mort, et à une reconnexion.
   */
  readonly #closedKills = new Map<string, number>();

  readonly #settings: CampaignSettings;

  /**
   * Ennemis déjà détruits sur la mission en cours, quand ils ne reviennent pas.
   *
   * Retenus par **rang dans la liste des ennemis de la mission** : c'est le seul
   * repère stable d'une tentative à l'autre, les identifiants d'entités étant
   * réattribués à chaque rechargement du monde.
   *
   * Vidé dès qu'on change de mission — la mémoire ne porte que sur les
   * tentatives successives d'une même arène.
   */
  readonly #clearedEnemies = new Set<number>();

  /** Rang de mission de chaque tank ennemi du monde courant. */
  #enemyRankByTankId: ReadonlyMap<EntityId, number> = new Map();

  /**
   * Issue retenue au moment où elle s'est produite.
   *
   * Elle est prononcée dès que la mission bascule, et non relue à la fin du
   * temps mort : sans cette mémoire, tout changement survenu entretemps
   * pourrait la contredire.
   */
  #decided: MissionOutcome | null = null;

  constructor({
    playerIds,
    startingMission = 1,
    settings = DEFAULT_CAMPAIGN_SETTINGS,
  }: CampaignRunnerOptions) {
    this.#playerIds = [...playerIds];
    this.#settings = settings;
    this.#state = startCampaign(startingMission);
    this.#world = this.#openMission();
    // Une partie commence comme n'importe quel round : par son annonce. Tomber
    // directement dans l'arène est brutal, et prive de l'information la plus
    // utile — ce qui attend, surtout si l'on reprend en pleine campagne.
    this.#beginBriefing();
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

  /** Où en est le cycle de mission. Le rendu s'en sert pour choisir son écran. */
  get phase(): CampaignPhase {
    return this.#phase;
  }

  /** Joueurs installés, dans l'ordre des sièges. */
  get playerIds(): readonly string[] {
    return this.#playerIds;
  }

  /**
   * Ennemis détruits par joueur depuis le début de la partie, sièges compris.
   *
   * Somme de ce qui a été replié aux missions précédentes et de ce que le tank
   * courant a marqué depuis. Un joueur sans tank — mort, ou tout juste arrivé —
   * garde son total.
   */
  get scores(): ReadonlyMap<string, number> {
    const scores = new Map<string, number>();

    for (const playerId of this.#playerIds) {
      const current = this.tankOf(playerId)?.kills ?? 0;
      scores.set(playerId, (this.#closedKills.get(playerId) ?? 0) + current);
    }

    return scores;
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
    // Ses prises de la mission en cours sont repliées avant que son tank
    // disparaisse : s'il revient plus tard, il retrouve son score.
    const scored = this.tankOf(playerId)?.kills ?? 0;
    if (scored > 0) {
      this.#closedKills.set(playerId, (this.#closedKills.get(playerId) ?? 0) + scored);
    }

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
    this.#decided = null;
    this.#world = this.#openMission();
    // Nouvelle partie, tableau remis à zéro : `#openMission` vient de replier
    // les prises de la partie qu'on abandonne, on les efface derrière lui.
    this.#closedKills.clear();
    this.#beginBriefing();
  }

  /**
   * Avance d'un pas, et enchaîne les missions le moment venu.
   *
   * @param inputs intentions des joueurs pour ce pas, par identifiant de tank
   */
  step(inputs: TickInputs): void {
    // Campagne terminée : le monde continue de tourner en toile de fond, mais
    // plus aucune transition n'est déclenchée.
    if (this.#state.status !== 'playing') {
      tick(this.#world, inputs);
      return;
    }

    // Les deux phases de transition figent la simulation. C'est tout le
    // correctif : un obus en vol ne peut plus rien changer à une issue déjà
    // prononcée.
    if (this.#phase !== 'playing') {
      this.#pauseTicks--;
      if (this.#pauseTicks > 0) return;

      if (this.#phase === 'ending') this.#resolve();
      else this.#phase = 'playing';
      return;
    }

    tick(this.#world, inputs);

    const outcome = missionOutcome(this.#world);
    if (outcome === 'playing') return;

    // L'issue est **retenue** ici, au moment où elle se produit, et non
    // relue à la fin du temps mort : c'est elle qui fait foi.
    this.#decided = outcome;
    this.#phase = 'ending';
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
    // `#decided` et non `missionOutcome(this.#world)` : le monde a pu changer
    // depuis, et c'est l'issue prononcée sur le moment qui compte.
    const outcome = this.#decided ?? missionOutcome(this.#world);
    const from = this.#state.mission;

    this.#state = advanceCampaign(this.#state, outcome, this.#settings);
    this.#decided = null;

    // La mémoire des ennemis abattus ne vaut que pour les tentatives
    // successives d'une même arène : on la remplit sur un échec, on la vide dès
    // qu'on avance. Le test sur le numéro de mission couvre les deux cas d'un
    // coup, y compris la partie perdue qui ne rouvrira jamais rien.
    if (this.#state.mission !== from) this.#clearedEnemies.clear();
    else if (outcome === 'failed' && !this.#settings.respawnEnemiesOnRetry) {
      this.#rememberClearedEnemies();
    }

    if (this.#state.status !== 'playing') {
      this.#phase = 'playing';
      return;
    }

    // La mission suivante est chargée tout de suite, mais reste figée le temps
    // de l'annonce : c'est ce qui permet d'afficher ses ennemis avant qu'elle
    // ne démarre, et de faire partir le monde et sa musique ensemble.
    this.#world = this.#openMission();
    this.#beginBriefing();
  }

  /**
   * Note quels ennemis ne reviendront pas à la prochaine tentative.
   *
   * Les rangs déjà retenus le restent : sur une troisième tentative, ce qui a
   * été abattu aux deux premières compte toujours.
   */
  #rememberClearedEnemies(): void {
    for (const [tankId, rank] of this.#enemyRankByTankId) {
      const tank = this.#world.tanks.find((candidate) => candidate.id === tankId);
      // Absent du monde ou mort : dans les deux cas il a été détruit.
      if (!tank || !tank.alive) this.#clearedEnemies.add(rank);
    }
  }

  /**
   * Replie les prises du monde courant avant de le jeter.
   *
   * Appelé juste avant d'ouvrir une mission, et non après : à ce moment-là le
   * monde sortant est encore là, tanks compris. L'appeler après reviendrait à
   * compter les prises du monde entrant, qui sont nulles.
   */
  #foldKills(): void {
    for (const playerId of this.#playerIds) {
      const kills = this.tankOf(playerId)?.kills;
      if (!kills) continue;
      this.#closedKills.set(playerId, (this.#closedKills.get(playerId) ?? 0) + kills);
    }
  }

  /** Fige la mission chargée le temps de son annonce. */
  #beginBriefing(): void {
    this.#phase = 'briefing';
    this.#pauseTicks = secondsToTicks(BRIEFING_SECONDS);
  }

  /** Charge la mission courante dans un monde neuf. */
  #openMission(): World {
    this.#foldKills();

    const mission = missionByNumber(this.#state.mission);
    if (!mission) throw new Error(`Mission ${this.#state.mission} inexistante`);

    const { world, playerTankIds, enemyRankByTankId } = loadMission(mission, {
      playerIds: this.#playerIds,
      skipEnemies: this.#clearedEnemies,
    });

    this.#tankByPlayer = new Map(
      this.#playerIds.map((playerId, index) => [playerId, playerTankIds[index]!]),
    );
    this.#enemyRankByTankId = enemyRankByTankId;

    return world;
  }
}
