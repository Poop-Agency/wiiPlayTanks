/**
 * Les missions de la campagne — les vingt tracés d'origine, huit paliers, et
 * le reste généré (voir la section « Missions 21-100 » plus bas).
 *
 * ─── Ce que l'ancienne version contenait réellement ──────────────────────────
 *
 * Le plan de refonte annonçait « les 20 missions réellement remplies » côté
 * dépôt distant. La conversion des données, figée dans `docs/provenance.md`,
 * montre que ce n'était pas le cas. Relevé exact :
 *
 *   · missions 1 et 2  → un vrai tracé (10 et 24 blocs posés) ;
 *   · missions 3 à 5   → aucun bloc, aucun départ joueur, ennemis en pixels ;
 *   · missions 6 à 20  → aucun bloc, aucun départ joueur, et des ennemis dont
 *                        les coordonnées valent `null`, ce que l'ancien code
 *                        commentait lui-même « pas créé ».
 *
 * Autrement dit : dix-huit missions sur vingt étaient des salles vides, et
 * quinze d'entre elles ne faisaient apparaître aucun ennemi.
 *
 * ─── Ce qui est porté, et ce qui est écrit ici ───────────────────────────────
 *
 * **Porté** — les deux tracés existants (missions 1 et 2) et, surtout, **les
 * effectifs des vingt missions**. Ces listes de couleurs sont la vraie donnée
 * de progression : elles disent quand chaque couleur entre en scène et en quel
 * nombre. Un test (`tests/missions.test.ts`) vérifie que chaque grille
 * ci-dessous contient exactement l'effectif relevé dans l'ancienne version.
 *
 * **Écrit ici** — les dix-huit tracés manquants. Ils ne sont pas des relevés du
 * jeu original : personne ne les avait mesurés. Le format ASCII est justement
 * choisi pour que leur correction soit triviale — modifier une arène, c'est
 * éditer du texte, et le diff se relit à l'oeil.
 *
 * Deux règles ont guidé leur tracé, l'une et l'autre tirées de l'expérience
 * de #11 :
 *
 *   1. **Terrain ouvert à couverts épars, jamais de labyrinthe.** Des couloirs
 *      d'une tuile ne laissent ni ligne de tir ni angle de ricochet : les
 *      ennemis y restent muets, ce qui ressemble à une panne d'IA alors que
 *      c'est un défaut de tracé.
 *   2. **Aucun ennemi à portée immédiate du départ joueur.** Un tank vert placé
 *      à cinq tuiles tue en deux secondes et demie — comportement correct,
 *      placement absurde.
 *
 * ─── Dimensions ─────────────────────────────────────────────────────────────
 *
 * Toutes les arènes font la même taille, comme dans l'original où le plateau ne
 * change jamais : seule la disposition des blocs varie. L'ancienne version, elle,
 * changeait les dimensions d'une mission à l'autre.
 *
 * La taille retenue, **18 × 18** (soit 16 × 16 de terrain jouable), vient du
 * comptage des blocs sur une capture du vrai jeu, mission 4. Elle a remplacé le
 * 23 × 19 déduit du relevé de calibration en pixels (736 × 600), qui donnait un
 * plateau plus large que haut.
 *
 * ⚠ Les deux lectures se contredisent, et ce n'est pas tranché : les captures
 * montrent un plateau visiblement plus large que haut (rapport ≈ 1,3), ce
 * qu'un carré ne reproduit pas. Le comptage de blocs fait foi pour l'instant —
 * c'est un relevé direct là où la calibration était une déduction — mais si
 * les arènes paraissent étriquées à l'écran, c'est cette valeur qu'il faut
 * remettre en cause en premier. Voir `docs/provenance.md`.
 *
 * Conséquence pratique : la largeur de l'arène **est** la règle graduée qui a
 * servi à mesurer les vitesses. « Un obus traverse l'arène en 4 s » se vérifie
 * donc à l'oeil, chronomètre en main, dans le jeu qui tourne — et ce repère
 * est à revérifier depuis le passage à 18 tuiles.
 *
 * ─── Symboles ───────────────────────────────────────────────────────────────
 *
 *   `#` incassable · `X` cassable (mines seules) · `H` trou · `.` sol libre
 *   `1`–`4` départs joueurs
 *   `b` brun · `a` cendre · `t` sarcelle · `y` jaune · `r` rose
 *   `g` vert · `p` violet · `w` blanc · `k` noir
 *
 * ─── Missions 21-100 ─────────────────────────────────────────────────────────
 *
 * Le vrai jeu va jusqu'à cent missions, mais la quasi-totalité au-delà de la
 * vingtième ne sont pas des tracés uniques : ce sont des remixes des
 * premières, avec une composition d'ennemis tirée au sort. `generate.ts`
 * reproduit ce mécanisme (tirage scellé sur le numéro de mission, jamais sur
 * l'horloge — le rejeu après échec et l'accord serveur/client en dépendent),
 * `milestones.ts` porte les huit scènes fixes qui ponctuent la campagne
 * (30, 40, … 100). Détail et réserves de confiance dans `docs/provenance.md`.
 */

import { buildCampaign } from './generate';
import { MILESTONE_MISSIONS } from './milestones';

/** Une mission : un nom et une grille. Tout le reste s'en déduit. */
export interface Mission {
  /** Numéro dans la campagne, à partir de 1. */
  readonly id: number;
  readonly name: string;
  /** Grille ASCII. Lue par `parseMission`. */
  readonly grid: string;
}

/** Largeur commune à toutes les arènes, en tuiles — bordure comprise. */
export const ARENA_WIDTH_TILES = 18;

/** Hauteur commune à toutes les arènes, en tuiles — bordure comprise. */
export const ARENA_HEIGHT_TILES = 18;

/** Nombre de missions dans la campagne complète, comme dans le vrai jeu. */
const CAMPAIGN_TOTAL_MISSIONS = 100;

/**
 * Missions dont le tracé est transcrit d'une capture du vrai jeu, et non
 * dessiné pour cette refonte.
 *
 * Sur celles-là, la fidélité prime sur les règles d'auteur que ce projet
 * s'était données : `tests/missions.test.ts` n'y applique pas la distance de
 * sécurité au départ. L'original place parfois un adversaire tout près du
 * joueur, et c'est un choix de game design, pas un défaut à corriger.
 *
 * Les tracés restants (1, 2 et 6 à 20) attendent leurs captures ; la liste
 * grandit à mesure qu'on les relève.
 */
export const TRANSCRIBED_MISSION_IDS: ReadonlySet<number> = new Set([3, 4, 5]);

/** Les vingt missions d'origine, tracés uniques écrits à la main. */
const HAND_AUTHORED_MISSIONS: readonly Mission[] = [
  {
    id: 1,
    name: 'Champ de tir',
    // Porté depuis l'ancienne version : deux colonnes, celle de droite
    // fermée par deux blocs cassables. Seule adaptation, le recentrage sur
    // l'arène commune — l'original de l'ancienne version faisait 25 × 12.
    grid: `
##################
#................#
#................#
#................#
#................#
#................#
#....#...#.......#
#....#...#.......#
#........X.......#
#..1.#...#.....b.#
#....#...#.......#
#................#
#................#
#................#
#................#
#................#
#................#
##################
`,
  },
  {
    id: 2,
    name: 'Deux barrages',
    // Porté depuis l'ancienne version. Le départ joueur y était déclaré en
    // `y: 23` pour une arène de 17 blocs de haut : jamais atteignable, jamais
    // remarqué. Il est ramené en bas à gauche, ce que la position d'origine
    // cherchait manifestement à exprimer.
    grid: `
##################
#................#
#................#
#..............a.#
#................#
#..#######XXX....#
#................#
#................#
#................#
#................#
#................#
#....XXX######...#
#................#
#................#
#..1.............#
#................#
#................#
##################
`,
  },
  {
    id: 3,
    name: 'Le zigzag',
    // Relevé sur capture du vrai jeu. Un escalier de deux paliers coupe
    // l'arène en biais : murs pleins aux extrémités, blocs cassables au
    // milieu de chaque palier. Les trois adversaires sont répartis de part et
    // d'autre de l'escalier.
    grid: `
##################
#................#
#...a............#
#..##XXXX#.......#
#........#.......#
#........#.......#
#........#.......#
#........#.......#
#.......##.....b.#
#..1....#........#
#.......#........#
#.......#........#
#.......#........#
#.......#........#
#.......#XXX##...#
#............a...#
#................#
##################
`,
  },
  {
    id: 4,
    name: 'Les nids-de-poule',
    // Relevé sur capture du vrai jeu : pas un seul bloc, mais un damier de
    // trous qui quadrille tout le terrain. Les obus les survolent, les tanks
    // doivent les contourner — l'arène est donc entièrement dégagée à la
    // vue et pourtant lente à traverser. Les lignes sont volontairement
    // discontinues : une ligne pleine enfermerait chaque case.
    grid: `
##################
#.....H....H.....#
#.....H..b.H.....#
#.....H....H..a..#
#.....H....H.....#
#.....H..........#
#HHHH.H.HHHHHHHHH#
#.....H..........#
#.....H....H.....#
#.....H.a..H..b..#
#.....H....H.....#
#..........H.....#
#HHHHHHHHH.H.HHHH#
#..........H.....#
#.....H....H.....#
#..1..H....H.....#
#.....H....H.....#
##################
`,
  },
  {
    id: 5,
    name: 'Terrain découvert',
    // Relevé sur capture du vrai jeu : presque rien. Trois blocs cassables en
    // tout — un couvert minuscule contre le flanc du joueur, une paire près du
    // premier sarcelle. Un duel à découvert, où seul le ricochet protège.
    grid: `
##################
#................#
#................#
#...........t....#
#................#
#...........XX...#
#................#
#................#
#....X...........#
#..1.X.........t.#
#................#
#................#
#................#
#................#
#................#
#................#
#................#
##################
`,
  },
  {
    id: 6,
    name: 'Entre deux murs',
    // Relevé sur capture du vrai jeu : deux longues barres horizontales,
    // pleines aux extrémités et cassables au centre, enferment une bande
    // médiane qu'une file de trous coupe en deux. Les quatre adversaires
    // tiennent le flanc droit.
    grid: `
##################
#................#
#................#
#................#
#....##XX####....#
#..............a.#
#................#
#.......H........#
#.......H........#
#..1....H......t.#
#.......H........#
#....##XX####....#
#................#
#..............t.#
#............a...#
#................#
#................#
##################
`,
  },
  {
    id: 7,
    name: 'Les chicanes',
    // Relevé sur capture du vrai jeu : quatre barres décalées en quinconce,
    // alternativement à gauche et à droite, chacune pleine aux bouts et
    // cassable au milieu. On ne traverse jamais en ligne droite.
    grid: `
##################
#................#
#.....t..........#
#.##XX###.....t..#
#................#
#.....t..........#
#........###XX##.#
#................#
#................#
#.##XX#..........#
#................#
#..1.....###XX##.#
#................#
#.............t..#
#................#
#................#
#................#
##################
`,
  },
  {
    id: 8,
    name: 'Les piliers',
    // Relevé sur capture du vrai jeu : des piliers isolés, courts et de
    // matières mêlées, éparpillés en diagonale du coin du joueur vers le coin
    // opposé. Les cinq adversaires tiennent le bord droit, en file.
    grid: `
##################
#................#
#..........y.....#
#......###.....t.#
#..X.............#
#..X...........X.#
#..X.............#
#.....X..##....y.#
#.....X..##......#
#..1.....##......#
#.......XX...y...#
#................#
#........####..t.#
#................#
#................#
#................#
#................#
##################
`,
  },
  {
    id: 9,
    name: 'Le mur du milieu',
    // Relevé sur capture du vrai jeu : une longue colonne cassable coupe
    // l'arène en deux dans la hauteur, doublée à droite de deux paliers
    // pleins et à gauche d'un bloc bas. Six adversaires des deux côtés du
    // mur — il faut le percer ou le contourner.
    grid: `
##################
#................#
#.....y........a.#
#.........X......#
#........aX......#
#.........X.###..#
#.........X......#
#.........X....a.#
#.........X......#
#..1......X.###y.#
#.........X......#
#...........a....#
#....###.........#
#................#
#................#
#................#
#................#
##################
`,
  },
  {
    id: 10,
    name: 'Les gradins',
    // Relevé sur capture du vrai jeu : quatre rangées de trois barres
    // alignées, alternativement pleines et cassables, avec des couloirs
    // francs entre elles. Deux roses seulement, mais ils tirent au ricochet
    // dans un terrain fait de lignes droites.
    grid: `
##################
#................#
#........r.......#
#................#
#...###..###.###.#
#..............r.#
#................#
#...XXX..XXX.XXX.#
#................#
#..1###..###.###.#
#................#
#................#
#...XXX..XXX.XXX.#
#................#
#................#
#................#
#................#
##################
`,
  },
  {
    id: 11,
    name: "L'enceinte",
    grid: `
##################
#................#
#..t...........t.#
#................#
#..############..#
#..#..........#..#
#..#...r..r...#..#
#..X..........X..#
#..#....aa....#..#
#..#..........#..#
#..###..##..###..#
#................#
#................#
#................#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 12,
    name: 'Angles morts',
    grid: `
##################
#................#
#..g..........g..#
#................#
#..####...####...#
#................#
#................#
#.....r....r.....#
#................#
#...###....###...#
#................#
#.....XX..XXX....#
#................#
#................#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 13,
    name: 'Les obliques',
    grid: `
##################
#..y.....y.....y.#
#................#
#..##............#
#...##...........#
#....##..........#
#.....X..........#
#.....##.........#
#................#
#..t..t.....t....#
#.........##.....#
#..........XX....#
#...........#....#
#...........##...#
#............##..#
#........1.......#
#................#
##################
`,
  },
  {
    id: 14,
    name: 'Le damier',
    grid: `
##################
#..g....g...g....#
#................#
#..#..##..##..##.#
#..#..##..##..##.#
#................#
#...r.....r......#
#..X..XX..XX..XX.#
#..X..XX..XX..XX.#
#..r.............#
#..#..##..##..##.#
#..#..##..##..##.#
#................#
#................#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 15,
    name: 'Les fosses',
    grid: `
##################
#................#
#...p.....p......#
#................#
#..HHHH.....HHH..#
#..HHHH.....HHH..#
#................#
#.......##.......#
#.......##.......#
#.......XX..p....#
#................#
#..HHHH.....HHH..#
#..HHHH.....HHH..#
#................#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 16,
    name: 'Les casemates',
    grid: `
##################
#..g...........g.#
#................#
#..####.....####.#
#.....#.....#....#
#.....#.....#....#
#....p......p....#
#........p.......#
#...XXX....XXX...#
#................#
#................#
#.....#.....#....#
#.....#.....#....#
#..####.....####.#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 17,
    name: 'Le peloton vert',
    grid: `
##################
#..g...g....g....#
#................#
#.##.##.##.##.##.#
#................#
#..g...g....g....#
#................#
#.##.##.##.##.##.#
#................#
#.XX.XX.XX.XX.XX.#
#................#
#................#
#.##.##.##.##.##.#
#................#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 18,
    name: 'Effectif mêlé',
    grid: `
##################
#..p..........p..#
#................#
#...#########....#
#........r.......#
#..t...........t.#
#........g.......#
#.....XXXXX......#
#................#
#................#
#.....########...#
#................#
#................#
#................#
#...####..####...#
#........1.......#
#................#
##################
`,
  },
  {
    id: 19,
    name: 'La meute',
    grid: `
##################
#..p..p.....p..p.#
#................#
#................#
#...##......##...#
#...##......##...#
#................#
#..p...........p.#
#.......XX.......#
#.......XX.......#
#..p...........p.#
#................#
#...##......##...#
#...##......##...#
#................#
#........1.......#
#................#
##################
`,
  },
  {
    id: 20,
    name: 'Les invisibles',
    grid: `
##################
#................#
#..w..........w..#
#................#
#..###.....###...#
#................#
#.....XXXXXX.....#
#................#
#..##.......##...#
#................#
#...###....###...#
#................#
#.....XXXXXX.....#
#................#
#...###.....##...#
#........1.......#
#................#
##################
`,
  },
];

/**
 * La campagne complète : les vingt tracés d'origine et les huit paliers tels
 * quels, le reste (21-99, hors paliers) généré à la volée — voir l'en-tête
 * de ce fichier. Construite une fois, au chargement du module, exactement
 * comme l'était l'ancien tableau littéral : rien en aval ne distingue une
 * mission écrite à la main d'une mission générée.
 */
export const MISSIONS: readonly Mission[] = buildCampaign(
  HAND_AUTHORED_MISSIONS,
  MILESTONE_MISSIONS,
  CAMPAIGN_TOTAL_MISSIONS,
);

/** Mission portant ce numéro, ou `undefined` au-delà de la campagne. */
export function missionByNumber(number: number): Mission | undefined {
  return MISSIONS[number - 1];
}
