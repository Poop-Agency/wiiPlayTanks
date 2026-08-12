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
}

/* ── Tanks ────────────────────────────────────────────────────────────────── */

/**
 * Couleur d'un tank, qui détermine entièrement son comportement.
 *
 * Les caractéristiques associées vivent dans `systems/ai/profiles.ts` (#11) :
 * aucun `switch` sur la couleur ne doit apparaître dans la logique.
 */
export type TankColor =
  | 'player'
  | 'brown'
  | 'ash'
  | 'teal'
  | 'yellow'
  | 'pink'
  | 'green'
  | 'purple'
  | 'white'
  | 'black';

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
}

/* ── Projectiles ──────────────────────────────────────────────────────────── */

export interface Shell {
  id: EntityId;
  /** Tank qui a tiré. L'obus reste mortel pour lui après ricochet. */
  ownerId: EntityId;

  /** Position du centre, en tuiles. */
  x: number;
  y: number;
  /** Vitesse, en tuiles par seconde. */
  vx: number;
  vy: number;

  /**
   * Rebonds encore autorisés. À zéro, le prochain contact détruit l'obus.
   * Dépend du type d'obus : 1 pour un obus normal, 0 pour un missile, 2 pour
   * l'obus du tank vert.
   */
  bouncesLeft: number;
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
