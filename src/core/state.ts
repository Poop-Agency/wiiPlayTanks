/**
 * Forme de l'état de jeu.
 *
 * Règle absolue : **tout ce qui est décrit ici est du pur JSON**. Aucune classe,
 * aucune méthode, aucune référence circulaire, aucun `Map`, aucun `Set`.
 *
 * C'est ce qui rend possibles, sans code supplémentaire :
 *   - le clonage par `structuredClone` (rejeu, rollback) ;
 *   - la sérialisation directe en snapshot réseau (#13) ;
 *   - le hachage d'état pour les tests de déterminisme.
 *
 * Les entités se référencent par identifiant numérique, jamais par pointeur —
 * une référence directe survivrait mal à un aller-retour de sérialisation.
 */

import type { RngState } from './rng.js';

/** Identifiant d'entité, unique au sein d'un `World`. */
export type EntityId = number;

/* ── Terrain ──────────────────────────────────────────────────────────────── */

/**
 * Nature d'une tuile.
 *
 * Encodée en nombres plutôt qu'en chaînes : c'est ce qui circule le plus sur le
 * réseau, et un `enum` TypeScript classique ne survivrait pas à
 * `isolatedModules`.
 */
export const TileKind = {
  /** Sol libre. */
  Empty: 0,
  /** Bloc incassable. Les obus y rebondissent, rien ne le détruit. */
  Indestructible: 1,
  /** Bloc cassable. Les obus y rebondissent ; seules les mines le détruisent. */
  Destructible: 2,
  /** Trou. Les tanks ne passent pas, les obus le survolent. */
  Hole: 3,
} as const;

export type TileKind = (typeof TileKind)[keyof typeof TileKind];

/** Grille du terrain, en tuiles. `tiles` fait exactement `width * height`. */
export interface Grid {
  width: number;
  height: number;
  tiles: TileKind[];

  /**
   * Incrémenté à chaque modification du terrain.
   *
   * Le rendu met la grille en cache dans un canevas hors écran — elle ne change
   * qu'à la destruction d'un bloc, alors que le reste est redessiné jusqu'à
   * 240 fois par seconde. Ce compteur lui dit quand reconstruire, sans avoir à
   * comparer les tuiles une à une. Il fait partie de l'état, donc il traverse
   * le réseau et informe aussi les clients distants (#13).
   */
  version: number;
}

/* ── Tanks ────────────────────────────────────────────────────────────────── */

/**
 * Couleur d'un tank, qui détermine entièrement son comportement.
 *
 * Les caractéristiques associées vivent dans `systems/ai/profiles.ts` (#11) :
 * aucun `switch` sur la couleur ne doit apparaître dans la logique.
 *
 * `player2`, `player3` et `player4` partagent exactement le profil de
 * `player` (même comportement, un seul joueur humain derrière chacun) : ils
 * n'existent que pour distinguer les coéquipiers à l'écran en co-op, un par
 * siège dans l'ordre d'arrivée (#13, #couleurs-coop).
 */
export type TankColor =
  | 'player'
  | 'player2'
  | 'player3'
  | 'player4'
  | 'brown'
  | 'ash'
  | 'teal'
  | 'yellow'
  | 'pink'
  | 'green'
  | 'purple'
  | 'white'
  | 'black';

/**
 * Couleur de chaque siège de joueur, dans l'ordre d'arrivée dans le salon.
 *
 * `shared/missions/load.ts` assigne les tanks de joueurs dans cet ordre ; le
 * rendu client s'en sert pour prévisualiser la couleur d'un siège dès le
 * salon d'attente, avant même qu'un tank n'existe.
 */
export const PLAYER_SEAT_COLORS: readonly TankColor[] = ['player', 'player2', 'player3', 'player4'];

/**
 * Ce tank est-il celui d'un joueur ?
 *
 * Se lit sur la seule couleur, et non sur `playerId` : c'est ce qui permet au
 * rendu de trancher à partir d'un `TankView`, qui ne transporte pas
 * l'identifiant du joueur.
 */
export function isPlayerColor(color: TankColor): boolean {
  return PLAYER_SEAT_COLORS.includes(color);
}

/**
 * Mémoire d'un tank piloté par l'IA.
 *
 * Elle vit **dans l'état du monde** et non dans une structure annexe : sans ça,
 * un rejeu ou une réconciliation réseau repartirait avec une IA amnésique et
 * les deux simulations divergeraient.
 */
export interface TankAiState {
  /** Angle de tir retenu au dernier calcul, ou `null` si aucune solution. */
  solutionAngle: number | null;
  /** Ticks avant le prochain tir autorisé. */
  fireCooldownTicks: number;
  /** Ticks avant la prochaine pose de mine autorisée. */
  mineCooldownTicks: number;
  /** Direction suivie en patrouille, en radians. */
  roamAngle: number;
  /** Ticks avant de choisir une nouvelle direction de patrouille. */
  roamTicks: number;
}

export interface Tank {
  id: EntityId;
  color: TankColor;
  /**
   * Joueur qui pilote ce tank, ou `null` pour un tank piloté par l'IA.
   * C'est le serveur qui fait autorité sur ce champ (#13).
   */
  playerId: string | null;

  /** Position du centre, en tuiles. */
  x: number;
  y: number;

  /** Orientation du châssis, en radians. Purement visuelle : la hitbox est une AABB. */
  bodyAngle: number;
  /** Orientation de la tourelle, en radians. C'est elle qui détermine le tir. */
  turretAngle: number;

  alive: boolean;

  /** Obus et mines de ce tank actuellement en jeu, pour faire respecter les quotas. */
  activeShells: number;
  activeMines: number;

  /** Ticks restants avant de pouvoir tirer à nouveau. */
  reloadTicks: number;

  /**
   * Ticks restants avant de pouvoir reposer une mine.
   *
   * Sans ce délai, maintenir la touche enfoncée viderait le stock de mines en
   * deux pas consécutifs. L'original se joue par appuis distincts ; un délai
   * court reproduit ce rythme sans exiger de détecter les fronts d'appui, ce
   * qui obligerait à mémoriser l'entrée précédente dans l'état.
   */
  mineReloadTicks: number;

  /** Mémoire d'IA, ou `null` pour un tank piloté par un joueur. */
  ai: TankAiState | null;
}

/* ── Projectiles ──────────────────────────────────────────────────────────── */

/**
 * Type de projectile.
 *
 * Détermine la vitesse et l'apparence. Le nombre de rebonds est porté
 * séparément par `bouncesLeft` : le tank vert tire un missile rapide **avec**
 * deux rebonds, donc les deux caractéristiques ne sont pas liées.
 */
export type ShellKind = 'normal' | 'fast';

export interface Shell {
  id: EntityId;
  /** Tank qui a tiré. L'obus reste mortel pour lui après ricochet. */
  ownerId: EntityId;

  kind: ShellKind;

  /** Position du centre, en tuiles. */
  x: number;
  y: number;
  /** Vitesse, en tuiles par seconde. */
  vx: number;
  vy: number;

  /**
   * Rebonds encore autorisés. À zéro, le prochain contact détruit l'obus.
   * 1 pour un obus normal, 0 pour un missile, 2 pour l'obus du tank vert.
   */
  bouncesLeft: number;

  /**
   * L'obus est-il devenu dangereux pour celui qui l'a tiré ?
   *
   * Faux tant que l'obus chevauche encore son tireur — sinon il le tuerait dès
   * la sortie du canon. Il s'arme dès qu'il l'a quitté, ce qui reproduit la
   * règle de l'original : **on peut se tuer soi-même avec son propre ricochet**.
   */
  armed: boolean;
}

export interface Mine {
  id: EntityId;
  ownerId: EntityId;
  x: number;
  y: number;
  /** Ticks restants avant détonation. */
  fuseTicks: number;
}

/**
 * Explosion en cours.
 *
 * Elle vit dans l'état simulé, et non côté rendu, parce qu'elle a des
 * conséquences de gameplay (elle tue et elle détruit du terrain) et que les
 * autres joueurs doivent la voir en multijoueur.
 *
 * Les effets purement décoratifs — débris, étincelles, traces de chenilles —
 * restent au contraire strictement côté client (#14).
 */
export interface Explosion {
  id: EntityId;
  x: number;
  y: number;
  radius: number;
  /** Ticks restants d'affichage. Les dégâts sont appliqués au tick d'apparition. */
  ticksLeft: number;
  /**
   * Durée totale, conservée pour que le rendu puisse en déduire l'avancement.
   *
   * Portée par l'entité plutôt que relue dans les réglages : une explosion en
   * cours doit finir son animation même si la durée est modifiée en direct par
   * le panneau de calibration (#10).
   */
  totalTicks: number;
}

/* ── Monde ────────────────────────────────────────────────────────────────── */

export interface World {
  /** Numéro du pas de simulation. C'est la seule horloge que connaît `core/`. */
  tick: number;

  /** État du générateur pseudo-aléatoire, cloné et rejoué avec le monde. */
  rng: RngState;

  /** Prochain identifiant à attribuer. Fait partie de l'état pour rester déterministe. */
  nextEntityId: EntityId;

  grid: Grid;
  tanks: Tank[];
  shells: Shell[];
  mines: Mine[];
  explosions: Explosion[];
}

/* ── Entrées ──────────────────────────────────────────────────────────────── */

/**
 * Intention d'un joueur pour un tick.
 *
 * C'est le **seul** message que le client envoie au serveur (#13) : jamais une
 * position. Un client ne peut donc pas se téléporter en trichant, contrairement
 * à l'ancien protocole qui diffusait directement les coordonnées.
 */
export interface InputCommand {
  /** Direction de déplacement, chaque composante dans [-1, 1]. */
  moveX: number;
  moveY: number;
  /** Angle de visée absolu, en radians. */
  aim: number;
  fire: boolean;
  mine: boolean;
}

/** Entrée neutre : aucun mouvement, aucune action. */
export const NEUTRAL_INPUT: InputCommand = {
  moveX: 0,
  moveY: 0,
  aim: 0,
  fire: false,
  mine: false,
};
