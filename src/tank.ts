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
  moveNorth(otherTanks: Tank[] = []) {
    const newY = this.y - this.speed;
    if (this.canMoveTo(this.x, newY, otherTanks)) {
      this.y = newY;
      this.direction = -Math.PI / 2; // Nord (vers le haut)
    } else {
      // Tenter de pousser d'autres tanks
      this.tryPushTanks(this.x, newY, otherTanks);
    }
  }

  moveSouth(otherTanks: Tank[] = []) {
    const newY = this.y + this.speed;
    if (this.canMoveTo(this.x, newY, otherTanks)) {
      this.y = newY;
      this.direction = Math.PI / 2; // Sud (vers le bas)
    } else {
      // Tenter de pousser d'autres tanks
      this.tryPushTanks(this.x, newY, otherTanks);
    }
  }

  moveEast(otherTanks: Tank[] = []) {
    const newX = this.x + this.speed;
    if (this.canMoveTo(newX, this.y, otherTanks)) {
      this.x = newX;
      this.direction = 0; // Est (vers la droite)
    } else {
      // Tenter de pousser d'autres tanks
      this.tryPushTanks(newX, this.y, otherTanks);
    }
  }

  moveWest(otherTanks: Tank[] = []) {
    const newX = this.x - this.speed;
    if (this.canMoveTo(newX, this.y, otherTanks)) {
      this.x = newX;
      this.direction = Math.PI; // Ouest (vers la gauche)
    } else {
      // Tenter de pousser d'autres tanks
      this.tryPushTanks(newX, this.y, otherTanks);
    }
  }

  // Anciennes méthodes conservées pour compatibilité
  moveForward(otherTanks: Tank[] = []) {
    const newX = this.x + Math.cos(this.direction) * this.speed;
    const newY = this.y + Math.sin(this.direction) * this.speed;

    if (this.canMoveTo(newX, newY, otherTanks)) {
      this.x = newX;
      this.y = newY;
    } else {
      // Tenter de pousser d'autres tanks
      this.tryPushTanks(newX, newY, otherTanks);
    }
  }

  moveBackward(otherTanks: Tank[] = []) {
    const newX = this.x - Math.cos(this.direction) * this.speed;
    const newY = this.y - Math.sin(this.direction) * this.speed;

    if (this.canMoveTo(newX, newY, otherTanks)) {
      this.x = newX;
      this.y = newY;
    } else {
      // Tenter de pousser d'autres tanks
      this.tryPushTanks(newX, newY, otherTanks);
    }
  }

  // Méthode pour tenter de pousser d'autres tanks
  private tryPushTanks(newX: number, newY: number, otherTanks: Tank[]) {
    const pushSpeed = this.speed * 0.5; // Vitesse de poussée à 50% de la vitesse normale
    
    for (const otherTank of otherTanks) {
      if (otherTank !== this) {
        const distance = Math.sqrt(
          Math.pow(newX - otherTank.x, 2) + Math.pow(newY - otherTank.y, 2)
        );
        const minDistance = (Math.max(this.width, this.height) + Math.max(otherTank.width, otherTank.height)) / 2;
        
        if (distance < minDistance) {
          // Calculer la direction de poussée
          const pushDirectionX = (otherTank.x - newX) / distance;
          const pushDirectionY = (otherTank.y - newY) / distance;
          
          // Calculer la nouvelle position pour l'autre tank
          const pushedX = otherTank.x + pushDirectionX * pushSpeed;
          const pushedY = otherTank.y + pushDirectionY * pushSpeed;
          
          // Vérifier si l'autre tank peut être poussé
          if (otherTank.canMoveTo(pushedX, pushedY, otherTanks.filter(t => t !== otherTank))) {
            // Pousser l'autre tank
            otherTank.x = pushedX;
            otherTank.y = pushedY;
            
            // Ce tank peut maintenant bouger aussi (légèrement moins pour ne pas se coller)
            const moveScale = 0.8; // Se déplacer à 80% pour éviter le collage
            const finalX = this.x + (newX - this.x) * moveScale;
            const finalY = this.y + (newY - this.y) * moveScale;
            
            if (this.canMoveTo(finalX, finalY, otherTanks)) {
              this.x = finalX;
              this.y = finalY;
            }
            break; // On a réussi à pousser, sortir de la boucle
          }
        }
      }
    }
  }

  private canMoveTo(x: number, y: number, otherTanks: Tank[] = []): boolean {
    // Vérifier les limites de l'écran (en utilisant les nouvelles dimensions)
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

    // Vérifier collision avec les autres tanks
    for (const otherTank of otherTanks) {
      if (otherTank !== this) {
        const distance = Math.sqrt(
          Math.pow(x - otherTank.x, 2) + Math.pow(y - otherTank.y, 2)
        );
        const minDistance = (Math.max(this.width, this.height) + Math.max(otherTank.width, otherTank.height)) / 2;
        
        if (distance < minDistance) {
          return false;
        }
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