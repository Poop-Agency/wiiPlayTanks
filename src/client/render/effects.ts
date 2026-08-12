/**
 * Effets décoratifs : traces de chenilles, débris, étincelles, onde de choc.
 *
 * ─── La règle, et pourquoi elle tient ───────────────────────────────────────
 *
 * Rien de ce qui vit ici n'entre dans le `WorldState`. Aucune particule n'a de
 * conséquence de jeu, aucune n'est simulée à pas fixe, aucune ne traverse le
 * réseau. Le test de déterminisme sert de garde-fou : si un effet visuel
 * s'infiltrait dans l'état simulé, le hachage divergerait.
 *
 * La contrepartie, c'est que ce module ne reçoit **aucun évènement** : la
 * simulation ne lui en envoie pas. Il déduit tout en comparant deux instantanés
 * de rendu successifs — un obus dont l'identifiant apparaît vient d'être tiré,
 * un obus dont le compteur de rebonds a baissé vient de ricocher, un tank passé
 * de vivant à détruit vient d'exploser.
 *
 * Ce choix a un coût assumé : à très bas régime d'affichage, une particule peut
 * manquer à l'appel. C'est le bon compromis — l'alternative serait une file
 * d'évènements dans l'état simulé, c'est-à-dire exactement ce qu'on s'interdit.
 */

import { TILE_SIZE_PX } from '@core/tuning';
import type { RenderSnapshot, ShellView, TankView } from './snapshots';

/** Marque de chenille laissée au sol. */
export interface TrackMark {
  x: number;
  y: number;
  angle: number;
  /** Opacité restante, de 1 à 0. */
  life: number;
}

/** Fragment projeté : débris de tank, étincelle de ricochet, éclat de bloc. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Durée de vie restante, en secondes. */
  life: number;
  /** Durée de vie totale, pour en déduire l'estompage. */
  span: number;
  size: number;
  color: string;
}

/** Onde de choc circulaire, dessinée en anneau qui s'élargit. */
export interface Shockwave {
  x: number;
  y: number;
  /** Rayon final, en tuiles. */
  radius: number;
  life: number;
  span: number;
}

export interface EffectsView {
  tracks: readonly TrackMark[];
  particles: readonly Particle[];
  shockwaves: readonly Shockwave[];
}

const EMPTY_VIEW: EffectsView = { tracks: [], particles: [], shockwaves: [] };

/* ── Réglages purement visuels ─────────────────────────────────────────────
 *
 * Ils ne sont pas dans `tuning.ts` et n'ont rien à y faire : `tuning.ts` porte
 * ce qui décide du jeu, pas ce qui décide de son apparence. Le test de garde
 * anti-valeurs magiques ne couvre que `src/core/`, pour cette raison exacte.
 * ────────────────────────────────────────────────────────────────────────── */

/** Durée d'effacement d'une trace de chenille, en secondes. */
const TRACK_FADE_SECONDS = 6;

/** Distance parcourue entre deux marques, en tuiles. */
const TRACK_SPACING_TILES = 0.22;

/** Au-delà, les plus anciennes traces sont oubliées, quel que soit leur âge. */
const MAX_TRACKS = 400;

/** Au-delà, les particules les plus anciennes sont oubliées. */
const MAX_PARTICLES = 500;

const DEBRIS_COLORS = ['#3a2f24', '#6d6459', '#b0793f', '#8b8175'];
const SPARK_COLORS = ['#ffd98a', '#ff9a3c', '#fff2c4'];

/** Frottement appliqué aux fragments, par seconde. */
const DRAG_PER_SECOND = 2.4;

export class Effects {
  #tracks: TrackMark[] = [];
  #particles: Particle[] = [];
  #shockwaves: Shockwave[] = [];

  /** Instantané précédent, pour détecter ce qui a changé. */
  #previous: RenderSnapshot | null = null;

  /** Position de la dernière marque déposée, par tank. */
  readonly #lastTrack = new Map<number, { x: number; y: number }>();

  /**
   * Générateur pseudo-aléatoire local.
   *
   * Volontairement `Math.random` : on est côté client, hors de la simulation, et
   * l'aléa décoratif n'a aucune raison d'être reproductible. Le mettre dans le
   * générateur du monde le ferait au contraire diverger entre deux clients.
   */
  #random(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  #pick<T>(values: readonly T[]): T {
    return values[Math.floor(Math.random() * values.length)]!;
  }

  /**
   * Fait vivre les effets et détecte les évènements de la frame.
   *
   * @param view instantané dessiné à cette frame
   * @param elapsedSeconds temps réel écoulé depuis la frame précédente
   */
  update(view: RenderSnapshot, elapsedSeconds: number): void {
    const dt = Math.min(Math.max(elapsedSeconds, 0), 0.1);

    // Un changement de mission remet le monde à zéro : les traces de l'arène
    // précédente n'ont plus lieu d'être, et les identifiants sont réattribués —
    // les comparer produirait des évènements imaginaires.
    if (this.#previous && view.tick < this.#previous.tick) this.clear();

    this.#detect(view);
    this.#age(dt);
    this.#previous = view;
  }

  /** Efface tout. Appelé au changement de mission. */
  clear(): void {
    this.#tracks.length = 0;
    this.#particles.length = 0;
    this.#shockwaves.length = 0;
    this.#lastTrack.clear();
    this.#previous = null;
  }

  view(): EffectsView {
    return { tracks: this.#tracks, particles: this.#particles, shockwaves: this.#shockwaves };
  }

  /* ── Détection ────────────────────────────────────────────────────────── */

  #detect(view: RenderSnapshot): void {
    const before = this.#previous;

    // Tous les tanks marquent le sol, y compris les invisibles : des chenilles
    // creusent le terrain, que le châssis se voie ou non. Pour un tank blanc,
    // cette trace est même le seul indice de sa position — et la seule façon
    // de le combattre autrement qu'au hasard.
    for (const tank of view.tanks) {
      if (tank.alive) this.#layTrack(tank);
    }

    if (!before) return;

    const tanksBefore = new Map(before.tanks.map((tank) => [tank.id, tank]));
    for (const tank of view.tanks) {
      const previous = tanksBefore.get(tank.id);
      if (previous?.alive === true && !tank.alive) this.#burstTank(tank);
    }

    const shellsBefore = new Map(before.shells.map((shell) => [shell.id, shell]));
    for (const shell of view.shells) {
      const previous = shellsBefore.get(shell.id);
      if (previous && shell.bouncesLeft < previous.bouncesLeft) this.#sparks(shell);
    }

    const explosionsBefore = new Set(before.explosions.map((explosion) => explosion.id));
    for (const explosion of view.explosions) {
      if (explosionsBefore.has(explosion.id)) continue;
      this.#blast(explosion.x, explosion.y, explosion.radius);
    }
  }

  /* ── Émission ─────────────────────────────────────────────────────────── */

  /** Dépose une marque de chenille, à intervalle de distance constant. */
  #layTrack(tank: TankView): void {
    const last = this.#lastTrack.get(tank.id);

    if (last) {
      const moved = Math.hypot(tank.x - last.x, tank.y - last.y);
      // À intervalle de distance et non de temps : un tank à l'arrêt ne doit pas
      // creuser sur place, et un tank rapide ne doit pas laisser de pointillés.
      if (moved < TRACK_SPACING_TILES) return;
    }

    this.#lastTrack.set(tank.id, { x: tank.x, y: tank.y });
    this.#tracks.push({ x: tank.x, y: tank.y, angle: tank.bodyAngle, life: 1 });

    if (this.#tracks.length > MAX_TRACKS) this.#tracks.shift();
  }

  /** Débris d'un tank détruit. */
  #burstTank(tank: TankView): void {
    for (let index = 0; index < 14; index++) {
      const angle = this.#random(0, Math.PI * 2);
      const speed = this.#random(1.5, 5);

      this.#particles.push({
        x: tank.x,
        y: tank.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.#random(0.4, 0.9),
        span: 0.9,
        size: this.#random(1.5, 4),
        color: this.#pick(DEBRIS_COLORS),
      });
    }

    this.#shockwaves.push({ x: tank.x, y: tank.y, radius: 1.6, life: 0.35, span: 0.35 });
  }

  /** Étincelles d'un obus qui ricoche, projetées dans le sens du rebond. */
  #sparks(shell: ShellView): void {
    for (let index = 0; index < 6; index++) {
      const angle = shell.heading + this.#random(-1, 1);
      const speed = this.#random(1, 3.5);

      this.#particles.push({
        x: shell.x,
        y: shell.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.#random(0.12, 0.3),
        span: 0.3,
        size: this.#random(1, 2),
        color: this.#pick(SPARK_COLORS),
      });
    }
  }

  /** Souffle d'une explosion : débris projetés et onde de choc. */
  #blast(x: number, y: number, radius: number): void {
    for (let index = 0; index < 20; index++) {
      const angle = this.#random(0, Math.PI * 2);
      const speed = this.#random(2, 7);

      this.#particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.#random(0.3, 0.8),
        span: 0.8,
        size: this.#random(2, 5),
        color: this.#pick(DEBRIS_COLORS),
      });
    }

    this.#shockwaves.push({ x, y, radius, life: 0.4, span: 0.4 });
  }

  /* ── Vieillissement ───────────────────────────────────────────────────── */

  #age(dt: number): void {
    const decay = dt / TRACK_FADE_SECONDS;

    let kept = 0;
    for (const track of this.#tracks) {
      track.life -= decay;
      if (track.life > 0) this.#tracks[kept++] = track;
    }
    this.#tracks.length = kept;

    const drag = Math.max(0, 1 - DRAG_PER_SECOND * dt);

    kept = 0;
    for (const particle of this.#particles) {
      particle.life -= dt;
      if (particle.life <= 0) continue;

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= drag;
      particle.vy *= drag;

      this.#particles[kept++] = particle;
    }
    this.#particles.length = kept;

    if (this.#particles.length > MAX_PARTICLES) {
      this.#particles.splice(0, this.#particles.length - MAX_PARTICLES);
    }

    kept = 0;
    for (const wave of this.#shockwaves) {
      wave.life -= dt;
      if (wave.life > 0) this.#shockwaves[kept++] = wave;
    }
    this.#shockwaves.length = kept;
  }
}

/** Vue vide, pour les renderers qui n'affichent pas d'effets. */
export const NO_EFFECTS = EMPTY_VIEW;

/** Conversion tuiles → pixels, utilisée par le renderer d'effets. */
export const toPixels = (tiles: number): number => tiles * TILE_SIZE_PX;
