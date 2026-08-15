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
  /**
   * Se rapproche en biais plutôt que de face, et change de côté en chemin.
   * Prendre l'adversaire en tenaille suppose de ne pas arriver là où il
   * regarde.
   */
  | 'flank'
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
   * Délai moyen entre deux poses de mine, en secondes. **0 = ne mine jamais.**
   *
   * Séparé de `maxActiveMines`, qui est un quota relevé sur l'original : quatre
   * couleurs en portent, mais rien ne dit qu'elles s'en servent toutes de la
   * même façon. Ce champ dit qui mine réellement, et à quelle fréquence.
   */
  mineIntervalSeconds: number;

  /**
   * Ouverture du cône d'erreur de visée, en radians.
   *
   * L'écart appliqué est tiré uniformément dans ±moitié de cette valeur.
   */
  aimErrorRadians: number;

  /** Portée de détection de la cible, en tuiles. Gouverne le **déplacement**. */
  detectionRangeTiles: number;

  /**
   * Portée au-delà de laquelle le tank n'ouvre pas le feu, en tuiles.
   *
   * `Infinity` pour presque tous : ce qui commande le tir est l'existence d'un
   * angle, pas la distance. Seul le brun est borné — c'est l'adversaire le plus
   * faible du jeu, et le laisser canarder d'un bout à l'autre de l'arène dès
   * qu'une ligne se dégage en faisait un tireur d'élite immobile, ce qu'il
   * n'est pas censé être.
   */
  firingRangeTiles: number;

  /**
   * Le tank vise-t-il là où la cible **sera**, plutôt que là où elle est ?
   *
   * Réservé au noir, seul dont le relevé mentionne qu'il anticipe. Sur une
   * cible immobile, ou pour un tir à ricochets, l'avance vaut zéro et le
   * comportement est identique à celui des autres.
   */
  leadsTarget: boolean;

  /**
   * Anticipation de l'esquive, en fraction de `TUNING.ai.evasionHorizonSeconds`.
   * **0 = n'esquive jamais**, 1 = pleine anticipation.
   *
   * Multiplicateur plutôt que durée absolue, pour que le panneau de calibration
   * garde la main sur l'échelle globale sans avoir à retoucher neuf profils.
   *
   * Le relevé n'attribue l'esquive qu'à deux couleurs — « parfois » pour le
   * cendre, « activement » pour le noir. Une valeur intermédiaire ne veut pas
   * dire « une fois sur deux » : elle veut dire *prévenu plus tard*, donc trop
   * tard pour se dégager quand l'obus est rapide ou le châssis lent. Le hasard
   * n'a pas sa place ici, le noyau devant rester déterministe.
   */
  evasionSkill: number;

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
  mineIntervalSeconds: 0,
  aimErrorRadians: 0,
  detectionRangeTiles: Number.POSITIVE_INFINITY,
  firingRangeTiles: Number.POSITIVE_INFINITY,
  leadsTarget: false,
  // Sans objet : c'est un humain qui décide de s'écarter ou non.
  evasionSkill: 0,
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
    mineIntervalSeconds: 0,
    aimErrorRadians: 0.8,
    detectionRangeTiles: STANDARD_RANGE,
    firingRangeTiles: STANDARD_RANGE,
    leadsTarget: false,
    // Immobile : la question ne se pose pas.
    evasionSkill: 0,
    plannedBounces: 0,
    movement: 'hold',
    preferredRangeTiles: 0,
    invisible: false,
  },

  /** Cendre : patrouille lentement et garde ses distances. Repère de loin. */
  ash: {
    speedMultiplier: 0.7,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.025),
    maxActiveShells: 1,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 0,
    fireIntervalSeconds: 3,
    fireIntervalJitterSeconds: 2,
    mineIntervalSeconds: 0,
    aimErrorRadians: 0.4,
    detectionRangeTiles: LONG_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // « Esquive parfois ». Réglé à la mesure : à 0,25 il survit à six obus sur
    // dix, là où un tank de même vitesse qui n'esquive pas s'en tire trois fois
    // sur dix par la seule grâce de sa patrouille. Au-dessus de 0,3 il devient
    // presque intouchable, ce qui n'est plus « parfois ».
    evasionSkill: 0.25,
    plannedBounces: 1,
    // « Their turrets mildly seek the player, but their movement does not. They
    // are neither offensive or defensive in their movements. » Sa tourelle
    // cherche, son châssis non : il patrouille, et c'est au joueur de croiser
    // sa route.
    movement: 'patrol',
    preferredRangeTiles: 5,
    invisible: false,
  },

  /** Sarcelle : lent, mais son missile ne rebondit pas et arrive vite. */
  teal: {
    speedMultiplier: 0.7,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.025),
    maxActiveShells: 1,
    shellKind: 'fast',
    shellBounces: 0,
    maxActiveMines: 0,
    fireIntervalSeconds: 2.5,
    fireIntervalJitterSeconds: 0,
    mineIntervalSeconds: 0,
    // Sa roquette ne rebondit pas : une balle perdue l'est définitivement,
    // là où un obus manqué peut encore revenir de bande. Un cône trop serré en
    // faisait un tireur presque aussi fiable que le vert dès qu'il tenait son
    // angle, ce qu'il n'est pas censé être. ±11°.
    aimErrorRadians: 0.38,
    detectionRangeTiles: STANDARD_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // Le relevé ne lui prête aucune esquive : il cherche sa ligne, il ne
    // regarde pas ce qui vient.
    evasionSkill: 0,
    // Un missile ne rebondit pas : chercher un angle à rebonds n'aurait aucun sens.
    plannedBounces: 0,
    // « Their turrets strongly seek the player, but their movement does not.
    // They are defensive in their movement. » Il tient sa distance et laisse la
    // tourelle travailler — il ne va pas chercher sa ligne de vue, il attend
    // qu'elle s'ouvre.
    movement: 'keepAway',
    preferredRangeTiles: 6,
    invisible: false,
  },

  /**
   * Jaune : le poseur de mines. Très mobile, un seul obus, quatre mines.
   *
   * Sa force n'est pas son canon mais sa capacité à saturer une zone : quatre
   * mines simultanées, le quota le plus élevé du jeu, et la cadence de pose la
   * plus rapide.
   *
   * ⚠ Le quota est un plafond, pas une garantie : `brain.ts` refuse de poser
   * près d'une mine déjà en place, pour que le jaune ne s'enferme pas dans son
   * propre champ. Quatre mines au sol en même temps demandent donc de la place.
   */
  yellow: {
    speedMultiplier: 1.3,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.02),
    maxActiveShells: 1,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 4,
    fireIntervalSeconds: 1.5,
    fireIntervalJitterSeconds: 2,
    mineIntervalSeconds: 2.5,
    aimErrorRadians: 0.6,
    detectionRangeTiles: STANDARD_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // Aucune esquive : s'il survit à un obus, c'est que sa trajectoire
    // erratique l'avait déjà sorti du couloir, pas qu'il l'a vu venir.
    evasionSkill: 0,
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
    mineIntervalSeconds: 0,
    aimErrorRadians: 0.2,
    detectionRangeTiles: STANDARD_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // Aucune esquive : il fonce, c'est tout son propos.
    evasionSkill: 0,
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
    mineIntervalSeconds: 0,
    // **Zéro**, et c'est délibéré : le vert est immobile, il n'a qu'un canon, et
    // toute sa valeur tient dans le fait que son ricochet arrive exactement où
    // il l'a calculé. Un cône, même minuscule, se paie au bout d'une trentaine
    // de tuiles de trajet à deux bandes et lui fait manquer un tank entier — ce
    // qui ne lui laisse plus aucune force.
    aimErrorRadians: 0,
    detectionRangeTiles: LONG_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // Immobile : la question ne se pose pas.
    evasionSkill: 0,
    plannedBounces: 2,
    movement: 'hold',
    preferredRangeTiles: 0,
    invisible: false,
  },

  /** Violet : rapide, cinq obus en vol, traque sans relâche. */
  purple: {
    speedMultiplier: 1.3,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.045),
    maxActiveShells: 5,
    shellKind: 'normal',
    shellBounces: 1,
    maxActiveMines: 2,
    fireIntervalSeconds: 1,
    fireIntervalJitterSeconds: 0,
    mineIntervalSeconds: 4,
    aimErrorRadians: 0.2,
    detectionRangeTiles: STANDARD_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // ⚠ Déduit, pas relevé : la fiche ne mentionne l'esquive ni pour le violet
    // ni pour le blanc, mais leur prête une « IA avancée ».
    //
    // Même préavis que le cendre, et ce n'est pas une négligence : au-delà de
    // 0,2 sa courbe est parfaitement plate (21 à 23 morts sur 80 quel que soit
    // le réglage jusqu'à 0,6). À 130 % de vitesse, il lui suffit d'un préavis
    // minime pour dégager le couloir. Sa supériorité sur le cendre vient de son
    // châssis, pas de sa vigilance — mettre plus ici ne ferait qu'écrire un
    // chiffre sans effet.
    evasionSkill: 0.25,
    plannedBounces: 1,
    movement: 'flank',
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
    mineIntervalSeconds: 4,
    aimErrorRadians: 0.2,
    detectionRangeTiles: STANDARD_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: false,
    // ⚠ Déduit comme celle du violet, dont il partage l'armement — mais **plus
    // haut**, et c'est mesuré : à 100 % de vitesse il lui faut nettement plus
    // de préavis pour parcourir la même distance latérale. Sa courbe descend
    // encore de 31 morts sur 80 à 0,25, à 14 à 0,6. L'aligner sur le violet le
    // rendrait deux fois plus facile à tuer, à armement identique.
    evasionSkill: 0.6,
    plannedBounces: 1,
    movement: 'hunt',
    preferredRangeTiles: 4,
    invisible: true,
  },

  /** Noir : le plus rapide, missiles sans rebond, cadence la plus élevée. */
  black: {
    speedMultiplier: 1.7,
    turretRateRadiansPerSecond: perFrameToPerSecond(0.05),
    maxActiveShells: 2,
    shellKind: 'fast',
    shellBounces: 0,
    maxActiveMines: 2,
    fireIntervalSeconds: 0.6,
    fireIntervalJitterSeconds: 0,
    mineIntervalSeconds: 4,
    aimErrorRadians: 0.25,
    detectionRangeTiles: LONG_RANGE,
    firingRangeTiles: Number.POSITIVE_INFINITY,
      leadsTarget: true,
    // « Esquive activement » : pleine anticipation, la seule du jeu.
    evasionSkill: 1,
    plannedBounces: 0,
    // « Black tanks are defensive and tend to run away whenever you fire at
    // them. Black tanks can easily outrun your bullets, so you may have to
    // charge in at them to finish them off. » C'est le seul adversaire qu'il
    // faut aller chercher : il ne vient jamais à vous, et à 170 % de vitesse il
    // reprend sa distance dès qu'on la réduit.
    movement: 'keepAway',
    preferredRangeTiles: 7,
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
