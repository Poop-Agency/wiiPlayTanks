# Provenance des données de jeu

Ce document fige ce qui a été **extrait de l'ancienne version** avant que son
code ne soit supprimé (#14). Il n'a pas d'autre rôle : le jeu ne le lit pas.

L'ancien arbre reste consultable dans l'historique git — il vivait dans
`legacy/`, et la branche `snapshot-local-20260812` conserve en plus la copie
locale hors-git d'origine.

## Ce qui a été relevé sur le jeu original

Ces mesures viennent de `legacy/src/constants.ts`, où elles avaient été prises
image par image. Ce sont les **seuls faits observables** dont le projet dispose,
et tout le reste en dérive.

| Grandeur | Valeur |
|---|---|
| Largeur de l'arène de référence | 736 px |
| Traversée par un obus normal | 4 s |
| Traversée par un missile | 2 s (exactement deux fois plus rapide) |
| Traversée par le tank du joueur | 7 s |
| Côté d'un tank | 25 px |
| Rayon d'un obus | 3 px |
| Côté d'un bloc | 32 px |

⚠ Le fichier d'origine se contredisait : ses commentaires dérivaient 184 px/s
pour l'obus et 105 px/s pour le tank, mais il exportait 68 et 39 px/s — environ
2,7 fois plus lent. Le *ratio* obus/tank était pourtant préservé (1,752 contre
1,744) : tout avait donc été divisé par un facteur global unique, calé à la main
contre une boucle sans pas de temps fixe. Ce facteur compensait un bug, ce
n'était pas une mesure. Voir la note de calibration en tête de
`src/core/tuning.ts`.

Confirmé séparément par l'auteur : **5 obus et 2 mines** simultanés pour le
joueur.

## Ce qui reste non mesuré

Signalé en clair dans le code, à relever par la même méthode de comptage
d'images :

- `TUNING.mine` — durée de mèche, rayon du souffle, délai entre deux poses ;
- `CAMPAIGN_RULES` — tanks de réserve au départ, périodicité du tank offert.

## Dimensions du plateau : 18 × 18, et la contradiction qui reste

Le vrai jeu garde **un seul plateau pour ses cent niveaux** — caméra fixe, ni
zoom ni panoramique, cadre identique sur les huit captures relevées. Le
principe d'une taille unique n'est donc pas en doute. Sa valeur, si.

Deux lectures s'opposent :

| Source | Résultat | Nature |
| --- | --- | --- |
| Calibration en pixels (736 × 600 px ÷ 32) | 23 × 19 | déduite d'un relevé |
| Comptage des blocs, capture mission 4 | **18 × 18** | relevé direct |

**C'est 18 × 18 qui est retenu** : un comptage de blocs est une observation, la
calibration en pixels était une déduction à partir d'une mesure faite pour autre
chose (les vitesses).

⚠ **Mais les deux ne se réconcilient pas.** Toutes les captures montrent un
plateau nettement plus large que haut — rapport mesuré ≈ 1,3, perspective
comprise. Un plateau carré ne reproduit pas ça. L'une des deux lectures est
fausse et on ne sait pas laquelle : soit le comptage de blocs a raté des
colonnes sur les bords, soit la calibration en pixels portait sur autre chose
que le terrain jouable. Si les arènes paraissent étriquées à l'usage, c'est la
première valeur à remettre en cause.

Ce que le passage à 18 × 18 a entraîné, et qui est à revérifier avec :

- **Les vitesses.** Ce qui a été mesuré sur le vrai jeu, ce sont des durées de
  traversée (4 s pour un obus, 7 s pour un tank), pas des tuiles par seconde.
  `REFERENCE_ARENA_WIDTH_TILES` a donc suivi, sans quoi la traversée serait
  tombée à 3,1 s au lieu des 4 s relevées. Tanks et obus sont plus lents en
  tuiles par seconde qu'avant, et la partie a le même tempo qu'avant.
- **La distance de sécurité au départ.** Elle valait 8 tuiles en dur, soit un
  tiers de 23. Elle se déduit maintenant de la largeur du plateau (6 tuiles),
  faute de quoi elle aurait interdit la moitié du terrain.
- **Le bandeau.** Ses trois blocs étaient posés à des abscisses fixes calées
  sur 736 px et se chevauchaient à 576 ; ils sont maintenant mesurés.

## Tracés des missions 3 à 10, relevés sur captures

Les missions 3 à 20 avaient été **écrites** pour cette refonte, faute de tracé
dans l'ancienne version (voir « Ce que la conversion a révélé »). Pour les
missions 3 à 10, ces tracés inventés ont depuis été **remplacés** par une
transcription de captures d'écran du vrai jeu, fournies image par image.

Ce qui a été lu sur les captures, et ce qui ne l'a pas été :

| Lu sur l'image | Statut |
| --- | --- |
| Forme d'ensemble des murs (escalier, chicanes, barres, damier de trous) | relevé |
| Matière de chaque bloc (bois plein `#` / liège cassable `X` / trou `H`) | relevé |
| Coin de départ du joueur | relevé |
| Nombre d'adversaires et leur zone | relevé |
| Coordonnée exacte, à la tuile près | **estimé** |
| Couleur exacte d'un tank en zone d'ombre | **estimé** |

Les captures sont vues en perspective légère, en basse définition, et les blocs
y sont dessinés avec une hauteur qui décale leur sommet au-dessus de leur case.
La marge d'erreur de transcription est donc de l'ordre d'une à deux tuiles.

Sur les missions transcrites, la distance de sécurité au départ que
`tests/missions.test.ts` impose depuis #11 **ne s'applique pas** : elle est une
règle que ce projet s'est donnée, pas une de l'original, et l'original place
parfois un adversaire tout près du joueur. `TRANSCRIBED_MISSION_IDS` tient la
liste. Les remixes (21-99), eux, refiltrent les emplacements hérités : reprendre
un placement serré hors de son contexte n'aurait plus rien d'intentionnel.

Les missions 3, 4 et 5 ont ensuite été retracées à la main par l'auteur du
projet, capture en main, la première transcription automatique n'étant pas
assez fidèle. Les missions 6 à 10 attendent la même passe.

Deux points relevés sur les captures et non tranchés par l'image seule :

- **Mission 4** — le terrain n'y porte aucun bloc, seulement un quadrillage de
  courts tirets sombres. Lus comme des **trous** : les obus les survolent
  (`blocksShell` les ignore), les tanks les contournent. Les lignes sont
  écrites discontinues, sans quoi chaque case du damier serait une poche
  fermée.
- **Mission 7** — l'un des quatre adversaires paraît plus clair que les trois
  autres, sans qu'on puisse distinguer cendre de sarcelle à l'ombre. L'effectif
  relevé (quatre sarcelle) a été conservé.

Les missions 1, 2 et 11 à 20 ne sont **pas** concernées : 1 et 2 restent le
portage de l'ancienne version, 11 à 20 restent des tracés écrits pour cette
refonte, en attente de captures.

## Effectifs des vingt missions

Transcrits depuis les listes `enemies` de `legacy/src/level.ts`. C'est la seule
donnée de progression que l'ancienne version contenait pour l'ensemble de la
campagne, et `tests/missions.test.ts` vérifie que chaque grille la respecte.
La couleur `grey` y est devenue `ash`, seul renommage.

**Une correction**, apportée après relevé sur capture : la mission 4 montre
quatre adversaires (deux bruns au fond, deux cendre au milieu) là où
l'ancienne version n'en listait que trois. Le relevé fait foi sur ce point,
l'ancienne version étant par ailleurs la même qui déclarait un départ joueur
hors de l'arène. Les dix-neuf autres effectifs sont inchangés et correspondent
aux captures partout où elles permettent de compter.


    ═══ Mission 1 — 25×12 blocs, 10 posés
        effectif : brown

    #########################
    #.......................#
    #.......................#
    #.....#.....#...........#
    #.....#.....#...........#
    #..1........X.........b.#
    #...........X...........#
    #.....#.....#...........#
    #.....#.....#...........#
    #.......................#
    #.......................#
    #########################

    ═══ Mission 2 — 26×17 blocs, 24 posés
        effectif : grey
        ⚠ départ joueur hors limites en (3, 23) — arène 26×17

    ##########################
    #........................#
    #........................#
    #....................a...#
    #........................#
    #....########XXXX........#
    #........................#
    #........................#
    #........................#
    #........................#
    #......XXXX########......#
    #........................#
    #........................#
    #........................#
    #........................#
    #........................#
    ##########################

    ═══ Mission 3 — 25×19 blocs, 0 posés
        effectif : grey, grey, brown
        ⚠ aucun point de départ joueur

    ═══ Mission 4 — 25×19 blocs, 0 posés
        effectif : grey, grey, brown
        ⚠ aucun point de départ joueur

    ═══ Mission 5 — 25×19 blocs, 0 posés
        effectif : teal, teal
        ⚠ aucun point de départ joueur

    ═══ Mission 6 — 25×19 blocs, 0 posés
        effectif : teal, teal, grey, grey
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 2 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 3 (grey) sans coordonnées — jamais créé
        ⚠ ennemi 4 (grey) sans coordonnées — jamais créé

    ═══ Mission 7 — 25×19 blocs, 0 posés
        effectif : teal, teal, teal, teal
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 2 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 3 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 4 (teal) sans coordonnées — jamais créé

    ═══ Mission 8 — 25×19 blocs, 0 posés
        effectif : yellow, yellow, yellow, teal, teal
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 2 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 3 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 4 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 5 (teal) sans coordonnées — jamais créé

    ═══ Mission 9 — 25×19 blocs, 0 posés
        effectif : yellow, yellow, grey, grey, grey, grey
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 2 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 3 (grey) sans coordonnées — jamais créé
        ⚠ ennemi 4 (grey) sans coordonnées — jamais créé
        ⚠ ennemi 5 (grey) sans coordonnées — jamais créé
        ⚠ ennemi 6 (grey) sans coordonnées — jamais créé

    ═══ Mission 10 — 25×19 blocs, 0 posés
        effectif : pink, pink
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 2 (pink) sans coordonnées — jamais créé

    ═══ Mission 11 — 25×19 blocs, 0 posés
        effectif : pink, pink, teal, teal, grey, grey
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 2 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 3 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 4 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 5 (grey) sans coordonnées — jamais créé
        ⚠ ennemi 6 (grey) sans coordonnées — jamais créé

    ═══ Mission 12 — 25×19 blocs, 0 posés
        effectif : green, green, pink, pink
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (green) sans coordonnées — jamais créé
        ⚠ ennemi 2 (green) sans coordonnées — jamais créé
        ⚠ ennemi 3 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 4 (pink) sans coordonnées — jamais créé

    ═══ Mission 13 — 25×19 blocs, 0 posés
        effectif : yellow, yellow, yellow, teal, teal, teal
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 2 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 3 (yellow) sans coordonnées — jamais créé
        ⚠ ennemi 4 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 5 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 6 (teal) sans coordonnées — jamais créé

    ═══ Mission 14 — 25×19 blocs, 0 posés
        effectif : green, green, green, pink, pink, pink
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (green) sans coordonnées — jamais créé
        ⚠ ennemi 2 (green) sans coordonnées — jamais créé
        ⚠ ennemi 3 (green) sans coordonnées — jamais créé
        ⚠ ennemi 4 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 5 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 6 (pink) sans coordonnées — jamais créé

    ═══ Mission 15 — 25×19 blocs, 0 posés
        effectif : purple, purple, purple
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 2 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 3 (purple) sans coordonnées — jamais créé

    ═══ Mission 16 — 25×19 blocs, 0 posés
        effectif : purple, purple, purple, green, green
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 2 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 3 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 4 (green) sans coordonnées — jamais créé
        ⚠ ennemi 5 (green) sans coordonnées — jamais créé

    ═══ Mission 17 — 25×19 blocs, 0 posés
        effectif : green, green, green, green, green, green
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (green) sans coordonnées — jamais créé
        ⚠ ennemi 2 (green) sans coordonnées — jamais créé
        ⚠ ennemi 3 (green) sans coordonnées — jamais créé
        ⚠ ennemi 4 (green) sans coordonnées — jamais créé
        ⚠ ennemi 5 (green) sans coordonnées — jamais créé
        ⚠ ennemi 6 (green) sans coordonnées — jamais créé

    ═══ Mission 18 — 25×19 blocs, 0 posés
        effectif : purple, purple, green, pink, teal, teal
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 2 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 3 (green) sans coordonnées — jamais créé
        ⚠ ennemi 4 (pink) sans coordonnées — jamais créé
        ⚠ ennemi 5 (teal) sans coordonnées — jamais créé
        ⚠ ennemi 6 (teal) sans coordonnées — jamais créé

    ═══ Mission 19 — 25×19 blocs, 0 posés
        effectif : purple, purple, purple, purple, purple, purple, purple, purple
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 2 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 3 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 4 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 5 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 6 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 7 (purple) sans coordonnées — jamais créé
        ⚠ ennemi 8 (purple) sans coordonnées — jamais créé

    ═══ Mission 20 — 25×19 blocs, 0 posés
        effectif : white, white
        ⚠ aucun point de départ joueur
        ⚠ ennemi 1 (white) sans coordonnées — jamais créé
        ⚠ ennemi 2 (white) sans coordonnées — jamais créé

## Ce que la conversion a révélé

Le plan de refonte annonçait « les 20 missions réellement remplies » côté dépôt
distant. Le relevé ci-dessus montre que non :

| Missions | Contenu réel |
|---|---|
| 1 et 2 | un vrai tracé (10 et 24 blocs posés) |
| 3 à 5 | aucun bloc, aucun départ joueur, ennemis en pixels |
| 6 à 20 | aucun bloc, aucun départ joueur, ennemis aux coordonnées `null` |

Dix-huit salles vides sur vingt, dont quinze qui ne faisaient apparaître aucun
ennemi — l'ancien code commentait lui-même ces `null` par « pas créé ». La
mission 2 déclarait par ailleurs un départ joueur en `y: 23` sur une arène de
17 blocs de haut : jamais atteignable, jamais remarqué.

Les dix-huit tracés manquants ont donc été **écrits** pour cette refonte. Ce ne
sont pas des relevés, et `src/shared/missions/missions.ts` le dit en toutes
lettres. Ce qui les rend défendables n'est pas leur provenance mais leur
vérification : bordure étanche, effectif conforme, tous les ennemis accessibles
depuis le départ, aucun ennemi à moins de huit tuiles du joueur.

## Profils des neuf couleurs

Transcrits depuis `ENEMY_CONFIGS` et `getAccuracy()` de `legacy/src/enemy.ts`
vers `src/core/systems/ai/profiles.ts`, avec deux conversions d'unités —
multiplicateurs de vitesse conservés tels quels, rotations de tourelle passées
de radians par image à radians par seconde. Le détail et les deux réserves
figurent en tête du fichier.

### La fiche de référence remplace le relevé sur six couleurs

Une fiche de référence complète des dix tanks a été fournie par l'auteur du
projet. Sur six couleurs elle contredit les valeurs portées ici, qui se
présentaient comme des relevés du jeu original :

| | Ancien « relevé » | Fiche de référence |
| --- | --- | --- |
| Gris, Turquoise | 50 % | **70 %** |
| Jaune, Violet | 150 % | **130 %** |
| Noir | 200 % | **170 %** |
| Noir — obus | 3 | **2** |
| Jaune — mines | 0 | **4** |

⚠ **Les deux ne peuvent pas être vraies.** Ni l'une ni l'autre n'est vérifiable
ici : l'ancienne version annonçait des mesures sans les documenter, la fiche est
une synthèse. La fiche l'emporte parce qu'elle est cohérente en interne et
qu'elle décrit aussi les comportements, mais **ces vitesses ne sont plus à
considérer comme mesurées** — c'est du réglage, au même titre que
`CAMPAIGN_RULES`.

Le classement, lui, est stable d'une source à l'autre, et c'est ce qui compte en
jeu : deux tourelles fixes, deux lents, le joueur au milieu, deux rapides, le
noir seul en tête. `tests/ai.test.ts` vérifie ce classement séparément des
chiffres, pour qu'un futur réglage ne puisse pas le casser sans le voir.

### Comportements ajoutés d'après la fiche

Quatre comportements qu'elle décrit n'existaient pas dans le code :

- **Le Noir anticipe.** Il vise là où la cible sera, pas où elle est. Les tanks
  n'ayant pas de vecteur vitesse dans leur état, chaque tireur mémorise la
  position de sa cible au calcul précédent et en déduit un déplacement par pas.
  L'avance est abandonnée pour les tirs à ricochets, où le temps de vol calculé
  à vol d'oiseau n'a plus de sens.
- **Le Violet prend en tenaille.** Il approche en biais plutôt que de face, d'un
  côté fixé par la parité de son identifiant : lâchés à plusieurs, ils
  contournent par des bords opposés.
- **Le Turquoise cherche sa ligne de tir.** Sans ricochet planifié, il n'a que
  la ligne de vue : il se replace tant qu'aucun angle n'est ouvert, et tient sa
  position dès qu'il en a un.
- **Le Gris suit.** Il gardait ses distances, ce qui était l'inverse de ce que
  la fiche décrit.

### Le brun a retrouvé une portée de tir

Supprimer la limite de portée sur le tir (voir plus bas) avait produit un excès
inverse : le brun, décrit comme l'adversaire le plus faible du jeu, canardait
d'un bord à l'autre de l'arène dès qu'une ligne se dégageait. Il est le seul à
porter un `firingRangeTiles` fini ; pour toutes les autres couleurs, c'est
l'existence d'un angle qui commande le tir, et rien d'autre.

Létalité mesurée après réglage, contre un joueur immobile en arène ouverte —
délai moyen avant la mort du joueur, sur 30 graines :

| Brun | Gris | Jaune | Turquoise | Rose | Blanc | Violet | Vert | Noir |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jamais | 9,6 s | 8,2 s | 7,5 s | 4,2 s | 3,9 s | 3,7 s | 2,5 s | 1,7 s |

### Deux corrections apportées après observation du vrai jeu

**Le jaune est un poseur de mines.** Le relevé lui en donnait zéro ; la fiche de
référence lui en donne **quatre**, le quota le plus élevé du jeu, pour un seul
obus. Sa force n'est pas son canon mais sa capacité à saturer une zone.

Une consigne antérieure disait l'inverse — « le jaune ne tire pas, il n'envoie
que des bombes ». Elle a été explicitement annulée : **la fiche est la seule
référence**, et les consignes qui la précèdent ne valent plus. C'est aussi
pourquoi `tests/ai.test.ts` la transcrit en une table unique plutôt qu'en
assertions dispersées : une seule source, qui se relit comme le document.

Conséquence : l'IA sait maintenant poser des mines, ce qu'elle ne faisait pas du
tout (`mine: false` était écrit en dur). Un champ `mineIntervalSeconds` dit qui
mine et à quelle fréquence, séparément du quota. Les quatre couleurs qui en
portent s'en servent désormais toutes ; le violet, le blanc et le noir ont
longtemps gardé là une capacité morte, faute de savoir comment l'original la
leur fait employer.

Trois garde-fous ont été nécessaires, chacun découvert en voyant le jaune se
suicider :

- il fuit toute mine dans un rayon du double du souffle, la sienne comprise ;
- cette fuite contourne les murs au lieu de foncer dedans — glisser le long
  d'un obstacle ne sort pas du souffle ;
- il ne pose ni près d'une mine existante, ni près d'un allié, ni au contact
  du joueur. Sans ça, trois jaunes lâchés dans la même arène s'entretuaient en
  une minute.

**Les tanks n'engagent plus seulement de près.** La portée de détection relevée
(un tiers de la largeur d'arène) gouvernait à la fois le déplacement et le tir,
si bien qu'un brun avec une ligne dégagée restait muet à l'autre bout du
terrain — ce qui se lit comme une panne, pas comme de la prudence. Elle ne
gouverne plus que le **déplacement** ; le tir n'est conditionné qu'à
l'existence d'un angle. Les valeurs relevées sont inchangées, seul leur champ
d'application est réduit.

## Missions 21-100 : paliers et remix scellé

Le vrai jeu va jusqu'à cent missions ; ce dépôt s'arrêtait à vingt, faute de
relevé exploitable au-delà (voir plus haut). Cette section documente ce qui a
été ajouté pour rejoindre les cent, dans `src/shared/missions/generate.ts` et
`src/shared/missions/milestones.ts`.

### La base : une seule source, non recoupée

Contrairement aux missions 1-20, il n'existe ici aucun code source à
convertir. La seule information disponible vient d'un site de stratégie
consacré au jeu, résumée sans en recopier le texte : au-delà de la vingtième
mission, l'essentiel des niveaux ne sont pas des tracés uniques mais des
**remixes** des vingt premiers, avec une composition d'ennemis tirée au sort à
chaque partie et un effectif qui croît avec le numéro (~4 ennemis vers la
mission 60, ~6 vers 80, ~8 à partir de 91). Des paliers réguliers (30, 40, 50,
60, 70, 80, 90, 100) seraient en revanche des scènes fixes et plus difficiles,
le tank noir faisant sa première apparition à la mission 50.

⚠️ Cette source est **unique et n'a pas été recoupée**. Elle a la même valeur
qu'une indication de terrain : un point de départ plausible, pas un fait
vérifié. Les nombres qui en découlent (paliers, effectifs, palier
d'apparition du noir) sont donc à traiter comme `CAMPAIGN_RULES` dans
`campaign.ts` — un réglage à ajuster à l'usage, pas une donnée figée.

### Ce qui a été retenu, et ce qui a été écarté

**Retenu** — le mécanisme : des paliers fixes tous les dix niveaux, un remix
tiré au sort pour le reste, le noir introduit au palier 50. C'est ce qui donne
à la campagne étendue le même rythme que l'original, sans prétendre
reproduire cent tracés dont personne n'a le détail.

**Écarté** — les arènes uniques que la même source prête aux missions 25, 35,
45, 55 et 65 (par opposition à un simple remix). Le niveau de confiance sur ce
détail précis est plus faible que sur les paliers, et son absence ne se
remarque pas en jeu : ces cinq missions deviennent des remix ordinaires,
comme leurs voisines. Travail futur si la source se confirme.

### Le mécanisme de remix n'est pas un relevé — c'est une conception originale

Le vrai algorithme de tirage du jeu original n'est documenté nulle part, seul
son comportement observable l'est (tracé réutilisé, composition variable).
Le mécanisme mis en place ici — reprendre le tracé d'une mission 1-20, en
retirer les ennemis, en replacer un nombre croissant tirés au sort dans un
pool de couleurs débloquées progressivement — est donc une solution originale
de cette refonte, pas une reproduction. Elle est scellée sur le numéro de
mission (jamais sur l'horloge) : c'est ce qui garantit qu'une mission donnée
produit toujours le même monde, condition dont dépendent le rejeu après échec
et l'accord serveur/client en co-op.

### Les huit paliers sont écrits à la main, pas mesurés

Comme les dix-huit tracés manquants des missions 3-20, les huit arènes de
`milestones.ts` sont des tracés originaux, écrits selon les deux mêmes règles
(terrain ouvert, aucun ennemi à moins de huit tuiles du départ) et vérifiés
par les mêmes tests mécaniques. Seuls les **effectifs** (qui, combien, à quel
palier) s'appuient sur la source ci-dessus — et seulement comme point de
départ :

| Palier | Effectif | Noir |
|---|---|---|
| 30 | blanc ×2, violet ×1, vert ×1 | — |
| 40 | blanc ×3, violet ×2 | — |
| 50 | noir ×1, blanc ×2, violet ×2 | première apparition |
| 60 | noir ×2, blanc ×2, violet ×2 | |
| 70 | noir ×3, blanc ×2, violet ×1 | |
| 80 | noir ×3, blanc ×2, violet ×2 | |
| 90 | noir ×4, blanc ×2, violet ×2 | |
| 100 | noir ×5, blanc ×2, violet ×1 | l'effectif le plus lourd |

Ces chiffres ont été choisis pour rester cohérents entre eux (progression
sans jamais redescendre) et compatibles avec les trois repères de la source
— pas calculés à partir d'une formule qui, sur une seule source non
recoupée, aurait relevé de la précision de façade.
