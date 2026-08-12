/**
 * Lecture de la manette.
 *
 * ─── Pourquoi c'est le schéma le plus fidèle ────────────────────────────────
 *
 * Dans Tanks!, le stick du nunchuk déplace le tank pendant que le pointeur de
 * la Wiimote vise **indépendamment**. Le clavier-souris transpose bien cette
 * séparation, mais une manette à deux sticks la reproduit exactement : stick
 * gauche pour le châssis, stick droit pour la tourelle.
 *
 * ─── Ce que ce module ne fait pas ───────────────────────────────────────────
 *
 * Il ne produit pas d'`InputCommand`. Il rend une lecture brute, que
 * l'échantillonneur fusionne avec le clavier et la souris — sans quoi brancher
 * une manette désactiverait le clavier, et la débrancher figerait le tank sur
 * sa dernière intention.
 */

/** Lecture d'une manette à un instant donné. */
export interface GamepadReading {
  /** Déplacement, chaque composante dans [-1, 1]. */
  moveX: number;
  moveY: number;
  /** Angle de visée absolu, ou `null` si le stick droit est au repos. */
  aim: number | null;
  fire: boolean;
  mine: boolean;
}

const NEUTRAL: GamepadReading = { moveX: 0, moveY: 0, aim: null, fire: false, mine: false };

/**
 * Zone morte des sticks.
 *
 * Un stick analogique ne revient jamais exactement à zéro : sans ce seuil, le
 * tank dériverait en permanence et la tourelle tournerait toute seule.
 */
const DEADZONE = 0.25;

/** Seuil de déclenchement des gâchettes analogiques. */
const TRIGGER_THRESHOLD = 0.4;

/** Applique la zone morte à un axe. */
function axis(value: number | undefined): number {
  if (value === undefined || Math.abs(value) < DEADZONE) return 0;
  return value;
}

function pressed(pad: Gamepad, index: number): boolean {
  const button = pad.buttons[index];
  if (!button) return false;
  return button.pressed || button.value > TRIGGER_THRESHOLD;
}

/**
 * Lit la première manette connectée.
 *
 * Rend une lecture neutre si aucune n'est branchée. L'état des manettes n'est
 * pas évènementiel : il faut l'interroger à chaque échantillonnage.
 */
export function readGamepad(): GamepadReading {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return NEUTRAL;

  const pads = navigator.getGamepads();
  const pad = pads.find((candidate): candidate is Gamepad => candidate !== null && candidate.connected);
  if (!pad) return NEUTRAL;

  const moveX = axis(pad.axes[0]);
  const moveY = axis(pad.axes[1]);
  const aimX = axis(pad.axes[2]);
  const aimY = axis(pad.axes[3]);

  return {
    moveX,
    moveY,
    // Le stick droit donne une direction, pas une cible : l'angle s'en déduit
    // directement, sans passer par une position à l'écran comme le pointeur.
    aim: aimX === 0 && aimY === 0 ? null : Math.atan2(aimY, aimX),
    // Disposition standard : R2 et R1 tirent, X pose une mine — les deux index
    // du dessus tombent sous les doigts déjà posés sur les sticks.
    fire: pressed(pad, 7) || pressed(pad, 5) || pressed(pad, 0),
    mine: pressed(pad, 6) || pressed(pad, 4) || pressed(pad, 2),
  };
}

/** Une manette est-elle branchée ? Sert à l'afficher dans l'aide des commandes. */
export function hasGamepad(): boolean {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return false;
  return navigator.getGamepads().some((pad) => pad !== null && pad.connected);
}
