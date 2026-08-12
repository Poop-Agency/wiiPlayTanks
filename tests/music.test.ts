import { describe, expect, test } from 'bun:test';

import { jingleUrl, musicUrl, trackUrlForMission } from '../src/client/audio/playlist.js';
import { CAMPAIGN_LENGTH } from '../src/shared/campaign.js';
import { dominantEnemy, enemyComposition, threatRank } from '../src/shared/missions/composition.js';

/**
 * Le choix du morceau est une fonction pure de la mission : c'est tout ce qui
 * est testable hors navigateur, le reste pilotant des `HTMLAudioElement`.
 */
describe('composition des missions', () => {
  test('les ennemis sont classés du plus dangereux au moins dangereux', () => {
    // Mission 18, la plus mêlée : violet, sarcelle, vert et rose.
    const groupes = enemyComposition(18);
    const rangs = groupes.map((groupe) => threatRank(groupe.color));

    expect(rangs.length).toBeGreaterThan(1);
    expect([...rangs].sort((a, b) => b - a)).toEqual(rangs);
  });

  test('l\'effectif correspond à la grille', () => {
    // La mission 17 aligne six tanks verts, la 19 huit violets.
    expect(enemyComposition(17)).toEqual([{ color: 'green', count: 6 }]);
    expect(enemyComposition(19)).toEqual([{ color: 'purple', count: 8 }]);
  });

  test('chaque mission de la campagne a un ennemi dominant', () => {
    for (let mission = 1; mission <= CAMPAIGN_LENGTH; mission++) {
      expect(dominantEnemy(mission)).toBeDefined();
    }
  });

  test('la composition ne change pas d\'un appel à l\'autre', () => {
    // Le résultat est mémoïsé : un appelant qui le modifierait empoisonnerait
    // le cache pour tout le monde.
    expect(enemyComposition(12)).toEqual(enemyComposition(12));
  });
});

describe('choix du morceau', () => {
  test('toute la campagne a une musique', () => {
    for (let mission = 1; mission <= CAMPAIGN_LENGTH; mission++) {
      expect(trackUrlForMission(mission)).toBeDefined();
    }
  });

  test('la musique suit l\'ennemi le plus redoutable, pas le plus nombreux', () => {
    // Mission 16 : trois violets et deux verts. Le violet est plus haut dans
    // l'ordre de menace, c'est donc lui qui donne le ton — alors qu'un choix
    // par effectif aurait retenu le violet aussi ; la mission 18 tranche, elle
    // n'a qu'un seul violet contre deux sarcelles.
    expect(dominantEnemy(16)).toBe('purple');
    expect(dominantEnemy(18)).toBe('purple');
    expect(trackUrlForMission(16)).toContain('Purple');
    expect(trackUrlForMission(18)).toContain('Purple');
  });

  test('la première mission est celle du tank brun', () => {
    expect(trackUrlForMission(1)).toContain('Brown');
  });

  test('les missions consécutives d\'une même couleur changent de variante', () => {
    // Missions 2, 3 et 4 sont toutes dominées par le tank cendre, qui n'a que
    // deux variantes : la rotation doit alterner, pas répéter.
    const [deux, trois, quatre] = [2, 3, 4].map(trackUrlForMission);

    expect(deux).not.toBe(trois);
    expect(trois).not.toBe(quatre);
    // Deux variantes seulement : la troisième reprend la première.
    expect(quatre).toBe(deux);
  });

  test('hors campagne, aucun morceau', () => {
    expect(trackUrlForMission(0)).toBeUndefined();
    expect(trackUrlForMission(CAMPAIGN_LENGTH + 1)).toBeUndefined();
    expect(trackUrlForMission(1.5)).toBeUndefined();
  });

  test('le choix est stable d\'un lancement à l\'autre', () => {
    const premier = Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => trackUrlForMission(i + 1));
    const second = Array.from({ length: CAMPAIGN_LENGTH }, (_, i) => trackUrlForMission(i + 1));
    expect(second).toEqual(premier);
  });
});

describe('URL', () => {
  test('les noms de fichiers sont encodés', () => {
    // Espaces et caractères spéciaux abondent dans ces noms : non encodés, la
    // requête n'atteindrait jamais le fichier.
    const url = musicUrl('Un titre (Variante 1).mp3');
    expect(url).toBe('/musique/Un%20titre%20(Variante%201).mp3');
    expect(url).not.toContain(' ');
  });

  test('les trois jingles ont une URL', () => {
    for (const name of ['cleared', 'failed', 'interlude'] as const) {
      expect(jingleUrl(name)).toStartWith('/musique/');
    }
  });
});
