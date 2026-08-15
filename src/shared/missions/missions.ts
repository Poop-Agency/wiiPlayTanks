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
 * Les tracés 1 et 2 attendent encore leurs captures ; la liste grandit à
 * mesure qu'on les relève.
 */
export const TRANSCRIBED_MISSION_IDS: ReadonlySet<number> = new Set([
  3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  // Paliers relevés eux aussi sur capture.
  50, 90, 100,
]);

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
#.1......X.....b.#
#....#...#.......#
#....#...#.......#
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
#...........t....#
#................#
#...........X....#
#...........#X...#
#................#
#................#
#................#
#..............t.#
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
    id: 6,
    name: 'Entre deux murs',
    // Relevé sur capture du vrai jeu, décrit rangée par rangée plutôt que lu
    // sur l'image — la perspective de la capture rendait le comptage faux.
    //
    // Deux rangées libres en haut, deux en bas. La troisième de chaque côté
    // porte une barre pleine avec deux blocs cassables. Au milieu, une faille
    // de cinq trous, décalée d'une colonne vers la droite, puis cinq de plus
    // vers le bas.
    //
    // Les deux barres ne vont pas d'un bord à l'autre, et c'est structurel :
    // une barre pleine couperait l'arène en trois bandes étanches, et
    // l'adversaire de la bande du bas deviendrait inatteignable. Le passage
    // est à gauche en haut, à droite en bas — ce que montre aussi la capture,
    // où les barres s'arrêtent avant le mur d'enceinte.
    //
    // Les deux files de trous, elles, se rejoignent en diagonale : la boîte du
    // tank ne passe pas entre deux coins qui se touchent, donc la bande
    // médiane est bel et bien coupée en deux. On en fait le tour par le bas.
    grid: `
##################
#................#
#................#
#...#X#X######...#
#.......H.....a..#
#.......H........#
#.......H........#
#.......H........#
#.......HH.....t.#
#..1.....H.......#
#........H.......#
#........H.......#
#........H.....t.#
#........H.......#
#..#######X#X#...#
#............a...#
#................#
##################
`,
  },
  {
    id: 7,
    name: 'Les chicanes',
    // Relevé sur capture du vrai jeu : des étagères adossées aux murs
    // latéraux, décalées en hauteur d'un côté à l'autre. Trois à gauche
    // (rangées 3, 7 et 10), deux à droite (6 et 11), plus une barre en bas.
    // Chacune porte un bloc cassable.
    //
    // Aucune ne traverse : le couloir central reste ouvert, et c'est par lui
    // qu'on passe d'une moitié à l'autre. Le joueur part en bas à gauche, les
    // quatre sarcelle sont réparties de part et d'autre.
    grid: `
##################
#................#
#..t..........t..#
#................#
#................#
###X###..........#
#..........###X###
#................#
#.t..............#
#................#
#................#
###X###..........#
#..........###X###
#................#
#.1............t.#
#................#
#................#
##################
`,
  },
  {
    id: 8,
    name: 'Les piliers',
    // Relevé sur capture du vrai jeu : une arène symétrique. De chaque côté,
    // une colonne verticale en trois tronçons décalés d'une case — cassable
    // en haut et en bas, plein au milieu. Entre les deux, une barre courte en
    // haut et une en bas, cassables aux extrémités et pleines au centre.
    //
    // ⚠ La capture est rognée à gauche et à droite : le joueur et les trois
    // sarcelle y sont coupés par le bord de l'image. Les marges latérales sont
    // donc déduites, pas relevées.
    grid: `
##################
#................#
#................#
#..X...X##X...X.t#
#..X..........X..#
#..XX......y.XX..#
#...X........X...#
#...#........#...#
#1..#........#.y.#
#...#........#...#
#...X........X...#
#..XX........XX..#
#..X..........X..#
#..X...X##X.y.X..#
#................#
#...............t#
#................#
##################
`,
  },
  {
    id: 9,
    name: 'Le mur du milieu',
    // Tracé à la main par l'auteur du projet, capture sous les yeux, après
    // trois transcriptions ratées.
    //
    // Une colonne de liège en **S** occupe le centre : deux blocs pleins
    // côte à côte en chapeau, quatre liège dans la colonne de gauche, une
    // rangée où les deux colonnes sont occupées — c'est la marche —, quatre
    // liège dans celle de droite, et deux pleins côte à côte en socle.
    //
    // De part et d'autre, une **rangée horizontale** de quatre blocs pleins
    // partant du mur, à mi-hauteur. Elles ne montent pas en escalier : c'est
    // la hauteur variable du rendu 3D qui le laisse croire.
    //
    // Le liège se perce mais ne se contourne qu'en haut ou en bas. Six
    // adversaires — quatre cendre, deux jaunes.
    grid: `
##################
#................#
#.....a..........#
#..y....##.......#
#.......X.....a..#
#.......X........#
#.......X...a....#
#.......X........#
#####...XX...#####
#........X.......#
#........X.......#
#........X.......#
#........X.......#
#..1....##.......#
#.............y..#
#................#
#...........a....#
##################
`,
  },
  {
    id: 10,
    name: 'Les gradins',
    // Tracé à la main par l'auteur du projet, capture sous les yeux.
    //
    // Huit barres horizontales en quinconce, sur un rythme régulier de trois
    // rangées : latérales aux rangées 3, 8 et 14, centrales aux rangées 5 et
    // 11, intercalées entre les précédentes.
    //
    // Trois détails qu'aucune mesure au pixel ne donne, et qui distinguent ce
    // tracé du précédent :
    //
    //   · **aucune barre ne touche un mur** — une tuile de dégagement partout,
    //     contrairement à la mission 9 ;
    //   · **les longueurs varient** — trois blocs en haut et en bas, quatre au
    //     milieu ;
    //   · **le liège n'est pas réparti par moitiés** — les deux barres
    //     latérales du milieu sont intégralement cassables, tandis que chaque
    //     barre centrale ne porte qu'**un seul** bloc de liège, et pas à  
    //     même colonne de l'une à l'autre.
    //
    // Deux roses seulement, mais le terrain n'est fait que de lignes droites —
    // de quoi ricocher d'un bout à l'autre.
    grid: `
##################
#................#
#.........r......#
#.###........###.#
#...............r#
#......#X##......#
#................#
#................#
#.XXXX......XXXX.#
#................#
#................#
#......##X#......#
#................#
#1...............#
#.###........###.#
#................#
#................#
##################
`,
  },
  {
    id: 11,
    name: "L'enceinte",
    // Tracé à la main par l'auteur du projet, capture sous les yeux.
    //
    // Deux longs murs coudés qui se font face en diagonale, chacun courant
    // presque d'un bord à l'autre de l'arène :
    //
    //   · à gauche, une descente en colonne 5 depuis le mur du haut, un
    //     décrochement d'une case vers la gauche à mi-hauteur, puis la suite
    //     jusqu'en bas où elle part vers la droite en pied ;
    //   · à droite, un pied horizontal en haut qui plonge en colonne 13,
    //     décroche vers la gauche aux deux tiers, et descend en colonne 12
    //     jusqu'au mur du bas.
    //
    // **Le liège marque les extrémités** — les deux bouts du mur de gauche,
    // le bout du pied nord-est, le bas du mur de droite. C'est la règle de
    // composition du tracé, et elle vaut mieux que de chercher les blocs roses
    // un à un sur la capture.
    //
    // Six adversaires, deux de chaque couleur, un par secteur.
    grid: `
##################
#....Xt..........#
#....X......a....#
#.1..#....##XX...#
#....#.......X...#
#....#.......#.r.#
#....#.......#...#
#...##.......#...#
#...#........#...#
#...#...r...##...#
#...#.......#....#
#...#.......#....#
#...X.......#....#
#...XX##....#....#
#..a........#..t.#
#...........X....#
#...........X....#
##################
`,
  },
  {
    id: 12,
    name: 'Angles morts',
    // Relevé sur capture du vrai jeu, replacé sur un quadrillage tracé par
    // l'auteur du projet par-dessus l'image — seize colonnes, seize rangées,
    // pas régulier. C'est la méthode la plus fiable trouvée jusqu'ici : elle
    // supprime d'un coup la perspective et le tâtonnement au pixel.
    //
    // Un escalier en diagonale traverse l'arène du coin bas-gauche au coin
    // haut-droite, deux blocs par marche, une marche par rangée, avec deux
    // marches de liège en son milieu.
    //
    // De part et d'autre, deux carrés de quatre trous — en haut à gauche et en
    // bas à droite — qui coupent le passage aux tanks sans arrêter les obus.
    //
    // Deux verts et deux roses, un de chaque de part et d'autre de la
    // diagonale : les verts tirent au ricochet par-dessus l'escalier, ce que
    // leurs deux rebonds rendent redoutable sur un terrain tout en biais.
    grid: `
##################
#................#
#..........r.....#
#............#...#
#...HH......##.g.#
#...HH.....##....#
#.........##.....#
#........X#......#
#.1.....XX.......#
#......#X........#
#.....##.........#
#....##..........#
#...##......HH...#
#...#.......HH...#
#......r.........#
#.............g..#
#................#
##################
`,
  },
  {
    id: 13,
    name: 'Les obliques',
    // Décrit rangée par rangée par l'auteur du projet, capture en main. Trois
    // barres horizontales de dix blocs, colonnes 4 à 13, séparées de quatre
    // rangées vides — barres aux rangées 3, 8 et 13.
    //
    // Les barres alternent bois et liège par paires, et celle du milieu est
    // **en opposition de phase** avec les deux autres : là où celles du haut
    // et du bas sont pleines, elle est cassable. C'est ce décalage qui donne
    // son intérêt au tracé, sans quoi les trois barres offriraient les mêmes
    // ouvertures.
    //
    // Le motif décrit totalise quinze rangées ; la seizième est laissée en
    // marge basse.
    //
    // Trois jaunes et trois sarcelle, un couple par bande.
    grid: `
##################
#................#
#.......y......t.#
#...##XX##XX##...#
#................#
#................#
#................#
#................#
#1..XX##XX##XX.t.#
#................#
#.........y......#
#................#
#................#
#...##XX##XX##...#
#................#
#....y........t..#
#................#
##################
`,
  },
  {
    id: 14,
    name: 'Le damier',
    // Relevé sur capture du vrai jeu, charpente donnée par l'auteur du
    // projet : trois rangées libres en haut et trois en bas, et **tout est
    // d'équerre** — aucun biais, aucune diagonale.
    //
    // Deux lignes horizontales encadrent le tracé, l'une en rangée 4 et
    // l'autre en 13, chacune mêlant les trois matières : bois plein, liège
    // cassable et trou. Entre les deux, deux équerres de bois se font face,
    // ouvertes l'une vers l'autre.
    //
    // Trois verts et trois roses, répartis dans les trois bandes.
    grid: `
##################
#................#
#...........r..g.#
#................#
#...#####H#H#X#X##
#...#............#
#...#............#
#...#............#
#.r.#.g....###...#
#...#........#...#
#...###......#...#
#..........g.#...#
#............#.r.#
##X#X#H#H#####...#
#................#
#.1..............#
#................#
##################
`,
  },
  {
    id: 15,
    name: 'Les fosses',
    // Décrit par l'auteur du projet. Quatre équerres de six sur quatre —
    // jambe de six blocs, pied de quatre — notées par le caractère de coin
    // qui dessine leur forme :
    //
    //     ┘ └        haut-gauche, haut-droite
    //     ┐ ┌        bas-gauche, bas-droite
    //
    // **Les quatre pointes convergent vers le centre**, et ce sont elles qui
    // portent le liège : la pointe et son voisin sur chaque bras, soit trois
    // blocs cassables par équerre. Percer un coin ouvre les deux directions
    // d'un coup.
    //
    // Les jambes courent d'un mur à la voie centrale, qui mesure quatre
    // colonnes sur trois rangées.
    //
    // Six verts, l'effectif le plus fourni de la campagne en tireurs
    // immobiles — et les quatre longues jambes leur laissent des couloirs
    // droits d'un bout à l'autre du plateau.
    grid: `
##################
#................#
#..............p.#
#..#X#X....#.....#
#..#.......#.....#
#..#.p.....#.....#
#..#.......#X#X..#
#................#
#................#
#................#
#................#
#..X#X#.......#..#
#.....#.......#..#
#.....#.......#..#
#.1...#....X#X#..#
#..............p.#
#................#
##################
`,
  },
  {
    id: 16,
    name: 'Les casemates',
    // Relevé sur capture du vrai jeu, cadrage donné par l'auteur du projet :
    // trois rangées libres en haut, deux en bas.
    //
    // Le tracé décrit un grand **S** : une verticale contre le bord gauche,
    // une barre horizontale haute, une verticale contre le bord droit, une
    // barre horizontale basse. Les deux barres alternent bois et liège un bloc
    // sur deux, en opposition de phase l'une par rapport à l'autre.
    //
    // Trois violets et deux verts. Les verts, immobiles, sont posés de part et
    // d'autre du S : leurs ricochets à deux bandes passent par-dessus les
    // barres que le joueur doit contourner.
    grid: `
##################
#................#
#.......p......g.#
#................#
#..#...X#X#X#....#
#..#........#....#
#..#........#X#..#
#..#..........#..#
#..#.......p..#..#
#..#..........#..#
#..#..........#..#
#..#..........#..#
#..#..........#..#
#..#X#.g......#..#
#....#........#.p#
#....#X#X#X...#..#
#.1..............#
##################
`,
  },
  {
    id: 17,
    name: 'Le peloton vert',
    // Décrit par l'auteur du projet : quatre équerres, chacune tenant dans un
    // rectangle de six sur quatre.
    //
    // Notation retenue pour l'orientation d'une équerre — le caractère dessine
    // la forme, et il n'en existe que quatre :
    //
    //     ┌ bras vers le bas et la droite      ┐ bras vers le bas et la gauche
    //     └ bras vers le haut et la droite     ┘ bras vers le haut et la gauche
    //
    // Ici, en lecture haut-gauche → bas-droite : `┘ └ ┐ ┌`. Les quatre pointes
    // convergent donc vers le centre, et c'est le **long bras qui alterne** :
    // vertical jusqu'à la bordure haute pour l'équerre haut-gauche, horizontal
    // jusqu'à la bordure droite pour celle du haut-droite, et l'inverse en bas.
    // Le tracé a une symétrie de **rotation** d'un demi-tour, pas de miroir —
    // c'est ce que j'avais manqué aux deux premières tentatives.
    //
    // Les décalages qui en résultent ouvrent une voie centrale de quatre
    // colonnes sur trois rangées.
    //
    // **Le coin et ses deux voisins immédiats sont cassables**, un sur chaque
    // bras. C'est la seule brèche de chaque équerre, et elle est exactement à
    // l'angle : la percer à la mine ouvre les deux directions d'un coup.
    //
    // Six verts, l'effectif le plus fourni de la campagne en tireurs
    // immobiles. Le tracé leur va bien : les quatre jambes verticales laissent
    // de longs couloirs droits, et leurs deux rebonds portent d'un bout à
    // l'autre.
    grid: `
##################
#.....#..........#
#..g..#..........#
#.....#..........#
#.....#....#.....#
#.....X....#...g.#
#.....X....X.....#
#...#XX....XX#####
#................#
#.g..............#
#.......g......g.#
#####XX....XX#...#
#.....X....X.....#
#.....#....#.....#
#.1...#....#.....#
#..........#...g.#
#..........#.....#
##################
`,
  },
  {
    id: 18,
    name: 'Effectif mêlé',
    // Relevé sur capture du vrai jeu, avec le schéma de l'auteur du projet.
    //
    // Deux barres horizontales identiques de dix blocs — **trois incassables,
    // quatre cassables, trois incassables** — centrées, laissant trois colonnes
    // libres de chaque côté. Entre elles, un couloir de trois rangées.
    //
    // Chaque barre est reliée à la bordure la plus proche par un **Z** posé au
    // centre exact du plateau : trois rangées de mur sur la colonne 8, trois sur
    // la colonne 9, les deux se rejoignant sur une rangée commune — d'où six
    // blocs seulement, et non huit. Le Z du bas est celui du haut retourné d'un
    // demi-tour ; il compte une rangée de plus parce que les barres, elles, ne
    // sont pas symétriques (cinq rangées libres au-dessus, six au-dessous).
    //
    // Les deux Z touchent leur barre en plein liège, ce qui donne quatre poches
    // cassables distinctes au lieu d'une seule brèche centrale.
    grid: `
##################
#.......#........#
#.......#........#
#...t...##.p.....#
#.....r..#.......#
#........#.......#
#...###XXXX###...#
#................#
#........g.......#
#................#
#...###XXXX###...#
#.......#........#
#.......#........#
#.......#........#
#..1....##....t..#
#........#.p.....#
#........#.......#
##################
`,
  },
  {
    id: 19,
    name: 'La meute',
    // Relevé sur capture du vrai jeu, décrit rangée par rangée par l'auteur du
    // projet : trois barres de treize blocs, chacune laissant trois colonnes
    // libres à un bout, et l'ouverture alterne d'un côté à l'autre. Le plateau
    // se parcourt donc en **serpentin** — trois rangées libres au-dessus de la
    // première barre, quatre dans chacun des deux couloirs, deux seulement sous
    // la dernière.
    //
    // Les barres alternent deux cassables et deux incassables, et finissent
    // toutes par du bois côté ouverture : le passage libre n'est pas doublé
    // d'une brèche facile juste à côté.
    //
    // Huit violets, l'effectif le plus nombreux de la campagne. Le serpentin
    // leur convient : ils posent des mines, et un couloir sans issue latérale
    // transforme chaque mine en verrou.
    grid: `
##################
#................#
#.p....p.....p...#
#................#
#XX##XX##XX###...#
#................#
#................#
#.........p.....p#
#................#
#...XX##XX##XX####
#.p..............#
#................#
#...............p#
#................#
#XX##XX##XX###...#
#.1..........p...#
#................#
##################
`,
  },
  {
    id: 20,
    name: 'Les invisibles',
    // Relevé sur capture du vrai jeu : **le terrain est entièrement nu**. Pas
    // un bloc, pas un trou — seulement le joueur d'un côté et deux tanks
    // invisibles de l'autre.
    //
    // C'est le seul tracé vide de la campagne, et c'est délibéré : la mission
    // sert à faire découvrir le blanc, qu'on ne voit qu'au reflet de son ombre
    // et à la trace de ses obus. Le moindre couvert lui donnerait un avantage
    // qui rendrait la leçon illisible.
    grid: `
##################
#................#
#................#
#................#
#................#
#................#
#................#
#............w...#
#................#
#.1............w.#
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
