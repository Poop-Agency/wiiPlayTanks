/**
 * Rendu Canvas 2D, vue du dessus.
 *
 * Le terrain est dessiné une fois dans un canevas hors écran puis recopié à
 * chaque frame : il ne change qu'à la destruction d'un bloc (#9), alors que le
 * reste est redessiné 60 à 240 fois par seconde.
 */

import { TileKind, isPlayerColor } from '@core/state';
import type { Grid, World } from '@core/state';
import { TILE_SIZE_PX, TUNING } from '@core/tuning';
import { tileAt } from '@core/grid';
import { BLAST, BLOCKS, BOARD, SHELL, TANK_COLORS, darken, lighten } from '../palette';
import type { DebugOptions } from '../../ui/tuning-panel';
import { NO_EFFECTS } from '../effects';
import type { EffectsView, Particle, Shockwave, TrackMark } from '../effects';
import { drawDebugOverlay } from './debug-overlay';
import type { Renderer } from '../Renderer';
import type {
  ExplosionView,
  MineView,
  RenderSnapshot,
  ShellView,
  TankView,
} from '../snapshots';

/** Décalage vertical des faces de blocs, qui simule leur épaisseur. */
const BLOCK_RELIEF_PX = 5;

/**
 * Bandes réservées au-dessus et au-dessous du plateau, en pixels.
 *
 * Le HUD et le bandeau de diagnostic ont leur propre place plutôt que d'être
 * peints par-dessus le jeu : superposés, ils masquaient le mur d'enceinte
 * supérieur et l'arène semblait ouverte en haut.
 *
 * Elles sont réservées en permanence, y compris sur le terrain d'essai qui n'a
 * pas de HUD : une hauteur de canevas qui dépend de ce qu'on affiche dessus
 * ferait sauter le plateau d'une taille à l'autre.
 */
export const BOARD_TOP_BAND_PX = 38;
export const BOARD_BOTTOM_BAND_PX = 46;

export class Canvas2DRenderer implements Renderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;

  /** Cache du terrain. Reconstruit seulement quand la grille change. */
  #terrain: HTMLCanvasElement | null = null;
  #terrainStale = true;
  #terrainVersion = -1;

  /**
   * Grille effectivement dessinée dans le cache.
   *
   * Le numéro de version seul ne suffit pas : deux grilles **différentes**
   * peuvent porter le même numéro. C'est le cas de deux missions consécutives,
   * qui commencent toutes deux à zéro — le terrain de la précédente resterait
   * affiché jusqu'à la première destruction de bloc. La comparaison
   * d'identité ferme ce trou une fois pour toutes, plutôt que d'obliger chaque
   * appelant à penser à signaler le changement.
   */
  #terrainGrid: Grid | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Contexte 2D indisponible');

    this.#canvas = canvas;
    this.#ctx = ctx;
  }

  resize(grid: Grid): void {
    this.#canvas.width = grid.width * TILE_SIZE_PX;
    this.#canvas.height = grid.height * TILE_SIZE_PX + BOARD_TOP_BAND_PX + BOARD_BOTTOM_BAND_PX;
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
      // Le plateau commence sous la bande du HUD : sans ce retrait, la visée
      // serait décalée d'une tuile vers le haut sur toute la hauteur.
      y: ((clientY - bounds.top) * scaleY - BOARD_TOP_BAND_PX) / TILE_SIZE_PX,
    };
  }

  draw(grid: Grid, view: RenderSnapshot, effects: EffectsView = NO_EFFECTS): void {
    // Le cache se reconstruit sur changement de version plutôt que sur appel
    // explicite : personne ne peut oublier de signaler une destruction de bloc.
    if (this.#terrainStale || grid !== this.#terrainGrid || grid.version !== this.#terrainVersion) {
      this.#buildTerrain(grid);
    }

    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);

    // Une seule translation pour tout le plateau : chaque primitive continue de
    // raisonner en coordonnées monde, sans jamais avoir à connaître la bande.
    this.#ctx.save();
    this.#ctx.translate(0, BOARD_TOP_BAND_PX);

    if (this.#terrain) this.#ctx.drawImage(this.#terrain, 0, 0);

    // Les traces de chenilles font partie du sol : sous tout le reste, y compris
    // sous les épaves.
    this.#drawTracks(effects.tracks);

    // Les mines au sol : un tank posé dessus doit rester visible.
    for (const mine of view.mines) {
      this.#drawMine(mine);
    }

    // Les épaves avant les vivants : un tank détruit ne doit pas masquer celui
    // qui passe dessus.
    for (const tank of view.tanks) {
      if (!tank.alive) this.#drawWreck(tank);
    }

    for (const tank of view.tanks) {
      if (tank.alive && tank.visible) this.#drawTank(tank);
    }

    // Les obus par-dessus les tanks : c'est ce qu'on doit suivre des yeux.
    for (const shell of view.shells) {
      this.#drawShell(shell);
    }

    // Et les explosions au-dessus de tout.
    for (const explosion of view.explosions) {
      this.#drawExplosion(explosion);
    }

    this.#drawParticles(effects);

    this.#ctx.restore();
  }

  /**
   * Superpose les calques de débogage.
   *
   * Méthode distincte de `draw`, et prenant le `World` et non un instantané :
   * ces calques servent à vérifier ce que la simulation fait réellement, donc
   * ils lisent la source. La transformation du plateau est réappliquée ici,
   * puisqu'elle appartient au renderer.
   */
  drawDebug(world: World, options: Readonly<DebugOptions>): void {
    if (!options.hitboxes && !options.trajectories && !options.blastRadii) return;

    this.#ctx.save();
    this.#ctx.translate(0, BOARD_TOP_BAND_PX);
    drawDebugOverlay(this.#ctx, world, options);
    this.#ctx.restore();
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
    this.#terrainVersion = grid.version;
    this.#terrainGrid = grid;
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

  /* ── Effets décoratifs ───────────────────────────────────────────────── */

  /** Traces de chenilles, dessinées à même le sol. */
  #drawTracks(tracks: readonly TrackMark[]): void {
    const ctx = this.#ctx;
    const size = TUNING.tank.sizeTiles * TILE_SIZE_PX;
    const half = size / 2;
    const spacing = size * 0.31;

    ctx.fillStyle = BOARD.trackMark;

    for (const track of tracks) {
      // Sauvegarde par marque plutôt qu'une remise à zéro de la transformation :
      // celle du plateau appartient à `draw`, et la recomposer ici la
      // dupliquerait — donc la ferait diverger le jour où elle change.
      ctx.save();

      // L'opacité maximale reste faible : ce sont des marques au sol, pas des
      // traits de peinture, et elles s'accumulent par centaines.
      ctx.globalAlpha = track.life * 0.22;
      ctx.translate(track.x * TILE_SIZE_PX, track.y * TILE_SIZE_PX);
      ctx.rotate(track.angle);
      ctx.fillRect(-half * 0.5, -spacing - 2, half, 3);
      ctx.fillRect(-half * 0.5, spacing - 1, half, 3);

      ctx.restore();
    }
  }

  /** Débris, étincelles et ondes de choc, au-dessus de la mêlée. */
  #drawParticles({ particles, shockwaves }: EffectsView): void {
    const ctx = this.#ctx;

    ctx.save();
    for (const wave of shockwaves) this.#drawShockwave(wave);
    for (const particle of particles) this.#drawParticle(particle);
    ctx.restore();
  }

  #drawParticle(particle: Particle): void {
    const ctx = this.#ctx;

    ctx.globalAlpha = Math.min(1, particle.life / particle.span);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(
      particle.x * TILE_SIZE_PX,
      particle.y * TILE_SIZE_PX,
      particle.size,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  #drawShockwave(wave: Shockwave): void {
    const ctx = this.#ctx;
    const progress = 1 - wave.life / wave.span;

    // L'anneau s'élargit en s'effaçant : c'est ce qui donne l'impression du
    // souffle, plutôt qu'un cercle qui grossit à opacité constante.
    ctx.globalAlpha = (1 - progress) * 0.55;
    ctx.strokeStyle = BLAST.fireCore;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      wave.x * TILE_SIZE_PX,
      wave.y * TILE_SIZE_PX,
      wave.radius * TILE_SIZE_PX * progress,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * Épave d'un tank détruit.
   *
   * Écrasée et noircie, comme dans l'original où le tank touché s'aplatit au
   * sol plutôt que de disparaître. C'est la trace de ce qui s'est passé, et elle
   * dit au joueur où le coup est parti.
   */
  #drawWreck(tank: TankView): void {
    const ctx = this.#ctx;
    const size = TUNING.tank.sizeTiles * TILE_SIZE_PX;
    const half = size / 2;

    ctx.save();
    ctx.translate(tank.x * TILE_SIZE_PX, tank.y * TILE_SIZE_PX);
    ctx.rotate(tank.bodyAngle);
    ctx.scale(1, 0.45);

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = darken(TANK_COLORS[tank.color], 0.62);
    ctx.fillRect(-half, -half * 0.62, size, size * 0.62);

    ctx.strokeStyle = darken(TANK_COLORS[tank.color], 0.8);
    ctx.lineWidth = 1;
    ctx.strokeRect(-half + 0.5, -half * 0.62 + 0.5, size - 1, size * 0.62 - 1);
    ctx.restore();

    this.#drawWreckCross(tank);
  }

  /**
   * Croix posée sur une épave.
   *
   * Blanche pour un tank d'IA : savoir lequel des neuf est tombé n'apprend
   * rien, seul compte qu'il ne tire plus. À la couleur du siège pour un
   * joueur — en co-op c'est ce qui dit **qui** vient de tomber, et donc qui
   * n'est plus là pour couvrir.
   *
   * Dessinée hors de la transformation de l'épave, qui l'écraserait et la
   * ferait tourner avec le châssis : cette croix est une marque à lire, pas
   * un morceau de la carcasse.
   */
  #drawWreckCross(tank: TankView): void {
    const ctx = this.#ctx;
    const reach = (TUNING.tank.sizeTiles * TILE_SIZE_PX) / 2 - 2;

    ctx.save();
    ctx.translate(tank.x * TILE_SIZE_PX, tank.y * TILE_SIZE_PX);

    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-reach, -reach);
    ctx.lineTo(reach, reach);
    ctx.moveTo(reach, -reach);
    ctx.lineTo(-reach, reach);

    // Liseré sombre d'abord : une croix blanche se perdrait sur le plateau
    // clair, et une croix de couleur sur la carcasse noircie de sa propre
    // teinte. Ce contour la détache des deux.
    ctx.strokeStyle = 'rgba(25, 16, 8, 0.55)';
    ctx.lineWidth = 4.5;
    ctx.stroke();

    ctx.strokeStyle = isPlayerColor(tank.color) ? TANK_COLORS[tank.color] : '#f4f1ea';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.restore();
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

  /* ── Obus ────────────────────────────────────────────────────────────── */

  #drawShell(shell: ShellView): void {
    const ctx = this.#ctx;
    const radius = TUNING.shell.radiusTiles * TILE_SIZE_PX;
    const x = shell.x * TILE_SIZE_PX;
    const y = shell.y * TILE_SIZE_PX;

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = BOARD.shadow;
    ctx.beginPath();
    ctx.arc(1.5, 2.5, radius, 0, Math.PI * 2);
    ctx.fill();

    if (shell.kind === 'fast') {
      // Le missile est allongé dans son axe : à deux fois la vitesse d'un obus
      // normal, sa forme doit trahir sa nature avant qu'il n'arrive.
      ctx.rotate(shell.heading);
      ctx.fillStyle = SHELL.fastBody;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 2.1, radius, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SHELL.fastTip;
      ctx.beginPath();
      ctx.arc(radius * 1.1, 0, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = SHELL.normalBody;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SHELL.normalHighlight;
      ctx.beginPath();
      ctx.arc(-radius * 0.35, -radius * 0.35, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /* ── Mines et explosions ─────────────────────────────────────────────── */

  #drawMine(mine: MineView): void {
    const ctx = this.#ctx;
    const radius = TUNING.mine.radiusTiles * TILE_SIZE_PX;

    ctx.save();
    ctx.translate(mine.x * TILE_SIZE_PX, mine.y * TILE_SIZE_PX);

    ctx.fillStyle = BOARD.shadow;
    ctx.beginPath();
    ctx.ellipse(1, 2, radius, radius * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = BLAST.mineBody;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = BLAST.mineRim;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Voyant : c'est le seul indice donné au joueur pour juger s'il a encore le
    // temps de passer. Il ne clignote que plus vite, jamais différemment.
    if (mine.blinkOn) {
      ctx.fillStyle = mine.urgency > 0.6 ? BLAST.mineLightUrgent : BLAST.mineLightIdle;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  #drawExplosion(explosion: ExplosionView): void {
    const ctx = this.#ctx;

    // La boule croît vite puis s'estompe : une racine carrée donne cette
    // détente franche au début, sans le côté mou d'une progression linéaire.
    const growth = Math.sqrt(Math.min(1, explosion.progress * 1.6));
    const radius = explosion.radius * TILE_SIZE_PX * (0.45 + 0.55 * growth);
    const fade = 1 - explosion.progress;

    ctx.save();
    ctx.translate(explosion.x * TILE_SIZE_PX, explosion.y * TILE_SIZE_PX);
    ctx.globalAlpha = fade;

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    gradient.addColorStop(0, BLAST.fireCore);
    gradient.addColorStop(0.55, BLAST.fireEdge);
    gradient.addColorStop(1, BLAST.smoke);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
