/**
 * Correspondance touches → actions.
 *
 * Le schéma reprend celui du jeu original transposé au clavier-souris : dans
 * Tanks!, le stick du nunchuk déplace le tank pendant que le pointeur de la
 * Wiimote vise indépendamment. Le clavier tient le rôle du stick, la souris
 * celui du pointeur — c'est la transposition la plus fidèle, et c'était déjà le
 * choix de l'ancienne version.
 *
 * Les dispositions AZERTY (ZQSD) et QWERTY (WASD) sont acceptées simultanément :
 * elles ne se recouvrent pas, donc aucun conflit.
 */

export type GameAction = 'up' | 'down' | 'left' | 'right' | 'fire' | 'mine';

/**
 * Codes physiques de touches, et non caractères produits.
 *
 * `KeyboardEvent.code` désigne l'emplacement sur le clavier indépendamment de
 * la disposition : `KeyW` est la touche en haut à gauche du bloc, qu'elle
 * imprime « w » en QWERTY ou « z » en AZERTY. On couvre donc les deux mains
 * sans avoir à détecter la disposition.
 */
export const KEY_BINDINGS: Readonly<Record<string, GameAction>> = {
  KeyW: 'up',
  KeyZ: 'up',
  ArrowUp: 'up',

  KeyS: 'down',
  ArrowDown: 'down',

  KeyA: 'left',
  KeyQ: 'left',
  ArrowLeft: 'left',

  KeyD: 'right',
  ArrowRight: 'right',

  Space: 'fire',
  KeyE: 'mine',
  ShiftLeft: 'mine',
};

/** Boutons de souris. 0 = principal, 2 = secondaire. */
export const MOUSE_BINDINGS: Readonly<Record<number, GameAction>> = {
  0: 'fire',
  2: 'mine',
};
