/**
 * Caractéristiques des neuf couleurs de tanks, entièrement en données.
 *
 * ─── Provenance ──────────────────────────────────────────────────────────────
 *
 * Tout ce fichier est transcrit depuis l'ancienne version — `constants.ts` et
 * `enemy.ts` — où ces valeurs avaient été relevées sur le jeu original. Rien
 * n'y est inventé, à deux exceptions signalées sur place. Le détail de
 * l'extraction est figé dans `docs/provenance.md`.
 *
 * Deux conversions ont été nécessaires :
 *
 *   - les **vitesses de déplacement** étaient des multiplicateurs de la vitesse
 *     du joueur ; elles le restent, la vitesse de référence vivant dans
 *     `tuning.ts` ;
 *   - les **vitesses de rotation de tourelle** étaient en radians par frame.
 *     Elles sont converties en radians par seconde à 60 Hz, ce qui donne un
 *     étalement de 3,3 s (brun) à 0,5 s (noir) pour un quart de tour.
 *
 * Note sur ce second point : le commentaire d'origine annonçait « environ 1 à
 * 2 secondes pour 90° » pour le tank brun, ce que la valeur brute ne donne pas.
 * Contrairement aux vitesses de déplacement, aucune mention d'ajustement
 * empirique n'accompagnait ces nombres — on garde donc les valeurs, et on
 * considère que c'est le commentaire qui était approximatif.
 *
 * ─── Règle ───────────────────────────────────────────────────────────────────
 *
 * Aucun `switch` sur la couleur ne doit exister ailleurs dans la logique.
 * L'ancienne version en avait trois, dispersés dans la classe `Enemy`
 * (`adjustAITimings`, `getAccuracy`, `updateMovement`), ce qui obligeait à
 * toucher trois endroits pour ajuster un seul comportement.
 */

import type { ShellKind, TankColor } from '../../state.js';
import { TILE_SIZE_PX } from '../../tuning.js';

/** Manière dont un tank se déplace vis-à-vis de sa cible. */
export type MovementStyle =
  /** Ne bouge jamais. */
  | 'hold'
  /** Patrouille sans tenir compte de la cible. */
  | 'patrol'
  /** Garde ses distances, recule si la cible approche. */
  | 'keepAway'
  /** Se rapproche jusqu'à portée utile. */
  | 'hunt'
  /** Alterne sans logique apparente entre approche et déplacement erratique. */
  | 'erratic';

export interface TankProfile {
  /** Multiplicateur de la vitesse de référence du joueur. */
  speedMultiplier: number;
  /** Vitesse de rotation de la tourelle, en radians par seconde. */
  turretRateRadiansPerSecond: number;

  /** Obus simultanés autorisés. */
  maxActiveShells: number;
  shellKind: ShellKind;
  /** Rebonds autorisés par obus. */
  shellBounces: number;

  /** Mines simultanées autorisées. 0 pour les tanks qui n'en posent pas. */
  maxActiveMines: number;

  /** Délai moyen entre deux tirs, en secondes. */
  fireIntervalSeconds: number;
  /** Amplitude aléatoire ajoutée au délai, en secondes. 0 = cadence régulière. */
  fireIntervalJitterSeconds: number;

  /**
   * Ouverture du cône d'erreur de visée, en radians.
   *
   * L'écart appliqué est tiré uniformément dans ±moitié de cette valeur.
   */
  aimErrorRadians: number;

  /** Portée de détection de la cible, en tuiles. */
  detectionRangeTiles: number;

  /** Nombre de rebonds que l'IA envisage en cherchant un angle de tir. */
  plannedBounces: number;

  movement: MovementStyle;
  /** Distance que le style de déplacement cherche à tenir, en tuiles. */
  preferredRangeTiles: number;

  /** Le tank est-il invisible tant qu'il ne tire pas ? */
  invisible: boolean;
}

/** Conversion des rotations relevées en radians par frame à 60 Hz. */
const perFrameToPerSecond = (radiansPerFrame: number): number => radiansPerFrame * 60;

/** Les portées étaient relevées en pixels. */
const pixelsToTiles = (pixels: number): number => pixels / TILE_SIZE_PX;

/** Portée de détection standard : environ un tiers de la largeur de l'arène. */
const STANDARD_RANGE = pixelsToTiles(267);
/** Portée étendue, relevée pour les tanks qui repèrent de loin. */
const LONG_RANGE = pixelsToTiles(400);

/**
 * Le joueur. Sa tourelle suit le pointeur sans inertie — d'où une vitesse de
 * rotation infinie, qui court-circuite le limiteur appliqué aux autres.
 *
 * Partagé par `player`, `player2`, `player3` et `player4` : ces alias ne
 * distinguent qu'une couleur d'affichage, jamais un comportement.
 */
const TANK_PROFILES_PLAYER: TankProfile = {
  speedMultiplier: 1,
  turretRateRadiansPerSecond: Number.POSITIVE_INFINITY,
  maxActiveShells: 5,
  shellKind: 'normal',
  shellBounces: 1,
  maxActiveMines: 2,
  fireIntervalSeconds: 0,
  fireIntervalJitterSeconds: 0,
  aimErrorRadians: 0,
  detectionRangeTiles: Number.POSITIVE_INFINITY,
  plannedBounces: 0,
  movement: 'hold',
  preferredRangeTiles: 0,
  invisible: false,
};

export const TANK_PROFILES: Record<TankColor, TankProfile> = {
  player: TANK_PROFILES_PLAYER,

  /** Brun : immobile, lent à viser, tire rarement. La cible d'entraînement. */
  brown: {
    speedMultiplier: 0,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.008),
    maxActiveShells: 1,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 0,
    fireIntervalSeconds: 4,
    fireIntervalJitterSeconds: 4,
    aimErrorRadians: 0.8,
    detectionRangeTiles: STANDARD_RANGE,
    plannedBounces: 0,
    movement: 'hold',
    preferredRangeTiles: 0,
    invisible: false,
  },

  /** Cendre : patrouille lentement et garde ses distances. Repère de loin. */
  ash: {
    speedMultiplier: 0.5,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.025),
    maxActiveShells: 1,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 0,
    fireIntervalSeconds: 3,
    fireIntervalJitterSeconds: 2,
    aimErrorRadians: 0.4,
    detectionRangeTiles: LONG_RANGE,
    plannedBounces: 1,
    movement: 'keepAway',
    preferredRangeTiles: 5,
    invisible: false,
  },

  /** Sarcelle : lent, mais son missile ne rebondit pas et arrive vite. */
  teal: {
    speedMultiplier: 0.5,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.025),
    maxActiveShells: 1,
    shellKind: 'fast',
    shellBounces: 0,
    maxActiveMines: 0,
    fireIntervalSeconds: 2.5,
    fireIntervalJitterSeconds: 0,
    aimErrorRadians: 0.3,
    detectionRangeTiles: STANDARD_RANGE,
    // Un missile ne rebondit pas : chercher un angle à rebonds n'aurait aucun sens.
    plannedBounces: 0,
    movement: 'patrol',
    preferredRangeTiles: 6,
    invisible: false,
  },

  /** Jaune : rapide et imprévisible, mais vise mal. */
  yellow: {
    speedMultiplier: 1.5,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.02),
    maxActiveShells: 1,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 0,
    fireIntervalSeconds: 1.5,
    fireIntervalJitterSeconds: 2,
    aimErrorRadians: 0.6,
    detectionRangeTiles: STANDARD_RANGE,
    plannedBounces: 1,
    movement: 'erratic',
    preferredRangeTiles: 4,
    invisible: false,
  },

  /** Rose : cadence soutenue, trois obus en vol, se rapproche. */
  pink: {
    speedMultiplier: 1,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.035),
    maxActiveShells: 3,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 0,
    fireIntervalSeconds: 1,
    fireIntervalJitterSeconds: 0,
    aimErrorRadians: 0.2,
    detectionRangeTiles: STANDARD_RANGE,
    plannedBounces: 1,
    movement: 'hunt',
    preferredRangeTiles: 3,
    invisible: false,
  },

  /**
   * Vert : immobile, mais c'est le tireur d'élite du jeu. Missiles à deux
   * rebonds et cône d'erreur minuscule — il vous atteint derrière un mur.
   */
  green: {
    speedMultiplier: 0,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.04),
    maxActiveShells: 2,
    shellKind: 'fast',
    shellBounces: 2,
    maxActiveMines: 0,
    fireIntervalSeconds: 1.8,
    fireIntervalJitterSeconds: 0,
    aimErrorRadians: 0.05,
    detectionRangeTiles: LONG_RANGE,
    plannedBounces: 2,
    movement: 'hold',
    preferredRangeTiles: 0,
    invisible: false,
  },

  /** Violet : rapide, cinq obus en vol, traque sans relâche. */
  purple: {
    speedMultiplier: 1.5,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.045),
    maxActiveShells: 5,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 2,
    fireIntervalSeconds: 1,
    fireIntervalJitterSeconds: 0,
    aimErrorRadians: 0.2,
    detectionRangeTiles: STANDARD_RANGE,
    plannedBounces: 1,
    movement: 'hunt',
    preferredRangeTiles: 3,
    invisible: false,
  },

  /** Blanc : les mêmes armes que le violet, mais invisible. */
  white: {
    speedMultiplier: 1,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.04),
    maxActiveShells: 5,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 2,
    fireIntervalSeconds: 1,
    fireIntervalJitterSeconds: 0,
    aimErrorRadians: 0.2,
    detectionRangeTiles: STANDARD_RANGE,
    plannedBounces: 1,
    movement: 'hunt',
    preferredRangeTiles: 4,
    invisible: true,
  },

  /** Noir : le plus rapide, missiles sans rebond, cadence la plus élevée. */
  black: {
    speedMultiplier: 2,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.05),
    maxActiveShells: 3,
    shellKind: 'fast',
    shellBounces: 0,
    maxActiveMines: 2,
    fireIntervalSeconds: 0.6,
    fireIntervalJitterSeconds: 0,
    aimErrorRadians: 0.25,
    detectionRangeTiles: LONG_RANGE,
    plannedBounces: 0,
    movement: 'hunt',
    preferredRangeTiles: 3,
    invisible: false,
  },

  // Alias de `player` : même comportement, seule la couleur affichée diffère
  // (voir la remarque sur `TankColor` dans core/state.ts). Placés après les
  // couleurs d'IA pour ne pas décaler l'ordre de `Object.keys`, dont le
  // panneau de réglage se sert pour choisir son profil affiché par défaut.
  player2: TANK_PROFILES_PLAYER,
  player3: TANK_PROFILES_PLAYER,
  player4: TANK_PROFILES_PLAYER,
};

/** Profil d'une couleur donnée. */
export function profileOf(color: TankColor): TankProfile {
  return TANK_PROFILES[color];
}
