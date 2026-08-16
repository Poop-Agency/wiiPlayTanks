/**
 * Messages échangés entre client et serveur.
 *
 * ─── Le principe qui gouverne tout ce fichier ───────────────────────────────
 *
 * **Le client n'envoie que des intentions, jamais un état.** Pas de position,
 * pas de vitesse, pas de « j'ai touché ». Un client malveillant ne peut donc
 * pas se téléporter ni s'attribuer une victoire : au mieux, il envoie des
 * intentions absurdes, que le serveur applique — et les règles s'appliquent à
 * lui comme aux autres.
 *
 * L'ancienne version faisait l'inverse : elle diffusait les coordonnées, et le
 * serveur relayait sans lire. Tricher revenait à éditer un champ.
 *
 * ─── Ce qui circule dans l'autre sens ───────────────────────────────────────
 *
 * Le serveur diffuse l'état complet du monde à 20 Hz, **sauf le terrain**, qui
 * ne change qu'à la destruction d'un bloc. Le terrain part à part, quand son
 * numéro de version bouge : c'est de loin le plus gros objet de l'état, et le
 * renvoyer soixante fois par seconde pour rien multiplierait le débit par cinq.
 */

import type { Grid, InputCommand, TileKind, World } from '@core/state';
import type { TankProfile } from '@core/systems/ai/profiles';
import type { TankColor } from '@core/state';
import type { Tuning } from '@core/tuning';
import type { CampaignSettings, CampaignState } from './campaign';
import type { CampaignPhase } from './CampaignRunner';

/** Version du protocole. Un client d'une autre version est refusé à la porte. */
export const PROTOCOL_VERSION = 1;

/** Fréquence de diffusion des instantanés, en hertz. */
export const SNAPSHOT_RATE = 20;

/**
 * Retard d'interpolation des entités distantes, en secondes.
 *
 * Un peu plus que l'intervalle entre deux instantanés (50 ms) : il faut avoir
 * reçu le suivant pour interpoler vers lui. Trop court, le client manque de
 * données et fige ; trop long, tout le monde joue dans le passé.
 */
export const INTERPOLATION_DELAY_SECONDS = 0.1;

/**
 * Nombre de joueurs nécessaire pour démarrer une partie en salon.
 *
 * En dessous, ce n'est pas du co-op : un seul joueur passe par le mode
 * `?mission=` (campagne solo, sans salon d'attente).
 */
export const MIN_PLAYERS_TO_START = 2;

/**
 * Sièges disponibles dans un salon.
 *
 * Borné par `PLAYER_SEAT_COLORS` (`@core/state`), qui n'a qu'une couleur par
 * siège — et par les points de départ dérivés autour du spawn d'origine de
 * chaque mission, qui ne garantissent une place propre qu'à ce nombre.
 */
export const MAX_PLAYERS_PER_ROOM = 4;

/* ── Client → serveur ───────────────────────────────────────────────────── */

/** Demande d'entrée dans un salon. */
export interface JoinMessage {
  t: 'join';
  version: number;
  /** Salon visé. Créé s'il n'existe pas. */
  room: string;
  /** Nom affiché dans le lobby. */
  name: string;
}

/**
 * Changement de règles, depuis le salon d'attente.
 *
 * N'importe quel joueur du salon peut l'émettre, et le serveur l'ignore une fois
 * la partie lancée : la réserve de tanks est commune, changer les règles en
 * cours de route ferait de la partie une cible mouvante.
 */
export interface SettingsMessage {
  t: 'settings';
  settings: CampaignSettings;
}

/**
 * Fait entrer un spectateur.
 *
 * Émis par un joueur déjà en place — un spectateur ne s'accepte pas lui-même.
 * L'entrée prend effet à la mission suivante : installer un tank au milieu d'un
 * combat déplacerait tout le monde, la position de départ appartenant à la
 * mission.
 */
export interface AdmitMessage {
  t: 'admit';
  /** Spectateur à faire entrer. */
  playerId: string;
}

/**
 * Intention pour un pas.
 *
 * `seq` est le numéro de pas **du client**. Le serveur le renvoie tel quel dans
 * son accusé de réception, ce qui permet au client de savoir quelles intentions
 * sont déjà prises en compte et lesquelles il doit rejouer.
 */
export interface InputMessage {
  t: 'input';
  seq: number;
  input: InputCommand;
}

/** Demande de démarrage de la partie. N'importe quel joueur du salon peut la faire. */
export interface StartMessage {
  t: 'start';
}

export type ClientMessage =
  | JoinMessage
  | InputMessage
  | StartMessage
  | SettingsMessage
  | AdmitMessage;

/* ── Serveur → client ───────────────────────────────────────────────────── */

/**
 * Accueil.
 *
 * Contient la **table de réglages du serveur** : la prédiction du client doit
 * tourner sur exactement les mêmes constantes que l'autorité, sinon elle
 * dérive à chaque pas et se fait corriger en permanence. C'est le serveur qui
 * fait foi, y compris sur les réglages.
 */
export interface WelcomeMessage {
  t: 'welcome';
  playerId: string;
  room: string;
  tickRate: number;
  snapshotRate: number;
  tuning: Tuning;
  profiles: Record<TankColor, TankProfile>;
}

/** Un joueur du salon, tel qu'affiché dans le lobby. */
export interface LobbyPlayer {
  playerId: string;
  name: string;
  connected: boolean;
  /**
   * Présent sans tank : il a rejoint une partie déjà lancée.
   *
   * On ne s'installe pas au milieu d'un combat — il regarde jusqu'à ce qu'un
   * joueur en place le fasse entrer, ou qu'une nouvelle campagne commence.
   */
  spectator: boolean;
}

export interface LobbyMessage {
  t: 'lobby';
  room: string;
  players: LobbyPlayer[];
  started: boolean;
  /** Règles retenues pour ce salon, affichées avant le départ. */
  settings: CampaignSettings;
}

/** Prises d'un joueur, pour le tableau des scores. */
export interface PlayerScore {
  playerId: string;
  name: string;
  /** Ennemis détruits depuis le début de la partie. */
  kills: number;
}

/**
 * Terrain de la mission courante.
 *
 * Envoyé à la connexion, puis seulement quand `version` change — c'est-à-dire
 * à une destruction de bloc ou à un changement de mission.
 */
export interface TerrainMessage {
  t: 'terrain';
  grid: Grid;
}

/**
 * État du monde à un pas donné, terrain exclu.
 *
 * `ack` est le `seq` de la dernière intention du destinataire prise en compte.
 * Chaque client en reçoit donc un différent : l'instantané est diffusé, cette
 * valeur ne l'est pas.
 */
export interface SnapshotMessage {
  t: 'snapshot';
  /**
   * Horloge **monotone** de la salle, en pas.
   *
   * Et non `world.tick`, qui repart de zéro à chaque mission : le client s'en
   * sert de base de temps pour interpoler les entités distantes, et une horloge
   * qui recule ferait sauter cette interpolation à chaque changement d'arène.
   */
  tick: number;
  ack: number;
  /** Tank du destinataire, pour qu'il sache lequel prédire. */
  yourTankId: number | null;
  /** Version du terrain courant, pour détecter un `terrain` manquant. */
  gridVersion: number;
  /** Le monde, sans les tuiles. */
  world: WorldWithoutTiles;
  campaign: CampaignState;
  /**
   * Prises de chaque joueur du salon, sièges vides exclus.
   *
   * Dans l'instantané et non dans le message de salon : il change en cours de
   * partie, et c'est justement pendant la partie qu'on veut le lire.
   */
  scores: PlayerScore[];
  /**
   * Spectateurs en attente d'être acceptés.
   *
   * Dans l'instantané et non dans le message de salon : ils arrivent pendant la
   * partie, et c'est en jouant qu'on doit pouvoir les faire entrer.
   */
  spectators: LobbyPlayer[];
  /**
   * Où en est le cycle de mission.
   *
   * Les phases de transition figent la simulation côté serveur ; le client
   * doit le savoir pour afficher l'écran correspondant plutôt que de croire à
   * une partie immobile.
   */
  phase: CampaignPhase;
}

/** Le monde amputé des tuiles de terrain, qui voyagent séparément. */
export type WorldWithoutTiles = Omit<World, 'grid'> & {
  grid: Omit<Grid, 'tiles'>;
};

/** Fin de connexion à l'initiative du serveur. */
export interface ByeMessage {
  t: 'bye';
  reason: string;
}

export type ServerMessage =
  | WelcomeMessage
  | LobbyMessage
  | TerrainMessage
  | SnapshotMessage
  | ByeMessage;

/* ── (Dé)sérialisation ──────────────────────────────────────────────────── */

export function encode(message: ClientMessage | ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Décode un message reçu.
 *
 * Rend `null` sur tout ce qui n'a pas la forme attendue, plutôt que de lever :
 * un pair distant peut envoyer n'importe quoi, y compris du binaire ou du JSON
 * tronqué, et ça ne doit jamais interrompre la boucle de jeu.
 */
export function decode<T extends ClientMessage | ServerMessage>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof (parsed as { t?: unknown }).t !== 'string') return null;
    return parsed as T;
  } catch {
    return null;
  }
}

/** Sépare le monde de ses tuiles, pour la diffusion. */
export function stripTiles(world: World): WorldWithoutTiles {
  const { tiles: _tiles, ...grid } = world.grid;
  return { ...world, grid };
}

/** Recompose un monde complet à partir d'un instantané et du terrain connu. */
export function withTiles(partial: WorldWithoutTiles, tiles: TileKind[]): World {
  return { ...partial, grid: { ...partial.grid, tiles } };
}
