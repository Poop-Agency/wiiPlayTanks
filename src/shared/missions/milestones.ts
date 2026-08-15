/**
 * Missions jalons : les huit scènes fixes de la campagne à 100 missions.
 *
 * D'après la recherche sur le vrai jeu (voir `docs/provenance.md`), les
 * missions 30, 40, 50, 60, 70, 80, 90 et 100 sont les seules, au-delà de la
 * vingtième, à ne pas être un remixage — des scènes délibérément plus
 * difficiles, l'équivalent de « paliers ». La mission 50 y introduit le tank
 * noir, jamais vu avant dans la campagne.
 *
 * **Quatre d'entre eux sont maintenant relevés sur capture du vrai jeu** :
 * 30, 50, 90 et 100. Le constat le plus utile qu'ils apportent, c'est que les
 * paliers ne sont pas des arènes neuves — **ils rejouent un tracé des vingt
 * premières missions en changeant l'effectif** : le 50 est la mission 5, le 90
 * la mission 4, le 100 la mission 1. Les quatre paliers encore inconnus
 * (40, 60, 70, 80) suivent probablement la même règle ; en attendant leurs
 * captures, ils gardent leur tracé écrit pour cette refonte.
 *
 * Second constat, qui a coûté un test : **l'effectif ne mesure pas la
 * difficulté**. Le palier 50 n'aligne que deux tanks noirs sur un terrain nu,
 * là où le 40 en compte cinq. `tests/missions.test.ts` vérifiait la monotonie
 * des effectifs ; c'était une règle inventée faute de données, elle est tombée.
 *
 * Les tracés encore écrits à la main suivent les deux règles des missions 3-20
 * (voir l'en-tête de `missions.ts`) : terrain ouvert à couverts épars, aucun
 * ennemi à portée immédiate du départ. Les tracés transcrits en sont dispensés,
 * comme les missions 3-20 transcrites — voir `TRANSCRIBED_MISSION_IDS`.
 *
 * ⚠ Les effectifs des quatre paliers non relevés restent un réglage à l'œil,
 * même statut que `CAMPAIGN_RULES` dans `campaign.ts`.
 */

import type { Mission } from './missions';

export const MILESTONE_MISSIONS: readonly Mission[] = [
  {
    id: 30,
    name: 'Palier 30',
    // Relevé sur capture du vrai jeu — le premier palier dont on ait une image.
    //
    // Deux longs murs verticaux encadrent une allée centrale, chacun terminé en
    // pied par une barre de trois blocs. De part et d'autre, deux champs de
    // trous de trois sur trois : ils ne bloquent pas les obus, seulement les
    // châssis, ce qui découpe le plateau pour les tanks sans rien fermer aux
    // tirs. Quelques blocs de liège ponctuent les bords.
    //
    // 5 ennemis : blanc x2, violet x2, vert x1 — l'escalade après le
    // « blanc, blanc » de la mission 20.
    grid: `
##################
#................#
#.......w........#
#............g...#
#................#
#XX.........XX...#
#...p........w...#
#.....#....#.....#
#..HHH#....#HHH..#
#..HHH#....#HHH..#
#..HHH#....#HHH..#
#.....#....#.....#
#.....#....#.....#
#....###...###...#
#................#
#..1...........p.#
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
    // Relevé sur capture du vrai jeu : **c'est le tracé de la mission 5**, à
    // l'identique, avec deux tanks noirs à la place des deux sarcelles.
    //
    // 2 ennemis seulement, et c'est le palier le plus dur rencontré jusque-là :
    // le terrain est nu, le noir tire vite et sans rebond, et les trois blocs
    // de liège sont le seul couvert du plateau.
    grid: `
##################
#................#
#...........k....#
#................#
#...........X....#
#...........#X...#
#................#
#................#
#................#
#..............k.#
#................#
#................#
#................#
#...X#...........#
#....X...........#
#..1.............#
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
    // Relevé sur capture du vrai jeu : **c'est le tracé de la mission 4**, le
    // damier de trous, à l'identique — mais peuplé de sept tanks cendre au lieu
    // de quatre adversaires mélangés.
    //
    // Un seul type d'ennemi, en nombre, et un terrain qui n'offre aucun couvert
    // aux obus : la difficulté vient entièrement du fait que les trous coupent
    // les fuites, jamais les lignes de tir. Chaque case du damier reçoit sa
    // garnison.
    grid: `
##################
#.....H....H.....#
#.....H....H.....#
#..a..H..a.H.a...#
#.....H....H.....#
#.....H..........#
#HHHH.H.HHHHHHHHH#
#.....H..........#
#.....H....H.....#
#..a..H.a..H.a...#
#.....H....H.....#
#..........H.....#
#HHHHHHHHH.H.HHHH#
#..........H.....#
#.....H....H.....#
#..1..H.a..H.a...#
#.....H....H.....#
##################
`,
  },
  {
    id: 100,
    name: 'Palier 100 — le dernier round',
    // Relevé sur capture du vrai jeu : **c'est le tracé de la mission 1**, les
    // deux colonnes, à l'identique — la campagne se referme sur son premier
    // décor, mais avec huit adversaires au lieu d'un seul brun.
    //
    // L'effectif est le plus lourd de la campagne et surtout le plus mélangé :
    // quatre noirs, deux bruns, un blanc, un vert. Les deux bruns ne sont pas
    // une facilité — ils encombrent les couloirs pendant que les noirs tirent.
    grid: `
##################
#................#
#................#
#..........k.k...#
#......b.........#
#................#
#....#...#.......#
#....#...#.......#
#........X..w..g.#
#.1......X.......#
#....#...#.......#
#....#...#.......#
#......b..k.k....#
#................#
#................#
#................#
#................#
##################
`,
  },
];
