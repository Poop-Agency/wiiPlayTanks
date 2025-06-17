// src/enemy.ts
import { Bullet } from "./bullet.js";
import { walls } from "./level.js";

export type EnemyType = 'brown' | 'grey' | 'teal' | 'yellow' | 'pink' | 'green' | 'purple' | 'white' | 'black';

export interface EnemyConfig {
  color: string;
  speed: number; // Multiplicateur de vitesse (0 = immobile, 1 = normale, 1.5 = rapide, etc.)
  maxBullets: number;
  bulletSpeed: number; // Multiplicateur de vitesse des balles (1 = lente, 2 = rapide)
  bulletRicochets: number; // Nombre de ricochets autorisés
  aiType: 'weak' | 'defensive' | 'medium' | 'uncertain' | 'offensive' | 'precise' | 'aggressive';
  special?: string; // Effets spéciaux (invisibilité, etc.)
}

const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  brown: {
    color: '#8B4513',
    speed: 0, // Immobile
    maxBullets: 1,
    bulletSpeed: 1, // Balle lente
    bulletRicochets: 1,
    aiType: 'weak'
  },
  grey: {
    color: '#808080',
    speed: 0.5, // Lent
    maxBullets: 1,
    bulletSpeed: 1, // Balle lente
    bulletRicochets: 1,
    aiType: 'defensive'
  },
  teal: {
    color: '#008080',
    speed: 0.5, // Lent
    maxBullets: 1,
    bulletSpeed: 2, // Missile rapide
    bulletRicochets: 0,
    aiType: 'medium'
  },
  yellow: {
    color: '#FFD700',
    speed: 1.5, // Rapide
    maxBullets: 1,
    bulletSpeed: 1, // Balle lente
    bulletRicochets: 1,
    aiType: 'uncertain'
  },
  pink: {
    color: '#FF69B4',
    speed: 1, // Normal
    maxBullets: 3,
    bulletSpeed: 1, // Balles lentes
    bulletRicochets: 1,
    aiType: 'offensive'
  },
  green: {
    color: '#00FF00',
    speed: 0, // Immobile
    maxBullets: 2,
    bulletSpeed: 2, // Missiles rapides
    bulletRicochets: 2,
    aiType: 'precise'
  },
  purple: {
    color: '#800080',
    speed: 1.5, // Rapide
    maxBullets: 5,
    bulletSpeed: 1, // Balles lentes
    bulletRicochets: 1,
    aiType: 'offensive'
  },
  white: {
    color: '#FFFFFF',
    speed: 1, // Normal
    maxBullets: 5,
    bulletSpeed: 1, // Balles lentes
    bulletRicochets: 1,
    aiType: 'offensive',
    special: 'invisible' // Invisibilité
  },
  black: {
    color: '#000000',
    speed: 2, // Très rapide
    maxBullets: 3,
    bulletSpeed: 2, // Missiles rapides
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
  
  constructor(x: number, y: number, type: EnemyType, direction: number = 0) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.direction = direction;
    this.cannonDirection = direction;
    this.config = ENEMY_CONFIGS[type];
    
    // Générer un ID unique basé sur la position et le type
    this.id = `${type}_${x}_${y}_${Math.random().toString(36).substr(2, 5)}`;
    
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
        this.shootInterval = 4000; // Tire lentement
        this.moveInterval = 2000;
        break;
      case 'defensive':
        this.shootInterval = 3000;
        this.moveInterval = 1500;
        break;
      case 'medium':
        this.shootInterval = 2500;
        this.moveInterval = 1200;
        break;
      case 'uncertain':
        this.shootInterval = 1500 + Math.random() * 2000; // Variable
        this.moveInterval = 800 + Math.random() * 1000;
        break;
      case 'offensive':
        this.shootInterval = 1000;
        this.moveInterval = 800;
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
      // IA de mouvement
      if (this.config.speed > 0 && now - this.lastMove > this.moveInterval) {
        const oldPos = { x: this.x, y: this.y, direction: this.direction, cannonDirection: this.cannonDirection };
        this.updateMovement(playerTanks);
        
        // Envoyer la mise à jour si la position a changé
        if (oldPos.x !== this.x || oldPos.y !== this.y || oldPos.direction !== this.direction || oldPos.cannonDirection !== this.cannonDirection) {
          sendNetworkUpdate('enemyMove', {
            type: 'enemyMove',
            enemyId: this.id,
            x: this.x,
            y: this.y,
            direction: this.direction,
            cannonDirection: this.cannonDirection
          });
        }
        
        this.lastMove = now;
      }
      
      // IA de tir
      if (now - this.lastShot > this.shootInterval) {
        if (this.bullets.length < this.config.maxBullets) {
          this.updateShooting(playerTanks);
          
          // Envoyer le message de tir
          const bulletX = this.x + Math.cos(this.cannonDirection) * (this.width/2 + 5);
          const bulletY = this.y + Math.sin(this.cannonDirection) * (this.width/2 + 5);
          
          sendNetworkUpdate('enemyShoot', {
            type: 'enemyShoot',
            enemyId: this.id,
            x: bulletX,
            y: bulletY,
            cannonDirection: this.cannonDirection,
            bulletSpeed: this.config.bulletSpeed,
            bulletColor: this.config.color
          });
        }
        this.lastShot = now;
      }
    }
    
    // Nettoyer les balles expirées
    this.bullets = this.bullets.filter(bullet => {
      bullet.update();
      return bullet.x >= 0 && bullet.x <= 800 && bullet.y >= 0 && bullet.y <= 600;
    });
  }
  
  private updateMovement(playerTanks: any[]) {
    if (this.config.speed === 0) return; // Immobile
    
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return;
    
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    switch (this.config.aiType) {
      case 'defensive':
        // Garder ses distances
        if (distance < 150) {
          this.moveAwayFrom(player);
        }
        break;
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
  
  private updateShooting(playerTanks: any[]) {
    if (this.bullets.length >= this.config.maxBullets) return;
    
    const player = this.findNearestPlayer(playerTanks);
    if (!player) return;
    
    // Calculer l'angle vers le joueur
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    let targetAngle = Math.atan2(dy, dx);
    
    // Ajuster la précision selon l'IA
    const accuracy = this.getAccuracy();
    targetAngle += (Math.random() - 0.5) * accuracy;
    
    this.cannonDirection = targetAngle;
    this.shoot();
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
      const moveX = (dx / distance) * this.config.speed * 0.8;
      const moveY = (dy / distance) * this.config.speed * 0.8;
      
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
      const moveX = (dx / distance) * this.config.speed * 0.8;
      const moveY = (dy / distance) * this.config.speed * 0.8;
      
      if (this.canMoveTo(this.x + moveX, this.y + moveY)) {
        this.x += moveX;
        this.y += moveY;
        this.direction = Math.atan2(dy, dx);
      }
    }
  }
  
  private moveRandomly() {
    const angle = Math.random() * Math.PI * 2;
    const moveX = Math.cos(angle) * this.config.speed * 0.8;
    const moveY = Math.sin(angle) * this.config.speed * 0.8;
    
    if (this.canMoveTo(this.x + moveX, this.y + moveY)) {
      this.x += moveX;
      this.y += moveY;
      this.direction = angle;
    }
  }
  
  private canMoveTo(x: number, y: number): boolean {
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    
    // Vérifier les limites de l'écran
    if (x - halfWidth < 20 || x + halfWidth > 800 - 20 || 
        y - halfHeight < 20 || y + halfHeight > 600 - 20) {
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
    const bulletX = this.x + Math.cos(this.cannonDirection) * (this.width/2 + 5);
    const bulletY = this.y + Math.sin(this.cannonDirection) * (this.width/2 + 5);
    
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
    (bullet as any).maxRicochets = this.config.bulletRicochets;
    
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
    ctx.fillRect(-this.width/2 + 1, -this.height/2 + 1, this.width, this.height);
    
    // Corps principal
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(this.width, this.height)/2);
    gradient.addColorStop(0, this.config.color);
    gradient.addColorStop(1, this.darkenColor(this.config.color, 0.3));
    ctx.fillStyle = gradient;
    ctx.fillRect(-this.width/2, -this.height/2, this.width, this.height);
    
    // Bordure
    ctx.strokeStyle = this.darkenColor(this.config.color, 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(-this.width/2, -this.height/2, this.width, this.height);
    
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
    ctx.fillRect(-2, -cannonWidth/2, cannonLength, cannonWidth);
    ctx.strokeStyle = this.darkenColor(this.config.color, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(-2, -cannonWidth/2, cannonLength, cannonWidth);
    
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
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.cannonDirection = cannonDirection;
  }
  
  shootFromNetwork(x: number, y: number, cannonDirection: number, bulletSpeed: number, bulletColor: string) {
    if (this.bullets.length >= this.config.maxBullets) return;
    
    const bullet = new Bullet(x, y, cannonDirection, bulletColor);
    bullet.speed *= bulletSpeed;
    bullet.dx = Math.cos(cannonDirection) * bullet.speed;
    bullet.dy = Math.sin(cannonDirection) * bullet.speed;
    bullet.maxRicochets = this.config.bulletRicochets;
    
    this.bullets.push(bullet);
  }
}
