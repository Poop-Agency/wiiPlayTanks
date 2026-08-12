/**
 * Déclenchement des sons à partir de ce qui est affiché.
 *
 * Même principe que les effets visuels, et pour la même raison : la simulation
 * n'émet aucun évènement, donc on déduit tout en comparant deux instantanés de
 * rendu successifs.
 *
 * Conséquence heureuse de ce choix : **on entend exactement ce qu'on voit**. En
 * co-op, les entités distantes sont affichées avec cent millisecondes de
 * retard ; leurs sons le sont aussi, puisqu'ils sortent du même instantané. Un
 * système d'évènements venu du serveur aurait, lui, fait entendre les tirs
 * avant de les montrer.
 */

import type { RenderSnapshot } from '../render/snapshots';
import type { Synth } from './synth';

/**
 * Sons simultanés autorisés pour un même évènement, par frame.
 *
 * Six tanks qui tirent au même pas produiraient six détonations superposées,
 * c'est-à-dire une saturation. Au-delà de cette limite on n'en joue plus : la
 * différence est inaudible, la saturation ne l'est pas.
 */
const MAX_SIMULTANEOUS = 3;

/**
 * Seuil d'urgence à partir duquel une mine se met à biper.
 *
 * En dessous, une mine posée depuis longtemps encombrerait la bande sonore sans
 * rien apprendre : c'est l'imminence qui doit s'entendre.
 */
const BEEP_FROM_URGENCY = 0.35;

export class SoundDirector {
  readonly #synth: Synth;
  #previous: RenderSnapshot | null = null;

  /** Voyants de mines déjà entendus, pour ne biper qu'aux bascules. */
  #beeping = new Map<number, boolean>();

  constructor(synth: Synth) {
    this.#synth = synth;
  }

  /** Oublie l'instantané précédent. À appeler au changement de mission. */
  reset(): void {
    this.#previous = null;
    this.#beeping.clear();
  }

  /** Compare l'instantané affiché au précédent et joue ce qui s'est produit. */
  update(view: RenderSnapshot): void {
    const before = this.#previous;
    this.#previous = view;

    // Changement de mission : les identifiants sont réattribués, et les
    // comparer produirait une salve de sons imaginaires.
    if (!before || view.tick < before.tick) {
      this.#beeping.clear();
      return;
    }

    this.#shells(before, view);
    this.#tanks(before, view);
    this.#minesAndBlasts(before, view);
  }

  /* ── Détections ───────────────────────────────────────────────────────── */

  #shells(before: RenderSnapshot, view: RenderSnapshot): void {
    const known = new Map(before.shells.map((shell) => [shell.id, shell]));

    let fired = 0;
    let ricochets = 0;

    for (const shell of view.shells) {
      const previous = known.get(shell.id);

      if (!previous) {
        if (fired++ < MAX_SIMULTANEOUS) {
          this.#synth.play(shell.kind === 'fast' ? 'shotFast' : 'shot');
        }
        continue;
      }

      if (shell.bouncesLeft < previous.bouncesLeft && ricochets++ < MAX_SIMULTANEOUS) {
        this.#synth.play('ricochet');
      }
    }
  }

  #tanks(before: RenderSnapshot, view: RenderSnapshot): void {
    const known = new Map(before.tanks.map((tank) => [tank.id, tank]));

    let destroyed = 0;
    for (const tank of view.tanks) {
      const previous = known.get(tank.id);
      if (previous?.alive === true && !tank.alive && destroyed++ < MAX_SIMULTANEOUS) {
        this.#synth.play('tankDestroyed');
      }
    }
  }

  #minesAndBlasts(before: RenderSnapshot, view: RenderSnapshot): void {
    const knownMines = new Set(before.mines.map((mine) => mine.id));
    const stillHere = new Set(view.mines.map((mine) => mine.id));

    let laid = 0;
    for (const mine of view.mines) {
      if (!knownMines.has(mine.id) && laid++ < MAX_SIMULTANEOUS) {
        this.#synth.play('mineLay');
      }

      // Le bip suit le voyant : il s'accélère avec la mèche, ce qui donne au
      // joueur la seule indication du temps qui lui reste.
      if (mine.urgency >= BEEP_FROM_URGENCY) {
        const wasOn = this.#beeping.get(mine.id) ?? false;
        if (mine.blinkOn && !wasOn) this.#synth.play('mineBeep');
        this.#beeping.set(mine.id, mine.blinkOn);
      }
    }

    for (const id of this.#beeping.keys()) {
      if (!stillHere.has(id)) this.#beeping.delete(id);
    }

    const knownBlasts = new Set(before.explosions.map((explosion) => explosion.id));
    let blasts = 0;
    for (const explosion of view.explosions) {
      if (!knownBlasts.has(explosion.id) && blasts++ < MAX_SIMULTANEOUS) {
        this.#synth.play('explosion');
      }
    }
  }
}
