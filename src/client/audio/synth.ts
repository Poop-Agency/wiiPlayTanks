/**
 * Banque de sons, **entièrement synthétisée**.
 *
 * ─── Pourquoi pas de fichiers audio ─────────────────────────────────────────
 *
 * Aucun échantillon n'est distribué avec le jeu : tout est fabriqué à la volée
 * par l'API Web Audio. Trois raisons, dans cet ordre :
 *
 *   1. le dépôt reste sans actifs binaires — rien à héberger, rien à charger,
 *      rien qui manque au premier lancement ;
 *   2. la palette sonore de l'original est faite de bruits courts et secs, très
 *      exactement ce que la synthèse soustractive produit le mieux ;
 *   3. régler un son revient à changer un nombre, pas à rouvrir un éditeur.
 *
 * ─── Contrainte des navigateurs ─────────────────────────────────────────────
 *
 * Le contexte audio ne peut démarrer qu'après un geste de l'utilisateur. Il est
 * donc créé paresseusement, au premier son demandé après une interaction — et
 * tant qu'il n'existe pas, jouer un son ne fait simplement rien.
 */

/** Réglages persistés d'une session à l'autre. */
export interface AudioSettings {
  volume: number;
  muted: boolean;
}

const STORAGE_KEY = 'tanks.audio';

const DEFAULT_SETTINGS: AudioSettings = { volume: 0.6, muted: false };

/** Sons disponibles. */
export type SoundName =
  | 'shot'
  | 'shotFast'
  | 'ricochet'
  | 'explosion'
  | 'mineLay'
  | 'mineBeep'
  | 'tankDestroyed'
  | 'victory'
  | 'failure';

export class Synth {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  #noise: AudioBuffer | null = null;

  #settings: AudioSettings = loadSettings();

  get settings(): Readonly<AudioSettings> {
    return this.#settings;
  }

  get muted(): boolean {
    return this.#settings.muted;
  }

  setVolume(volume: number): void {
    this.#settings = { ...this.#settings, volume: Math.min(1, Math.max(0, volume)) };
    this.#applySettings();
  }

  toggleMute(): boolean {
    this.#settings = { ...this.#settings, muted: !this.#settings.muted };
    this.#applySettings();
    return this.#settings.muted;
  }

  /**
   * Ouvre le contexte audio.
   *
   * À appeler depuis un gestionnaire d'évènement d'entrée : les navigateurs
   * refusent de démarrer le son autrement.
   */
  resume(): void {
    const context = this.#ensureContext();
    if (context && context.state === 'suspended') void context.resume();
  }

  /** Joue un son. Sans effet tant que le contexte n'a pas pu s'ouvrir. */
  play(name: SoundName): void {
    if (this.#settings.muted) return;

    const context = this.#ensureContext();
    const master = this.#master;
    if (!context || !master || context.state !== 'running') return;

    const at = context.currentTime;

    switch (name) {
      case 'shot':
        this.#boom(at, { attack: 0.005, decay: 0.16, from: 320, to: 90, gain: 0.5 });
        this.#hiss(at, { decay: 0.09, cutoff: 2200, gain: 0.32 });
        break;

      // Le missile part plus haut et plus court : c'est ce qui le distingue à
      // l'oreille, comme sa forme le distingue à l'oeil.
      case 'shotFast':
        this.#boom(at, { attack: 0.004, decay: 0.11, from: 640, to: 200, gain: 0.4 });
        this.#hiss(at, { decay: 0.06, cutoff: 4200, gain: 0.24 });
        break;

      case 'ricochet':
        this.#ping(at, { frequency: 1500, decay: 0.11, gain: 0.16, type: 'triangle' });
        this.#ping(at + 0.01, { frequency: 2300, decay: 0.07, gain: 0.09, type: 'sine' });
        break;

      case 'explosion':
        this.#hiss(at, { decay: 0.55, cutoff: 900, gain: 0.55, sweepTo: 120 });
        this.#boom(at, { attack: 0.005, decay: 0.4, from: 160, to: 40, gain: 0.5 });
        break;

      case 'tankDestroyed':
        this.#hiss(at, { decay: 0.7, cutoff: 1400, gain: 0.6, sweepTo: 90 });
        this.#boom(at, { attack: 0.004, decay: 0.55, from: 220, to: 34, gain: 0.6 });
        break;

      case 'mineLay':
        this.#ping(at, { frequency: 300, decay: 0.09, gain: 0.2, type: 'square' });
        break;

      case 'mineBeep':
        this.#ping(at, { frequency: 1000, decay: 0.05, gain: 0.12, type: 'sine' });
        break;

      // Deux jingles, seuls sons mélodiques du jeu : ils marquent une bascule,
      // et rien d'autre ne doit leur ressembler.
      case 'victory':
        this.#arpeggio(at, [523, 659, 784, 1047], 0.09);
        break;

      case 'failure':
        this.#arpeggio(at, [392, 311, 233], 0.16);
        break;
    }
  }

  /* ── Briques de synthèse ──────────────────────────────────────────────── */

  /** Oscillateur dont la hauteur chute : le corps d'un tir ou d'une détonation. */
  #boom(
    at: number,
    options: { attack: number; decay: number; from: number; to: number; gain: number },
  ): void {
    const context = this.#context!;

    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(options.from, at);
    // Chute exponentielle et non linéaire : c'est ainsi que l'oreille perçoit
    // les hauteurs, et un balayage linéaire s'entend comme un glissando.
    oscillator.frequency.exponentialRampToValueAtTime(options.to, at + options.decay);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(options.gain, at + options.attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.decay);

    oscillator.connect(gain).connect(this.#master!);
    oscillator.start(at);
    oscillator.stop(at + options.decay + 0.02);
  }

  /** Bruit blanc filtré : le souffle d'une explosion, la poudre d'un tir. */
  #hiss(
    at: number,
    options: { decay: number; cutoff: number; gain: number; sweepTo?: number },
  ): void {
    const context = this.#context!;

    const source = context.createBufferSource();
    source.buffer = this.#ensureNoise();

    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(options.cutoff, at);
    if (options.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(options.sweepTo, at + options.decay);
    }

    const gain = context.createGain();
    gain.gain.setValueAtTime(options.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.decay);

    source.connect(filter).connect(gain).connect(this.#master!);
    source.start(at);
    source.stop(at + options.decay + 0.02);
  }

  /** Note brève : ricochet, bip de mine. */
  #ping(
    at: number,
    options: { frequency: number; decay: number; gain: number; type: OscillatorType },
  ): void {
    const context = this.#context!;

    const oscillator = context.createOscillator();
    oscillator.type = options.type;
    oscillator.frequency.setValueAtTime(options.frequency, at);

    const gain = context.createGain();
    gain.gain.setValueAtTime(options.gain, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + options.decay);

    oscillator.connect(gain).connect(this.#master!);
    oscillator.start(at);
    oscillator.stop(at + options.decay + 0.02);
  }

  /** Suite de notes, pour les deux jingles. */
  #arpeggio(at: number, frequencies: readonly number[], step: number): void {
    frequencies.forEach((frequency, index) => {
      this.#ping(at + index * step, {
        frequency,
        decay: step * 1.8,
        gain: 0.18,
        type: 'triangle',
      });
    });
  }

  /* ── Contexte ─────────────────────────────────────────────────────────── */

  #ensureContext(): AudioContext | null {
    if (this.#context) return this.#context;
    if (typeof AudioContext === 'undefined') return null;

    const context = new AudioContext();
    const master = context.createGain();
    master.connect(context.destination);

    this.#context = context;
    this.#master = master;
    this.#applySettings();

    return context;
  }

  /** Bruit blanc d'une seconde, fabriqué une fois et réutilisé. */
  #ensureNoise(): AudioBuffer {
    if (this.#noise) return this.#noise;

    const context = this.#context!;
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);

    // `Math.random` sans réserve : on est hors de la simulation, et un bruit
    // reproductible n'aurait aucun intérêt — il s'entendrait même comme une
    // boucle.
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.random() * 2 - 1;
    }

    this.#noise = buffer;
    return buffer;
  }

  #applySettings(): void {
    if (this.#master && this.#context) {
      const level = this.#settings.muted ? 0 : this.#settings.volume;
      this.#master.gain.setTargetAtTime(level, this.#context.currentTime, 0.02);
    }
    saveSettings(this.#settings);
  }
}

/* ── Persistance ────────────────────────────────────────────────────────── */

function loadSettings(): AudioSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };

    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      volume:
        typeof parsed.volume === 'number' ? Math.min(1, Math.max(0, parsed.volume)) : DEFAULT_SETTINGS.volume,
      muted: parsed.muted === true,
    };
  } catch {
    // Stockage indisponible ou contenu abîmé : le son ne doit pas empêcher de
    // jouer.
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* Navigation privée, quota plein : sans conséquence. */
  }
}
