/**
 * Partie en ligne, vue du client.
 *
 * ─── Les deux régimes, et pourquoi ils cohabitent ───────────────────────────
 *
 * **Le tank local est prédit.** Son intention s'applique au pas même où elle est
 * saisie, sans attendre le serveur — sinon le pilotage serait pâteux, et c'est
 * la première chose qu'on remarque. Voir {@link Reconciler}.
 *
 * **Tout le reste est interpolé, avec ~100 ms de retard.** Les autres joueurs,
 * les ennemis, les obus : leurs positions viennent des instantanés reçus, et on
 * les affiche entre les deux derniers plutôt qu'au dernier connu. Ces entités
 * ne sont **jamais** prédites : le client ignore les intentions des autres
 * joueurs, une prédiction serait donc une invention, et chaque instantané la
 * corrigerait par une téléportation.
 *
 * Le prix de ces 100 ms, c'est de voir les autres légèrement dans le passé. Le
 * prix de la prédiction, ce serait de les voir sauter. Le second se remarque
 * beaucoup plus.
 *
 * ─── Ce qui est dessiné vient donc de deux sources ──────────────────────────
 *
 *     tank local  ──► monde prédit          (immédiat)
 *     le reste    ──► tampon d'instantanés  (retardé, lissé)
 */

import type { EntityId, InputCommand, Tank, TileKind, World } from '@core/state';
import { TANK_PROFILES } from '@core/systems/ai/profiles';
import { DT, TICK_RATE } from '@core/tick';
import { TUNING } from '@core/tuning';
import { createWorld } from '@core/world';
import type { CampaignSettings, CampaignState } from '@shared/campaign';
import type { CampaignPhase } from '@shared/CampaignRunner';
import { DEFAULT_CAMPAIGN_SETTINGS, startCampaign } from '@shared/campaign';
import { ARENA_HEIGHT_TILES, ARENA_WIDTH_TILES } from '@shared/missions/missions';
import {
  INTERPOLATION_DELAY_SECONDS,
  MAX_PLAYERS_PER_ROOM,
  MIN_PLAYERS_TO_START,
  withTiles,
} from '@shared/protocol';
import type { LobbyPlayer, PlayerScore, ServerMessage } from '@shared/protocol';
import { captureSnapshot, interpolateSnapshots } from '../render/snapshots';
import type { RenderSnapshot } from '../render/snapshots';
import { buildCampaignView } from '../session';
import type { CampaignView, Session } from '../session';
import type { Transport } from './connection';
import { Reconciler } from './reconciler';

/** Retard d'affichage des entités distantes, en pas de simulation. */
const INTERPOLATION_DELAY_TICKS = INTERPOLATION_DELAY_SECONDS * TICK_RATE;

/**
 * Instantanés conservés.
 *
 * Deux suffisent à interpoler ; on en garde davantage pour absorber une arrivée
 * groupée sans perdre l'échantillon d'avant.
 */
const BUFFER_SIZE = 8;

/**
 * Écart au-delà duquel l'horloge d'affichage est recalée d'un coup, en pas.
 *
 * En deçà, on la corrige par petites touches — un saut d'horloge se voit comme
 * une saccade générale. Au-delà, c'est une coupure ou un changement de salle :
 * rattraper en douceur prendrait plusieurs secondes.
 */
const CLOCK_SNAP_TICKS = 30;

interface BufferedSnapshot {
  /** Horloge monotone de la salle. */
  tick: number;
  view: RenderSnapshot;
}

export class NetworkSession implements Session {
  readonly #transport: Transport;
  readonly #reconciler = new Reconciler();

  /** Monde affiché tant qu'aucun instantané n'est arrivé. */
  #placeholder: World;

  /** Tuiles du terrain courant, reçues à part des instantanés. */
  #tiles: TileKind[] | null = null;

  #buffer: BufferedSnapshot[] = [];

  /**
   * Horloge d'affichage, en pas de la salle.
   *
   * Avance d'un pas par pas de simulation local, et se recale doucement pour
   * rester {@link INTERPOLATION_DELAY_TICKS} derrière le dernier instantané reçu.
   */
  #renderClock = 0;
  #clockStarted = false;

  #campaign: CampaignState = startCampaign();
  #phase: CampaignPhase = 'playing';
  #players: LobbyPlayer[] = [];
  #scores: PlayerScore[] = [];
  #settings: CampaignSettings = DEFAULT_CAMPAIGN_SETTINGS;
  #started = false;
  #room = '';

  /** Raison d'un refus du serveur (salon plein…), affichée dans le salon d'attente. */
  #byeReason: string | null = null;

  /** Numéro de la prochaine intention émise. */
  #seq = 0;

  #playerId: string | null = null;
  #connected = false;

  constructor(transport: Transport) {
    this.#transport = transport;
    this.#placeholder = createWorld({
      width: ARENA_WIDTH_TILES,
      height: ARENA_HEIGHT_TILES,
      seed: 0,
    });
  }

  /* ── Contrat de session ───────────────────────────────────────────────── */

  get world(): World {
    return this.#reconciler.world ?? this.#placeholder;
  }

  get playerTank(): Tank | undefined {
    const id = this.#reconciler.localTankId;
    if (id === null) return undefined;
    return this.#reconciler.world?.tanks.find((tank) => tank.id === id);
  }

  /** Y a-t-il un lien avec le serveur ? Le HUD l'affiche. */
  get connected(): boolean {
    return this.#connected;
  }

  update(input: InputCommand): void {
    const seq = this.#seq++;

    // L'intention part avant d'être appliquée : c'est la seule chose que le
    // serveur acceptera d'un client, et plus tôt elle part, plus tôt elle
    // est prise en compte.
    this.#transport.send({ t: 'input', seq, input });
    this.#reconciler.predict(seq, input);

    if (this.#clockStarted) this.#renderClock += 1;
  }

  view(alpha: number): RenderSnapshot {
    const remote = this.#interpolateRemote(alpha);
    return this.#overrideLocalTank(remote);
  }

  status(): CampaignView {
    const teammates = this.#players
      .filter((player) => player.playerId !== this.#playerId)
      .map((player) => (player.connected ? player.name : `${player.name} (hors ligne)`));

    // Trié par prises décroissantes : c'est un classement, il se lit de haut en
    // bas. À égalité, l'ordre des sièges — stable d'un instantané à l'autre,
    // donc les lignes ne dansent pas.
    const scores = [...this.#scores]
      .sort((left, right) => right.kills - left.kills)
      .map((entry) => ({
        name: entry.name,
        kills: entry.kills,
        you: entry.playerId === this.#playerId,
      }));

    // Tant qu'aucun instantané n'est arrivé, `this.world` est un monde d'attente
    // sans le moindre tank. `missionOutcome` y lirait « aucun joueur vivant » et
    // afficherait un bandeau d'échec avant même que la connexion se termine —
    // un faux « TANK DÉTRUIT » au chargement, systématique en co-op. Le vrai
    // jugement n'a de sens qu'une fois qu'un premier monde réel est arrivé.
    if (!this.#reconciler.world) {
      const base = {
        ...buildCampaignView(this.#campaign, this.#placeholder, undefined, teammates),
        missionName: this.#connected ? 'Connexion à la partie…' : 'Connexion au serveur…',
        outcome: 'playing' as const,
        playerAlive: true,
      };

      // Le salon n'a de sens qu'une fois connecté et tant que la partie n'a
      // pas démarré : avant ça il n'y a encore rien à choisir, après ça il
      // n'y a plus rien à attendre.
      if (!this.#connected || this.#started) return base;

      return {
        ...base,
        lobby: {
          room: this.#room,
          players: this.#players,
          minPlayers: MIN_PLAYERS_TO_START,
          maxPlayers: MAX_PLAYERS_PER_ROOM,
          error: this.#byeReason,
          settings: this.#settings,
        },
      };
    }

    return buildCampaignView(
      this.#campaign,
      this.world,
      this.playerTank,
      teammates,
      this.#phase,
      scores,
    );
  }

  /**
   * Demande le démarrage, ou la reprise d'une campagne terminée.
   *
   * L'arbitrage appartient au serveur, seul à savoir où en est la partie : il
   * démarre, relance ou ignore. Le client filtrait autrefois lui-même sur « la
   * partie a-t-elle déjà démarré », ce qui rendait une campagne perdue
   * définitivement bloquée — plus rien ne repartait.
   */
  restart(): void {
    this.#transport.send({ t: 'start' });
  }

  /* ── Réception ────────────────────────────────────────────────────────── */

  /** Traite un message du serveur. Point d'entrée unique du réseau. */
  handle(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        this.#playerId = message.playerId;
        this.#room = message.room;
        this.#connected = true;
        this.#byeReason = null;
        // Le serveur fait autorité jusque sur les réglages : la prédiction doit
        // tourner sur exactement la même table, sinon elle dérive à chaque pas
        // et se fait corriger en permanence.
        Object.assign(TUNING, message.tuning);
        Object.assign(TANK_PROFILES, message.profiles);
        break;

      case 'lobby':
        this.#players = message.players;
        this.#started = message.started;
        // Même raison que pour les scores : un serveur d'une version antérieure
        // n'envoie pas ce champ, et le salon ne doit pas tomber pour autant.
        this.#settings = message.settings ?? DEFAULT_CAMPAIGN_SETTINGS;
        break;

      case 'terrain':
        this.#tiles = message.grid.tiles;
        break;

      case 'snapshot':
        this.#applySnapshot(message);
        break;

      case 'bye':
        this.#connected = false;
        this.#byeReason = message.reason;
        this.#reconciler.reset();
        break;
    }
  }

  /** Signale la perte du lien. Le dernier état reste affiché, figé. */
  disconnected(): void {
    this.#connected = false;
  }

  #applySnapshot(message: Extract<ServerMessage, { t: 'snapshot' }>): void {
    // Sans terrain, impossible de reconstruire un monde jouable : la collision
    // lirait un tableau de tuiles vide et rien ne bloquerait plus.
    if (!this.#tiles) return;

    const world = withTiles(message.world, this.#tiles);
    const previous = this.#reconciler.world;

    this.#reconciler.reconcile(world, message.ack, message.yourTankId);
    this.#campaign = message.campaign;
    this.#phase = message.phase;
    // Le repli n'est pas décoratif : pendant un déploiement, un client déjà
    // chargé continue de parler à un serveur qui n'a pas encore redémarré, et
    // reçoit donc des instantanés sans ce champ. Sans garde, `status()` lèverait
    // à chaque image et la boucle de rendu mourrait — le jeu se fige, ce qui ne
    // ressemble en rien à sa cause.
    this.#scores = message.scores ?? [];

    // Changement de mission : le monde repart de zéro, et interpoler d'une
    // arène à l'autre ferait glisser les tanks à travers l'écran.
    if (previous && world.tick < previous.tick) this.#buffer = [];

    this.#buffer.push({ tick: message.tick, view: captureSnapshot(world) });
    if (this.#buffer.length > BUFFER_SIZE) this.#buffer.shift();

    this.#steerClock(message.tick);
  }

  /**
   * Recale l'horloge d'affichage sur le flux reçu.
   *
   * Le client et le serveur ne comptent pas exactement à la même vitesse : sans
   * correction, l'horloge finirait par sortir du tampon, d'un côté ou de
   * l'autre. La correction est d'un pas à la fois — un rattrapage brutal se
   * verrait comme une saccade générale.
   */
  #steerClock(serverTick: number): void {
    const target = serverTick - INTERPOLATION_DELAY_TICKS;

    if (!this.#clockStarted || Math.abs(this.#renderClock - target) > CLOCK_SNAP_TICKS) {
      this.#renderClock = target;
      this.#clockStarted = true;
      return;
    }

    if (this.#renderClock < target - 1) this.#renderClock += 1;
    else if (this.#renderClock > target + 1) this.#renderClock -= 1;
  }

  /* ── Composition de l'image ───────────────────────────────────────────── */

  /** Entités distantes, lues dans le passé et lissées entre deux instantanés. */
  #interpolateRemote(alpha: number): RenderSnapshot {
    const last = this.#buffer[this.#buffer.length - 1];
    if (!last) return captureSnapshot(this.world);

    const when = this.#renderClock + alpha;

    // On cherche l'intervalle qui encadre l'instant visé.
    for (let index = this.#buffer.length - 1; index > 0; index--) {
      const after = this.#buffer[index]!;
      const before = this.#buffer[index - 1]!;

      if (when < before.tick || when > after.tick) continue;

      const span = after.tick - before.tick;
      const ratio = span > 0 ? (when - before.tick) / span : 1;
      return interpolateSnapshots(before.view, after.view, ratio);
    }

    // Hors tampon : soit on est en avance sur le flux et il n'y a rien de plus
    // récent à montrer, soit on a pris trop de retard. Le plus proche des deux
    // bouts vaut mieux qu'une extrapolation inventée.
    return when > last.tick ? last.view : this.#buffer[0]!.view;
  }

  /**
   * Remplace le tank local par sa position prédite.
   *
   * C'est le point de jonction des deux régimes : le reste de l'image vient du
   * passé, ce tank-ci vient du présent.
   */
  #overrideLocalTank(view: RenderSnapshot): RenderSnapshot {
    const world = this.#reconciler.world;
    const id: EntityId | null = this.#reconciler.localTankId;
    if (!world || id === null) return view;

    const predicted = captureSnapshot(world).tanks.find((tank) => tank.id === id);
    if (!predicted) return view;

    const tanks = view.tanks.filter((tank) => tank.id !== id);
    tanks.push(predicted);

    return { ...view, tanks };
  }
}

/** Durée d'un pas, réexportée pour les tests de cadence réseau. */
export { DT };
