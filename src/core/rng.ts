/**
 * Générateur pseudo-aléatoire déterministe (xorshift128).
 *
 * `Math.random()` est interdit dans `core/` : il rendrait impossible à la fois
 * la prédiction côté client (deux machines partant du même état divergeraient
 * immédiatement) et les tests de non-régression.
 *
 * L'état du générateur vit **dans le `World`**. Il est donc cloné, sérialisé,
 * envoyé sur le réseau et rejoué avec le reste de l'état — ce qui garantit
 * qu'un rejeu produit exactement la même partie, tirs aléatoires de l'IA
 * compris.
 *
 * Les fonctions ci-dessous **mutent** l'état qu'on leur passe : c'est voulu, il
 * appartient au monde, et le monde est cloné avant tout rejeu.
 */

/** État interne : quatre mots de 32 bits. Sérialisable tel quel. */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Diviseur pour ramener un entier 32 bits non signé dans [0, 1). */
const UINT32_RANGE = 0x1_0000_0000;

/**
 * Mélangeur splitmix32 : étale un seed unique sur quatre mots bien répartis.
 *
 * Sans cette étape, un seed simple comme `1` produirait un état presque nul, et
 * xorshift mettrait des milliers de tirages à s'en remettre.
 */
function splitmix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e37_79b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0_aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a_2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

/** Crée un état de générateur à partir d'un seed entier. */
export function createRng(seed: number): RngState {
  const mix = splitmix32(seed);
  const state: RngState = { a: mix(), b: mix(), c: mix(), d: mix() };

  // L'état tout-à-zéro est un point fixe de xorshift : il ne produirait que des
  // zéros. Impossible en pratique après splitmix, mais le coût du garde-fou est
  // nul et l'échec serait silencieux.
  if ((state.a | state.b | state.c | state.d) === 0) state.a = 1;

  return state;
}

/** Tire le prochain entier non signé sur 32 bits. Mute l'état. */
export function nextUint32(rng: RngState): number {
  let t = rng.d;
  const s = rng.a;

  rng.d = rng.c;
  rng.c = rng.b;
  rng.b = s;

  t ^= t << 11;
  t ^= t >>> 8;
  rng.a = (t ^ s ^ (s >>> 19)) >>> 0;

  return rng.a;
}

/** Tire un flottant dans [0, 1). Mute l'état. */
export function nextFloat(rng: RngState): number {
  return nextUint32(rng) / UINT32_RANGE;
}

/** Tire un flottant dans [min, max). Mute l'état. */
export function nextRange(rng: RngState, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

/**
 * Tire un entier dans [min, max] (bornes incluses). Mute l'état.
 *
 * Utilisé par l'IA pour les choix discrets (direction de patrouille, cible).
 */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}
