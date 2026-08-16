import { describe, expect, test } from 'bun:test';

import type { MissionOutcome } from '../src/core/systems/mission.js';
import {
  CAMPAIGN_LENGTH,
  CAMPAIGN_RULES,
  advanceCampaign,
  earnsBonusTank,
  startCampaign,
} from '../src/shared/campaign.js';
import type { CampaignSettings, CampaignState } from '../src/shared/campaign.js';
import { CampaignRunner } from '../src/shared/CampaignRunner.js';
import { killTank } from '../src/core/systems/damage.js';
import { loadMission } from '../src/shared/missions/load.js';
import { missionByNumber } from '../src/shared/missions/missions.js';

/**
 * La progression est un réducteur pur : c'est ce qui permettra au serveur (#13)
 * et au client de la calculer chacun de leur côté sans jamais diverger. Ces
 * tests vérifient donc aussi qu'elle ne mute rien.
 */

/**
 * Rejoue une suite d'issues depuis un état donné.
 *
 * La lambda plutôt que `reduce(advanceCampaign, …)` : le réducteur accepte
 * désormais des réglages en troisième paramètre, et `reduce` y passerait
 * l'indice de l'élément courant.
 */
function replay(
  state: CampaignState,
  outcomes: readonly MissionOutcome[],
  settings?: CampaignSettings,
): CampaignState {
  return outcomes.reduce((current, outcome) => advanceCampaign(current, outcome, settings), state);
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

describe('réglages de salon', () => {
  const NO_BONUS: CampaignSettings = { bonusEveryMissions: 0, respawnEnemiesOnRetry: true };
  const EVERY_TWO: CampaignSettings = { bonusEveryMissions: 2, respawnEnemiesOnRetry: true };

  test('une périodicité nulle supprime le tank offert', () => {
    // Et surtout : pas de modulo par zéro. C'est traité dans `earnsBonusTank`
    // plutôt que chez l'appelant, pour qu'aucun chemin ne puisse l'oublier.
    expect(earnsBonusTank(5, NO_BONUS)).toBe(false);
    expect(earnsBonusTank(10, NO_BONUS)).toBe(false);

    const after = replay(startCampaign(), ['cleared', 'cleared', 'cleared', 'cleared', 'cleared'], NO_BONUS);
    expect(after.spares).toBe(CAMPAIGN_RULES.startingSpares);
  });

  test('une périodicité personnalisée est respectée', () => {
    expect(earnsBonusTank(2, EVERY_TWO)).toBe(true);
    expect(earnsBonusTank(3, EVERY_TWO)).toBe(false);

    // Quatre missions franchies, donc les paliers 2 et 4 : deux tanks offerts.
    const after = replay(startCampaign(), ['cleared', 'cleared', 'cleared', 'cleared'], EVERY_TWO);
    expect(after.spares).toBe(CAMPAIGN_RULES.startingSpares + 2);
  });
});

describe('cycle de mission', () => {
  /** Fait avancer le runner jusqu'à ce que la condition tienne, ou échoue. */
  function advanceUntil(runner: CampaignRunner, done: () => boolean, limit = 2000): void {
    for (let step = 0; step < limit; step++) {
      if (done()) return;
      runner.step([]);
    }
    throw new Error('condition jamais atteinte');
  }

  /**
   * Runner prêt à jouer, annonce d'ouverture passée.
   *
   * Une partie commence par le briefing de sa première mission : sans le
   * traverser, un test qui attend « la phase briefing » se satisferait de
   * celle du départ au lieu de celle qui suit la victoire.
   */
  function startedRunner(): CampaignRunner {
    const runner = new CampaignRunner({ playerIds: ['a'] });
    advanceUntil(runner, () => runner.phase === 'playing');
    return runner;
  }

  test('une partie s\'ouvre sur l\'annonce de sa première mission', () => {
    const runner = new CampaignRunner({ playerIds: ['a'] });

    expect(runner.phase).toBe('briefing');
    expect(runner.campaign.mission).toBe(1);

    // Rien ne bouge tant que l'annonce dure : on ne tombe pas dans l'arène.
    const tickAvant = runner.world.tick;
    runner.step([]);
    expect(runner.world.tick).toBe(tickAvant);

    advanceUntil(runner, () => runner.phase === 'playing');
    runner.step([]);
    expect(runner.world.tick).toBeGreaterThan(tickAvant);
  });

  test('reprendre en pleine campagne s\'annonce aussi', () => {
    // Le cas qui motivait le correctif : démarrer à la mission 15 tombait
    // directement dans une arène de trois tanks violets.
    const runner = new CampaignRunner({ playerIds: ['a'], startingMission: 15 });
    expect(runner.phase).toBe('briefing');
    expect(runner.campaign.mission).toBe(15);
  });

  test('la simulation est figée dès qu\'une issue est prononcée', () => {
    const runner = startedRunner();
    for (const tank of runner.world.tanks) {
      if (tank.playerId === null) tank.alive = false;
    }

    runner.step([]);
    expect(runner.phase).toBe('ending');

    // Plus rien ne doit bouger : c'est ce qui empêche un obus encore en vol de
    // tuer le joueur après sa victoire.
    const tickAvant = runner.world.tick;
    runner.step([]);
    runner.step([]);
    expect(runner.world.tick).toBe(tickAvant);
  });

  test('mourir après avoir gagné ne fait pas rejouer la mission', () => {
    // Le défaut d'origine : le monde tournait pendant le temps mort, et
    // l'issue était relue à la fin. Un obus perdu transformait donc une
    // victoire en échec, et renvoyait sur la mission qu'on venait de finir.
    const runner = startedRunner();
    for (const tank of runner.world.tanks) {
      if (tank.playerId === null) tank.alive = false;
    }

    runner.step([]);
    expect(runner.phase).toBe('ending');

    // On tue le joueur pendant le temps mort, ce que le gel rend impossible en
    // jeu mais qu'on force ici pour verrouiller le comportement.
    for (const tank of runner.world.tanks) tank.alive = false;

    advanceUntil(runner, () => runner.phase === 'briefing');
    expect(runner.campaign.mission).toBe(2);
    expect(runner.campaign.attempt).toBe(1);
  });

  test('le briefing charge la mission suivante mais la garde figée', () => {
    const runner = startedRunner();
    for (const tank of runner.world.tanks) {
      if (tank.playerId === null) tank.alive = false;
    }

    advanceUntil(runner, () => runner.phase === 'briefing');

    // La mission annoncée est bien celle qui va démarrer, et ses ennemis sont
    // en place — c'est ce que l'écran d'annonce donne à lire.
    expect(runner.campaign.mission).toBe(2);
    expect(runner.world.tanks.some((tank) => tank.playerId === null)).toBe(true);

    const tickAvant = runner.world.tick;
    runner.step([]);
    expect(runner.world.tick).toBe(tickAvant);

    // Puis tout repart d'un coup.
    advanceUntil(runner, () => runner.phase === 'playing');
    runner.step([]);
    expect(runner.world.tick).toBeGreaterThan(tickAvant);
  });
});

describe('tableau des scores', () => {
  /** Fait avancer le runner jusqu'à ce que la condition tienne, ou échoue. */
  function advanceUntil(runner: CampaignRunner, done: () => boolean, limit = 2000): void {
    for (let step = 0; step < limit; step++) {
      if (done()) return;
      runner.step([]);
    }
    throw new Error('condition jamais atteinte');
  }

  function started(playerIds: string[]): CampaignRunner {
    const runner = new CampaignRunner({ playerIds });
    advanceUntil(runner, () => runner.phase === 'playing');
    return runner;
  }

  /** Abat tous les ennemis en les créditant au tank d'un joueur. */
  function wipeEnemies(runner: CampaignRunner, playerId: string): number {
    const killer = runner.tankOf(playerId)!;
    let killed = 0;

    for (const tank of runner.world.tanks) {
      if (tank.playerId !== null || !tank.alive) continue;
      killTank(runner.world, tank, killer.id);
      killed++;
    }

    return killed;
  }

  test('les prises survivent au changement de mission', () => {
    // Le compteur vit sur le tank, et le tank disparaît avec son monde. Sans le
    // repli opéré par le runner, le tableau repartirait de zéro à chaque
    // mission — c'est-à-dire qu'il ne servirait à rien.
    const runner = started(['a']);
    const first = wipeEnemies(runner, 'a');
    expect(first).toBeGreaterThan(0);
    expect(runner.scores.get('a')).toBe(first);

    advanceUntil(runner, () => runner.campaign.mission === 2);
    expect(runner.world.tanks.find((tank) => tank.playerId === 'a')!.kills).toBe(0);
    expect(runner.scores.get('a')).toBe(first);

    const second = wipeEnemies(runner, 'a');
    expect(runner.scores.get('a')).toBe(first + second);
  });

  test('un coéquipier qui arrive en cours de partie ne fait perdre le score de personne', () => {
    // L'arrivée libre reconstruit le monde pour donner un point de départ au
    // nouveau venu : tous les compteurs de tanks repartent à zéro au passage.
    const runner = started(['a']);
    const scored = wipeEnemies(runner, 'a');

    runner.addPlayer('b');

    expect(runner.scores.get('a')).toBe(scored);
    expect(runner.scores.get('b')).toBe(0);
  });

  test('ni le suicide ni le tir fratricide ne comptent', () => {
    const runner = started(['a', 'b']);
    const a = runner.tankOf('a')!;
    const b = runner.tankOf('b')!;

    killTank(runner.world, a, a.id);
    killTank(runner.world, b, a.id);

    expect(runner.scores.get('a')).toBe(0);
  });
});

describe('ennemis persistants d\'une tentative à l\'autre', () => {
  function advanceUntil(runner: CampaignRunner, done: () => boolean, limit = 2000): void {
    for (let step = 0; step < limit; step++) {
      if (done()) return;
      runner.step([]);
    }
    throw new Error('condition jamais atteinte');
  }

  /**
   * Runner sur la **mission 3**, et non la première.
   *
   * La mission 1 n'aligne qu'un seul brun : on ne peut pas y distinguer « les
   * abattus ne reviennent pas » de « l'arène est rechargée entière ».
   */
  function started(settings: CampaignSettings): CampaignRunner {
    const runner = new CampaignRunner({ playerIds: ['a'], startingMission: 3, settings });
    advanceUntil(runner, () => runner.phase === 'playing');
    return runner;
  }

  function enemies(runner: CampaignRunner): number {
    return runner.world.tanks.filter((tank) => tank.playerId === null && tank.alive).length;
  }

  /** Tue `count` ennemis, puis le joueur : la mission est perdue. */
  function loseAfterKilling(runner: CampaignRunner, count: number): void {
    let killed = 0;
    for (const tank of runner.world.tanks) {
      if (tank.playerId !== null || killed >= count) continue;
      tank.alive = false;
      killed++;
    }

    for (const tank of runner.world.tanks) {
      if (tank.playerId !== null) tank.alive = false;
    }
  }

  test('les ennemis abattus ne reviennent pas quand le réglage le demande', () => {
    const runner = started({ bonusEveryMissions: 5, respawnEnemiesOnRetry: false });
    const total = enemies(runner);
    expect(total).toBeGreaterThan(1);

    loseAfterKilling(runner, 1);
    advanceUntil(runner, () => runner.campaign.attempt === 2 && runner.phase === 'briefing');

    expect(runner.campaign.mission).toBe(3);
    expect(enemies(runner)).toBe(total - 1);
  });

  test('par défaut l\'arène est rechargée entière', () => {
    const runner = started({ bonusEveryMissions: 5, respawnEnemiesOnRetry: true });
    const total = enemies(runner);

    loseAfterKilling(runner, 1);
    advanceUntil(runner, () => runner.campaign.attempt === 2 && runner.phase === 'briefing');

    expect(enemies(runner)).toBe(total);
  });

  test('la mémoire ne franchit pas la mission', () => {
    // Elle ne vaut que pour les tentatives successives d'une même arène :
    // sinon le rang retenu désignerait un tout autre ennemi dans l'arène
    // suivante, et l'on verrait disparaître un tank au hasard.
    const runner = started({ bonusEveryMissions: 5, respawnEnemiesOnRetry: false });

    loseAfterKilling(runner, 1);
    advanceUntil(runner, () => runner.campaign.attempt === 2 && runner.phase === 'playing');

    // Cette fois on nettoie : on passe à la mission 2, à effectif plein.
    for (const tank of runner.world.tanks) {
      if (tank.playerId === null) tank.alive = false;
    }
    advanceUntil(runner, () => runner.campaign.mission === 4);

    const next = missionByNumber(4)!;
    const declared = loadMission(next, { playerIds: ['a'] }).enemyRankByTankId.size;
    expect(enemies(runner)).toBe(declared);
  });
});
