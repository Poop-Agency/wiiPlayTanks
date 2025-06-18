// src/level.ts

// Types pour le système de niveaux
export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Enemy {
  type: 'brown' | 'grey' | 'teal' | 'yellow' | 'pink' | 'green' | 'purple' | 'white';
  x: number | null;
  y: number | null;
  direction: number;
}

export interface Level {
  id: number;
  walls: Wall[];
  enemies: Enemy[];
}

// Définition des 20 niveaux
const levels: Level[] = [
  {
    id: 1,
    walls: [],
    enemies: [
      { type: "brown", x: 400, y: 100, direction: 0 } // Position définie pour test
    ]
  },
  {
    id: 2,
    walls: [],
    enemies: [
      { type: "grey", x: 300, y: 150, direction: 0 } // Position définie pour test
    ]
  },
  {
    id: 3,
    walls: [],
    enemies: [
      { type: "grey", x: 200, y: 100, direction: 0 },
      { type: "grey", x: 600, y: 100, direction: 0 },
      { type: "brown", x: 400, y: 200, direction: 0 }
    ]
  },
  {    id: 4,
    walls: [],
    enemies: [
      { type: "grey", x: 150, y: 120, direction: 0 },
      { type: "grey", x: 650, y: 120, direction: 0 },
      { type: "brown", x: 400, y: 300, direction: 0 }
    ]
  },
  {
    id: 5,
    walls: [],
    enemies: [
      { type: "teal", x: 300, y: 200, direction: 0 },
      { type: "teal", x: 500, y: 200, direction: 0 }
    ]
  },
  {
    id: 6,
    walls: [],
    enemies: [
      { type: "teal", x: null, y: null, direction: 0 }, // Pas de coordonnées = pas créé
      { type: "teal", x: null, y: null, direction: 0 }, // Pas de coordonnées = pas créé
      { type: "grey", x: null, y: null, direction: 0 }, // Pas de coordonnées = pas créé
      { type: "grey", x: null, y: null, direction: 0 }  // Pas de coordonnées = pas créé
    ]
  },
  {
    id: 7,
    walls: [],
    enemies: [
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 8,
    walls: [],
    enemies: [
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 9,
    walls: [],
    enemies: [
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "grey", x: null, y: null, direction: 0 },
      { type: "grey", x: null, y: null, direction: 0 },
      { type: "grey", x: null, y: null, direction: 0 },
      { type: "grey", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 10,
    walls: [],
    enemies: [
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 11,
    walls: [],
    enemies: [
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "grey", x: null, y: null, direction: 0 },
      { type: "grey", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 12,
    walls: [],
    enemies: [
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 13,
    walls: [],
    enemies: [
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "yellow", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 14,
    walls: [],
    enemies: [
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 15,
    walls: [],
    enemies: [
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 16,
    walls: [],
    enemies: [
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 17,
    walls: [],
    enemies: [
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 18,
    walls: [],
    enemies: [
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "green", x: null, y: null, direction: 0 },
      { type: "pink", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 },
      { type: "teal", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 19,
    walls: [],
    enemies: [
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 },
      { type: "purple", x: null, y: null, direction: 0 }
    ]
  },
  {
    id: 20,
    walls: [],
    enemies: [
      { type: "white", x: null, y: null, direction: 0 },
      { type: "white", x: null, y: null, direction: 0 }
    ]
  }
];

// Variables globales pour le niveau actuel
let currentLevelIndex = 0; // Index dans le tableau (0-19)
let currentLevel: Level = levels[currentLevelIndex];

// Murs de bordure permanents (toujours présents)
const BORDER_WALLS: Wall[] = [
  // Mur du haut
  { x: 0, y: 0, w: 736, h: 20 },
  // Mur du bas
  { x: 0, y: 580, w: 736, h: 20 },
  // Mur de gauche
  { x: 0, y: 0, w: 20, h: 600 },
  // Mur de droite
  { x: 716, y: 0, w: 20, h: 600 }
];

// Export des murs (bordures + murs du niveau actuel)
export const walls: Wall[] = [...BORDER_WALLS, ...currentLevel.walls];

// Positions de spawn fixes pour les joueurs (à l'intérieur des murs)
const PLAYER_SPAWNS = {
  player1: [50, 550] as [number, number], // Bas gauche (à l'intérieur des murs)
  player2: [500, 550] as [number, number]  // Bas droite (à l'intérieur des murs)
};

// Fonctions pour gérer les niveaux
export function getCurrentLevel(): Level {
  return currentLevel;
}

export function getCurrentLevelNumber(): number {
  return currentLevel.id;
}

export function getTotalLevels(): number {
  return levels.length;
}

export function getPlayerSpawns(): { player1: [number, number], player2: [number, number] } {
  return PLAYER_SPAWNS;
}

export function getEnemies(): Enemy[] {
  return [...currentLevel.enemies];
}

// Fonction pour passer au niveau suivant
export function nextLevel(): boolean {
  if (currentLevelIndex < levels.length - 1) {
    currentLevelIndex++;
    currentLevel = levels[currentLevelIndex];
    
    // Mettre à jour les murs (bordures + murs du niveau)
    walls.length = 0;
    walls.push(...BORDER_WALLS, ...currentLevel.walls);
    
    return true;
  }
  return false; // Pas de niveau suivant
}

// Fonction pour aller au niveau précédent (utile pour debug)
export function previousLevel(): boolean {
  if (currentLevelIndex > 0) {
    currentLevelIndex--;
    currentLevel = levels[currentLevelIndex];
    
    // Mettre à jour les murs (bordures + murs du niveau)
    walls.length = 0;
    walls.push(...BORDER_WALLS, ...currentLevel.walls);
    
    return true;
  }
  return false;
}

// Fonction pour aller à un niveau spécifique
export function goToLevel(levelNumber: number): boolean {
  const levelIndex = levelNumber - 1; // Conversion vers index (1-20 -> 0-19)
  if (levelIndex >= 0 && levelIndex < levels.length) {
    currentLevelIndex = levelIndex;
    currentLevel = levels[currentLevelIndex];
    
    // Mettre à jour les murs (bordures + murs du niveau)
    walls.length = 0;
    walls.push(...BORDER_WALLS, ...currentLevel.walls);
    
    return true;
  }
  return false;
}

// Fonction pour remettre le jeu au niveau 1 (nouvelle partie)
export function resetToFirstLevel() {
  currentLevelIndex = 0;
  currentLevel = levels[currentLevelIndex];
  console.log(`Jeu réinitialisé au niveau 1`);
}

// Fonction de dessin du niveau (simplifiée car pas de murs pour l'instant)
export function drawLevel(ctx: CanvasRenderingContext2D) {
  // Dessiner les murs s'il y en a
  ctx.save();
  
  for (const wall of walls) {
    // Ombre des murs
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(wall.x + 2, wall.y + 2, wall.w, wall.h);
    
    // Mur principal
    const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.h);
    gradient.addColorStop(0, '#8B4513');  // Marron clair
    gradient.addColorStop(1, '#654321');  // Marron foncé
    ctx.fillStyle = gradient;
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    
    // Bordure des murs
    ctx.strokeStyle = '#2F1B14';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
  }
  
  // Ajouter quelques détails décoratifs
  drawDecorations(ctx);
  
  ctx.restore();
}

function drawDecorations(ctx: CanvasRenderingContext2D) {
  // Petites herbes/détails au sol
  ctx.fillStyle = 'rgba(34, 139, 34, 0.4)';
  
  // Quelques patches d'herbe
  const grassPatches = [
    { x: 50, y: 50, size: 15 },
    { x: 750, y: 50, size: 12 },
    { x: 50, y: 550, size: 18 },
    { x: 750, y: 550, size: 14 },
    { x: 300, y: 150, size: 10 },
    { x: 500, y: 450, size: 12 },
  ];
  
  for (const patch of grassPatches) {
    ctx.beginPath();
    ctx.arc(patch.x, patch.y, patch.size, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Quelques "cailloux"
  ctx.fillStyle = 'rgba(128, 128, 128, 0.6)';
  const rocks = [
    { x: 120, y: 80, size: 4 },
    { x: 680, y: 520, size: 5 },
    { x: 400, y: 180, size: 3 },
    { x: 450, y: 420, size: 4 },
  ];
  
  for (const rock of rocks) {
    ctx.beginPath();
    ctx.arc(rock.x, rock.y, rock.size, 0, Math.PI * 2);
    ctx.fill();
  }
}