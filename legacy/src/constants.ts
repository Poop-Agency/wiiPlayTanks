// src/constants.ts
// Constantes de vitesse basées sur les spécifications Wii Play Tanks

// Référentiel: Carte 736x600px
// Balle normale: 736px en 4s = 184 px/s -> ajusté pour le rendu réel
// Super balle: 2x plus rapide = 368 px/s -> ajusté pour le rendu réel
// Tank joueur: 736px en 7s = 105 px/s -> ajusté pour le rendu réel
// Dernière calibration: facteur 1.257 appliqué (8.8s->7s observed)

export const SPEEDS = {
  tank: {
    player: 39,     // Tank de base - ajusté empiriquement (31*1.257)
    brown: 0,       // 0× - Immobile
    grey: 19,       // 0.5× - Lente patrouille (15*1.257)
    pink: 39,       // 1× - Standard
    yellow: 58,     // 1.5× - Rapide (46*1.257)
    purple: 58,     // 1.5× - Très mobile
    white: 39,      // 1× - Normal
    black: 77,      // 2× - Ultra rapide (61*1.257)
    teal: 19,       // 0.5× - Fixe ou très lent selon le niveau
    green: 0,       // 0× - Généralement immobile
  },
  bullet: {
    normal: 68,     // Balle normale - ajustée empiriquement (54*1.257)
    super: 135,     // Super balle - 2x plus rapide (107*1.257)
  },
};

// Conversion vitesse par seconde -> vitesse par frame (à 60 FPS)
export const FRAME_SPEEDS = {
  tank: {
    player: SPEEDS.tank.player / 60,     // ~0.65 px/frame
    brown: SPEEDS.tank.brown / 60,       // 0 px/frame
    grey: SPEEDS.tank.grey / 60,         // ~0.32 px/frame
    pink: SPEEDS.tank.pink / 60,         // ~0.65 px/frame
    yellow: SPEEDS.tank.yellow / 60,     // ~0.97 px/frame
    purple: SPEEDS.tank.purple / 60,     // ~0.97 px/frame
    white: SPEEDS.tank.white / 60,       // ~0.65 px/frame
    black: SPEEDS.tank.black / 60,       // ~1.28 px/frame
    teal: SPEEDS.tank.teal / 60,         // ~0.32 px/frame
    green: SPEEDS.tank.green / 60,       // 0 px/frame
  },
  bullet: {
    normal: SPEEDS.bullet.normal / 60,   // ~1.13 px/frame
    super: SPEEDS.bullet.super / 60,     // ~2.25 px/frame
  },
};

// Autres constantes du jeu
export const GAME_CONSTANTS = {
  canvas: {
    width: 736,
    height: 600,
  },
  tank: {
    size: 25, // Taille standard d'un tank
  },
  bullet: {
    radius: 3, // Rayon standard d'une balle
  },
};
