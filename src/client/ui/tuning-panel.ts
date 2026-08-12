/**
 * Panneau de calibration, ouvert par la touche `~`.
 *
 * ─── Pourquoi cet outil existe ───────────────────────────────────────────────
 *
 * Les constantes exactes du jeu Wii ne sont documentées nulle part. La seule
 * méthode honnête est donc : partir des temps de traversée mesurés — les seuls
 * faits observables — puis ajuster le reste **au ressenti, manette en main**.
 *
 * Ce panneau est ce qui rend cette seconde étape praticable. Sans lui, ajuster
 * une valeur voudrait dire éditer un fichier, recompiler, relancer une partie,
 * et essayer de se souvenir de la sensation d'il y a trente secondes. Avec lui,
 * on compare deux réglages en trois secondes, curseur en main.
 *
 * ─── Ce qu'il n'est pas ──────────────────────────────────────────────────────
 *
 * Il n'introduit **aucune** valeur nouvelle : il ne fait qu'exposer `TUNING` et
 * `TANK_PROFILES`, qui restent la seule source de vérité. Ce qu'on retient se
 * recopie dans la source par l'export JSON — le panneau ne persiste rien.
 *
 * ⚠ Modifier un réglage en cours de partie rompt le déterminisme de cette
 * partie-là : deux clients n'auraient plus la même table. C'est sans importance
 * en solo, et le serveur (#13) transmettra la sienne à la connexion — le
 * panneau y sera donc un outil de mise au point, pas de jeu.
 *
 * Le panneau est en DOM et non dessiné dans le canevas, contrairement au HUD :
 * il lui faut des curseurs, du texte sélectionnable et une zone de copie. Le
 * navigateur fait tout ça mieux qu'un `fillText`, et rien de tout cela n'a à
 * rester aligné au plateau.
 */

import type { TankColor } from '@core/state';
import { TANK_PROFILES } from '@core/systems/ai/profiles';
import { REFERENCE_MEASUREMENTS, TILE_SIZE_PX, TUNING } from '@core/tuning';
import { globalGroups, profileGroup } from './knobs';
import type { Knob, KnobGroup } from './knobs';

/**
 * Couleurs proposées dans le sélecteur de profil.
 *
 * `player2`, `player3` et `player4` partagent l'objet de `player` — les
 * lister à part n'ajouterait que des doublons dans le menu.
 */
const PROFILE_COLORS = (Object.keys(TANK_PROFILES) as TankColor[]).filter(
  (color) => color !== 'player2' && color !== 'player3' && color !== 'player4',
);

/** Chiffres vivants affichés en tête du panneau. */
export interface PanelStats {
  tick: number;
  /** Tanks encore en vie. */
  tanks: number;
  shells: number;
  mines: number;
  /** Temps de calcul moyen d'un pas de simulation, en millisecondes. */
  msPerTick: number;
  ticksPerSecond: number;
  framesPerSecond: number;
}

/** Ce que le panneau donne à voir en plus des réglages. */
export interface DebugOptions {
  /** Boîtes de collision des tanks, des obus et des mines. */
  hitboxes: boolean;
  /** Trajectoires prévues des obus en vol, rebonds compris. */
  trajectories: boolean;
  /** Rayon du souffle de chaque mine posée. */
  blastRadii: boolean;
}

export const DEFAULT_DEBUG_OPTIONS: DebugOptions = {
  hitboxes: false,
  trajectories: false,
  blastRadii: false,
};

/** Touche d'ouverture. `Backquote` est la touche `~` / `²` selon la disposition. */
const TOGGLE_KEY = 'Backquote';

export class TuningPanel {
  readonly #root: HTMLElement;
  readonly #statsLine: HTMLElement;
  readonly #profileHost: HTMLElement;
  readonly #exportArea: HTMLTextAreaElement;

  /**
   * Rafraîchisseurs des curseurs, appelés quand les valeurs changent hors panneau.
   *
   * Deux listes et non une : la section de profil est reconstruite à chaque
   * changement de couleur, et ses rafraîchisseurs doivent partir avec elle.
   * Mélangés aux autres, ils pointeraient sur des éléments détachés du document
   * et fuiraient à chaque changement.
   */
  readonly #globalRefreshers: Array<() => void> = [];
  #profileRefreshers: Array<() => void> = [];

  readonly #debug: DebugOptions = { ...DEFAULT_DEBUG_OPTIONS };

  #open = false;

  constructor(host: HTMLElement = document.body) {
    this.#root = document.createElement('aside');
    this.#root.className = 'tuning-panel';
    this.#root.hidden = true;
    // Le panneau est un outil, pas du contenu : il ne doit pas être lu par une
    // technologie d'assistance comme s'il faisait partie du jeu.
    this.#root.setAttribute('role', 'group');
    this.#root.setAttribute('aria-label', 'Panneau de calibration');

    const title = document.createElement('h2');
    title.textContent = 'Calibration';
    this.#root.append(title);

    this.#statsLine = document.createElement('p');
    this.#statsLine.className = 'tuning-stats';
    this.#root.append(this.#statsLine);

    // La zone d'export est créée en premier bien qu'affichée en dernier :
    // construire une section de réglages écrit dedans, et un champ pas encore
    // initialisé ferait échouer tout le démarrage du client.
    this.#exportArea = document.createElement('textarea');
    this.#exportArea.className = 'tuning-export';
    this.#exportArea.readOnly = true;
    this.#exportArea.spellcheck = false;

    this.#root.append(this.#buildDebugToggles());

    for (const group of globalGroups()) {
      this.#root.append(this.#buildGroup(group, this.#globalRefreshers));
    }

    this.#profileHost = document.createElement('div');
    this.#root.append(this.#buildProfileSelector(), this.#profileHost);
    this.#showProfile(PROFILE_COLORS[1] ?? 'brown');

    this.#root.append(this.#buildExport());

    host.append(this.#root);
    window.addEventListener('keydown', this.#onKeyDown);
  }

  get open(): boolean {
    return this.#open;
  }

  /** Options d'affichage de débogage. Lues à chaque frame par le renderer. */
  get debug(): Readonly<DebugOptions> {
    return this.#debug;
  }

  toggle(): void {
    this.#open = !this.#open;
    this.#root.hidden = !this.#open;

    // Le panneau est en position fixe : sans cette marque, il recouvrirait le
    // bord droit du plateau, et le HUD avec. La classe décale la page.
    document.body.classList.toggle('panneau-ouvert', this.#open);

    // Les curseurs peuvent être périmés si une valeur a changé ailleurs.
    if (this.#open) this.#refreshAll();
  }

  /** Met à jour les chiffres vivants. Sans effet quand le panneau est fermé. */
  update(stats: PanelStats): void {
    if (!this.#open) return;

    this.#statsLine.textContent =
      `pas ${stats.tick} · ${stats.tanks} tanks · ${stats.shells} obus · ${stats.mines} mines\n` +
      `${stats.msPerTick.toFixed(2)} ms/pas · ${stats.ticksPerSecond} pas/s · ${stats.framesPerSecond} img/s`;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#onKeyDown);
    document.body.classList.remove('panneau-ouvert');
    this.#root.remove();
  }

  /* ── Construction ─────────────────────────────────────────────────────── */

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== TOGGLE_KEY) return;
    event.preventDefault();
    this.toggle();
  };

  #buildGroup(group: KnobGroup, refreshers: Array<() => void>): HTMLElement {
    const section = document.createElement('section');

    const heading = document.createElement('h3');
    heading.textContent = group.title;
    section.append(heading);

    if (group.note) {
      const note = document.createElement('p');
      note.className = 'tuning-note';
      note.textContent = group.note;
      section.append(note);
    }

    for (const knob of group.knobs) section.append(this.#buildKnob(knob, refreshers));
    return section;
  }

  #buildKnob(knob: Knob, refreshers: Array<() => void>): HTMLElement {
    const row = document.createElement('label');
    row.className = 'tuning-knob';
    if (knob.hint) row.title = knob.hint;

    const name = document.createElement('span');
    name.className = 'tuning-knob-name';
    name.textContent = knob.label;

    const readout = document.createElement('output');
    readout.className = 'tuning-knob-value';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(knob.min);
    slider.max = String(knob.max);
    slider.step = String(knob.step);

    const show = (): void => {
      const value = knob.get();
      readout.textContent = `${value.toFixed(knob.decimals)}${knob.unit ? ` ${knob.unit}` : ''}`;
    };

    const refresh = (): void => {
      slider.value = String(knob.get());
      show();
    };

    slider.addEventListener('input', () => {
      knob.set(Number(slider.value));
      show();
      this.#updateExport();
    });

    refresh();
    refreshers.push(refresh);

    row.append(name, slider, readout);
    return row;
  }

  #buildDebugToggles(): HTMLElement {
    const section = document.createElement('section');

    const heading = document.createElement('h3');
    heading.textContent = 'Affichage de débogage';
    section.append(heading);

    const toggles: Array<[keyof DebugOptions, string, string]> = [
      ['hitboxes', 'Boîtes de collision', 'Le châssis ne tourne pas : sa boîte reste alignée aux axes.'],
      ['trajectories', 'Trajectoires prévues', 'Chemin de chaque obus en vol, rebonds restants compris.'],
      ['blastRadii', 'Rayons de souffle', 'Portée de l’explosion de chaque mine posée.'],
    ];

    for (const [key, label, hint] of toggles) {
      const row = document.createElement('label');
      row.className = 'tuning-toggle';
      row.title = hint;

      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = this.#debug[key];
      box.dataset['debugOption'] = key;
      box.addEventListener('change', () => {
        this.#debug[key] = box.checked;
      });

      const text = document.createElement('span');
      text.textContent = label;

      row.append(box, text);
      section.append(row);
    }

    return section;
  }

  #buildProfileSelector(): HTMLElement {
    const row = document.createElement('label');
    row.className = 'tuning-profile-picker';

    const text = document.createElement('span');
    text.textContent = 'Couleur';

    const select = document.createElement('select');
    for (const color of PROFILE_COLORS) {
      const option = document.createElement('option');
      option.value = color;
      option.textContent = color;
      select.append(option);
    }
    select.value = PROFILE_COLORS[1] ?? 'brown';
    select.addEventListener('change', () => this.#showProfile(select.value as TankColor));

    row.append(text, select);
    return row;
  }

  /**
   * Remplace la section de profil.
   *
   * Une couleur à la fois : dix profils de quatorze réglages feraient cent
   * quarante curseurs à l'écran, où l'on ne trouverait plus rien.
   */
  #showProfile(color: TankColor): void {
    this.#profileRefreshers = [];
    this.#profileHost.replaceChildren(
      this.#buildGroup(profileGroup(color), this.#profileRefreshers),
    );
    this.#updateExport();
  }

  #buildExport(): HTMLElement {
    const section = document.createElement('section');

    const heading = document.createElement('h3');
    heading.textContent = 'Export';
    section.append(heading);

    const note = document.createElement('p');
    note.className = 'tuning-note';
    note.textContent =
      'À recopier dans src/core/tuning.ts et systems/ai/profiles.ts. ' +
      'Le bloc « mesures » rappelle les grandeurs chronométrables : ce sont elles ' +
      'qui font foi, les vitesses en tuiles/s n’en sont que la traduction. ' +
      '« Infinity » vaut Number.POSITIVE_INFINITY.';
    section.append(note);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copier';
    copy.addEventListener('click', () => {
      this.#updateExport();
      // `select()` avant l'API presse-papiers : celle-ci exige un contexte
      // sécurisé, et le mode développement n'en est pas toujours un.
      this.#exportArea.select();
      void navigator.clipboard?.writeText(this.#exportArea.value).catch(() => {
        /* La sélection reste, un Ctrl+C manuel suffit. */
      });
    });

    section.append(copy, this.#exportArea);
    this.#updateExport();
    return section;
  }

  #updateExport(): void {
    const widthTiles = REFERENCE_MEASUREMENTS.arenaWidthPx / TILE_SIZE_PX;
    const crossing = (tilesPerSecond: number): number =>
      Number((widthTiles / tilesPerSecond).toFixed(3));

    // `JSON.stringify` transforme silencieusement Infinity en `null`, ce qui
    // ferait recopier une valeur fausse. On l'écrit en toutes lettres.
    const keepInfinities = (_key: string, value: unknown): unknown =>
      typeof value === 'number' && !Number.isFinite(value) ? String(value) : value;

    this.#exportArea.value = JSON.stringify(
      {
        // En tête, parce que c'est la seule partie qui se vérifie chronomètre
        // en main sur le jeu original.
        mesures: {
          largeurArenePx: REFERENCE_MEASUREMENTS.arenaWidthPx,
          traverseeTankSecondes: crossing(TUNING.tank.speedTilesPerSecond),
          traverseeObusSecondes: crossing(TUNING.shell.normalSpeedTilesPerSecond),
          traverseeMissileSecondes: crossing(TUNING.shell.fastSpeedTilesPerSecond),
        },
        tuning: TUNING,
        profiles: TANK_PROFILES,
      },
      keepInfinities,
      2,
    );
  }

  #refreshAll(): void {
    for (const refresh of this.#globalRefreshers) refresh();
    for (const refresh of this.#profileRefreshers) refresh();
    this.#updateExport();
  }
}
