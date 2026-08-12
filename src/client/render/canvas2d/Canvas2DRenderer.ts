/**
 * Rendu Canvas 2D, vue du dessus.
 *
 * Le terrain est dessiné une fois dans un canevas hors écran puis recopié à
 * chaque frame : il ne change qu'à la destruction d'un bloc (#9), alors que le
 * reste est redessiné 60 à 240 fois par seconde.
 */

import { TileKind } from '@core/state';
import type { Grid } from '@core/state';
import { TILE_SIZE_PX, TUNING } from '@core/tuning';
import { tileAt } from '@core/grid';
import { BLOCKS, BOARD, TANK_COLORS, darken, lighten } from '../palette';
import type { Renderer } from '../Renderer';
import type { RenderSnapshot, TankView } from '../snapshots';

/** Décalage vertical des faces de blocs, qui simule leur épaisseur. */
const BLOCK_RELIEF_PX = 5;

export class Canvas2DRenderer implements Renderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;

  /** Cache du terrain. Reconstruit seulement quand la grille change. */
  #terrain: HTMLCanvasElement | null = null;
  #terrainStale = true;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexte 2D indisponible');

    this.#canvas = canvas;
    this.#ctx = ctx;
  }

  resize(grid: Grid): void {
    this.#canvas.width = grid.width * TILE_SIZE_PX;
    this.#canvas.height = grid.height * TILE_SIZE_PX;
    this.#terrainStale = true;
  }

  invalidateTerrain(): void {
    this.#terrainStale = true;
  }

  pointerToWorld(clientX: number, clientY: number): { x: number; y: number } {
    // Le canevas est mis à l'échelle par CSS pour tenir dans la fenêtre : on
    // repasse donc par le rapport entre sa taille affichée et sa résolution
    // interne, sans quoi la visée dériverait dès que la fenêtre est petite.
    const bounds = this.#canvas.getBoundingClientRect();
    const scaleX = this.#canvas.width / bounds.width;
    const scaleY = this.#canvas.height / bounds.height;

    return {
      x: ((clientX - bounds.left) * scaleX) / TILE_SIZE_PX,
      y: ((clientY - bounds.top) * scaleY) / TILE_SIZE_PX,
    };
  }

  draw(grid: Grid, view: RenderSnapshot): void {
    if (this.#terrainStale) this.#buildTerrain(grid);
    if (this.#terrain) this.#ctx.drawImage(this.#terrain, 0, 0);

    for (const tank of view.tanks) {
      if (tank.alive) this.#drawTank(tank);
    }
  }

  /* ── Terrain ─────────────────────────────────────────────────────────── */

  #buildTerrain(grid: Grid): void {
    const canvas = document.createElement('canvas');
    canvas.width = this.#canvas.width;
    canvas.height = this.#canvas.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    this.#drawFloor(ctx, grid);

    // Les ombres d'abord, en une passe séparée : dessinées bloc par bloc, elles
    // se projetteraient par-dessus les blocs voisins déjà peints.
    for (let tileY = 0; tileY < grid.height; tileY++) {
      for (let tileX = 0; tileX < grid.width; tileX++) {
        const kind = tileAt(grid, tileX, tileY);
        if (kind === TileKind.Indestructible || kind === TileKind.Destructible) {
          ctx.fillStyle = BOARD.shadow;
          ctx.fillRect(
            tileX * TILE_SIZE_PX + 3,
            tileY * TILE_SIZE_PX + 4,
            TILE_SIZE_PX,
            TILE_SIZE_PX,
          );
        }
      }
    }

    for (let tileY = 0; tileY < grid.height; tileY++) {
      for (let tileX = 0; tileX < grid.width; tileX++) {
        this.#drawTile(ctx, tileAt(grid, tileX, tileY), tileX, tileY);
      }
    }

    this.#terrain = canvas;
    this.#terrainStale = false;
  }

  #drawFloor(ctx: CanvasRenderingContext2D, grid: Grid): void {
    ctx.fillStyle = BOARD.floor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    // Damier très peu contrasté : il donne l'échelle de la grille sans devenir
    // le motif dominant de l'image.
    ctx.fillStyle = BOARD.floorAlternate;
    for (let tileY = 0; tileY < grid.height; tileY++) {
      for (let tileX = (tileY % 2); tileX < grid.width; tileX += 2) {
        ctx.fillRect(tileX * TILE_SIZE_PX, tileY * TILE_SIZE_PX, TILE_SIZE_PX, TILE_SIZE_PX);
      }
    }
  }

  #drawTile(ctx: CanvasRenderingContext2D, kind: TileKind, tileX: number, tileY: number): void {
    if (kind === TileKind.Empty) return;

    const px = tileX * TILE_SIZE_PX;
    const py = tileY * TILE_SIZE_PX;

    if (kind === TileKind.Hole) {
      ctx.fillStyle = BLOCKS.holeRim;
      ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);
      ctx.fillStyle = BLOCKS.holeFloor;
      ctx.fillRect(px + 2, py + 2, TILE_SIZE_PX - 4, TILE_SIZE_PX - 4);
      return;
    }

    const isDestructible = kind === TileKind.Destructible;
    const face = isDestructible ? BLOCKS.destructibleFace : BLOCKS.indestructibleFace;
    const top = isDestructible ? BLOCKS.destructibleTop : BLOCKS.indestructibleTop;
    const edge = isDestructible ? BLOCKS.destructibleEdge : BLOCKS.indestructibleEdge;

    // Flanc, puis dessus décalé vers le haut : le bloc paraît avoir une
    // épaisseur, comme les blocs de liège posés sur le plateau de l'original.
    ctx.fillStyle = face;
    ctx.fillRect(px, py, TILE_SIZE_PX, TILE_SIZE_PX);

    ctx.fillStyle = top;
    ctx.fillRect(px, py - BLOCK_RELIEF_PX, TILE_SIZE_PX, TILE_SIZE_PX - BLOCK_RELIEF_PX);

    ctx.strokeStyle = edge;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py - BLOCK_RELIEF_PX + 0.5, TILE_SIZE_PX - 1, TILE_SIZE_PX - 1);

    // Les blocs cassables portent un grain visible : le joueur doit pouvoir
    // décider d'un coup d'oeil où poser une mine.
    if (isDestructible) {
      ctx.fillStyle = 'rgba(80, 45, 15, 0.22)';
      for (let i = 0; i < 5; i++) {
        const dotX = px + 5 + ((i * 11) % (TILE_SIZE_PX - 10));
        const dotY = py - BLOCK_RELIEF_PX + 6 + ((i * 7) % (TILE_SIZE_PX - 14));
        ctx.fillRect(dotX, dotY, 3, 3);
      }
    }
  }

  /* ── Tanks ───────────────────────────────────────────────────────────── */

  #drawTank(tank: TankView): void {
    const ctx = this.#ctx;
    const size = TUNING.tank.sizeTiles * TILE_SIZE_PX;
    const half = size / 2;
    const centerX = tank.x * TILE_SIZE_PX;
    const centerY = tank.y * TILE_SIZE_PX;
    const color = TANK_COLORS[tank.color];

    ctx.save();
    ctx.translate(centerX, centerY);

    // Ombre au sol, non tournée : elle appartient au plateau, pas au tank.
    ctx.fillStyle = BOARD.shadow;
    ctx.beginPath();
    ctx.ellipse(2, 4, half * 0.95, half * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Châssis, orienté selon la direction de déplacement ──
    //
    // La caisse est dessinée plus longue que large — un tank se lit à sa
    // silhouette. La hitbox, elle, reste le carré défini par `sizeTiles` :
    // seule l'apparence est allongée, et c'est ce qui rend les passages étroits
    // prévisibles quelle que soit l'orientation.
    ctx.save();
    ctx.rotate(tank.bodyAngle);

    const bodyWidth = size * 0.62;
    const halfBody = bodyWidth / 2;
    const treadWidth = 4;

    // Chenilles de part et d'autre de la caisse, avec leurs maillons.
    ctx.fillStyle = darken(color, 0.6);
    ctx.fillRect(-half, -halfBody - treadWidth, size, treadWidth);
    ctx.fillRect(-half, halfBody, size, treadWidth);

    ctx.fillStyle = darken(color, 0.75);
    for (let offset = 2; offset < size - 1; offset += 4) {
      ctx.fillRect(-half + offset, -halfBody - treadWidth, 2, treadWidth);
      ctx.fillRect(-half + offset, halfBody, 2, treadWidth);
    }

    ctx.fillStyle = color;
    ctx.fillRect(-half, -halfBody, size, bodyWidth);

    // Reflet sur le flanc supérieur : suggère le volume sans ombrage coûteux.
    ctx.fillStyle = lighten(color, 0.25);
    ctx.fillRect(-half, -halfBody, size, 3);

    ctx.strokeStyle = darken(color, 0.5);
    ctx.lineWidth = 1;
    ctx.strokeRect(-half + 0.5, -halfBody + 0.5, size - 1, bodyWidth - 1);
    ctx.restore();

    // ── Tourelle, orientée indépendamment vers la visée ──
    ctx.save();
    ctx.rotate(tank.turretAngle);

    ctx.fillStyle = darken(color, 0.3);
    ctx.fillRect(half * 0.35, -2.5, half * 1.15, 5);
    ctx.strokeStyle = darken(color, 0.55);
    ctx.strokeRect(half * 0.35 + 0.5, -2, half * 1.15 - 1, 4);

    ctx.fillStyle = lighten(color, 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, half * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = darken(color, 0.5);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
