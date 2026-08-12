/**
 * Toutes les constantes de gameplay du jeu, et elles seules.
 *
 * Rien de tout cela ne doit être écrit en dur ailleurs. Un test de garde
 * (issue #10) échouera si des valeurs magiques réapparaissent dans la logique,
 * parce que c'est exactement comme ça que la version précédente est devenue
 * impossible à calibrer.
 *
 * ─── Unités ──────────────────────────────────────────────────────────────────
 *
 * Les distances sont en **tuiles**, les vitesses en **tuiles par seconde**, les
 * angles en radians, les durées en secondes. Jamais en pixels par frame.
 *
 * La version précédente exprimait ses vitesses en pixels/frame, ce qui les
 * rendait dépendantes de la fréquence de l'écran — voir la note de calibration
 * ci-dessous. Les unités monde sont indépendantes de la résolution : le
 * renderer convertit en pixels au dernier moment.
 */

/** Côté d'une tuile, en pixels. Seul le rendu s'en sert. */
export const TILE_SIZE_PX = 32;

/* ───────────────────────────────────────────────────────────────────────────
 * Mesures de référence
 *
 * Relevées image par image sur le jeu original et documentées dans
 * `legacy/src/constants.ts`. Ce sont les seuls faits observables dont on
 * dispose ; tout le reste en est dérivé.
 *
 * ⚠ Note de calibration — pourquoi ces valeurs et pas celles de l'ancien fichier
 *
 * `legacy/src/constants.ts` documentait ces mêmes temps de traversée, puis
 * exportait des vitesses environ 2,7× plus lentes (68 px/s pour l'obus au lieu
 * de 184, 39 px/s pour le tank au lieu de 105), sous le commentaire « ajusté
 * empiriquement ».
 *
 * Le ratio obus/tank y était pourtant préservé (184/105 = 1,752 contre
 * 68/39 = 1,744) : tout avait donc été divisé par un facteur global unique.
 * L'explication tient à l'absence de pas de temps fixe dans l'ancienne boucle —
 * les valeurs avaient été calées à la main contre la fréquence d'un écran
 * particulier. Ce facteur 2,7 compensait un bug, ce n'était pas une mesure.
 *
 * Maintenant que la simulation tourne à pas fixe, ce sont les temps de
 * traversée mesurés qui font foi. Les tests de #7 et #8 les vérifient
 * directement.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Largeur de l'arène de référence sur laquelle les temps ont été mesurés. */
const REFERENCE_ARENA_WIDTH_PX = 736;

/** Temps mis par un obus normal pour traverser l'arène de référence. */
const SHELL_CROSSING_SECONDS = 4;

/** Temps mis par le tank du joueur pour traverser l'arène de référence. */
const TANK_CROSSING_SECONDS = 7;

/** Largeur de l'arène de référence, exprimée en tuiles. */
const REFERENCE_ARENA_WIDTH_TILES = REFERENCE_ARENA_WIDTH_PX / TILE_SIZE_PX;

/** Vitesse dérivée d'un temps de traversée, en tuiles par seconde. */
const speedFromCrossing = (seconds: number): number =>
  REFERENCE_ARENA_WIDTH_TILES / seconds;

/**
 * Constantes exposées aux mesures de conformité (tests de #7 et #8) et au
 * panneau de calibration (#10).
 */
export const REFERENCE_MEASUREMENTS = {
  arenaWidthPx: REFERENCE_ARENA_WIDTH_PX,
  shellCrossingSeconds: SHELL_CROSSING_SECONDS,
  tankCrossingSeconds: TANK_CROSSING_SECONDS,
} as const;

/** Forme de la table de réglages. Mutable : le panneau de #10 l'édite en direct. */
export interface Tuning {
  tank: {
    /** Côté de la boîte de collision, en tuiles. */
    readonly sizeTiles: number;
    /** Vitesse de déplacement de référence (le joueur), en tuiles/seconde. */
    speedTilesPerSecond: number;
    /** Vitesse de rotation du corps vers la direction visée, en radians/seconde. */
    turnRateRadiansPerSecond: number;
    /** Nombre d'obus simultanés autorisés au joueur. */
    maxActiveShells: number;
    /** Nombre de mines simultanées autorisées au joueur. */
    maxActiveMines: number;
  };
  shell: {
    /** Rayon de collision, en tuiles. */
    radiusTiles: number;
    /** Vitesse d'un obus normal, en tuiles/seconde. */
    normalSpeedTilesPerSecond: number;
    /** Vitesse d'un missile : deux fois celle d'un obus normal. */
    fastSpeedTilesPerSecond: number;
    /** Délai minimal entre deux tirs du joueur, en secondes. */
    cooldownSeconds: number;
  };
  mine: {
    /** Durée de la mèche avant détonation, en secondes. */
    fuseSeconds: number;
    /** Rayon de l'explosion, en tuiles. */
    blastRadiusTiles: number;
    /** Durée d'affichage de l'explosion, en secondes. */
    blastDurationSeconds: number;
    /** Délai minimal entre deux poses, en secondes. */
    cooldownSeconds: number;
    /** Rayon de collision d'une mine, en tuiles. Sert aux impacts d'obus. */
    radiusTiles: number;
  };
}

/**
 * Réglages actifs.
 *
 * Volontairement mutable et non figé par `as const` : le panneau de calibration
 * de #10 modifie ces valeurs en direct, et le serveur les transmet aux clients à
 * la connexion pour que prédiction et autorité partagent la même table.
 */
export const TUNING: Tuning = {
  tank: {
    // 25 px sur l'arène de référence, soit un peu moins d'une tuile : le tank
    // passe dans un couloir d'une tuile de large sans frotter.
    sizeTiles: 25 / TILE_SIZE_PX,
    speedTilesPerSecond: speedFromCrossing(TANK_CROSSING_SECONDS),
    // Environ un demi-tour en un tiers de seconde : le corps s'oriente vite
    // sans donner l'impression de pivoter instantanément.
    turnRateRadiansPerSecond: Math.PI * 3,
    // 5, et non le 4 que fixait `legacy/src/game.ts` : cette valeur-là était un
    // choix d'implémentation, pas un relevé.
    maxActiveShells: 5,
    // ⚠ Non mesuré — voir la section `mine` plus bas.
    maxActiveMines: 2,
  },
  shell: {
    radiusTiles: 3 / TILE_SIZE_PX,
    normalSpeedTilesPerSecond: speedFromCrossing(SHELL_CROSSING_SECONDS),
    fastSpeedTilesPerSecond: speedFromCrossing(SHELL_CROSSING_SECONDS) * 2,
    cooldownSeconds: 0.2,
  },
  // ⚠ SECTION NON MESURÉE — en attente de relevé sur le jeu original.
  //
  // Contrairement à tout le reste de ce fichier, ces valeurs ne dérivent
  // d'aucune mesure : les mines n'ayant jamais été implémentées dans la version
  // précédente, il n'y avait rien à en extraire. Ce sont des estimations.
  //
  // À relever, par la même méthode que les vitesses (comptage d'images) :
  //   · fuseSeconds      → temps entre la pose et l'explosion
  //   · blastRadiusTiles → portée du souffle, en nombre de blocs détruits
  //   · cooldownSeconds  → délai minimal observé entre deux poses
  // Et à confirmer : le nombre de mines simultanées (`tank.maxActiveMines`).
  mine: {
    fuseSeconds: 3,
    // Deux tuiles : de quoi ouvrir un passage franc dans un mur cassable, ce
    // qui est la raison d'être des mines dans le level design de l'original.
    blastRadiusTiles: 2,
    blastDurationSeconds: 0.35,
    cooldownSeconds: 0.5,
    radiusTiles: 0.35,
  },
};
