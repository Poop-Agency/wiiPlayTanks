// src/mine.ts
export class Mine {
  x: number;
  y: number;
  color: string;
  radius: number = 8; // Rayon d'explosion visuel
  explosionRadius: number = 64; // Rayon de dégâts
  armed: boolean = false; // La mine s'arme après un court délai
  armingTime: number = 1000; // 1 seconde pour s'armer
  createdAt: number;
  blinkInterval: number = 300; // Intervalle de clignotement en ms
  lastBlink: number = 0;
  visible: boolean = true;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.createdAt = Date.now();
  }

  update() {
    const now = Date.now();
    
    // Armer la mine après le délai
    if (!this.armed && now - this.createdAt > this.armingTime) {
      this.armed = true;
    }

    // Faire clignoter la mine quand elle est armée
    if (this.armed && now - this.lastBlink > this.blinkInterval) {
      this.visible = !this.visible;
      this.lastBlink = now;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.visible && this.armed) return; // Ne pas dessiner si invisible

    ctx.save();
    
    // Mine non armée: couleur atténuée
    if (!this.armed) {
      ctx.globalAlpha = 0.5;
    }

    // Corps de la mine
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();
    
    // Bordure
    ctx.strokeStyle = this.darkenColor(this.color, 0.4);
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Centre de la mine
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = this.darkenColor(this.color, 0.6);
    ctx.fill();

    ctx.restore();
  }

  // Vérifier si un objet déclenche la mine
  isTriggeredBy(x: number, y: number, objectRadius: number = 16): boolean {
    if (!this.armed) return false;
    
    const distance = Math.sqrt(
      Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2)
    );
    
    return distance < (this.radius + objectRadius);
  }

  // Vérifier si un objet est dans le rayon d'explosion
  isInExplosionRange(x: number, y: number): boolean {
    const distance = Math.sqrt(
      Math.pow(x - this.x, 2) + Math.pow(y - this.y, 2)
    );
    
    return distance < this.explosionRadius;
  }

  private darkenColor(color: string, factor: number): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      
      const newR = Math.floor(r * (1 - factor));
      const newG = Math.floor(g * (1 - factor));
      const newB = Math.floor(b * (1 - factor));
      
      return `rgb(${newR}, ${newG}, ${newB})`;
    }
    
    return color;
  }
}