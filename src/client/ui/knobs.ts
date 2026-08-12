/**
 * Description des réglages exposés par le panneau de calibration.
 *
 * Séparé du panneau lui-même parce que ce sont deux choses différentes : ici on
 * dit **quoi** régler et dans quelles bornes, là-bas on dit **comment**
 * l'afficher. Ajouter un réglage se fait donc en ajoutant une ligne à une
 * liste, sans toucher au code d'interface.
 *
 * Chaque réglage lit et écrit directement dans `TUNING` ou `TANK_PROFILES` :
 * il n'existe pas de copie intermédiaire à synchroniser, et une valeur modifiée
 * prend effet au pas de simulation suivant.
 */

import type { TankColor } from '@core/state';
import { REFERENCE_MEASUREMENTS, TILE_SIZE_PX, TUNING } from '@core/tuning';
import { TANK_PROFILES } from '@core/systems/ai/profiles';

/** Un réglage réglable, avec ses bornes d'affichage. */
export interface Knob {
  label: string;
  /** Unité affichée à côté de la valeur. Vide pour un nombre pur. */
  unit: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(value: number): void;
  /** Précision d'affichage, en décimales. */
  decimals: number;
  /** Explication, affichée en info-bulle. */
  hint?: string;
}

/** Un groupe de réglages affiché ensemble. */
export interface KnobGroup {
  title: string;
  note?: string;
  knobs: Knob[];
}

/* ── Fabriques ─────────────────────────────────────────────────────────── */

/** Clés d'un objet dont la valeur est un nombre. */
type NumericKeys<T> = {
  [K in keyof T]-?: T[K] extends number ? K : never;
}[keyof T];

/**
 * Réglage portant sur un champ numérique d'un objet.
 *
 * Le passage par une clé plutôt que par deux fermetures évite de répéter
 * `get: () => x.y, set: (v) => { x.y = v; }` une quarantaine de fois — et donc
 * d'écrire un jour un `get` qui ne lit pas le champ que son `set` écrit.
 */
function field<T extends object, K extends NumericKeys<T> & keyof T>(
  target: T,
  key: K,
  options: Omit<Knob, 'get' | 'set' | 'decimals'> & { decimals?: number },
): Knob {
  // `NumericKeys` garantit déjà que le champ est un nombre ; le compilateur, lui,
  // ne sait pas le propager jusqu'à l'affectation.
  const numeric = target as Record<K, number>;

  return {
    ...options,
    decimals: options.decimals ?? 2,
    get: () => numeric[key],
    set: (value) => {
      numeric[key] = value;
    },
  };
}

/* ── Réglages globaux ──────────────────────────────────────────────────── */

/**
 * Vitesse réglée en **secondes de traversée d'arène**, et non en tuiles par
 * seconde.
 *
 * C'est la grandeur qu'on sait mesurer sur l'original, chronomètre en main : le
 * curseur s'ajuste donc dans la même unité que le relevé auquel on le compare.
 */
function crossingKnob(
  label: string,
  read: () => number,
  write: (tilesPerSecond: number) => void,
  hint: string,
): Knob {
  const widthTiles = REFERENCE_MEASUREMENTS.arenaWidthPx / TILE_SIZE_PX;

  return {
    label,
    unit: 's',
    min: 1,
    max: 20,
    step: 0.1,
    decimals: 2,
    hint,
    get: () => widthTiles / read(),
    set: (seconds) => write(widthTiles / seconds),
  };
}

export function globalGroups(): KnobGroup[] {
  return [
    {
      title: 'Tank du joueur',
      note: 'Les temps de traversée sont les grandeurs réellement mesurées sur l’original.',
      knobs: [
        crossingKnob(
          'Traversée de l’arène',
          () => TUNING.tank.speedTilesPerSecond,
          (value) => {
            TUNING.tank.speedTilesPerSecond = value;
          },
          `Relevé : ${REFERENCE_MEASUREMENTS.tankCrossingSeconds} s pour ${REFERENCE_MEASUREMENTS.arenaWidthPx} px.`,
        ),
        field(TUNING.tank, 'turnRateRadiansPerSecond', {
          label: 'Rotation du châssis',
          unit: 'rad/s',
          min: 1,
          max: 30,
          step: 0.1,
          hint: 'Purement visuel : la boîte de collision ne tourne pas.',
        }),
        field(TUNING.tank, 'sizeTiles', {
          label: 'Taille du châssis',
          unit: 'tuiles',
          min: 0.4,
          max: 1.2,
          step: 0.01,
          hint: 'Côté de la boîte de collision. 25 px sur l’arène de référence.',
        }),
        field(TUNING.tank, 'maxActiveShells', {
          label: 'Obus simultanés',
          unit: '',
          min: 1,
          max: 10,
          step: 1,
          decimals: 0,
        }),
        field(TUNING.tank, 'maxActiveMines', {
          label: 'Mines simultanées',
          unit: '',
          min: 0,
          max: 6,
          step: 1,
          decimals: 0,
        }),
      ],
    },
    {
      title: 'Obus',
      knobs: [
        crossingKnob(
          'Traversée — obus normal',
          () => TUNING.shell.normalSpeedTilesPerSecond,
          (value) => {
            TUNING.shell.normalSpeedTilesPerSecond = value;
          },
          `Relevé : ${REFERENCE_MEASUREMENTS.shellCrossingSeconds} s pour ${REFERENCE_MEASUREMENTS.arenaWidthPx} px.`,
        ),
        crossingKnob(
          'Traversée — missile',
          () => TUNING.shell.fastSpeedTilesPerSecond,
          (value) => {
            TUNING.shell.fastSpeedTilesPerSecond = value;
          },
          'Relevé : exactement deux fois plus rapide qu’un obus normal.',
        ),
        field(TUNING.shell, 'radiusTiles', {
          label: 'Rayon',
          unit: 'tuiles',
          min: 0.02,
          max: 0.4,
          step: 0.01,
        }),
        field(TUNING.shell, 'cooldownSeconds', {
          label: 'Délai entre deux tirs',
          unit: 's',
          min: 0,
          max: 2,
          step: 0.05,
        }),
        field(TUNING.shell, 'muzzleOffsetFactor', {
          label: 'Sortie de canon',
          unit: '×',
          min: 0.3,
          max: 1.2,
          step: 0.05,
          hint: 'En fraction de la taille du tank. Trop court, l’obus naît dans le châssis ; trop long, il franchit les murs minces.',
        }),
      ],
    },
    {
      title: 'Mines',
      note: '⚠ Aucune de ces valeurs n’est mesurée — les mines n’existaient pas dans l’ancienne version.',
      knobs: [
        field(TUNING.mine, 'fuseSeconds', {
          label: 'Mèche',
          unit: 's',
          min: 0.5,
          max: 10,
          step: 0.1,
        }),
        field(TUNING.mine, 'blastRadiusTiles', {
          label: 'Rayon du souffle',
          unit: 'tuiles',
          min: 0.5,
          max: 6,
          step: 0.1,
        }),
        field(TUNING.mine, 'blastDurationSeconds', {
          label: 'Durée de l’explosion',
          unit: 's',
          min: 0.1,
          max: 2,
          step: 0.05,
        }),
        field(TUNING.mine, 'cooldownSeconds', {
          label: 'Délai entre deux poses',
          unit: 's',
          min: 0,
          max: 5,
          step: 0.1,
        }),
        field(TUNING.mine, 'radiusTiles', {
          label: 'Rayon de collision',
          unit: 'tuiles',
          min: 0.1,
          max: 1,
          step: 0.05,
        }),
      ],
    },
    {
      title: 'IA — commun à toutes les couleurs',
      knobs: [
        field(TUNING.ai, 'aimToleranceRadians', {
          label: 'Tolérance de visée',
          unit: 'rad',
          min: 0.01,
          max: 0.5,
          step: 0.01,
          hint: 'Trop serré, la tourelle oscille sans tirer.',
        }),
        field(TUNING.ai, 'evasionHorizonSeconds', {
          label: 'Anticipation d’esquive',
          unit: 's',
          min: 0,
          max: 3,
          step: 0.1,
        }),
        field(TUNING.ai, 'roamMinSeconds', {
          label: 'Patrouille — durée min.',
          unit: 's',
          min: 0.1,
          max: 5,
          step: 0.1,
        }),
        field(TUNING.ai, 'roamMaxSeconds', {
          label: 'Patrouille — durée max.',
          unit: 's',
          min: 0.1,
          max: 10,
          step: 0.1,
        }),
      ],
    },
  ];
}

/* ── Réglages d'une couleur ────────────────────────────────────────────── */

/**
 * Réglages du profil d'une couleur.
 *
 * Les champs non finis — la tourelle instantanée et la portée illimitée du
 * joueur — sont volontairement absents : un curseur ne peut pas représenter
 * l'infini, et le remplacer par une grande valeur finie changerait le
 * comportement en douce.
 */
export function profileGroup(color: TankColor): KnobGroup {
  const profile = TANK_PROFILES[color];

  const knobs: Knob[] = [
    field(profile, 'speedMultiplier', {
      label: 'Vitesse',
      unit: '× joueur',
      min: 0,
      max: 3,
      step: 0.1,
    }),
    field(profile, 'maxActiveShells', {
      label: 'Obus simultanés',
      unit: '',
      min: 1,
      max: 10,
      step: 1,
      decimals: 0,
    }),
    field(profile, 'shellBounces', {
      label: 'Rebonds par obus',
      unit: '',
      min: 0,
      max: 4,
      step: 1,
      decimals: 0,
    }),
    field(profile, 'maxActiveMines', {
      label: 'Mines simultanées',
      unit: '',
      min: 0,
      max: 6,
      step: 1,
      decimals: 0,
    }),
    field(profile, 'fireIntervalSeconds', {
      label: 'Cadence de tir',
      unit: 's',
      min: 0,
      max: 8,
      step: 0.1,
    }),
    field(profile, 'fireIntervalJitterSeconds', {
      label: 'Irrégularité de cadence',
      unit: 's',
      min: 0,
      max: 8,
      step: 0.1,
    }),
    field(profile, 'aimErrorRadians', {
      label: 'Cône d’erreur',
      unit: 'rad',
      min: 0,
      max: 1.5,
      step: 0.01,
    }),
    field(profile, 'plannedBounces', {
      label: 'Rebonds envisagés',
      unit: '',
      min: 0,
      max: 3,
      step: 1,
      decimals: 0,
      hint: 'Nombre de rebonds que l’IA explore en cherchant un angle de tir.',
    }),
    field(profile, 'preferredRangeTiles', {
      label: 'Distance recherchée',
      unit: 'tuiles',
      min: 0,
      max: 15,
      step: 0.5,
    }),
  ];

  // Ajoutés seulement s'ils sont représentables — voir la note ci-dessus.
  if (Number.isFinite(profile.turretRateRadiansPerSecond)) {
    knobs.splice(
      1,
      0,
      field(profile, 'turretRateRadiansPerSecond', {
        label: 'Rotation de tourelle',
        unit: 'rad/s',
        min: 0.1,
        max: 6,
        step: 0.05,
      }),
    );
  }

  if (Number.isFinite(profile.detectionRangeTiles)) {
    knobs.push(
      field(profile, 'detectionRangeTiles', {
        label: 'Portée de détection',
        unit: 'tuiles',
        min: 1,
        max: 30,
        step: 0.5,
      }),
    );
  }

  return {
    title: `Profil — ${color}`,
    ...(color === 'player'
      ? { note: 'Tourelle instantanée et portée illimitée : non réglables.' }
      : {}),
    knobs,
  };
}
