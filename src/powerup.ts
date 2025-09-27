// src/powerup.ts
export type PowerUpType = 'speed' | 'fireRate' | 'multiShot' | 'shield' | 'rapidFire';

export interface PowerUpConfig {
  color: string;
  duration: number; // Duration in milliseconds
  symbol: string; // Symbol to display
  description: string;
}

const POWERUP_CONFIGS: Record<PowerUpType, PowerUpConfig> = {
  speed: {
    color: '#00FF00',
    duration: 8000, // 8 seconds
    symbol: '»',
    description: 'Vitesse augmentée'
  },
  fireRate: {
    color: '#FF4500',
    duration: 10000, // 10 seconds  
    symbol: '↯',
    description: 'Cadence de tir augmentée'
  },
  multiShot: {
    color: '#9932CC',
    duration: 12000, // 12 seconds
    symbol: '※',
    description: 'Tir multiple'
  },
  shield: {
    color: '#4169E1',
    duration: 6000, // 6 seconds
    symbol: '⬟',
    description: 'Bouclier temporaire'
  },
  rapidFire: {
    color: '#FF1493',
    duration: 5000, // 5 seconds
    symbol: '⚡',
    description: 'Tir rapide'
  }
};

export class PowerUp {
  x: number;
  y: number;
  type: PowerUpType;
  config: PowerUpConfig;
  radius: number = 16;
  collected: boolean = false;
  glowPhase: number = 0;
  rotationAngle: number = 0;

  constructor(x: number, y: number, type: PowerUpType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.config = POWERUP_CONFIGS[type];
  }

  update(deltaTime: number) {
    if (this.collected) return;

    // Animation de glow et rotation
    this.glowPhase += deltaTime * 0.003; // Vitesse de glow
    this.rotationAngle += deltaTime * 0.002; // Vitesse de rotation

    if (this.glowPhase > Math.PI * 2) {
      this.glowPhase = 0;
    }
    if (this.rotationAngle > Math.PI * 2) {
      this.rotationAngle = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.collected) return;

    ctx.save();

    // Effet de glow
    const glowIntensity = 0.3 + Math.sin(this.glowPhase) * 0.2;
    ctx.shadowColor = this.config.color;
    ctx.shadowBlur = 15 * glowIntensity;

    // Hexagone principal
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotationAngle);

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * this.radius;
      const y = Math.sin(angle) * this.radius;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    // Gradient fill
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    gradient.addColorStop(0, this.config.color);
    gradient.addColorStop(0.7, this.adjustColorAlpha(this.config.color, 0.8));
    gradient.addColorStop(1, this.adjustColorAlpha(this.config.color, 0.3));

    ctx.fillStyle = gradient;
    ctx.fill();

    // Bordure
    ctx.strokeStyle = this.config.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Symbole au centre
    ctx.rotate(-this.rotationAngle); // Annuler la rotation pour le texte
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.config.symbol, 0, 0);

    ctx.restore();
  }

  // Vérifier si un tank collecte le power-up
  isCollectedBy(tankX: number, tankY: number, tankRadius: number = 16): boolean {
    if (this.collected) return false;

    const distance = Math.sqrt(
      Math.pow(tankX - this.x, 2) + Math.pow(tankY - this.y, 2)
    );

    return distance < (this.radius + tankRadius);
  }

  collect(): PowerUpType {
    this.collected = true;
    return this.type;
  }

  private adjustColorAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }
}

// Active power-ups for players
export interface ActivePowerUp {
  type: PowerUpType;
  endTime: number;
  config: PowerUpConfig;
}

export class PowerUpManager {
  private activePowerUps: Map<string, ActivePowerUp[]> = new Map();

  // Activer un power-up pour un joueur
  activatePowerUp(playerId: string, type: PowerUpType) {
    const config = POWERUP_CONFIGS[type];
    const endTime = Date.now() + config.duration;

    if (!this.activePowerUps.has(playerId)) {
      this.activePowerUps.set(playerId, []);
    }

    const playerPowerUps = this.activePowerUps.get(playerId)!;
    
    // Remplacer le power-up du même type s'il existe
    const existingIndex = playerPowerUps.findIndex(p => p.type === type);
    if (existingIndex !== -1) {
      playerPowerUps[existingIndex].endTime = endTime;
    } else {
      playerPowerUps.push({ type, endTime, config });
    }

    console.log(`${playerId} a activé le power-up: ${config.description}`);
  }

  // Vérifier et nettoyer les power-ups expirés
  update() {
    const now = Date.now();
    
    for (const [playerId, powerUps] of this.activePowerUps.entries()) {
      for (let i = powerUps.length - 1; i >= 0; i--) {
        if (powerUps[i].endTime < now) {
          console.log(`Power-up ${powerUps[i].config.description} expiré pour ${playerId}`);
          powerUps.splice(i, 1);
        }
      }
    }
  }

  // Obtenir les power-ups actifs pour un joueur
  getActivePowerUps(playerId: string): ActivePowerUp[] {
    return this.activePowerUps.get(playerId) || [];
  }

  // Vérifier si un joueur a un power-up spécifique
  hasPowerUp(playerId: string, type: PowerUpType): boolean {
    const playerPowerUps = this.activePowerUps.get(playerId) || [];
    return playerPowerUps.some(p => p.type === type && p.endTime > Date.now());
  }

  // Obtenir le multiplicateur de vitesse
  getSpeedMultiplier(playerId: string): number {
    return this.hasPowerUp(playerId, 'speed') ? 1.5 : 1.0;
  }

  // Obtenir le multiplicateur de cadence de tir
  getFireRateMultiplier(playerId: string): number {
    let multiplier = 1.0;
    if (this.hasPowerUp(playerId, 'fireRate')) multiplier *= 0.6; // Tir plus rapide
    if (this.hasPowerUp(playerId, 'rapidFire')) multiplier *= 0.4; // Tir très rapide
    return multiplier;
  }

  // Vérifier si le joueur a le tir multiple
  hasMultiShot(playerId: string): boolean {
    return this.hasPowerUp(playerId, 'multiShot');
  }

  // Vérifier si le joueur a un bouclier
  hasShield(playerId: string): boolean {
    return this.hasPowerUp(playerId, 'shield');
  }

  // Dessiner les indicateurs de power-ups actifs
  drawActivePowerUps(ctx: CanvasRenderingContext2D, playerId: string, x: number, y: number) {
    const activePowerUps = this.getActivePowerUps(playerId);
    
    activePowerUps.forEach((powerUp, index) => {
      const posX = x + index * 30;
      const remaining = Math.max(0, powerUp.endTime - Date.now());
      const progress = remaining / powerUp.config.duration;

      // Cercle de progression
      ctx.save();
      ctx.strokeStyle = powerUp.config.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(posX, y, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * progress));
      ctx.stroke();

      // Symbole au centre
      ctx.fillStyle = powerUp.config.color;
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(powerUp.config.symbol, posX, y);
      
      ctx.restore();
    });
  }
}

// Instance globale du gestionnaire de power-ups
export const powerUpManager = new PowerUpManager();