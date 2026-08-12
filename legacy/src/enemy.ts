// src/enemy.ts
import { Bullet } from "./bullet.js";
import { FRAME_SPEEDS, SPEEDS } from "./constants.js";
import { walls, BLOCK_SIZE, getCurrentLevel } from "./level.js";

export type EnemyType = 'brown' | 'grey' | 'teal' | 'yellow' | 'pink' | 'green' | 'purple' | 'white' | 'black';

export interface EnemyConfig {
  color: string;
  speed: number; // Vitesse en pixels par frame (calculée depuis les constantes)
  canonSpeed: number; // Vitesse de rotation du canon (0.01 = très lent, 0.1 = rapide)
  maxBullets: number;
  bulletSpeed: number; // Vitesse de la balle en pixels par frame
  bulletRicochets: number; // Nombre de ricochets autorisés
  aiType: 'weak' | 'defensive' | 'medium' | 'uncertain' | 'offensive' | 'precise' | 'aggressive';
  special?: string; // Effets spéciaux (invisibilité, etc.)
}

const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  brown: {
    color: '#8B4513',
    speed: FRAME_SPEEDS.tank.brown, // 0 px/frame - Immobile
    canonSpeed: 0.008, // Lente (environ 1-2 secondes pour 90°)
    maxBullets: 1, // 1 balle active à la fois
    bulletSpeed: FRAME_SPEEDS.bullet.normal, // Balle normale
    bulletRicochets: 1, // 1 rebond maximum
    aiType: 'weak'
  },
  grey: {
    color: '#808080',
    speed: FRAME_SPEEDS.tank.grey, // ~0.83 px/frame - Lente patrouille
    canonSpeed: 0.025, // Moyenne – plus rapide que le Brown
    maxBullets: 1, // 1 balle à la fois
    bulletSpeed: FRAME_SPEEDS.bullet.normal, // Balle normale
    bulletRicochets: 1, // Jusqu'à 1 ricochet
    aiType: 'defensive'
  },
  teal: {
    color: '#008080',
    speed: FRAME_SPEEDS.tank.teal, // ~0.83 px/frame - Lent
    canonSpeed: 0.025, // Lent
    maxBullets: 1,
    bulletSpeed: FRAME_SPEEDS.bullet.super, // Super balle rapide
    bulletRicochets: 0,
    aiType: 'medium'
  },
  yellow: {
    color: '#FFD700',
    speed: FRAME_SPEEDS.tank.yellow, // ~2.5 px/frame - Rapide
    canonSpeed: 0.02, // Variable lent (sera modifié dans le code)
    maxBullets: 1,
    bulletSpeed: FRAME_SPEEDS.bullet.normal, // Balle normale
    bulletRicochets: 1,
    aiType: 'uncertain'
  },
  pink: {
    color: '#FF69B4',
    speed: FRAME_SPEEDS.tank.pink, // ~1.67 px/frame - Standard
    canonSpeed: 0.035, // Modéré
    maxBullets: 3,
    bulletSpeed: FRAME_SPEEDS.bullet.normal, // Balles normales
    bulletRicochets: 1,
    aiType: 'offensive'
  },
  green: {
    color: '#00FF00',
    speed: FRAME_SPEEDS.tank.green, // 0 px/frame - Immobile
    canonSpeed: 0.04, // Un peu plus rapide mais précis
    maxBullets: 2,
    bulletSpeed: FRAME_SPEEDS.bullet.super, // Super balles rapides
    bulletRicochets: 2,
    aiType: 'precise'
  },
  purple: {
    color: '#800080',
    speed: FRAME_SPEEDS.tank.purple, // ~2.5 px/frame - Très mobile
    canonSpeed: 0.045, // Assez rapide
    maxBullets: 5,
    bulletSpeed: FRAME_SPEEDS.bullet.normal, // Balles normales
    bulletRicochets: 1,
    aiType: 'offensive'
  },
  white: {
    color: '#FFFFFF',
    speed: FRAME_SPEEDS.tank.white, // ~1.67 px/frame - Normal
    canonSpeed: 0.04, // Modéré
    maxBullets: 5,
    bulletSpeed: FRAME_SPEEDS.bullet.normal, // Balles normales
    bulletRicochets: 1,
    aiType: 'offensive',
    special: 'invisible' // Invisibilité
  },
  black: {
    color: '#000000',
    speed: FRAME_SPEEDS.tank.black, // ~3.33 px/frame - Ultra rapide
    canonSpeed: 0.05, // Le plus rapide mais toujours contrôlé
    maxBullets: 3,
    bulletSpeed: FRAME_SPEEDS.bullet.super, // Super balles rapides
    bulletRicochets: 0,
    aiType: 'aggressive'
  }
};

export class Enemy {
  x: number;
  y: number;
  type: EnemyType;
  config: EnemyConfig;
  direction: number;
  cannonDirection: number;
  width: number = 32;
  height: number = 24;
  bullets: Bullet[] = [];
  id: string; // Identifiant unique pour la synchronisation

  // IA properties
  lastShot: number = 0;
  shootInterval: number = 2000; // 2 secondes par défaut
  lastMove: number = 0;
  moveInterval: number = 1000; // 1 seconde par défaut
  targetX: number = 0;
  targetY: number = 0;
    // Effets visuels
  alpha: number = 1; // Pour l'invisibilité
  glowEffect: number = 0; // Pour les effets de glow

  // Synchronisation
  isNetworkControlled: boolean = false; // Si cet ennemi est contrôlé par le réseau
  lastNetworkUpdate: number = 0; // Timestamp de la dernière mise à jour réseau envoyée
    // Propriétés spéciales pour le brown
  detectionRadius: number = 267; // ~⅓ écran (736/3)
  lastKnownPlayerX: number = 0; // Dernière position connue du joueur
  lastKnownPlayerY: number = 0;
  isTrackingPlayer: boolean = false; // Si le tank brown suit actuellement un joueur
  
  // Propriétés spéciales pour le grey
  patrolDirection: number = 0; // Direction de patrouille
  patrolDistance: number = 0; // Distance parcourue dans la direction actuelle
  maxPatrolDistance: number = 60; // Distance max avant changement de direction
  detectionRadiusLarge: number = 400; // Rayon large de détection pour grey
  lastPlayerX: number = 0; // Position du joueur pour détecter s'il bouge
  lastPlayerY: number = 0;
  playerStationaryFrames: number = 0; // Compteur pour détecter si le joueur est immobile
    constructor(x: number, y: number, type: EnemyType, direction: number = 0) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.direction = direction;
    this.cannonDirection = direction;
    this.config = ENEMY_CONFIGS[type];
    
    // ID temporaire - sera remplacé par un ID déterministe dans initializeEnemies
    this.id = `temp_${type}_${x}_${y}`;
    
    // Ajuster les intervals selon l'IA
    this.adjustAITimings();

    // Effet spécial pour les tanks invisibles
    if (this.config.special === 'invisible') {
      this.alpha = 0.3; // Semi-transparent
    }
  }
    private adjustAITimings() {
    switch (this.config.aiType) {
      case 'weak':
        this.shootInterval = 4000 + Math.random() * 4000; // 4 à 8 secondes
        this.moveInterval = 0; // Immobile
        break;      case 'defensive':
        this.shootInterval = 3000 + Math.random() * 2000; // 3 à 5 secondes
        this.moveInterval = 2000; // Patrouille lente
        break;
      case 'medium':
        this.shootInterval = 2500;
        this.moveInterval = 1200;
        break;
      case 'uncertain':
        this.shootInterval = 1500 + Math.random() * 2000; // Variable
        this.moveInterval = 736 + Math.random() * 1000;
        break;
      case 'offensive':
        this.shootInterval = 1000;
        this.moveInterval = 736;
        break;
      case 'precise':
        this.shootInterval = 1800;
        this.moveInterval = 0; // Immobile mais précis
        break;
      case 'aggressive':
        this.shootInterval = 600;
        this.moveInterval = 400;
        break;
    }
  }
  update(playerTanks: any[], deltaTime: number, sendNetworkUpdate?: (type: string, data: any) => void) {
    const now = Date.now();

    // Mettre à jour l'effet de glow
    this.glowEffect = Math.sin(now * 0.005) * 0.5 + 0.5;
      // Ne calculer l'IA que si ce n'est pas contrôlé par le réseau
    if (!this.isNetworkControlled && sendNetworkUpdate) {
      const oldPos = { x: this.x, y: this.y, direction: this.direction, cannonDirection: this.cannonDirection };
      
      // Mettre à jour la direction du canon en continu pour suivre les joueurs
      this.updateCannonDirection(playerTanks);
      
      // IA de mouvement
      if (this.config.speed > 0 && now - this.lastMove > this.moveInterval) {
        this.updateMovement(playerTanks);
        this.lastMove = now;
      }      // Envoyer la mise à jour si la position OU la direction du canon a changé
      const posChanged = oldPos.x !== this.x || oldPos.y !== this.y || oldPos.direction !== this.direction;
      const cannonChanged = Math.abs(oldPos.cannonDirection - this.cannonDirection) > 0.001; // Seuil très petit pour les rotations
      
      // Envoyer systématiquement toutes les 100ms si le canon bouge, même si le changement est petit
      const timeSinceLastUpdate = now - (this.lastNetworkUpdate || 0);
      const shouldSendTimedUpdate = timeSinceLastUpdate > 100 && Math.abs(oldPos.cannonDirection - this.cannonDirection) > 0.0001;
      
      if (posChanged || cannonChanged || shouldSendTimedUpdate) {
        console.log(`[AI] Ennemi ${this.id} - Envoi update: pos=${posChanged}, cannon=${cannonChanged}, timed=${shouldSendTimedUpdate}, cannonDir=${this.cannonDirection.toFixed(3)}`);
        sendNetworkUpdate('enemyMove', {
          type: 'enemyMove',
          enemyId: this.id,
          x: this.x,
          y: this.y,
          direction: this.direction,
          cannonDirection: this.cannonDirection
        });
        this.lastNetworkUpdate = now;
      }// IA de tir - indépendant du mouvement
      if (now - this.lastShot > this.shootInterval) {
        if (this.bullets.length < this.config.maxBullets) {
          // Vérifier si on peut tirer (système de vision)
          if (this.canShootAtPlayer(playerTanks)) {
            const oldBulletCount = this.bullets.length;
            const shootDirection = this.updateShooting(playerTanks);
              // Envoyer le message de tir seulement si une balle a été créée
            if (this.bullets.length > oldBulletCount && shootDirection !== null) {
              const bulletX = this.x + Math.cos(shootDirection) * (this.width/2 + 5);
              const bulletY = this.y + Math.sin(shootDirection) * (this.width/2 + 5);
              
              sendNetworkUpdate('enemyShoot', {
                type: 'enemyShoot',
                enemyId: this.id,
                x: bulletX,
                y: bulletY,
                cannonDirection: shootDirection, // Utiliser la vraie direction de tir
                bulletSpeed: this.config.bulletSpeed,
                bulletColor: this.config.color
              });
            }
          }
        }
        this.lastShot = now; // Toujours mettre à jour le timer même si on n'a pas tiré
      }
    }    // Nettoyer les balles expirées
    this.bullets = this.bullets.filter(bullet => {
      bullet.update();
      const currentLevel = getCurrentLevel();
      const arenaWidth = currentLevel.dimensions?.width || 800;
      const arenaHeight = currentLevel.dimensions?.height || 600;
      return bullet.x >= 0 && bullet.x <= arenaWidth && bullet.y >= 0 && bullet.y <= arenaHeight;
    });
  }
    private updateMovement(playerTanks: any[]) {
    if (this.config.speed === 0) return; // Immobile
    
    // Comportement spécial pour le grey (defensive)
    if (this.config.aiType === 'defensive') {
      this.updateGreyMovement(playerTanks);
      return;
    }
    
    // Comportement normal pour les autres ennemis
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    switch (this.config.aiType) {
      case 'offensive':
      case 'aggressive':
        // Se rapprocher pour être plus efficace
        if (distance > 100) {
          this.moveTowards(player);
        }
        break;
      case 'uncertain':
        // Mouvement erratique
        if (Math.random() < 0.5) {
          this.moveTowards(player);
        } else {
          this.moveRandomly();
        }
        break;
      default:
        // Mouvement basique vers le joueur
        this.moveTowards(player);
    }
  }
  
  // Logique de patrouille pour le grey
  private updateGreyMovement(playerTanks: any[]) {
    // Initialiser la direction de patrouille si nécessaire
    if (this.patrolDirection === 0) {
      this.patrolDirection = Math.random() * Math.PI * 2;
    }    // Calculer le mouvement de patrouille - vitesse directe en pixels/frame
    const moveX = Math.cos(this.patrolDirection) * this.config.speed;
    const moveY = Math.sin(this.patrolDirection) * this.config.speed;
    
    // Vérifier si on peut se déplacer dans cette direction
    if (this.canMoveTo(this.x + moveX, this.y + moveY)) {
      this.x += moveX;
      this.y += moveY;
      this.direction = this.patrolDirection;
      this.patrolDistance += Math.sqrt(moveX * moveX + moveY * moveY);
    } else {
      // Obstacle rencontré, changer de direction
      this.patrolDirection = Math.random() * Math.PI * 2;
      this.patrolDistance = 0;
      return;
    }
    
    // Changer de direction après avoir parcouru la distance max
    if (this.patrolDistance >= this.maxPatrolDistance) {
      // Patrouille en ligne droite ou en carré
      if (Math.random() < 0.7) {
        // 70% chance de continuer en ligne droite ou tourner à 90°
        const turns = [0, Math.PI/2, -Math.PI/2, Math.PI]; // Droite, 90° droite, 90° gauche, demi-tour
        const randomTurn = turns[Math.floor(Math.random() * turns.length)];
        this.patrolDirection += randomTurn;
      } else {
        // 30% chance de direction complètement aléatoire
        this.patrolDirection = Math.random() * Math.PI * 2;
      }
      
      this.patrolDistance = 0;
    }
  }
  private updateShooting(playerTanks: any[]): number | null {
    if (this.bullets.length >= this.config.maxBullets) return null;
    
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return null;
    
    // La direction du canon est déjà mise à jour dans updateCannonDirection
    // Ajouter juste un peu d'imprécision selon l'IA
    const accuracy = this.getAccuracy();
    const shootDirection = this.cannonDirection + (Math.random() - 0.5) * accuracy;
    
    // Utiliser cette direction légèrement ajustée pour le tir
    const bulletX = this.x + Math.cos(shootDirection) * (this.width/2 + 5);
    const bulletY = this.y + Math.sin(shootDirection) * (this.width/2 + 5);
      const bullet = new Bullet(
      bulletX,
      bulletY,
      shootDirection,
      this.config.color
    );
      // Utiliser la vitesse configurée directement
    bullet.speed = this.config.bulletSpeed;
    bullet.dx = Math.cos(shootDirection) * bullet.speed;
    bullet.dy = Math.sin(shootDirection) * bullet.speed;
    
    // Configurer les ricochets
    bullet.maxRicochets = this.config.bulletRicochets;
    
    this.bullets.push(bullet);
    return shootDirection; // Retourner la direction utilisée pour le tir
  }

  private getAccuracy(): number {
    switch (this.config.aiType) {
      case 'weak': return 0.8; // Très imprécis
      case 'defensive': return 0.4;
      case 'medium': return 0.3;
      case 'uncertain': return 0.6;
      case 'offensive': return 0.2;
      case 'precise': return 0.05; // Très précis
      case 'aggressive': return 0.25;
      default: return 0.4;
    }
  }

  private findNearestPlayer(playerTanks: any[]): any {
    let nearest = null;
    let minDistance = Infinity;

    for (const tank of playerTanks) {
      const dx = tank.x - this.x;
      const dy = tank.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearest = tank;
      }
    }

    return nearest;
  }

  private moveTowards(target: any) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      // Se rapprocher directement avec la vitesse configurée
      const moveX = (dx / distance) * this.config.speed;
      const moveY = (dy / distance) * this.config.speed;
      
      if (this.canMoveTo(this.x + moveX, this.y + moveY)) {
        this.x += moveX;
        this.y += moveY;
        this.direction = Math.atan2(dy, dx);
      }
    }
  }

  private moveAwayFrom(target: any) {
    const dx = this.x - target.x;
    const dy = this.y - target.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 0) {
      // S'éloigner directement avec la vitesse configurée
      const moveX = (dx / distance) * this.config.speed;
      const moveY = (dy / distance) * this.config.speed;
      
      if (this.canMoveTo(this.x + moveX, this.y + moveY)) {
        this.x += moveX;
        this.y += moveY;
        this.direction = Math.atan2(dy, dx);
      }
    }
  }
    private moveRandomly() {
    const angle = Math.random() * Math.PI * 2;
    // Mouvement aléatoire avec la vitesse configurée
    const moveX = Math.cos(angle) * this.config.speed;
    const moveY = Math.sin(angle) * this.config.speed;
    
    if (this.canMoveTo(this.x + moveX, this.y + moveY)) {
      this.x += moveX;
      this.y += moveY;
      this.direction = angle;
    }
  }
  private canMoveTo(x: number, y: number): boolean {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;    // Vérifier les limites de l'écran avec les nouvelles dimensions
    const currentLevel = getCurrentLevel();
    const arenaWidth = currentLevel.dimensions?.width || 800;
    const arenaHeight = currentLevel.dimensions?.height || 600;
    if (x - halfWidth < BLOCK_SIZE || x + halfWidth > arenaWidth - BLOCK_SIZE ||
      y - halfHeight < BLOCK_SIZE || y + halfHeight > arenaHeight - BLOCK_SIZE) {
      return false;
    }

    // Vérifier collision avec les murs
    for (const wall of walls) {
      if (x + halfWidth > wall.x &&
        x - halfWidth < wall.x + wall.w &&
        y + halfHeight > wall.y &&
        y - halfHeight < wall.y + wall.h) {
        return false;
      }
    }

    return true;
  }

  private shoot() {
    const bulletX = this.x + Math.cos(this.cannonDirection) * (this.width / 2 + 5);
    const bulletY = this.y + Math.sin(this.cannonDirection) * (this.width / 2 + 5);

    const bullet = new Bullet(
      bulletX,
      bulletY,
      this.cannonDirection,
      this.config.color
    );

    // Ajuster la vitesse de la balle
    bullet.speed *= this.config.bulletSpeed;
    bullet.dx = Math.cos(this.cannonDirection) * bullet.speed;
    bullet.dy = Math.sin(this.cannonDirection) * bullet.speed;

    // Configurer les ricochets
    bullet.maxRicochets = this.config.bulletRicochets;
    
    this.bullets.push(bullet);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalAlpha = this.alpha;

    // Effet de glow pour certains types
    if (this.config.aiType === 'aggressive' || this.config.aiType === 'precise') {
      ctx.shadowColor = this.config.color;
      ctx.shadowBlur = 10 + this.glowEffect * 5;
    }

    // Dessiner le corps du tank
    ctx.translate(this.x, this.y);
    ctx.rotate(this.direction);

    // Ombre
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-this.width / 2 + 1, -this.height / 2 + 1, this.width, this.height);

    // Corps principal
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(this.width, this.height) / 2);
    gradient.addColorStop(0, this.config.color);
    gradient.addColorStop(1, this.darkenColor(this.config.color, 0.3));
    ctx.fillStyle = gradient;
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

    // Bordure
    ctx.strokeStyle = this.darkenColor(this.config.color, 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

    // Indicateur de type (petit carré coloré)
    ctx.fillStyle = this.config.color;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(-4, -4, 8, 8);

    ctx.restore();

    // Dessiner le canon
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.cannonDirection);

    const cannonLength = this.width * 0.8;
    const cannonWidth = 4;
    ctx.fillStyle = this.darkenColor(this.config.color, 0.4);
    ctx.fillRect(-2, -cannonWidth / 2, cannonLength, cannonWidth);
    ctx.strokeStyle = this.darkenColor(this.config.color, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(-2, -cannonWidth / 2, cannonLength, cannonWidth);

    ctx.restore();

    // Dessiner les balles
    this.bullets.forEach(bullet => bullet.draw(ctx));
  }

  private darkenColor(color: string, factor: number): string {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);

      const newR = Math.floor(r * (1 - factor));
      const newG = Math.floor(g * (1 - factor));
      const newB = Math.floor(b * (1 - factor));

      return `rgb(${newR}, ${newG}, ${newB})`;
    }

    return color;
  }

  // Vérifier si l'ennemi est touché par une balle
  isHitBy(bullet: Bullet): boolean {
    const distance = Math.sqrt(
      Math.pow(bullet.x - this.x, 2) + Math.pow(bullet.y - this.y, 2)
    );

    const collisionRadius = Math.max(this.width, this.height) / 2 + bullet.radius;
    return distance < collisionRadius;
  }

  // Obtenir toutes les balles de cet ennemi
  getBullets(): Bullet[] {
    return this.bullets;
  }

  // Supprimer une balle spécifique
  removeBullet(bullet: Bullet) {
    const index = this.bullets.indexOf(bullet);
    if (index !== -1) {
      this.bullets.splice(index, 1);
    }
  }
  // Méthodes pour la synchronisation réseau
  updateFromNetwork(x: number, y: number, direction: number, cannonDirection: number) {
    console.log(`[Network] Ennemi ${this.id} - Update: x=${x.toFixed(1)}, y=${y.toFixed(1)}, cannonDir=${cannonDirection.toFixed(3)}`);
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.cannonDirection = cannonDirection;
  }
  shootFromNetwork(x: number, y: number, cannonDirection: number, bulletSpeed: number, bulletColor: string): Bullet | undefined {
    if (this.bullets.length >= this.config.maxBullets) return undefined;
      const bullet = new Bullet(x, y, cannonDirection, bulletColor);    bullet.speed = bulletSpeed; // Utiliser directement la vitesse passée en paramètre
    bullet.dx = Math.cos(cannonDirection) * bullet.speed;
    bullet.dy = Math.sin(cannonDirection) * bullet.speed;
    bullet.maxRicochets = this.config.bulletRicochets;

    this.bullets.push(bullet);
    return bullet; // Retourner la balle créée pour l'ajouter à la liste principale
  }  private updateCannonDirection(playerTanks: any[]) {
    // Comportement spécial pour le tank brown (weak)
    if (this.config.aiType === 'weak') {
      this.updateBrownCannonDirection(playerTanks);
      return;
    }
    
    // Comportement spécial pour le tank grey (defensive)
    if (this.config.aiType === 'defensive') {
      this.updateGreyCannonDirection(playerTanks);
      return;
    }
    
    // Comportement normal pour les autres ennemis
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return;
    
    // Calculer l'angle vers le joueur le plus proche
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    let targetAngle = Math.atan2(dy, dx);
    
    // Calculer la différence d'angle
    const angleDiff = targetAngle - this.cannonDirection;
    let normalizedDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
    
    // Utiliser la vitesse de canon configurée
    let canonSpeed = this.config.canonSpeed;
    
    // Modifier la vitesse pour le type "uncertain" (jaune) - variable
    if (this.config.aiType === 'uncertain') {
      canonSpeed *= (0.5 + Math.random()); // Entre 50% et 150% de la vitesse de base
    }
    
    // Appliquer la rotation
    this.cannonDirection += normalizedDiff * canonSpeed;
    
    // Normaliser la direction finale
    this.cannonDirection = ((this.cannonDirection + Math.PI) % (2 * Math.PI)) - Math.PI;
  }
  
  // Logique de canon pour le grey
  private updateGreyCannonDirection(playerTanks: any[]) {
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return;
    
    // Calculer la distance
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Le grey détecte dans un rayon large
    if (distance <= this.detectionRadiusLarge) {
      // Suivre activement le joueur avec une rotation fluide et bonne précision
      let targetAngle = Math.atan2(dy, dx);
      
      // Calculer la différence d'angle
      const angleDiff = targetAngle - this.cannonDirection;
      let normalizedDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
      
      // Rotation fluide et précise
      this.cannonDirection += normalizedDiff * this.config.canonSpeed;
      
      // Normaliser la direction finale
      this.cannonDirection = ((this.cannonDirection + Math.PI) % (2 * Math.PI)) - Math.PI;
      
      // Suivre les mouvements du joueur pour la tactique de tir
      this.trackPlayerMovement(player);
    }
  }
  
  // Suivre les mouvements du joueur pour détecter s'il est immobile
  private trackPlayerMovement(player: any) {
    const movementThreshold = 5; // Pixels de mouvement minimum
    
    if (Math.abs(player.x - this.lastPlayerX) < movementThreshold && 
        Math.abs(player.y - this.lastPlayerY) < movementThreshold) {
      this.playerStationaryFrames++;
    } else {
      this.playerStationaryFrames = 0;
    }
    
    this.lastPlayerX = player.x;
    this.lastPlayerY = player.y;
  }
  
  // Logique spéciale pour le tank brown
  private updateBrownCannonDirection(playerTanks: any[]) {
    const player = this.findNearestPlayer(playerTanks);
    if (!player) {
      this.isTrackingPlayer = false;
      return;
    }
    
    // Calculer la distance au joueur
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Vérifier si le joueur est dans le rayon de détection
    if (distance <= this.detectionRadius) {
      // Le joueur est détecté, commencer/continuer le suivi
      this.isTrackingPlayer = true;
      
      // Mettre à jour la dernière position connue du joueur
      this.lastKnownPlayerX = player.x;
      this.lastKnownPlayerY = player.y;
    } else if (!this.isTrackingPlayer) {
      // Le joueur n'est pas dans le rayon et on ne le suivait pas déjà
      return;
    }
    
    // Si on suit le joueur, viser la dernière position connue avec imprécision
    if (this.isTrackingPlayer) {
      // Ajouter une variation aléatoire pour l'imprécision (moyenne à faible précision)
      const inaccuracy = (Math.random() - 0.5) * Math.PI * 0.4; // ±36 degrés d'erreur
      
      const targetDx = this.lastKnownPlayerX - this.x;
      const targetDy = this.lastKnownPlayerY - this.y;
      let targetAngle = Math.atan2(targetDy, targetDx) + inaccuracy;
      
      // Calculer la différence d'angle
      const angleDiff = targetAngle - this.cannonDirection;
      let normalizedDiff = ((angleDiff + Math.PI) % (2 * Math.PI)) - Math.PI;
      
      // Rotation lente (environ 1-2 secondes pour 90°)
      this.cannonDirection += normalizedDiff * this.config.canonSpeed;
      
      // Normaliser la direction finale
      this.cannonDirection = ((this.cannonDirection + Math.PI) % (2 * Math.PI)) - Math.PI;
    }
  }  // Système de vision - vérifier si l'ennemi peut tirer sur un joueur
  private canShootAtPlayer(playerTanks: any[]): boolean {
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return false;
    
    // Calculer la distance
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Comportement spécial pour le brown
    if (this.config.aiType === 'weak') {
      // Le brown ne tire que si le joueur est dans son rayon de détection
      if (distance > this.detectionRadius) return false;
      
      // Et seulement s'il y a une ligne de vue directe
      return this.hasDirectLineOfSight(this.x, this.y, player.x, player.y);
    }
    
    // Comportement spécial pour le grey
    if (this.config.aiType === 'defensive') {
      // Le grey détecte dans un rayon large
      if (distance > this.detectionRadiusLarge) return false;
      
      // Tactique de tir : tire souvent quand le joueur est immobile ou suit une ligne droite
      const isPlayerStationary = this.playerStationaryFrames > 30; // ~0.5 seconde immobile
      
      // Vérifier tir direct
      const hasDirectShot = this.hasDirectLineOfSight(this.x, this.y, player.x, player.y);
      
      // Vérifier tir avec rebond
      const hasRicochetShot = this.hasRicochetShot(player);
      
      // Conditions pour tirer
      if (hasDirectShot) {
        // Tir direct possible
        if (isPlayerStationary) {
          return true; // Priorité si le joueur est immobile
        }
        // Sinon, attendre une "fenêtre sûre" (pas toujours tirer)
        return Math.random() < 0.3; // 30% de chance de tirer même si le joueur bouge
      } else if (hasRicochetShot) {
        // Tir avec rebond possible - privilégie cette tactique
        return isPlayerStationary || Math.random() < 0.4; // 40% de chance ou si immobile
      }
      
      return false;
    }
    
    // Comportement normal pour les autres ennemis
    // Si le joueur est trop loin, ne pas tirer (économiser les balles)
    if (distance > 400) return false;
    
    // Vérifier le tir direct
    if (this.hasDirectLineOfSight(this.x, this.y, player.x, player.y)) {
      return true;
    }
    
    // Vérifier les tirs avec rebond (seulement pour les ennemis qui en sont capables)
    if (this.config.bulletRicochets > 0) {
      return this.hasRicochetShot(player);
    }
    
    return false;
  }
  
  // Vérifier s'il y a une ligne de vue directe
  private hasDirectLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    const dx = (x2 - x1) / steps;
    const dy = (y2 - y1) / steps;
    
    for (let i = 1; i < steps; i++) {
      const checkX = x1 + dx * i;
      const checkY = y1 + dy * i;
      
      // Vérifier collision avec les murs
      for (const wall of walls) {
        if (checkX >= wall.x && checkX <= wall.x + wall.w &&
            checkY >= wall.y && checkY <= wall.y + wall.h) {
          return false; // Obstacle détecté
        }
      }
    }
    
    return true; // Aucun obstacle
  }
  
  // Vérifier s'il y a un tir possible avec rebond (version simplifiée)
  private hasRicochetShot(player: any): boolean {
    // Pour simplifier, on vérifie quelques angles de rebond communs
    const bounceAngles = [
      Math.PI / 4,    // 45°
      -Math.PI / 4,   // -45°
      Math.PI / 2,    // 90°
      -Math.PI / 2,   // -90°
      3 * Math.PI / 4, // 135°
      -3 * Math.PI / 4 // -135°
    ];
    
    for (const angle of bounceAngles) {
      // Simuler un tir dans cette direction et voir s'il peut atteindre le joueur après rebond
      if (this.simulateRicochetToTarget(angle, player.x, player.y)) {
        return true;
      }
    }
    
    return false;
  }
  
  // Simulation simple de rebond (version basique)
  private simulateRicochetToTarget(angle: number, targetX: number, targetY: number): boolean {
    let x = this.x;
    let y = this.y;
    let dx = Math.cos(angle) * 2;
    let dy = Math.sin(angle) * 2;
    let bounces = 0;
    
    // Simulation sur 200 pas maximum
    for (let step = 0; step < 200 && bounces <= this.config.bulletRicochets; step++) {
      x += dx;
      y += dy;
      
      // Vérifier si on est proche de la cible
      if (Math.abs(x - targetX) < 20 && Math.abs(y - targetY) < 20) {
        return true;
      }
      
      // Vérifier les limites et rebonds
      if (x <= 0 || x >= 736) {
        dx = -dx;
        bounces++;
      }
      if (y <= 0 || y >= 600) {
        dy = -dy;
        bounces++;
      }
      
      // Vérifier collision avec les murs (rebond)
      for (const wall of walls) {
        if (x >= wall.x && x <= wall.x + wall.w &&
            y >= wall.y && y <= wall.y + wall.h) {
          // Rebond simplifié
          dx = -dx;
          dy = -dy;
          bounces++;
          break;
        }
      }
    }
    
    return false;
  }

  // Méthode pour réinitialiser complètement l'ennemi
  reset() {    // Réinitialiser les timers
    this.lastShot = 0;
    this.lastMove = 0;
    this.lastNetworkUpdate = 0;
    
    // Réinitialiser les balles
    this.bullets.length = 0;
    
    // Réinitialiser les propriétés visuelles
    this.alpha = this.config.special === 'invisible' ? 0.3 : 1;
    this.glowEffect = 0;
    
    // Réinitialiser les propriétés spéciales pour le brown
    this.lastKnownPlayerX = 0;
    this.lastKnownPlayerY = 0;
    this.isTrackingPlayer = false;
    
    // Réinitialiser les propriétés spéciales pour le grey
    this.patrolDirection = 0;
    this.patrolDistance = 0;
    this.lastPlayerX = 0;
    this.lastPlayerY = 0;
    this.playerStationaryFrames = 0;    // Réajuster les timings (important pour les intervals aléatoires)
    this.adjustAITimings();
    
    // NE PAS modifier isNetworkControlled lors du reset
    // Cette propriété doit être préservée car elle détermine le mode de fonctionnement de l'ennemi
  }

  // Méthode pour définir le contrôle réseau
  setNetworkControlled(isNetworkControlled: boolean) {
    this.isNetworkControlled = isNetworkControlled;
    console.log(`Ennemi ${this.id} - Network controlled: ${this.isNetworkControlled}`);
  }
}
