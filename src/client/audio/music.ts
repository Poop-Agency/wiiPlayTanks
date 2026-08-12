/**
 * Musique de fond, un morceau par mission.
 *
 * ─── Pourquoi des fichiers ici, alors que les bruitages sont synthétisés ────
 *
 * `synth.ts` fabrique tous les sons à la volée, et explique pourquoi : la
 * palette de l'original est faite de bruits courts et secs, que la synthèse
 * soustractive reproduit très bien. Une mélodie, non — la synthétiser
 * reviendrait à écrire un séquenceur et à transcrire vingt morceaux à la main.
 * D'où ce module, le seul qui charge des fichiers.
 *
 * Ces fichiers ne sont **pas fournis** avec le dépôt (voir
 * `public/musique/README.md`). Leur absence est donc le cas normal, pas une
 * panne : tout ici doit rester silencieux sans jamais gêner le jeu.
 *
 * ─── Contrainte des navigateurs ─────────────────────────────────────────────
 *
 * Comme pour les bruitages, rien ne peut démarrer avant un geste de
 * l'utilisateur. `unlock()` est appelé au premier, et la lecture demandée
 * avant est simplement mémorisée puis rejouée à ce moment-là.
 */

import { jingleUrl, trackUrlForMission } from './playlist';
import type { JingleName } from './playlist';

/**
 * Durée du fondu enchaîné entre deux morceaux, en millisecondes.
 *
 * Une coupure nette à chaque mission s'entendrait comme un défaut ; au-delà
 * d'une seconde, les deux morceaux se superposent assez longtemps pour qu'on
 * distingue la bouillie.
 */
const CROSSFADE_MS = 900;

/** Pas du fondu. Assez fin pour être inaudible, assez gros pour ne rien coûter. */
const FADE_STEP_MS = 40;

/**
 * Part du volume général réservée à la musique.
 *
 * La musique accompagne, les bruitages informent : un tir ou une mine amorcée
 * doivent rester lisibles par-dessus. Ce facteur les sépare sans obliger à
 * régler deux volumes.
 */
const MUSIC_GAIN = 0.45;

export class Music {
  /** Élément en cours de lecture, ou `null` si rien ne joue. */
  #current: HTMLAudioElement | null = null;

  /** Mission dont le morceau est en cours, pour ne pas le relancer à chaque pas. */
  #currentMission: number | null = null;

  /** Un geste de l'utilisateur a-t-il déjà eu lieu ? */
  #unlocked = false;

  /** Mission demandée avant le premier geste, à jouer dès qu'il arrive. */
  #pending: number | null = null;

  #muted = false;
  #volume = 0.6;

  /**
   * Missions dont le fichier est introuvable.
   *
   * Sans cette mémoire, chaque retour sur la mission relancerait une requête
   * vouée à échouer et remplirait la console.
   */
  readonly #missing = new Set<string>();

  /** Dernier morceau de transition lancé. Consultatif, pour les tests. */
  #lastJingle: JingleName | null = null;

  /**
   * État observable, pour les tests bout-en-bout.
   *
   * La musique ne laisse aucune trace à l'écran et ses éléments audio ne sont
   * pas dans le DOM (`new Audio()` n'y insère rien) : sans cette lecture, un
   * test n'aurait aucune prise sur elle. Purement consultatif.
   */
  get state(): {
    mission: number | null;
    playing: boolean;
    missing: string[];
    lastJingle: JingleName | null;
  } {
    return {
      mission: this.#currentMission,
      playing: this.#current !== null && !this.#current.paused,
      missing: [...this.#missing].sort(),
      lastJingle: this.#lastJingle,
    };
  }

  /** Autorise la lecture. À appeler depuis un gestionnaire d'évènement d'entrée. */
  unlock(): void {
    if (this.#unlocked) return;
    this.#unlocked = true;

    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null) this.playForMission(pending);
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;

    if (muted) {
      this.#stopCurrent();
      // La mission reste mémorisée : rétablir le son doit reprendre la
      // musique de la mission en cours, sans attendre la suivante.
      return;
    }

    if (this.#currentMission !== null) {
      const mission = this.#currentMission;
      this.#currentMission = null;
      this.playForMission(mission);
    }
  }

  setVolume(volume: number): void {
    this.#volume = Math.min(1, Math.max(0, volume));
    if (this.#current) this.#current.volume = this.#target();
  }

  /**
   * Passe au morceau d'une mission. Sans effet si c'est déjà celui qui joue.
   *
   * Appelable à chaque pas : c'est la comparaison avec la mission courante qui
   * évite de repartir de zéro soixante fois par seconde.
   */
  playForMission(mission: number): void {
    if (mission === this.#currentMission) return;

    if (!this.#unlocked) {
      this.#pending = mission;
      return;
    }

    this.#currentMission = mission;

    const url = trackUrlForMission(mission);

    if (this.#muted || url === undefined || this.#missing.has(url)) {
      this.#stopCurrent();
      return;
    }

    const next = new Audio(url);
    next.loop = true;
    next.volume = 0;

    next.addEventListener(
      'error',
      () => {
        // Fichier absent : c'est le cas normal d'un dépôt sans musique. On le
        // retient pour ne plus réessayer, et le jeu continue en silence.
        this.#missing.add(url);
        if (this.#current === next) this.#current = null;
      },
      { once: true },
    );

    const previous = this.#current;
    this.#current = next;

    void next.play().then(
      () => {
        this.#fade(next, this.#target());
        if (previous) this.#fade(previous, 0, () => previous.pause());
      },
      () => {
        // Lecture refusée malgré le geste : on n'insiste pas.
        if (this.#current === next) this.#current = null;
      },
    );
  }

  /**
   * Joue un court morceau de transition, par-dessus la musique en cours.
   *
   * Il ne boucle pas et ne remplace pas la piste de fond : c'est une ponctuation
   * — fin de round, échec, entre-deux. La musique de mission, elle, est coupée
   * par l'appelant s'il y a lieu, via {@link stop}.
   */
  playJingle(name: JingleName, options: { then?: JingleName } = {}): void {
    if (!this.#unlocked || this.#muted) return;

    const url = jingleUrl(name);
    if (this.#missing.has(url)) return;

    const jingle = new Audio(url);
    jingle.volume = this.#target();
    this.#lastJingle = name;

    jingle.addEventListener(
      'error',
      () => {
        this.#missing.add(url);
        // Le fichier manque : la suite ne doit pas être perdue pour autant.
        if (options.then) this.playJingle(options.then);
      },
      { once: true },
    );

    // Enchaînement sur la fin réelle du morceau plutôt que sur un minuteur
    // réglé à la louche : les deux ne se chevauchent jamais, quelle que soit
    // la durée du fichier déposé.
    if (options.then) {
      const next = options.then;
      jingle.addEventListener('ended', () => this.playJingle(next), { once: true });
    }

    void jingle.play().catch(() => {
      /* Refusé : sans conséquence, la partie continue. */
    });
  }

  /** Coupe la musique et oublie la mission en cours. */
  stop(): void {
    this.#stopCurrent();
    this.#currentMission = null;
    this.#pending = null;
  }

  /** Volume visé par le morceau en cours, réglages compris. */
  #target(): number {
    return this.#muted ? 0 : this.#volume * MUSIC_GAIN;
  }

  #stopCurrent(): void {
    const current = this.#current;
    if (!current) return;

    this.#current = null;
    this.#fade(current, 0, () => current.pause());
  }

  /** Amène le volume d'un élément à une valeur, par paliers. */
  #fade(element: HTMLAudioElement, to: number, done?: () => void): void {
    const from = element.volume;
    const steps = Math.max(1, Math.round(CROSSFADE_MS / FADE_STEP_MS));
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const ratio = Math.min(1, step / steps);
      element.volume = Math.min(1, Math.max(0, from + (to - from) * ratio));

      if (ratio >= 1) {
        clearInterval(timer);
        done?.();
      }
    }, FADE_STEP_MS);
  }
}
