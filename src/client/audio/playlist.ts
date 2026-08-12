/**
 * Correspondance mission → morceau.
 *
 * ─── La règle ───────────────────────────────────────────────────────────────
 *
 * Une mission prend la musique de **son ennemi le plus redoutable**. C'est ce
 * qui donne son caractère à un round : une arène de six tanks verts et une
 * arène d'un seul brun n'ont rien à voir, et c'est le plus haut de la liste
 * qui décide de l'ambiance. La mesure de dangerosité vit dans
 * `shared/missions/composition.ts` — l'ordre d'apparition dans la campagne.
 *
 * Quand une couleur revient sur plusieurs missions, ses variantes tournent :
 * trois missions de suite sur le même morceau s'entendraient comme un bug.
 * La rotation est déterministe (rang d'apparition modulo nombre de variantes),
 * donc deux lancements de la campagne jouent la même chose.
 *
 * ─── Les fichiers ───────────────────────────────────────────────────────────
 *
 * Aucun n'est fourni avec le dépôt : voir `public/musique/README.md`. Les noms
 * ci-dessous sont ceux attendus dans `public/musique/`. Un fichier absent n'est
 * pas une erreur — la mission se joue en silence.
 *
 * Les noms comportent espaces et caractères spéciaux : ils sont encodés au
 * moment de construire l'URL, jamais écrits en dur encodés ici.
 */

import type { TankColor } from '@core/state';
import { CAMPAIGN_LENGTH } from '@shared/campaign';
import { dominantEnemy } from '@shared/missions/composition';

/** Dossier servi tel quel à la racine du site. */
const MUSIC_DIR = '/musique';

/**
 * Variantes disponibles par couleur, dans l'ordre de rotation.
 *
 * Le tank noir a sa musique mais n'apparaît dans aucune des vingt missions :
 * elle est listée pour rester complète, et ne sera jamais choisie.
 */
const TRACKS_BY_COLOR: Partial<Record<TankColor, readonly string[]>> = {
  brown: ['Wii Play Tanks! Music - Brown Tank.mp3'],
  ash: [
    'Wii Play Tanks! Music - Grey⧸Ash Tank (Variant 1).mp3',
    'Wii Play Tanks! Music - Grey⧸Ash Tank (Variant 2).mp3',
  ],
  teal: [
    'Wii Play Tanks! Music - Teal⧸Marine Tank (Variant 1).mp3',
    'Wii Play Tanks! Music - Teal⧸Marine Tank (Variant 2).mp3',
  ],
  yellow: [
    'Wii Play Tanks! Music - Yellow Tank (Variant 1).mp3',
    'Wii Play Tanks! Music - Yellow Tank (Variant 2).mp3',
    'Wii Play Tanks! Music - Yellow Tank (Variant 3).mp3',
  ],
  pink: [
    'Wii Play Tanks! Music - Red⧸Pink Tank (Variant 1).mp3',
    'Wii Play Tanks! Music - Red⧸Pink Tank (Variant 2).mp3',
    'Wii Play Tanks! Music - Red⧸Pink Tank (Variant 3).mp3',
  ],
  green: [
    'Wii Play Tanks! Music - Green Tank (Variant 1).mp3',
    'Wii Play Tanks! Music - Green Tank (Variant 2).mp3',
    'Wii Play Tanks! Music - Green Tank (Variant 3).mp3',
    'Wii Play Tanks! Music - Green Tank (Variant 4).mp3',
  ],
  purple: [
    'Wii Play Tanks! Music - Purple⧸Violet Tank (Variant 1).mp3',
    'Wii Play Tanks! Music - Purple⧸Violet Tank (Variant 2).mp3',
    'Wii Play Tanks! Music - Purple⧸Violet Tank (Variant 3).mp3',
  ],
  white: [
    'Wii Play Tanks! Music - White Tank (Variant 1) {REUPLOAD}.mp3',
    'Wii Play Tanks! Music - White Tank (Variant 2) {REUPLOAD}.mp3',
    'Wii Play Tanks! Music - White Tank (Variant 3).mp3',
  ],
  black: ['Wii Play Tanks! Music - Black Tank.mp3'],
};

/** Courts morceaux joués aux transitions. */
const JINGLES = {
  /** Mission réussie. */
  cleared: 'Wii Play - Tanks - Round End [Wii Play OST].mp3',
  /** Mission perdue. */
  failed: 'Wii Play - Tanks - Round Failed [Wii Play OST].mp3',
  /** Entre deux missions, pendant le récap des ennemis à venir. */
  interlude: 'Wii Play - Tanks - Start [Wii Play OST].mp3',
} as const;

export type JingleName = keyof typeof JINGLES;

/** URL d'un fichier du dossier musique, correctement encodée. */
export function musicUrl(fileName: string): string {
  return `${MUSIC_DIR}/${encodeURIComponent(fileName)}`;
}

export function jingleUrl(name: JingleName): string {
  return musicUrl(JINGLES[name]);
}

/**
 * Rang d'une mission parmi celles qui partagent sa couleur dominante.
 *
 * Sert à faire tourner les variantes. Calculé en parcourant la campagne depuis
 * le début plutôt que stocké : la table resterait à mettre à jour à chaque
 * retouche d'arène, et se tromperait en silence.
 */
function occurrenceOfDominant(mission: number): number {
  const color = dominantEnemy(mission);
  if (color === undefined) return 0;

  let rank = 0;
  for (let earlier = 1; earlier < mission; earlier++) {
    if (dominantEnemy(earlier) === color) rank++;
  }
  return rank;
}

/**
 * Morceau d'une mission, ou `undefined` si aucune musique ne lui correspond
 * — mission sans ennemi, ou couleur sans piste déclarée.
 */
export function trackUrlForMission(mission: number): string | undefined {
  if (!Number.isInteger(mission) || mission < 1 || mission > CAMPAIGN_LENGTH) return undefined;

  const color = dominantEnemy(mission);
  if (color === undefined) return undefined;

  const variants = TRACKS_BY_COLOR[color];
  if (!variants || variants.length === 0) return undefined;

  const file = variants[occurrenceOfDominant(mission) % variants.length];
  return file === undefined ? undefined : musicUrl(file);
}
