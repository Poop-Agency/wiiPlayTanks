import { describe, expect, test } from 'bun:test';

import type { MissionOutcome } from '../src/core/systems/mission.js';
import {
  CAMPAIGN_LENGTH,
  CAMPAIGN_RULES,
  advanceCampaign,
  earnsBonusTank,
  startCampaign,
} from '../src/shared/campaign.js';
import type { CampaignState } from '../src/shared/campaign.js';

/**
 * La progression est un réducteur pur : c'est ce qui permettra au serveur (#13)
 * et au client de la calculer chacun de leur côté sans jamais diverger. Ces
 * tests vérifient donc aussi qu'elle ne mute rien.
 */

/** Rejoue une suite d'issues depuis un état donné. */
function replay(state: CampaignState, outcomes: readonly MissionOutcome[]): CampaignState {
  return outcomes.reduce(advanceCampaign, state);
}

describe('départ de campagne', () => {
  test('on commence à la mission 1 avec la réserve complète', () => {
    const state = startCampaign();

    expect(state.mission).toBe(1);
    expect(state.spares).toBe(CAMPAIGN_RULES.startingSpares);
    expect(state.status).toBe('playing');
    expect(state.attempt).toBe(1);
  });

  test('on peut démarrer à une mission choisie', () => {
    expect(startCampaign(7).mission).toBe(7);
  });
});

describe('réussite', () => {
  test('elle fait passer à la mission suivante et remet le compteur d\'essais à zéro', () => {
    const state = advanceCampaign({ ...startCampaign(), attempt: 3 }, 'cleared');

    expect(state.mission).toBe(2);
    expect(state.attempt).toBe(1);
    expect(state.status).toBe('playing');
  });

  test('un tank est offert toutes les cinq missions', () => {
    const start = startCampaign();
    const afterFour = replay(start, Array<MissionOutcome>(4).fill('cleared'));
    const afterFive = advanceCampaign(afterFour, 'cleared');

    expect(afterFour.mission).toBe(5);
    expect(afterFour.spares).toBe(CAMPAIGN_RULES.startingSpares);

    expect(afterFive.mission).toBe(6);
    expect(afterFive.spares).toBe(CAMPAIGN_RULES.startingSpares + 1);
  });

  test('franchir la vingtième mission termine la campagne', () => {
    const state = replay(startCampaign(), Array<MissionOutcome>(CAMPAIGN_LENGTH).fill('cleared'));

    expect(state.status).toBe('victory');
    expect(state.mission).toBe(CAMPAIGN_LENGTH);
  });

  test('la victoire est un état terminal', () => {
    const won = replay(startCampaign(), Array<MissionOutcome>(CAMPAIGN_LENGTH).fill('cleared'));

    expect(advanceCampaign(won, 'cleared')).toBe(won);
    expect(advanceCampaign(won, 'failed')).toBe(won);
  });
});

describe('échec', () => {
  test('il consomme un tank et rejoue la même mission', () => {
    const state = advanceCampaign(startCampaign(3), 'failed');

    expect(state.mission).toBe(3);
    expect(state.spares).toBe(CAMPAIGN_RULES.startingSpares - 1);
    expect(state.attempt).toBe(2);
    expect(state.status).toBe('playing');
  });

  test('la réserve épuisée met fin à la partie', () => {
    const failures = Array<MissionOutcome>(CAMPAIGN_RULES.startingSpares + 1).fill('failed');
    const state = replay(startCampaign(4), failures);

    expect(state.status).toBe('gameOver');
    // La mission reste affichée : le joueur doit savoir où il s'est arrêté.
    expect(state.mission).toBe(4);
    expect(state.spares).toBe(0);
  });

  test('la fin de partie est un état terminal', () => {
    const failures = Array<MissionOutcome>(CAMPAIGN_RULES.startingSpares + 1).fill('failed');
    const over = replay(startCampaign(), failures);

    expect(advanceCampaign(over, 'cleared')).toBe(over);
  });

  test('les tanks offerts repoussent la fin de partie', () => {
    // Cinq missions franchies valent un tank de plus : on encaisse donc un
    // échec supplémentaire par rapport à une partie qui n'aurait rien gagné.
    const afterFive = replay(startCampaign(), Array<MissionOutcome>(5).fill('cleared'));
    const failures = Array<MissionOutcome>(CAMPAIGN_RULES.startingSpares + 1).fill('failed');

    expect(replay(afterFive, failures).status).toBe('playing');
    expect(advanceCampaign(replay(afterFive, failures), 'failed').status).toBe('gameOver');
  });
});

describe('invariants', () => {
  test('une issue « en cours » ne change rien', () => {
    const state = startCampaign(9);
    expect(advanceCampaign(state, 'playing')).toBe(state);
  });

  test('l\'état précédent n\'est jamais muté', () => {
    const before = startCampaign();
    const snapshot = { ...before };

    advanceCampaign(before, 'cleared');
    advanceCampaign(before, 'failed');

    expect(before).toEqual(snapshot);
  });

  test('le tank offert est annoncé aux bonnes missions', () => {
    expect(earnsBonusTank(5)).toBe(true);
    expect(earnsBonusTank(15)).toBe(true);
    expect(earnsBonusTank(6)).toBe(false);
    // Rien à offrir pour la dernière : la campagne s'arrête juste après.
    expect(earnsBonusTank(CAMPAIGN_LENGTH)).toBe(false);
  });
});
