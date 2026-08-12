/**
 * Création, clonage et hachage du monde.
 *
 * Le hachage est l'outil central des tests de déterminisme : deux mondes qui
 * ont vécu la même histoire doivent produire le même nombre, sinon quelque
 * chose a introduit de l'indéterminisme et le multijoueur divergera.
 */

import { createRng } from './rng.js';
import { createAiState } from './systems/ai/brain.js';
import { TileKind } from './state.js';
import type { EntityId, Grid, Tank, TankColor, World } from './state.js';

/** Paramètres de création d'un monde vide. */
export interface WorldOptions {
  /** Largeur du terrain, en tuiles. */
  width: number;
  /** Hauteur du terrain, en tuiles. */
  height: number;
  /** Graine du générateur pseudo-aléatoire. Deux mondes de même graine sont jumeaux. */
  seed: number;
}

/** Crée une grille entièrement vide, ceinturée de blocs incassables. */
export function createGrid(width: number, height: number): Grid {
  const tiles: TileKind[] = new Array<TileKind>(width * height).fill(TileKind.Empty);

  for (let x = 0; x < width; x++) {
    tiles[x] = TileKind.Indestructible;
    tiles[(height - 1) * width + x] = TileKind.Indestructible;
  }
  for (let y = 0; y < height; y++) {
    tiles[y * width] = TileKind.Indestructible;
    tiles[y * width + (width - 1)] = TileKind.Indestructible;
  }

  return { width, height, tiles, version: 0 };
}

/** Crée un monde vide, prêt à être peuplé par le chargeur de mission (#12). */
export function createWorld({ width, height, seed }: WorldOptions): World {
  return {
    tick: 0,
    rng: createRng(seed),
    nextEntityId: 1,
    grid: createGrid(width, height),
    tanks: [],
    shells: [],
    mines: [],
    explosions: [],
  };
}

/**
 * Attribue le prochain identifiant d'entité.
 *
 * Le compteur vit dans le monde plutôt que dans une variable de module : sinon
 * deux mondes rejoués depuis le même état n'attribueraient pas les mêmes
 * identifiants, et le hachage divergerait sans qu'aucune vraie différence de
 * gameplay n'existe.
 */
export function allocateEntityId(world: World): EntityId {
  return world.nextEntityId++;
}

/** Paramètres de création d'un tank. Tout le reste part d'un état neutre. */
export interface TankOptions {
  color: TankColor;
  /** Position du centre, en tuiles. */
  x: number;
  y: number;
  /** Joueur qui le pilote, ou `null` pour un tank de l'IA. */
  playerId?: string | null;
  /** Orientation initiale du châssis et de la tourelle, en radians. */
  angle?: number;
}

/**
 * Crée un tank et l'ajoute au monde.
 *
 * Fabrique unique et volontaire : les compteurs (`activeShells`,
 * `reloadTicks`, …) sont des détails d'implémentation des systèmes, et les
 * recopier à chaque point de création — chargement de mission, test, bac à
 * sable — garantirait qu'un oubli passe inaperçu le jour où le tank gagne un
 * champ.
 */
export function createTank(world: World, options: TankOptions): Tank {
  const angle = options.angle ?? 0;
  const playerId = options.playerId ?? null;

  const tank: Tank = {
    id: allocateEntityId(world),
    color: options.color,
    playerId,
    x: options.x,
    y: options.y,
    bodyAngle: angle,
    turretAngle: angle,
    alive: true,
    activeShells: 0,
    activeMines: 0,
    reloadTicks: 0,
    mineReloadTicks: 0,
    // Un tank sans joueur est piloté par l'IA, et reçoit donc sa mémoire.
    ai: playerId === null ? createAiState() : null,
  };

  world.tanks.push(tank);
  return tank;
}

/**
 * Copie profonde du monde.
 *
 * `structuredClone` suffit parce que l'état est du pur JSON — c'est
 * précisément l'intérêt de la contrainte posée dans `state.ts`.
 */
export function cloneWorld(world: World): World {
  return structuredClone(world);
}

/**
 * Sérialisation canonique : clés triées, pour que deux mondes équivalents
 * produisent exactement la même chaîne quel que soit l'ordre d'insertion des
 * propriétés.
 *
 * On n'utilise pas `JSON.stringify` directement pour deux raisons : il conserve
 * l'ordre d'insertion (fragile), et il transforme `NaN` et `Infinity` en `null`,
 * ce qui masquerait justement le genre de bug de physique qu'on cherche à
 * détecter.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';

  // `String` conserve NaN et Infinity, contrairement à JSON.stringify.
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);

  return `{${entries.join(',')}}`;
}

/**
 * Empreinte FNV-1a 32 bits de l'état complet.
 *
 * Deux mondes ayant subi la même suite d'inputs depuis le même état initial
 * doivent produire la même empreinte. C'est l'assertion sur laquelle reposent
 * les tests de déterminisme, et plus tard la vérification de convergence
 * serveur/client (#13).
 */
export function hashWorld(world: World): number {
  const text = canonicalize(world);

  let hash = 0x811c_9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193);
  }

  return hash >>> 0;
}
