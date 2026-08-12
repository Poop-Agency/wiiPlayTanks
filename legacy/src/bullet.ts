// src/bullet.ts
import { FRAME_SPEEDS } from "./constants.js";

export class Bullet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: string;
  speed: number = FRAME_SPEEDS.bullet.normal; // Vitesse normale par défaut
  radius: number = 3; // 6px de diamètre = 3px de rayon
  direction: number;
  trail: { x: number; y: number }[] = [];
  hasRebounded: boolean = false; // Nouvelle propriété pour tracker le rebond
  maxRicochets: number = 1; // Nombre maximum de ricochets autorisés
  ricochetsUsed: number = 0; // Nombre de ricochets déjà utilisés

  constructor(x: number, y: number, direction: number, color: string) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.dx = Math.cos(direction) * this.speed;
    this.dy = Math.sin(direction) * this.speed;
    this.color = color;
  }

  update() {
    // Ajouter la position actuelle au trail
    this.trail.push({ x: this.x, y: this.y });
    
    // Limiter la taille du trail
    if (this.trail.length > 8) {
      this.trail.shift();
    }
    
    this.x += this.dx;
    this.y += this.dy;
  }

  draw(ctx: CanvasRenderingContext2D) {
    // Dessiner le trail (traînée)
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const alpha = (i + 1) / this.trail.length * 0.5;
      const size = (i + 1) / this.trail.length * this.radius * 0.7;
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.trail[i].x, this.trail[i].y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    
    // Dessiner la bullet principale
    ctx.save();
    
    // Ombre de la bullet
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(this.x + 1, this.y + 1, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Corps principal de la bullet
    const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
    gradient.addColorStop(0, '#FFFF00'); // Jaune clair au centre
    gradient.addColorStop(0.7, this.color); // Couleur du tank
    gradient.addColorStop(1, this.darkenColor(this.color, 0.3)); // Plus sombre sur les bords
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    
    // Bordure de la bullet
    ctx.strokeStyle = this.darkenColor(this.color, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.restore();
  }

  private darkenColor(color: string, factor: number): string {
    // Même logique que dans tank.ts
    const colorMap: { [key: string]: string } = {
      '#4CAF50': '#4CAF50',
      '#F44336': '#F44336',
      'blue': '#2196F3',
      'red': '#F44336',
      'green': '#4CAF50'
    };
    
    const hexColor = colorMap[color] || color;
    
    if (hexColor.startsWith('#')) {
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      
      const newR = Math.floor(r * (1 - factor));
      const newG = Math.floor(g * (1 - factor));
      const newB = Math.floor(b * (1 - factor));
      
      return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    return color;
  }  checkCollisionAndRebound(walls: { x: number; y: number; w: number; h: number }[]): boolean {
    // Vérifier collision avec les murs
    for (const wall of walls) {
      if (
        this.x + this.radius > wall.x &&
        this.x - this.radius < wall.x + wall.w &&
        this.y + this.radius > wall.y &&
        this.y - this.radius < wall.y + wall.h
      ) {
        console.log(`Balle collision: ricochetsUsed=${this.ricochetsUsed}, maxRicochets=${this.maxRicochets}`);
        
        // Si on a déjà utilisé tous les ricochets autorisés, détruire la balle
        if (this.ricochetsUsed >= this.maxRicochets) {
          console.log(`Balle détruite après ${this.ricochetsUsed} ricochets`);
          return true; // Détruire la balle
        }

        // Sinon, effectuer le rebond
        // Calculer de quel côté du mur la balle frappe
        const overlapLeft = (this.x + this.radius) - wall.x;
        const overlapRight = (wall.x + wall.w) - (this.x - this.radius);
        const overlapTop = (this.y + this.radius) - wall.y;
        const overlapBottom = (wall.y + wall.h) - (this.y - this.radius);

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        // Rebondir selon le côté touché
        if (minOverlap === overlapLeft || minOverlap === overlapRight) {
          // Collision horizontale - inverser dx
          this.dx = -this.dx;
        } else {
          // Collision verticale - inverser dy
          this.dy = -this.dy;
        }

        // Ajuster la position pour éviter de rester dans le mur
        if (minOverlap === overlapLeft) {
          this.x = wall.x - this.radius - 1; // -1 pour éviter le collage
        } else if (minOverlap === overlapRight) {
          this.x = wall.x + wall.w + this.radius + 1; // +1 pour éviter le collage
        } else if (minOverlap === overlapTop) {
          this.y = wall.y - this.radius - 1;
        } else if (minOverlap === overlapBottom) {
          this.y = wall.y + wall.h + this.radius + 1;
        }

        this.ricochetsUsed++;
        this.hasRebounded = true; // Garder pour compatibilité
        console.log(`Balle rebondit (${this.ricochetsUsed}/${this.maxRicochets})`);
        return false; // Ne pas détruire, juste rebondir
      }
    }
    return false;
  }

  // Garder l'ancienne méthode pour compatibilité
  checkCollision(walls: { x: number; y: number; w: number; h: number }[]): boolean {
    return this.checkCollisionAndRebound(walls);
  }
}
