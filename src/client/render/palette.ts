/**
 * Palette du jeu.
 *
 * Purement présentation : rien ici n'a d'influence sur la simulation. Le
 * parti-pris reprend celui de l'original — un plateau de jeu en bois clair,
 * des blocs façon liège, et des tanks aux couleurs franches qui se
 * distinguent au premier coup d'oeil sur ce fond.
 */

import { PLAYER_SEAT_COLORS } from '@core/state';
import type { TankColor } from '@core/state';

export const BOARD = {
  /** Sol du plateau. */
  floor: '#c9a875',
  /** Damier discret qui donne l'échelle sans attirer l'oeil. */
  floorAlternate: '#c3a06d',
  /** Ombre portée des blocs et des tanks. */
  shadow: 'rgba(60, 40, 20, 0.28)',
  /** Marque de chenille laissée au sol. Plus sombre que le plateau, à peine. */
  trackMark: '#8f7448',
};

export const BLOCKS = {
  /** Bloc incassable : gris-brun dense. */
  indestructibleFace: '#6d6459',
  indestructibleTop: '#8b8175',
  indestructibleEdge: '#4a433a',

  /** Bloc cassable : liège clair, visiblement plus tendre. */
  destructibleFace: '#b0793f',
  destructibleTop: '#cf9557',
  destructibleEdge: '#7d5228',

  /** Trou : les tanks n'y passent pas, les obus le survolent. */
  holeFloor: '#2a2018',
  holeRim: '#7a6a55',
};

/**
 * Obus.
 *
 * Volontairement neutres et non teintés par le tireur : sur un plateau où six
 * tanks tirent en même temps, ce qui compte est de repérer un projectile, pas
 * de savoir d'où il vient. Le missile se distingue par sa forme.
 */
export const SHELL = {
  normalBody: '#3b3630',
  normalHighlight: '#9c948a',
  fastBody: '#d9d2c4',
  fastTip: '#e8623a',
};

/** Mines et explosions. */
export const BLAST = {
  mineBody: '#4a4038',
  mineRim: '#241e19',
  /** Voyant au repos, puis à l'approche de la détonation. */
  mineLightIdle: '#8a5a2a',
  mineLightUrgent: '#ff5a2a',
  /** Coeur puis bord de la boule de feu. */
  fireCore: '#fff2c4',
  fireEdge: '#e0561f',
  smoke: 'rgba(60, 45, 35, 0.35)',
};

/** Couleur principale de chaque type de tank. */
export const TANK_COLORS: Record<TankColor, string> = {
  player: '#4a90d9',
  player2: '#e0453f',
  player3: '#22c3d4',
  player4: '#c04ae0',
  brown: '#8b5a2b',
  ash: '#8a8a8a',
  teal: '#189aa0',
  yellow: '#e8c33a',
  pink: '#e87ab0',
  green: '#4caf50',
  purple: '#8e5fc0',
  white: '#f2f2f2',
  black: '#3a3a3a',
};

export { PLAYER_SEAT_COLORS };

/**
 * Assombrit une couleur hexadécimale d'un facteur donné.
 *
 * Sert à dériver les chenilles et les contours depuis la couleur principale,
 * pour que chaque tank reste cohérent sans avoir à décliner la palette à la main.
 */
export function darken(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 0xff) * (1 - factor));
  const g = Math.round(((value >> 8) & 0xff) * (1 - factor));
  const b = Math.round((value & 0xff) * (1 - factor));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Éclaircit une couleur hexadécimale vers le blanc. */
export function lighten(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * factor);
  return `rgb(${mix((value >> 16) & 0xff)}, ${mix((value >> 8) & 0xff)}, ${mix(value & 0xff)})`;
}
