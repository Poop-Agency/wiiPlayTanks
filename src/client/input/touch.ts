/**
 * Commandes tactiles.
 *
 * Le schéma reprend celui du jeu original de la même façon que le clavier-souris
 * (voir `bindings.ts`) : le pouce gauche tient le rôle du stick du nunchuk, le
 * doigt droit celui du pointeur de la Wiimote. Poser le doigt sur le plateau
 * oriente le canon ; le tir et la mine ont leurs propres boutons.
 *
 * ─── Pourquoi ce module ressemble à `gamepad.ts` ─────────────────────────────
 *
 * Il rend délibérément la même forme de lecture qu'une manette — deux axes et
 * deux boutons. `InputSampler` fusionne déjà cette forme avec le clavier sans
 * savoir d'où elle vient : brancher le tactile ne demande donc pas de toucher à
 * la fusion, ni évidemment à la simulation.
 *
 * La différence est que l'état d'une manette s'interroge, là où le tactile est
 * évènementiel : d'où une instance à créer et à détruire, plutôt qu'une
 * fonction libre.
 */

/** Ce qu'un écran tactile rapporte, dans la même forme qu'une manette. */
export interface TouchReading {
  /** −1 à 1. Zéro au repos. */
  moveX: number;
  moveY: number;
  fire: boolean;
  mine: boolean;
}

export const NEUTRAL_TOUCH: TouchReading = { moveX: 0, moveY: 0, fire: false, mine: false };

/**
 * Rayon du stick virtuel, en pixels CSS.
 *
 * C'est la distance à laquelle la consigne sature. Trop court, le tank part à
 * pleine vitesse au moindre frémissement ; trop long, le pouce doit quitter sa
 * position de repos pour tourner.
 */
const STICK_RADIUS_PX = 56;

/**
 * Zone morte du stick, en pixels CSS.
 *
 * Un pouce posé n'est jamais parfaitement immobile. Sans ce seuil, le tank
 * dériverait en permanence, ce qui est particulièrement gênant ici : les tanks
 * qui se déplacent ne peuvent pas viser aussi précisément que ceux à l'arrêt.
 */
const STICK_DEADZONE_PX = 8;

/**
 * L'appareil est-il piloté au doigt ?
 *
 * `pointer: coarse` désigne le dispositif de pointage **principal**. Un portable
 * à écran tactile reste donc `fine` et n'affiche pas les commandes, ce qui est
 * le comportement voulu : elles masqueraient une partie du plateau pour rien.
 */
export function hasTouchScreen(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

export class TouchControls {
  readonly #root: HTMLElement;
  readonly #base: HTMLElement;
  readonly #knob: HTMLElement;
  readonly #disposers: Array<() => void> = [];

  /**
   * Identifiant du doigt qui tient le stick, `null` si aucun.
   *
   * Indispensable en multitouch : sans lui, le doigt qui appuie sur « tirer »
   * déplacerait aussi le stick, les deux évènements arrivant sur la même page.
   */
  #stickPointer: number | null = null;

  /** Point où le pouce s'est posé — le stick est flottant, pas fixe. */
  #originX = 0;
  #originY = 0;

  #moveX = 0;
  #moveY = 0;
  #fire = false;
  #mine = false;

  constructor(host: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'touch-controls';

    const stick = document.createElement('div');
    stick.className = 'touch-stick';

    this.#base = document.createElement('div');
    this.#base.className = 'touch-stick__base';

    this.#knob = document.createElement('div');
    this.#knob.className = 'touch-stick__knob';

    this.#base.append(this.#knob);
    stick.append(this.#base);

    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';

    const fire = this.#button('touch-button--fire', 'Tirer');
    const mine = this.#button('touch-button--mine', 'Mine');
    buttons.append(mine, fire);

    this.#root.append(stick, buttons);
    host.append(this.#root);

    this.#wireStick(stick);
    this.#wireButton(fire, (held) => {
      this.#fire = held;
    });
    this.#wireButton(mine, (held) => {
      this.#mine = held;
    });
  }

  read(): TouchReading {
    return { moveX: this.#moveX, moveY: this.#moveY, fire: this.#fire, mine: this.#mine };
  }

  dispose(): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
    this.#root.remove();
  }

  /* ── Câblage ─────────────────────────────────────────────────────────── */

  #button(modifier: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-button ${modifier}`;
    button.textContent = label;
    return button;
  }

  #wireStick(zone: HTMLElement): void {
    this.#listen(zone, 'pointerdown', (event) => {
      const pointer = event as PointerEvent;
      if (this.#stickPointer !== null) return;

      this.#stickPointer = pointer.pointerId;
      this.#originX = pointer.clientX;
      this.#originY = pointer.clientY;

      // Le stick apparaît sous le pouce plutôt qu'à une place fixe : les mains
      // n'ont pas toutes la même taille, et on ne regarde pas ses doigts en
      // jouant.
      const bounds = zone.getBoundingClientRect();
      this.#base.style.left = `${pointer.clientX - bounds.left}px`;
      this.#base.style.top = `${pointer.clientY - bounds.top}px`;
      this.#base.classList.add('is-held');

      event.preventDefault();
    });

    // Suivi et relâchement sur `window` et non sur la zone : un pouce qui
    // pousse le stick à fond en déborde, et il doit continuer d'être suivi.
    // C'est aussi ce qui évite `setPointerCapture`, qui refuse les identifiants
    // de pointeur qu'il ne connaît pas.
    this.#listen(window, 'pointermove', (event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerId !== this.#stickPointer) return;

      const dx = pointer.clientX - this.#originX;
      const dy = pointer.clientY - this.#originY;
      const distance = Math.hypot(dx, dy);

      if (distance < STICK_DEADZONE_PX) {
        this.#setStick(0, 0);
        return;
      }

      // Saturation au rayon : au-delà, pousser plus loin ne change rien, mais
      // le pouce peut continuer de tourner sans perdre la direction.
      const scale = Math.min(distance, STICK_RADIUS_PX) / distance;
      this.#setStick((dx * scale) / STICK_RADIUS_PX, (dy * scale) / STICK_RADIUS_PX);
    });

    const release = (event: Event): void => {
      const pointer = event as PointerEvent;
      if (pointer.pointerId !== this.#stickPointer) return;

      this.#stickPointer = null;
      this.#setStick(0, 0);
      this.#base.classList.remove('is-held');
    };

    this.#listen(window, 'pointerup', release);
    this.#listen(window, 'pointercancel', release);
  }

  #wireButton(button: HTMLElement, set: (held: boolean) => void): void {
    let pointerId: number | null = null;

    this.#listen(button, 'pointerdown', (event) => {
      const pointer = event as PointerEvent;
      if (pointerId !== null) return;

      pointerId = pointer.pointerId;
      set(true);
      button.classList.add('is-held');
      event.preventDefault();
    });

    // Sur `window` : un pouce qui glisse hors du bouton avant de se lever doit
    // relâcher quand même, sans quoi le tir resterait bloqué en position
    // enfoncée jusqu'au prochain appui.
    const release = (event: Event): void => {
      if ((event as PointerEvent).pointerId !== pointerId) return;

      pointerId = null;
      set(false);
      button.classList.remove('is-held');
    };

    this.#listen(window, 'pointerup', release);
    this.#listen(window, 'pointercancel', release);
  }

  #setStick(x: number, y: number): void {
    this.#moveX = x;
    this.#moveY = y;
    this.#knob.style.transform = `translate(${x * STICK_RADIUS_PX}px, ${y * STICK_RADIUS_PX}px)`;
  }

  #listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.#disposers.push(() => target.removeEventListener(type, handler));
  }
}
