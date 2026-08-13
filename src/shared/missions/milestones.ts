/**
 * Missions jalons : les huit scènes fixes de la campagne à 100 missions.
 *
 * D'après la recherche sur le vrai jeu (voir `docs/provenance.md`), les
 * missions 30, 40, 50, 60, 70, 80, 90 et 100 sont les seules, au-delà de la
 * vingtième, à ne pas être un remixage — des scènes délibérément plus
 * difficiles, l'équivalent de « paliers ». La mission 50 y introduit le tank
 * noir, jamais vu avant dans la campagne.
 *
 * Ces huit tracés sont écrits ici selon les deux mêmes règles que les
 * missions 3-20 (voir l'en-tête de `missions.ts`) : terrain ouvert à
 * couverts épars, aucun ennemi à moins de 8 tuiles du départ. Ils partagent
 * volontairement un même squelette de murs — seule la composition change —
 * ce qui limite la surface d'erreur géométrique sur huit arènes écrites d'un
 * coup ; `tests/missions.test.ts` vérifie chacune indépendamment.
 *
 * ⚠ Les effectifs précis (qui, combien, à quel palier) sont un réglage à
 * l'œil ancré sur les repères de la recherche, pas une donnée mesurée — même
 * statut que `CAMPAIGN_RULES` dans `campaign.ts`. Progression retenue,
 * `k` = noir : 0, 0, 1, 2, 3, 3, 4, 5.
 */

import type { Mission } from './missions';

export const MILESTONE_MISSIONS: readonly Mission[] = [
  {
    id: 30,
    name: 'Palier 30',
    // 4 ennemis : blanc x2, violet x1, vert x1 — l'escalade après le
    // « blanc, blanc » de la mission 20.
    grid: `
##################
#................#
#....####.w......#
#..............w.#
#................#
#..........XXXX..#
#.........p......#
#..............g.#
#................#
#..1.............#
#................#
#................#
#....####........#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 40,
    name: 'Palier 40',
    // 5 ennemis : blanc x3, violet x2 — toujours pas de noir.
    grid: `
##################
#................#
#....####.w......#
#..............w.#
#................#
#..........XXXX..#
#.........w......#
#..............p.#
#................#
#..1......p......#
#................#
#................#
#....####........#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 50,
    name: 'Palier 50 — le noir entre en scène',
    // 5 ennemis : noir x1, blanc x2, violet x2 — première apparition du noir.
    grid: `
##################
#................#
#....####.k......#
#..............w.#
#................#
#..........XXXX..#
#.........w......#
#..............p.#
#................#
#..1......p......#
#................#
#................#
#....####........#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 60,
    name: 'Palier 60',
    // 6 ennemis : noir x2, blanc x2, violet x2.
    grid: `
##################
#................#
#....####.k......#
#..............k.#
#................#
#..........XXXX..#
#.........w......#
#..............w.#
#................#
#..1......p....p.#
#................#
#................#
#....####........#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 70,
    name: 'Palier 70',
    // 6 ennemis : noir x3, blanc x2, violet x1.
    grid: `
##################
#................#
#....####.k......#
#..............k.#
#................#
#..........XXXX..#
#.........k......#
#..............w.#
#................#
#..1......w....p.#
#................#
#................#
#....####........#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 80,
    name: 'Palier 80',
    // 7 ennemis : noir x3, blanc x2, violet x2.
    grid: `
##################
#................#
#....####.k......#
#..............k.#
#................#
#..........XXXX..#
#.........k......#
#..............w.#
#................#
#..1......w....p.#
#................#
#.........p......#
#....####........#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 90,
    name: 'Palier 90',
    // 8 ennemis : noir x4, blanc x2, violet x2.
    grid: `
##################
#................#
#....####.k......#
#..............k.#
#................#
#..........XXXX..#
#.........k......#
#..............k.#
#................#
#..1......w....w.#
#................#
#.........p......#
#....####......p.#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
  {
    id: 100,
    name: 'Palier 100 — le dernier round',
    // 8 ennemis : noir x5, blanc x2, violet x1 — l'effectif le plus lourd de
    // la campagne.
    grid: `
##################
#................#
#....####.k......#
#..............k.#
#................#
#..........XXXX..#
#.........k......#
#..............k.#
#................#
#..1......k....w.#
#................#
#.........w......#
#....####......p.#
#................#
#..........XXXX..#
#................#
#................#
##################
`,
  },
];
