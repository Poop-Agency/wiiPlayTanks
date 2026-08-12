// src/tank.ts
import { Bullet } from "./bullet.js";
import { FRAME_SPEEDS } from "./constants.js";
import { walls, BLOCK_SIZE, getCurrentLevel } from "./level.js";

export class Tank {
  x: number;
  y: number;
  color: string;
  direction: number = 0; // Direction du tank (pour le mouvement et le corps)
  cannonDirection: number = 0; // Direction du canon (pour la visée)
  speed: number = FRAME_SPEEDS.tank.player; // Vitesse du joueur en pixels/frame
  id: string;
  width: number = 32; // Largeur officielle
  height: number = 24; // Hauteur officielle

  constructor(x: number, y: number, color: string, id: string) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.id = id;
  } draw(ctx: CanvasRenderingContext2D) {
    // Dessiner le corps du tank (orienté selon sa direction de mouvement)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.direction);

    // Ombre du tank
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-this.width / 2 + 1, -this.height / 2 + 1, this.width, this.height);

    // Corps principal du tank style Wii Play
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(this.width, this.height) / 2);
    gradient.addColorStop(0, this.color);
    gradient.addColorStop(1, this.darkenColor(this.color, 0.3));
    ctx.fillStyle = gradient;
    ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

    // Bordure du tank
    ctx.strokeStyle = this.darkenColor(this.color, 0.5);
    ctx.lineWidth = 2;
    ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

    // Détail sur le corps (écoutille/tourelle) - plus petit
    ctx.fillStyle = this.darkenColor(this.color, 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Petit détail central
    ctx.fillStyle = this.darkenColor(this.color, 0.6);
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Dessiner le canon séparément (orienté selon cannonDirection)
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.rotate(this.cannonDirection); // Rotation indépendante pour le canon
    // Canon du tank - ajusté aux nouvelles dimensions
    const cannonLength = this.width * 0.8; // Canon plus proportionnel
    const cannonWidth = 4;
    ctx.fillStyle = this.darkenColor(this.color, 0.4);
    ctx.fillRect(-2, -cannonWidth / 2, cannonLength, cannonWidth);
    ctx.strokeStyle = this.darkenColor(this.color, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(-2, -cannonWidth / 2, cannonLength, cannonWidth);

    ctx.restore();
  }

  private darkenColor(color: string, factor: number): string {
    // Convertir les couleurs nommées en hex approximatif
    const colorMap: { [key: string]: string } = {
      '#4CAF50': '#4CAF50', // Vert
      '#F44336': '#F44336', // Rouge
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
  }  // Nouvelles méthodes de mouvement selon les directions cardinales
  moveNorth() {
    const newY = this.y - this.speed;
    if (this.canMoveTo(this.x, newY)) {
      this.y = newY;
      this.direction = -Math.PI / 2; // Nord (vers le haut)
    }
  }

  moveSouth() {
    const newY = this.y + this.speed;
    if (this.canMoveTo(this.x, newY)) {
      this.y = newY;
      this.direction = Math.PI / 2; // Sud (vers le bas)
    }
  }

  moveEast() {
    const newX = this.x + this.speed;
    if (this.canMoveTo(newX, this.y)) {
      this.x = newX;
      this.direction = 0; // Est (vers la droite)
    }
  }

  moveWest() {
    const newX = this.x - this.speed;
    if (this.canMoveTo(newX, this.y)) {
      this.x = newX;
      this.direction = Math.PI; // Ouest (vers la gauche)
    }
  }

  // Anciennes méthodes conservées pour compatibilité
  moveForward() {
    const newX = this.x + Math.cos(this.direction) * this.speed;
    const newY = this.y + Math.sin(this.direction) * this.speed;

    if (this.canMoveTo(newX, newY)) {
      this.x = newX;
      this.y = newY;
    }
  }

  moveBackward() {
    const newX = this.x - Math.cos(this.direction) * this.speed;
    const newY = this.y - Math.sin(this.direction) * this.speed;

    if (this.canMoveTo(newX, newY)) {
      this.x = newX;
      this.y = newY;
    }
  } private canMoveTo(x: number, y: number): boolean {    // Vérifier les limites de l'écran (en utilisant les nouvelles dimensions)
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;

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

  rotateLeft() {
    this.direction -= 0.08; // Rotation un peu plus rapide
  }

  rotateRight() {
    this.direction += 0.08;
  } shoot(): Bullet {
    // Ajustement pour que la balle sorte du bout du canon centré
    return new Bullet(
      this.x + Math.cos(this.cannonDirection) * 20, // Utiliser cannonDirection pour le tir
      this.y + Math.sin(this.cannonDirection) * 20,
      this.cannonDirection, // Direction du tir basée sur le canon
      this.color
    );
  }
  // Méthode pour orienter le canon vers une position (souris)
  aimAt(targetX: number, targetY: number) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.cannonDirection = Math.atan2(dy, dx); // Modifier cannonDirection au lieu de direction
  }
}