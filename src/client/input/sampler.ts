/**
 * Collecte des entrées.
 *
 * Le rôle de ce module est de transformer des évènements du navigateur en un
 * {@link InputCommand} — la seule chose que la simulation accepte, et la seule
 * chose qui partira sur le réseau en multijoueur (#13).
 *
 * C'est délibérément la seule couche qui connaisse le clavier et la souris : la
 * simulation, elle, ne sait pas d'où viennent les intentions qu'elle applique.
 */

import type { InputCommand } from '@core/state';
import { KEY_BINDINGS, MOUSE_BINDINGS } from './bindings';
import type { GameAction } from './bindings';

/** Convertit une position de pointeur en coordonnées monde. */
export type PointerToWorld = (clientX: number, clientY: number) => { x: number; y: number };

export class InputSampler {
  readonly #active = new Set<GameAction>();

  /**
   * Actions pressées depuis le dernier échantillonnage, même déjà relâchées.
   *
   * La simulation n'échantillonne que soixante fois par seconde. Sans ce
   * verrouillage, un appui bref — un clic dure une dizaine de millisecondes —
   * pourrait commencer et finir entre deux pas, et disparaître purement et
   * simplement. Un tir ou une mine perdus sans raison visible sont exactement
   * le genre de chose qui rend un jeu frustrant.
   */
  readonly #pressedSinceSample = new Set<GameAction>();

  readonly #target: HTMLElement;
  readonly #pointerToWorld: PointerToWorld;
  readonly #disposers: Array<() => void> = [];

  /** Dernière position connue du pointeur, en coordonnées monde. */
  #aimX = 0;
  #aimY = 0;

  /** Origine de la visée : le tank, dont la position change à chaque pas. */
  #originX = 0;
  #originY = 0;

  constructor(target: HTMLElement, pointerToWorld: PointerToWorld) {
    this.#target = target;
    this.#pointerToWorld = pointerToWorld;
    this.#attach();
  }

  /**
   * Renseigne la position du tank piloté.
   *
   * L'angle de visée se recalcule à chaque pas depuis cette origine : sans ça,
   * un tank qui se déplace sous un pointeur immobile garderait un angle périmé.
   */
  setAimOrigin(x: number, y: number): void {
    this.#originX = x;
    this.#originY = y;
  }

  /**
   * Construit l'intention correspondant aux entrées depuis le dernier appel.
   *
   * Consomme le verrou d'appuis brefs : chaque pression est donc rapportée
   * exactement une fois au minimum, même si elle a été relâchée entre-temps.
   */
  sample(): InputCommand {
    const held = (action: GameAction): boolean =>
      this.#active.has(action) || this.#pressedSinceSample.has(action);

    // Les directions ne sont pas verrouillées : un déplacement est un état
    // maintenu, pas un évènement. Le verrouiller ferait avancer le tank d'un
    // pas fantôme après le relâchement.
    const moveX = (this.#active.has('right') ? 1 : 0) - (this.#active.has('left') ? 1 : 0);
    const moveY = (this.#active.has('down') ? 1 : 0) - (this.#active.has('up') ? 1 : 0);

    const command: InputCommand = {
      moveX,
      moveY,
      aim: Math.atan2(this.#aimY - this.#originY, this.#aimX - this.#originX),
      fire: held('fire'),
      mine: held('mine'),
    };

    this.#pressedSinceSample.clear();
    return command;
  }

  dispose(): void {
    for (const dispose of this.#disposers) dispose();
    this.#disposers.length = 0;
    this.#active.clear();
    this.#pressedSinceSample.clear();
  }

  /* ── Câblage ─────────────────────────────────────────────────────────── */

  #attach(): void {
    this.#listen(window, 'keydown', (event) => {
      const action = KEY_BINDINGS[(event as KeyboardEvent).code];
      if (!action) return;
      // Sinon la barre d'espace ferait défiler la page sous le jeu.
      event.preventDefault();
      this.#press(action);
    });

    this.#listen(window, 'keyup', (event) => {
      const action = KEY_BINDINGS[(event as KeyboardEvent).code];
      if (action) this.#active.delete(action);
    });

    // Perdre le focus pendant qu'une touche est enfoncée laisserait le tank
    // filer indéfiniment : on relâche tout.
    this.#listen(window, 'blur', () => this.#active.clear());

    this.#listen(this.#target, 'pointermove', (event) => {
      const { clientX, clientY } = event as PointerEvent;
      const world = this.#pointerToWorld(clientX, clientY);
      this.#aimX = world.x;
      this.#aimY = world.y;
    });

    this.#listen(this.#target, 'pointerdown', (event) => {
      const action = MOUSE_BINDINGS[(event as PointerEvent).button];
      if (action) this.#press(action);
    });

    // Sur `window` et non sur la cible : un bouton relâché en dehors du canevas
    // resterait sinon considéré comme enfoncé.
    this.#listen(window, 'pointerup', (event) => {
      const action = MOUSE_BINDINGS[(event as PointerEvent).button];
      if (action) this.#active.delete(action);
    });

    // Le clic droit sert à poser une mine : pas de menu contextuel.
    this.#listen(this.#target, 'contextmenu', (event) => event.preventDefault());
  }

  /** Enregistre une pression : état maintenu, et verrou pour l'échantillon à venir. */
  #press(action: GameAction): void {
    this.#active.add(action);
    this.#pressedSinceSample.add(action);
  }

  #listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.#disposers.push(() => target.removeEventListener(type, handler));
  }
}
