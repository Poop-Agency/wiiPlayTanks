// src/level.ts

// Constantes pour le système de blocs
export const BLOCK_SIZE = 32; // Taille d'un bloc en pixels

// Types pour le système de niveaux
export interface Wall {
  x: number;
  y: number;
  w: number;
  h: number;
  destructible?: boolean; // Indique si le mur peut être détruit par une mine
}

export interface BlockPosition {
  x: number; // Position en blocs
  y: number; // Position en blocs
}

export interface Enemy {
  type: 'brown' | 'grey' | 'teal' | 'yellow' | 'pink' | 'green' | 'purple' | 'white';
  x: number | null;
  y: number | null;
  blockX?: number; // Position en blocs
  blockY?: number; // Position en blocs
  direction: number;
}

export interface Level {
  id: number;
  walls: Wall[];
  enemies: Enemy[];
  dimensions?: { width: number; height: number };
  indestructibleWalls?: BlockPosition[]; // Murs incassables en coordonnées de blocs
  destructibleWalls?: BlockPosition[]; // Murs cassables en coordonnées de blocs
  playerSpawn?: BlockPosition; // Position d'apparition du joueur en blocs
}

// Fonctions utilitaires pour convertir entre blocs et pixels
export function blockToPixel(blockPos: number): number {
  return blockPos * BLOCK_SIZE;
}

export function pixelToBlock(pixelPos: number): number {
  return Math.floor(pixelPos / BLOCK_SIZE);
}

export function blockPositionToPixels(blockPos: BlockPosition): { x: number; y: number } {
  return {
    x: blockToPixel(blockPos.x),
    y: blockToPixel(blockPos.y)
  };
}

// Définition des 20 niveaux
const levels: Level[] = [{
  id: 1,
  walls: [], // Les murs seront générés à partir des positions de blocs
  enemies: [{
    type: "brown",
    x: null,
    y: null,
    blockX: 22,
    blockY: 5,
    direction: 0
  }],
  dimensions: { width: 25 * BLOCK_SIZE, height: 12 * BLOCK_SIZE }, // 25x10 blocs (+ 2 bordures)
  // Murs incassables (en coordonnées de blocs)
  indestructibleWalls: [
    // Colonne de gauche (2 blocs incassables en haut et en bas, vide au milieu)
    { x: 6, y: 3 },
    { x: 6, y: 4 },
    { x: 6, y: 7 },
    { x: 6, y: 8 },
    // Colonne de droite (configuration : 2 vides, 2 blocs, 2 cassables, 2 blocs, 2 vides)
    { x: 12, y: 3 }, // blocs
    { x: 12, y: 4 }, // blocs
    { x: 12, y: 7 }, // blocs
    { x: 12, y: 8 }  // blocs
  ],
  // Murs cassables (en coordonnées de blocs) - au milieu de la colonne de droite
  destructibleWalls: [
    { x: 12, y: 5 },
    { x: 12, y: 6 }
  ],
  // Position d'apparition du joueur (en coordonnées de blocs)
  playerSpawn: { x: 3, y: 5 }
},
{
  id: 2,
  walls: [], // Les murs seront générés à partir des positions de blocs
  enemies: [{
    type: "grey",
    x: null,
    y: null,
    blockX: 21,
    blockY: 3,
    direction: 0
  }],
  dimensions: { width: 26 * BLOCK_SIZE, height: 17 * BLOCK_SIZE }, // 24x15 blocs (+ 2 bordures)
  // Murs incassables (en coordonnées de blocs)
  indestructibleWalls: [
    // Ligne horizontale de (5,5) à (12,5)
    { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 },
    { x: 9, y: 5 }, { x: 10, y: 5 }, { x: 11, y: 5 }, { x: 12, y: 5 },
    // Ligne horizontale de (11,10) à (18,10)
    { x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }, { x: 14, y: 10 },
    { x: 15, y: 10 }, { x: 16, y: 10 }, { x: 17, y: 10 }, { x: 18, y: 10 }
  ],
  // Murs cassables (en coordonnées de blocs)
  destructibleWalls: [
    // Ligne de (7,10) à (10,10)
    { x: 7, y: 10 }, { x: 8, y: 10 }, { x: 9, y: 10 }, { x: 10, y: 10 },
    // Ligne de (13,5) à (16,5)
    { x: 13, y: 5 }, { x: 14, y: 5 }, { x: 15, y: 5 }, { x: 16, y: 5 }
  ],
  // Position d'apparition du joueur (en coordonnées de blocs)
  playerSpawn: { x: 3, y: 23 }
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
{
  id: 4,
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

// Fonction pour générer les murs de bordure avec des blocs de tailles aléatoires
function generateBorderWalls(level: Level): Wall[] {
  const borderWalls: Wall[] = [];
  const arenaWidth = level.dimensions?.width || 800;
  const arenaHeight = level.dimensions?.height || 600;

  // Mur du haut
  let x = 0;
  while (x < arenaWidth) {
    const width = (Math.random() < 0.5 ? 1 : 2) * BLOCK_SIZE; // 1 ou 2 blocs de large
    const actualWidth = Math.min(width, arenaWidth - x);
    borderWalls.push({ x, y: 0, w: actualWidth, h: BLOCK_SIZE });
    x += actualWidth;
  }

  // Mur du bas
  x = 0;
  while (x < arenaWidth) {
    const width = (Math.random() < 0.5 ? 1 : 2) * BLOCK_SIZE;
    const actualWidth = Math.min(width, arenaWidth - x);
    borderWalls.push({ x, y: arenaHeight - BLOCK_SIZE, w: actualWidth, h: BLOCK_SIZE });
    x += actualWidth;
  }

  // Mur de gauche
  let y = BLOCK_SIZE; // Commencer après le mur du haut
  while (y < arenaHeight - BLOCK_SIZE) {
    const height = (Math.random() < 0.5 ? 1 : 2) * BLOCK_SIZE;
    const actualHeight = Math.min(height, arenaHeight - BLOCK_SIZE - y);
    borderWalls.push({ x: 0, y, w: BLOCK_SIZE, h: actualHeight });
    y += actualHeight;
  }

  // Mur de droite
  y = BLOCK_SIZE;
  while (y < arenaHeight - BLOCK_SIZE) {
    const height = (Math.random() < 0.5 ? 1 : 2) * BLOCK_SIZE;
    const actualHeight = Math.min(height, arenaHeight - BLOCK_SIZE - y);
    borderWalls.push({ x: arenaWidth - BLOCK_SIZE, y, w: BLOCK_SIZE, h: actualHeight });
    y += actualHeight;
  }

  return borderWalls;
}

// Fonction pour générer les murs du niveau à partir des positions de blocs
function generateLevelWalls(level: Level): Wall[] {
  const levelWalls: Wall[] = [];

  // Ajouter les murs incassables
  if (level.indestructibleWalls) {
    for (const blockPos of level.indestructibleWalls) {
      const pixelPos = blockPositionToPixels(blockPos);
      levelWalls.push({
        x: pixelPos.x,
        y: pixelPos.y,
        w: BLOCK_SIZE,
        h: BLOCK_SIZE,
        destructible: false
      });
    }
  }

  // Ajouter les murs cassables
  if (level.destructibleWalls) {
    for (const blockPos of level.destructibleWalls) {
      const pixelPos = blockPositionToPixels(blockPos);
      levelWalls.push({
        x: pixelPos.x,
        y: pixelPos.y,
        w: BLOCK_SIZE,
        h: BLOCK_SIZE,
        destructible: true
      });
    }
  }

  return levelWalls;
}

// Murs de bordure générés aléatoirement
let BORDER_WALLS: Wall[] = generateBorderWalls(currentLevel);

// Export des murs (bordures + murs du niveau actuel)
export const walls: Wall[] = [...BORDER_WALLS, ...generateLevelWalls(currentLevel)];

// Fonction pour obtenir la position de spawn du joueur
export function getPlayerSpawn(): [number, number] {
  const level = getCurrentLevel();
  if (level.playerSpawn) {
    const pixelPos = blockPositionToPixels(level.playerSpawn);
    return [pixelPos.x + BLOCK_SIZE / 2, pixelPos.y + BLOCK_SIZE / 2]; // Centre du bloc
  }
  // Position par défaut si pas définie
  const arenaHeight = level.dimensions?.height || 600;
  return [BLOCK_SIZE + BLOCK_SIZE / 2, arenaHeight - 2 * BLOCK_SIZE + BLOCK_SIZE / 2];
}

// Positions de spawn fixes pour les joueurs (compatibilité avec l'ancien système)
export function getPlayerSpawns(): { player1: [number, number], player2: [number, number] } {
  const level = getCurrentLevel();
  const arenaWidth = level.dimensions?.width || 800;
  const arenaHeight = level.dimensions?.height || 600;

  return {
    player1: getPlayerSpawn(),
    player2: [arenaWidth - 2 * BLOCK_SIZE + BLOCK_SIZE / 2, arenaHeight - 2 * BLOCK_SIZE + BLOCK_SIZE / 2] as [number, number]
  };
}

export function getEnemies(): Enemy[] {
  const enemies = [...currentLevel.enemies];

  // Convertir les positions de blocs en pixels pour les ennemis qui en ont
  for (const enemy of enemies) {
    if (enemy.blockX !== undefined && enemy.blockY !== undefined) {
      const pixelPos = blockPositionToPixels({ x: enemy.blockX, y: enemy.blockY });
      enemy.x = pixelPos.x + BLOCK_SIZE / 2; // Centre du bloc
      enemy.y = pixelPos.y + BLOCK_SIZE / 2; // Centre du bloc
    }
  }

  return enemies;
}

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

// Fonction pour passer au niveau suivant
export function nextLevel(): boolean {
  if (currentLevelIndex < levels.length - 1) {
    currentLevelIndex++;
    currentLevel = levels[currentLevelIndex];

    // Mettre à jour les murs (bordures + murs du niveau)
    BORDER_WALLS = generateBorderWalls(currentLevel);
    walls.length = 0;
    walls.push(...BORDER_WALLS, ...generateLevelWalls(currentLevel));

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
    BORDER_WALLS = generateBorderWalls(currentLevel);
    walls.length = 0;
    walls.push(...BORDER_WALLS, ...generateLevelWalls(currentLevel));

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
    BORDER_WALLS = generateBorderWalls(currentLevel);
    walls.length = 0;
    walls.push(...BORDER_WALLS, ...generateLevelWalls(currentLevel));

    return true;
  }
  return false;
}

// Fonction de dessin du niveau
export function drawLevel(ctx: CanvasRenderingContext2D) {
  // Dessiner les murs
  ctx.save();

  for (const wall of walls) {
    // Ombre des murs
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(wall.x + 2, wall.y + 2, wall.w, wall.h);

    // Couleur du mur selon son type
    if (wall.destructible) {
      // Murs cassables - couleur différente
      const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.h);
      gradient.addColorStop(0, '#CD853F');  // Sable clair
      gradient.addColorStop(1, '#8B7355');  // Sable foncé
      ctx.fillStyle = gradient;
    } else {
      // Murs incassables - couleur standard
      const gradient = ctx.createLinearGradient(wall.x, wall.y, wall.x, wall.y + wall.h);
      gradient.addColorStop(0, '#8B4513');  // Marron clair
      gradient.addColorStop(1, '#654321');  // Marron foncé
      ctx.fillStyle = gradient;
    }

    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

    // Bordure des murs
    ctx.strokeStyle = wall.destructible ? '#8B7355' : '#2F1B14';
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);

    // Ajouter une texture pour les murs cassables
    if (wall.destructible) {
      ctx.fillStyle = 'rgba(139, 115, 85, 0.3)';
      // Petits points pour simuler une texture de sable/brique
      for (let i = 0; i < wall.w; i += 8) {
        for (let j = 0; j < wall.h; j += 8) {
          if (Math.random() > 0.7) {
            ctx.fillRect(wall.x + i, wall.y + j, 2, 2);
          }
        }
      }
    }
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

// Fonction pour détruire un mur cassable à une position donnée (en pixels)
export function destroyWallAt(x: number, y: number): boolean {
  const blockX = pixelToBlock(x);
  const blockY = pixelToBlock(y);

  // Chercher un mur cassable à cette position de bloc
  for (let i = walls.length - 1; i >= 0; i--) {
    const wall = walls[i];
    if (wall.destructible) {
      const wallBlockX = pixelToBlock(wall.x);
      const wallBlockY = pixelToBlock(wall.y);

      if (wallBlockX === blockX && wallBlockY === blockY) {
        walls.splice(i, 1);
        return true; // Mur détruit
      }
    }
  }

  return false; // Aucun mur cassable trouvé
}

// Fonction pour détruire tous les murs cassables dans un rayon donné (pour les explosions)
export function destroyWallsInRadius(centerX: number, centerY: number, radius: number): number {
  let destroyedCount = 0;

  for (let i = walls.length - 1; i >= 0; i--) {
    const wall = walls[i];
    if (wall.destructible) {
      const wallCenterX = wall.x + wall.w / 2;
      const wallCenterY = wall.y + wall.h / 2;
      const distance = Math.sqrt(
        Math.pow(wallCenterX - centerX, 2) +
        Math.pow(wallCenterY - centerY, 2)
      );

      if (distance <= radius) {
        walls.splice(i, 1);
        destroyedCount++;
      }
    }
  }

  return destroyedCount;
}