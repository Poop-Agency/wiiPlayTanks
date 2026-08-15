/**
 * Progression de la campagne : mission courante, tanks de réserve, fin de partie.
 *
 * ─── Pourquoi ici et pas dans `core/` ───────────────────────────────────────
 *
 * `core/` fait avancer **un** monde. La campagne est une suite de mondes : elle
 * vit donc au-dessus, dans `shared/`, d'où le client solo et le serveur (#13)
 * peuvent tous deux l'utiliser. C'est un réducteur pur — aucun état caché,
 * aucune mutation — pour que la transition d'une mission à la suivante soit
 * exactement la même des deux côtés du réseau.
 *
 * ─── Provenance des règles ──────────────────────────────────────────────────
 *
 * `startingSpares` et `bonusEveryMissions` étaient écrits à l'estime :
 * l'ancienne version n'avait ni vies, ni progression, ni écran de fin. Le wiki
 * du jeu original les **confirme** tous les deux — « the player starts with 3
 * lives. Every five levels, an extra life is rewarded ». Ils ne sont donc plus
 * des suppositions.
 *
 * ⚠ Restent non tranchés :
 *
 *   · la règle de reprise après un échec — l'original rejoue la mission perdue,
 *     ce qui est reproduit ici, mais renvoie-t-il au début de la campagne quand
 *     la réserve est vide ?
 *   · le **verrou des vingt premières** : d'après le wiki, seules les missions
 *     1-20 sont accessibles au départ, et les cent ne s'ouvrent qu'une fois la
 *     vingtième franchie. Pas implémenté ici — la campagne enchaîne 1 → 100
 *     d'un trait.
 */

import { MISSIONS } from './missions/missions';
import type { MissionOutcome } from '@core/systems/mission';

/** Règles de progression. Voir l'avertissement en tête de fichier. */
export const CAMPAIGN_RULES = {
  /** Tanks en réserve au démarrage, en plus de celui qu'on pilote. */
  startingSpares: 3,
  /** Un tank offert toutes les N missions réussies. */
  bonusEveryMissions: 5,
} as const;

export type CampaignStatus =
  /** Une mission est en cours. */
  | 'playing'
  /** Les vingt missions sont franchies. */
  | 'victory'
  /** La réserve est épuisée. */
  | 'gameOver';

export interface CampaignState {
  /** Mission en cours, à partir de 1. */
  readonly mission: number;
  /** Tanks encore en réserve. Zéro signifie « celui-ci est le dernier ». */
  readonly spares: number;
  readonly status: CampaignStatus;
  /**
   * Tentatives déjà consommées sur la mission courante.
   *
   * Sert au HUD, et sortira du domaine du confort le jour où l'on voudra
   * assouplir une mission après plusieurs échecs.
   */
  readonly attempt: number;
}

/** Nombre total de missions de la campagne. */
export const CAMPAIGN_LENGTH = MISSIONS.length;

/** Départ d'une nouvelle campagne. */
export function startCampaign(mission = 1): CampaignState {
  return {
    mission,
    spares: CAMPAIGN_RULES.startingSpares,
    status: 'playing',
    attempt: 1,
  };
}

/**
 * Applique l'issue de la mission courante et rend l'état suivant.
 *
 * Appeler avec `'playing'` ne change rien : la campagne n'avance que sur une
 * issue tranchée, ce qui permet à l'appelant de transmettre le résultat brut de
 * `missionOutcome()` sans avoir à filtrer.
 */
export function advanceCampaign(
  state: CampaignState,
  outcome: MissionOutcome,
): CampaignState {
  if (state.status !== 'playing' || outcome === 'playing') return state;

  if (outcome === 'failed') {
    // Plus de réserve : la partie s'arrête sur cette mission, qui reste
    // affichée pour que le joueur sache où il a échoué.
    if (state.spares === 0) return { ...state, status: 'gameOver' };

    return { ...state, spares: state.spares - 1, attempt: state.attempt + 1 };
  }

  if (state.mission >= CAMPAIGN_LENGTH) return { ...state, status: 'victory' };

  const earnsBonus = state.mission % CAMPAIGN_RULES.bonusEveryMissions === 0;

  return {
    mission: state.mission + 1,
    spares: state.spares + (earnsBonus ? 1 : 0),
    status: 'playing',
    attempt: 1,
  };
}

/** La mission suivante offre-t-elle un tank ? Sert à l'annoncer dans le HUD. */
export function earnsBonusTank(mission: number): boolean {
  return mission % CAMPAIGN_RULES.bonusEveryMissions === 0 && mission < CAMPAIGN_LENGTH;
}
