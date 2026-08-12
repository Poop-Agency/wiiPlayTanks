/**
 * Une partie en ligne : un monde, N joueurs, et l'IA.
 *
 * ─── Ce qui change par rapport à l'ancienne version ─────────────────────────
 *
 * L'ancien serveur relayait du JSON sans jamais le lire, et désignait
 * arbitrairement `player1` comme maître de l'IA — qui diffusait des paquets
 * `enemyMove` que les autres appliquaient aveuglément. Trois conséquences : les
 * états divergeaient à la première perte de paquet, la position d'un joueur
 * était ce qu'il déclarait, et la déconnexion de `player1` arrêtait l'IA.
 *
 * Ici, **la salle est la seule chose qui existe**. Elle détient le monde, elle
 * exécute toute l'IA, et elle n'accepte des clients que des intentions. Un
 * joueur qui part ne retire que son tank.
 *
 * Cette classe ne connaît ni WebSocket ni transport : elle reçoit des messages
 * décodés et rend des messages à envoyer. C'est ce qui la rend testable sans
 * réseau, et c'est comme ça que le test de convergence l'exerce.
 */

import type { EntityId, Grid, InputCommand } from '@core/state';
import { NEUTRAL_INPUT } from '@core/state';
import { TANK_PROFILES } from '@core/systems/ai/profiles';
import { TICK_RATE, secondsToTicks } from '@core/tick';
import { TUNING } from '@core/tuning';
import { CampaignRunner } from '@shared/CampaignRunner';
import { MAX_PLAYERS_PER_ROOM, SNAPSHOT_RATE, stripTiles } from '@shared/protocol';
import type {
  InputMessage,
  LobbyPlayer,
  ServerMessage,
  SnapshotMessage,
  TerrainMessage,
} from '@shared/protocol';

/**
 * Profondeur maximale du tampon anti-gigue, en pas.
 *
 * Les intentions n'arrivent pas à intervalle régulier : le réseau les groupe et
 * les espace. Sans tampon, une rafale de trois messages en ferait consommer un
 * seul et jetterait les deux autres. Au-delà de ce plafond — environ un tiers
 * de seconde d'avance — c'est que le client tourne trop vite ou qu'une rafale
 * est arrivée d'un bloc : on rattrape en consommant plusieurs intentions par
 * pas plutôt que de laisser le retard s'installer.
 */
const MAX_BUFFERED_INPUTS = 20;

/** Profondeur visée : de quoi absorber la gigue sans ajouter de latence perceptible. */
const TARGET_BUFFER_DEPTH = 2;

/**
 * Délai avant qu'un joueur déconnecté perde son tank, en secondes.
 *
 * Une coupure de quelques secondes est banale. Retirer le tank immédiatement
 * punirait un incident réseau ; le laisser indéfiniment laisserait une épave
 * immobile encaisser les tirs à la place de tout le monde.
 */
const DISCONNECT_GRACE_SECONDS = 10;

/** Un joueur, du point de vue de la salle. */
interface Player {
  playerId: string;
  name: string;
  connected: boolean;
  /** Intentions reçues et pas encore appliquées, dans l'ordre d'arrivée. */
  pending: InputMessage[];
  /** Dernière intention appliquée, rejouée si le tampon se vide. */
  lastApplied: InputCommand;
  /** `seq` de la dernière intention appliquée, renvoyé au client. */
  ack: number;
  /** Pas de simulation de la déconnexion, ou `null` si le joueur est là. */
  disconnectedAtTick: number | null;
}

/** Message destiné à un joueur en particulier, ou à tout le salon. */
export interface Outgoing {
  /** Destinataire, ou `null` pour une diffusion. */
  to: string | null;
  message: ServerMessage;
}

export class Room {
  readonly name: string;

  readonly #players = new Map<string, Player>();
  #runner: CampaignRunner | null = null;

  #started = false;

  /** Pas écoulés depuis la création. Sert d'horloge à la salle. */
  #tick = 0;

  /**
   * Terrain déjà envoyé à chaque joueur, pour ne le diffuser qu'au changement.
   *
   * On retient la **grille elle-même** en plus de son numéro de version : le
   * numéro seul ne distingue pas deux missions consécutives, qui commencent
   * toutes deux à zéro. Un joueur qui franchit une mission sans détruire un
   * seul bloc resterait alors sur l'ancien terrain — il verrait des murs que
   * le serveur n'a plus, et les obus les traverseraient.
   *
   * Les deux comparaisons couvrent deux évènements distincts : l'identité
   * change au chargement d'une mission, la version à la destruction d'un bloc
   * (qui mute la grille en place). Le rendu se protège déjà de la même façon,
   * voir `Canvas2DRenderer`.
   */
  readonly #terrainSent = new Map<string, { grid: Grid; version: number }>();

  constructor(name: string) {
    this.name = name;
  }

  get started(): boolean {
    return this.#started;
  }

  get tick(): number {
    return this.#tick;
  }

  /** Monde courant, ou `null` tant que la partie n'a pas démarré. */
  get world(): CampaignRunner['world'] | null {
    return this.#runner?.world ?? null;
  }

  get isEmpty(): boolean {
    return this.#players.size === 0;
  }

  /* ── Cycle de vie des joueurs ─────────────────────────────────────────── */

  /**
   * Installe ou réinstalle un joueur.
   *
   * Un identifiant déjà connu **reprend son siège** : c'est ce qui rend une
   * reconnexion transparente après une coupure passagère.
   */
  join(playerId: string, name: string): Outgoing[] {
    const existing = this.#players.get(playerId);

    // Un siège se garde à la reconnexion (`existing`), mais un salon plein
    // refuse un nouveau venu : au-delà, `PLAYER_SEAT_COLORS` n'a plus de
    // couleur à donner, et les points de départ dérivés n'ont plus de place.
    if (!existing && this.#players.size >= MAX_PLAYERS_PER_ROOM) {
      return [
        {
          to: playerId,
          message: { t: 'bye', reason: `Salon complet (${MAX_PLAYERS_PER_ROOM} joueurs maximum).` },
        },
      ];
    }

    if (existing) {
      existing.connected = true;
      existing.disconnectedAtTick = null;
      existing.name = name;
    } else {
      this.#players.set(playerId, {
        playerId,
        name,
        connected: true,
        pending: [],
        lastApplied: NEUTRAL_INPUT,
        ack: -1,
        disconnectedAtTick: null,
      });
      // Arrivée libre : un nouveau venu reçoit un tank tout de suite plutôt que
      // d'attendre la mission suivante.
      this.#runner?.addPlayer(playerId);
    }

    // Le terrain devra être renvoyé : le client n'en a aucun.
    this.#terrainSent.delete(playerId);

    const messages: Outgoing[] = [
      {
        to: playerId,
        message: {
          t: 'welcome',
          playerId,
          room: this.name,
          tickRate: TICK_RATE,
          snapshotRate: SNAPSHOT_RATE,
          tuning: TUNING,
          profiles: TANK_PROFILES,
        },
      },
    ];

    messages.push(this.#lobbyMessage());
    return messages;
  }

  /** Signale une coupure. Le tank reste quelques secondes avant d'être retiré. */
  disconnect(playerId: string): Outgoing[] {
    const player = this.#players.get(playerId);
    if (!player) return [];

    player.connected = false;
    player.disconnectedAtTick = this.#tick;
    // Sinon le tank continuerait sur sa lancée, touche enfoncée, sans personne
    // derrière.
    player.lastApplied = NEUTRAL_INPUT;
    player.pending.length = 0;

    return [this.#lobbyMessage()];
  }

  /**
   * Démarre la partie. Sans effet si elle a déjà commencé.
   *
   * `MIN_PLAYERS_TO_START` n'est pas imposé ici : c'est une recommandation du
   * salon, pas une règle du serveur. Un salon d'un seul joueur reste un co-op
   * valide — c'est ce qui permet de tester une partie en ligne seul, et c'est
   * exactement ce sur quoi repose l'isolation entre salons (voir les tests).
   */
  start(): Outgoing[] {
    if (this.#started) return [];

    this.#started = true;
    this.#runner = new CampaignRunner({ playerIds: [...this.#players.keys()] });

    return [this.#lobbyMessage()];
  }

  /** Enregistre une intention. Le serveur ne lit jamais autre chose d'un client. */
  input(playerId: string, message: InputMessage): void {
    const player = this.#players.get(playerId);
    if (!player) return;

    // Une intention déjà dépassée est un doublon ou un message en retard :
    // l'appliquer ferait reculer le tank.
    if (message.seq <= player.ack) return;

    player.pending.push(message);

    // Un client qui inonderait la salle ne doit pas la faire gonfler sans fin.
    if (player.pending.length > MAX_BUFFERED_INPUTS) {
      player.pending.splice(0, player.pending.length - MAX_BUFFERED_INPUTS);
    }
  }

  /* ── Simulation ───────────────────────────────────────────────────────── */

  /** Avance la salle d'un pas. */
  step(): void {
    this.#tick++;

    const runner = this.#runner;
    if (!runner) return;

    this.#dropExpiredPlayers(runner);

    const intents = new Map<string, InputCommand>();
    for (const player of this.#players.values()) {
      intents.set(player.playerId, this.#nextInput(player));
    }

    runner.step(runner.inputsFor(intents));
  }

  /**
   * Prélève l'intention du pas pour un joueur.
   *
   * Trois cas, et c'est tout le rôle du tampon anti-gigue :
   *
   *   - tampon vide → on rejoue la dernière intention connue. Un déplacement est
   *     un état maintenu : le tank continue plutôt que de saccader ;
   *   - tampon à la profondeur visée → on consomme une intention ;
   *   - tampon trop rempli → on en consomme deux, pour résorber l'avance sans
   *     jeter d'intention et sans laisser la latence s'installer.
   */
  #nextInput(player: Player): InputCommand {
    let consumed = player.pending.shift();
    if (!consumed) return player.lastApplied;

    if (player.pending.length > TARGET_BUFFER_DEPTH) {
      const extra = player.pending.shift();
      if (extra) consumed = extra;
    }

    player.lastApplied = consumed.input;
    player.ack = consumed.seq;
    return consumed.input;
  }

  /** Retire les joueurs dont le délai de grâce a expiré. */
  #dropExpiredPlayers(runner: CampaignRunner): void {
    const grace = secondsToTicks(DISCONNECT_GRACE_SECONDS);

    for (const player of [...this.#players.values()]) {
      if (player.disconnectedAtTick === null) continue;
      if (this.#tick - player.disconnectedAtTick < grace) continue;

      this.#players.delete(player.playerId);
      this.#terrainSent.delete(player.playerId);
      // L'IA et les autres joueurs ne s'en aperçoivent pas : seul le tank part.
      runner.removePlayer(player.playerId);
    }
  }

  /* ── Diffusion ────────────────────────────────────────────────────────── */

  /**
   * Compose les messages du prochain envoi.
   *
   * L'instantané est individuel malgré son contenu commun : chaque client a son
   * propre accusé de réception et son propre tank à prédire.
   */
  broadcast(): Outgoing[] {
    const runner = this.#runner;
    if (!runner) return [];

    const world = runner.world;
    const messages: Outgoing[] = [];
    const partial = stripTiles(world);

    for (const player of this.#players.values()) {
      if (!player.connected) continue;

      // Le terrain ne repart qu'au changement : c'est de loin le plus gros
      // objet de l'état, et il ne bouge qu'à la destruction d'un bloc ou au
      // changement de mission. Voir `#terrainSent` pour le détail des deux
      // comparaisons.
      const sent = this.#terrainSent.get(player.playerId);
      if (sent?.grid !== world.grid || sent.version !== world.grid.version) {
        this.#terrainSent.set(player.playerId, { grid: world.grid, version: world.grid.version });
        const terrain: TerrainMessage = { t: 'terrain', grid: world.grid };
        messages.push({ to: player.playerId, message: terrain });
      }

      const snapshot: SnapshotMessage = {
        t: 'snapshot',
        // L'horloge de la salle, monotone, et non celle du monde qui repart de
        // zéro à chaque mission.
        tick: this.#tick,
        ack: player.ack,
        yourTankId: runner.tankIdOf(player.playerId) ?? null,
        gridVersion: world.grid.version,
        world: partial,
        campaign: runner.campaign,
        phase: runner.phase,
      };

      messages.push({ to: player.playerId, message: snapshot });
    }

    return messages;
  }

  /** Identifiant du tank d'un joueur, ou `undefined`. Sert aux tests. */
  tankIdOf(playerId: string): EntityId | undefined {
    return this.#runner?.tankIdOf(playerId);
  }

  #lobbyMessage(): Outgoing {
    const players: LobbyPlayer[] = [...this.#players.values()].map((player) => ({
      playerId: player.playerId,
      name: player.name,
      connected: player.connected,
    }));

    return { to: null, message: { t: 'lobby', room: this.name, players, started: this.#started } };
  }
}
