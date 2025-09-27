// src/effects.ts
// Enhanced visual effects system

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
  fadeRate: number;
}

export class ParticleSystem {
  particles: Particle[] = [];

  update(deltaTime: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      // Mettre à jour la position
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      
      // Appliquer la gravité
      particle.vy += particle.gravity * deltaTime;
      
      // Diminuer la vie
      particle.life -= deltaTime;
      
      // Supprimer les particules mortes
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    
    for (const particle of this.particles) {
      const alpha = particle.life / particle.maxLife;
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  // Créer une explosion de particules
  createExplosion(x: number, y: number, color: string, particleCount: number = 12) {
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      const life = 800 + Math.random() * 400;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: 3 + Math.random() * 4,
        gravity: 0.008,
        fadeRate: 1
      });
    }
  }

  // Créer des étincelles de ricochet
  createSparks(x: number, y: number, direction: number) {
    const sparkCount = 6;
    for (let i = 0; i < sparkCount; i++) {
      const angle = direction + (Math.random() - 0.5) * Math.PI * 0.5;
      const speed = 3 + Math.random() * 2;
      const life = 300 + Math.random() * 200;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color: '#FFD700',
        size: 2,
        gravity: 0.01,
        fadeRate: 1
      });
    }
  }

  // Créer des débris de mur détruit
  createDebris(x: number, y: number, wallColor: string = '#8B4513') {
    const debrisCount = 8;
    for (let i = 0; i < debrisCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      const life = 1000 + Math.random() * 500;
      
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color: wallColor,
        size: 2 + Math.random() * 3,
        gravity: 0.006,
        fadeRate: 1
      });
    }
  }

  // Créer effet de fumée
  createSmoke(x: number, y: number) {
    const smokeCount = 5;
    for (let i = 0; i < smokeCount; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
      const speed = 0.5 + Math.random() * 1;
      const life = 2000 + Math.random() * 1000;
      
      this.particles.push({
        x: x + (Math.random() - 0.5) * 15,
        y: y + (Math.random() - 0.5) * 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color: '#666666',
        size: 8 + Math.random() * 6,
        gravity: -0.002, // Fumée monte
        fadeRate: 1
      });
    }
  }
}

// Animation d'explosion des tanks
export class ExplosionAnimation {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
  rings: { radius: number; alpha: number }[] = [];

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    this.radius = 0;
    this.maxRadius = 60;
    this.color = color;
    this.life = 800; // 800ms
    this.maxLife = 800;

    // Créer plusieurs anneaux d'explosion
    for (let i = 0; i < 3; i++) {
      this.rings.push({
        radius: 0,
        alpha: 1
      });
    }
  }

  update(deltaTime: number): boolean {
    this.life -= deltaTime;
    
    if (this.life <= 0) {
      return false; // Animation terminée
    }

    const progress = 1 - (this.life / this.maxLife);
    this.radius = this.maxRadius * progress;

    // Mettre à jour les anneaux
    this.rings.forEach((ring, index) => {
      const delay = index * 150; // Délai entre les anneaux
      const ringProgress = Math.max(0, (this.maxLife - this.life - delay) / (this.maxLife - delay));
      
      ring.radius = this.maxRadius * ringProgress * (1 + index * 0.3);
      ring.alpha = Math.max(0, 1 - ringProgress * 2);
    });

    return true; // Animation continue
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Dessiner les anneaux
    this.rings.forEach((ring) => {
      if (ring.alpha > 0 && ring.radius > 0) {
        ctx.globalAlpha = ring.alpha * 0.6;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 4;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Flash central
    const flashAlpha = this.life / this.maxLife;
    if (flashAlpha > 0.5) {
      ctx.globalAlpha = (flashAlpha - 0.5) * 2;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// Gestionnaire global des effets
export class EffectsManager {
  particleSystem: ParticleSystem = new ParticleSystem();
  explosions: ExplosionAnimation[] = [];

  update(deltaTime: number) {
    this.particleSystem.update(deltaTime);

    // Mettre à jour les explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      if (!this.explosions[i].update(deltaTime)) {
        this.explosions.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Dessiner les explosions en premier (arrière-plan)
    this.explosions.forEach(explosion => explosion.draw(ctx));
    
    // Puis les particules (premier plan)
    this.particleSystem.draw(ctx);
  }

  // Créer une explosion complète (animation + particules + fumée)
  createTankExplosion(x: number, y: number, tankColor: string) {
    // Animation d'explosion
    this.explosions.push(new ExplosionAnimation(x, y, tankColor));
    
    // Particules d'explosion
    this.particleSystem.createExplosion(x, y, tankColor, 15);
    
    // Fumée
    this.particleSystem.createSmoke(x, y);
    
    // Particules de feu/étincelles
    this.particleSystem.createExplosion(x, y, '#FF4500', 8);
  }

  // Effet de ricochet de balle
  createRicochetEffect(x: number, y: number, direction: number) {
    this.particleSystem.createSparks(x, y, direction);
  }

  // Effet de destruction de mur
  createWallDestructionEffect(x: number, y: number, width: number, height: number) {
    // Créer des débris aux 4 coins et au centre
    const positions = [
      { x: x, y: y },
      { x: x + width, y: y },
      { x: x, y: y + height },
      { x: x + width, y: y + height },
      { x: x + width/2, y: y + height/2 }
    ];

    positions.forEach(pos => {
      this.particleSystem.createDebris(pos.x, pos.y);
    });
  }

  // Effet de collecte de power-up
  createPowerUpEffect(x: number, y: number, color: string) {
    // Particules qui montent en spirale
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const life = 1000 + Math.random() * 500;
      
      this.particleSystem.particles.push({
        x,
        y,
        vx: Math.cos(angle) * 1.5,
        vy: Math.sin(angle) * 1.5 - 2, // Mouvement vers le haut
        life,
        maxLife: life,
        color,
        size: 4,
        gravity: -0.003, // Anti-gravité
        fadeRate: 1
      });
    }
  }

  // Nettoyer tous les effets
  clear() {
    this.particleSystem.particles.length = 0;
    this.explosions.length = 0;
  }
}

// Instance globale du gestionnaire d'effets
export const effectsManager = new EffectsManager();