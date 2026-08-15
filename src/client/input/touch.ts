/**
 * Commandes tactiles.
 *
 * Deux sticks : le gauche déplace le châssis, le droit oriente le canon. Le
 * jeu est un twin-stick par nature — dans l'original, le stick du nunchuk et le
 * pointeur de la Wiimote sont indépendants — et c'est la transposition qui
 * demande le moins d'apprentissage au doigt.
 *
 * ─── Pourquoi pas viser en touchant le plateau ───────────────────────────────
 *
 * C'était la première version, et elle reprenait le pointeur de la Wiimote au
 * plus près. Deux défauts en jeu : le doigt masque la zone qu'on regarde, et
 * surtout l'angle se calcule depuis le tank, donc plus le doigt en est proche
 * plus le canon devient nerveux — jusqu'à devenir incontrôlable au contact.
 * Le stick, lui, a un pivot fixe : la précision ne dépend plus de l'endroit où
 * l'on touche.
 *
 * ─── La visée est rémanente ──────────────────────────────────────────────────
 *
 * Relâcher le stick de visée **ne recentre pas le canon**. C'est ce qui rend
 * l'ensemble jouable à deux pouces : on pointe, on lâche, on tire — sans quoi
 * il faudrait tenir la visée et atteindre le bouton de tir en même temps, ce
 * qui demande une troisième main.
 *
 * ─── Pourquoi ce module ressemble à `gamepad.ts` ─────────────────────────────
 *
 * Il rend délibérément la même forme de lecture qu'une manette — deux axes, un
 * angle, deux boutons. `InputSampler` fusionne déjà cette forme avec le clavier
 * sans savoir d'où elle vient : brancher le tactile ne demande donc pas de
 * toucher à la fusion, ni évidemment à la simulation.
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
  /**
   * Orientation du canon en radians, ou `null` s'il n'y a pas d'écran tactile.
   *
   * Jamais `null` dès lors que les commandes existent : le canon a toujours une
   * direction, et la rendre facultative ferait reprendre la main à la souris —
   * qui, sur un téléphone, n'a jamais bougé et pointe donc le coin de l'écran.
   */
  aim: number | null;
  fire: boolean;
  mine: boolean;
}

export const NEUTRAL_TOUCH: TouchReading = {
  moveX: 0,
  moveY: 0,
  aim: null,
  fire: false,
  mine: false,
};

/**
 * Rayon d'un stick virtuel, en pixels CSS.
 *
 * C'est la distance à laquelle la consigne sature. Trop court, le tank part à
 * pleine vitesse au moindre frémissement ; trop long, le pouce doit quitter sa
 * position de repos pour tourner.
 */
const STICK_RADIUS_PX = 56;

/**
 * Zone morte du stick de déplacement, en pixels CSS.
 *
 * Un pouce posé n'est jamais parfaitement immobile. Sans ce seuil, le tank
 * dériverait en permanence, ce qui est particulièrement gênant ici : les tanks
 * qui se déplacent ne peuvent pas viser aussi précisément que ceux à l'arrêt.
 */
const MOVE_DEADZONE_PX = 8;

/**
 * Zone morte du stick de visée, en pixels CSS.
 *
 * Plus large que celle du déplacement, parce que la visée est rémanente : un
 * frémissement au moment de poser le pouce ferait pivoter le canon pour de bon,
 * là où un frémissement sur le déplacement se corrige tout seul au pas suivant.
 */
const AIM_DEADZONE_PX = 14;

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

/** Les trois éléments qui composent un stick à l'écran. */
interface StickParts {
  zone: HTMLElement;
  base: HTMLElement;
  knob: HTMLElement;
}

export class TouchControls {
  readonly #root: HTMLElement;
  readonly #disposers: Array<() => void> = [];

  #moveX = 0;
  #moveY = 0;

  /**
   * Orientation du canon, en radians. Vers la droite au démarrage.
   *
   * Une valeur de départ arbitraire mais **définie** : le canon doit pointer
   * quelque part avant le premier geste, et n'importe quelle direction franche
   * vaut mieux qu'un angle hérité d'une position de souris qui n'existe pas.
   */
  #aim = 0;

  #fire = false;
  #mine = false;

  constructor(host: HTMLElement) {
    this.#root = document.createElement('div');
    this.#root.className = 'touch-controls';

    const move = this.#stick('touch-stick--move');
    const aim = this.#stick('touch-stick--aim');

    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';

    const fire = this.#button('touch-button--fire', 'Tirer');
    const mine = this.#button('touch-button--mine', 'Mine');
    buttons.append(mine, fire);

    this.#root.append(move.zone, aim.zone, buttons);
    host.append(this.#root);

    this.#wireStick(move, MOVE_DEADZONE_PX, (x, y) => {
      this.#moveX = x;
      this.#moveY = y;
    });

    // Rémanence : on n'enregistre l'angle que lorsque le pouce sort de la zone
    // morte, donc ni au repos ni au relâchement. Le canon garde alors sa
    // dernière direction, ce qui est tout l'intérêt.
    this.#wireStick(aim, AIM_DEADZONE_PX, (x, y) => {
      if (x !== 0 || y !== 0) this.#aim = Math.atan2(y, x);
    });

    this.#wireButton(fire, (held) => {
      this.#fire = held;
    });
    this.#wireButton(mine, (held) => {
      this.#mine = held;
    });
  }

  read(): TouchReading {
    return {
      moveX: this.#moveX,
      moveY: this.#moveY,
      aim: this.#aim,
      fire: this.#fire,
      mine: this.#mine,
    };
  }

  dispose(): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
    this.#root.remove();
  }

  /* ── Construction ────────────────────────────────────────────────────── */

  #stick(modifier: string): StickParts {
    const zone = document.createElement('div');
    zone.className = `touch-stick ${modifier}`;

    const base = document.createElement('div');
    base.className = 'touch-stick__base';

    const knob = document.createElement('div');
    knob.className = 'touch-stick__knob';

    base.append(knob);
    zone.append(base);

    return { zone, base, knob };
  }

  #button(modifier: string, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `touch-button ${modifier}`;
    button.textContent = label;
    return button;
  }

  /* ── Câblage ─────────────────────────────────────────────────────────── */

  #wireStick(
    { zone, base, knob }: StickParts,
    deadzonePx: number,
    apply: (x: number, y: number) => void,
  ): void {
    /**
     * Doigt qui tient ce stick, `null` si aucun.
     *
     * Indispensable en multitouch, et c'est tout l'objet de cette refonte :
     * les deux pouces et le bouton de tir produisent des évènements sur la même
     * page, et chacun doit ne réagir qu'au sien.
     */
    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;

    const set = (x: number, y: number): void => {
      apply(x, y);
      knob.style.transform = `translate(${x * STICK_RADIUS_PX}px, ${y * STICK_RADIUS_PX}px)`;
    };

    this.#listen(zone, 'pointerdown', (event) => {
      const pointer = event as PointerEvent;
      if (pointerId !== null) return;

      pointerId = pointer.pointerId;
      originX = pointer.clientX;
      originY = pointer.clientY;

      // Le stick apparaît sous le pouce plutôt qu'à une place fixe : les mains
      // n'ont pas toutes la même taille, et on ne regarde pas ses doigts en
      // jouant.
      const bounds = zone.getBoundingClientRect();
      base.style.left = `${pointer.clientX - bounds.left}px`;
      base.style.top = `${pointer.clientY - bounds.top}px`;
      base.classList.add('is-held');

      event.preventDefault();
    });

    // Suivi et relâchement sur `window` et non sur la zone : un pouce qui
    // pousse le stick à fond en déborde, et il doit continuer d'être suivi.
    // C'est aussi ce qui évite `setPointerCapture`, qui refuse les identifiants
    // de pointeur qu'il ne connaît pas.
    this.#listen(window, 'pointermove', (event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerId !== pointerId) return;

      const dx = pointer.clientX - originX;
      const dy = pointer.clientY - originY;
      const distance = Math.hypot(dx, dy);

      if (distance < deadzonePx) {
        set(0, 0);
        return;
      }

      // Saturation au rayon : au-delà, pousser plus loin ne change rien, mais
      // le pouce peut continuer de tourner sans perdre la direction.
      const scale = Math.min(distance, STICK_RADIUS_PX) / distance;
      set((dx * scale) / STICK_RADIUS_PX, (dy * scale) / STICK_RADIUS_PX);
    });

    const release = (event: Event): void => {
      if ((event as PointerEvent).pointerId !== pointerId) return;

      pointerId = null;
      set(0, 0);
      base.classList.remove('is-held');
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

  #listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.#disposers.push(() => target.removeEventListener(type, handler));
  }
}
