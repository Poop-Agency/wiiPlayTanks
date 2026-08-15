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

### L'esquive n'appartient qu'à deux couleurs

`findEvasion` s'appliquait à **tous** les tanks mobiles, avec le même horizon
d'anticipation d'une seconde — largement de quoi sortir du couloir de tir. Le
turquoise, le jaune et le rose étaient donc aussi difficiles à toucher que le
noir, ce qui rendait la moitié faible de la campagne bien plus retorse que
l'original. Or la fiche ne mentionne l'esquive que deux fois : le Gris
« esquive parfois », le Noir « esquive activement ».

L'anticipation est devenue un réglage de profil, `evasionSkill`, exprimé en
fraction de `TUNING.ai.evasionHorizonSeconds` pour que le panneau de
calibration garde la main sur l'échelle globale. **Zéro pour six couleurs sur
neuf.**

Ce n'est délibérément **pas** une probabilité : le noyau doit rester
déterministe, et un tirage au sort par obus ferait vibrer le tank à l'écran.
Une valeur intermédiaire veut dire *prévenu plus tard*, donc trop tard pour se
dégager quand le châssis est lent — il faut environ une largeur de châssis de
décalage pour sortir du couloir.

Taux de survie à un obus tiré à deux tuiles, sur 20 graines, mines neutralisées
et fenêtre arrêtée au passage de l'obus (`tests/ai.test.ts`) :

| Brun | Vert | Turquoise | Gris | Rose | Jaune | Violet | Blanc | Noir |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 % | 0 % | 35 % | 60 % | 70 % | 75 % | 100 % | 100 % | 100 % |

Les tourelles fixes encaissent toujours. **Le Rose et le Jaune passent devant
le Gris sans esquiver du tout** : à 100 % et 130 % de vitesse, leur patrouille
les sort du couloir plus souvent qu'elle n'y ramène le Gris, qui est à 70 %.
C'est une chance, pas un talent, et c'est pourquoi le témoin utile est le
Turquoise — même vitesse que le Gris, aucune esquive, 35 %. Le Gris est réglé à
0,25 pour se tenir nettement au-dessus de ce témoin sans devenir intouchable :
au-delà de 0,3 il passe à 95 %, ce qui n'est plus « parfois ».

⚠ **Le Violet et le Blanc sont déduits, pas relevés.** La fiche ne leur prête
aucune esquive ; elle leur prête une « IA avancée ». C'est le seul choix de
cette passe qui ne vienne pas de la fiche.

Leurs deux valeurs ont été réglées à la mesure après un audit externe qui
soupçonnait, à juste titre, que les chiffres au-dessus de 0,35 n'avaient aucun
effet. Protocole : joueur immobile qui tire en continu, adversaire à 11 tuiles,
80 graines, nombre de parties où le joueur parvient à le tuer.

| `evasionSkill` | 0,20 | 0,25 | 0,30 | 0,35 | 0,45 | 0,60 |
| --- | --- | --- | --- | --- | --- | --- |
| **Violet** | 22/80 | 21/80 | 21/80 | 23/80 | 22/80 | 21/80 |
| **Blanc** | 33/80 | 31/80 | 19/80 | 17/80 | 15/80 | 14/80 |
| **Noir** | **80/80** | 0/80 | 0/80 | 0/80 | 0/80 | 3/80 |

Trois enseignements, et ils vont à l'encontre de l'intuition :

- **Le Violet est plat dès 0,20.** À 130 % de vitesse, un préavis minime lui
  suffit pour dégager le couloir. Il est donc ramené à **0,25**, le même cran
  que le Cendre : sa supériorité vient de son châssis, pas de sa vigilance.
  Écrire 0,6 revenait à noter un chiffre sans effet.
- **Le Blanc, lui, continue de progresser** jusqu'à 0,6 — il est à 100 % de
  vitesse et lui faut plus de préavis pour la même distance latérale. Il **garde
  0,6** ; l'aligner sur le Violet le rendrait deux fois plus facile à tuer, à
  armement identique.
- **Le Noir a une falaise entre 0,20 et 0,25**, et rien au-delà. Il garde
  néanmoins **1**, qui veut dire « pleine vigilance » relativement au réglage
  global : calibrer sur 0,25 casserait le jour où
  `TUNING.ai.evasionHorizonSeconds` change.

⚠ **`evasionSkill` n'est donc pas un classement de dangerosité.** C'est un temps
de réaction, et deux tanks au même cran peuvent être très inégaux à l'écran.
`tests/ai.test.ts` verrouille ce piège explicitement.

### Le cône du Turquoise élargi à ±11°

Sa roquette ne rebondit pas : une balle perdue l'est définitivement, là où un
obus manqué peut revenir de bande. À ±8,6° il devenait presque aussi fiable que
le Vert dès qu'il tenait son angle, ce que ni la fiche ni son rôle dans la
campagne ne justifient. Réglage, non relevé.

### Le vert ne trouvait pas ses ricochets

Signalé en jeu : « les verts ratent trop souvent, alors que leur seule force est
de toujours tirer parfaitement ». La mesure a corrigé le diagnostic — contre une
cible immobile **comme mobile**, en arène ouverte comme derrière un mur, le vert
touchait déjà 30 fois sur 30. Il ne ratait pas : par endroits, **il ne tirait
pas du tout**. Six verts en mission 17 n'envoyaient pas un obus en quarante
secondes.

Deux défauts distincts dans la recherche d'angle, et un troisième qui n'en est
pas un :

- **Le balayage était en tout ou rien.** 180 échantillons, soit 2° d'écart : au
  bout d'un trajet à deux bandes, deux angles voisins arrivent à une tuile l'un
  de l'autre, et une cible de 0,78 tuile passe **entre les deux**. La recherche
  note maintenant l'**écart** de chaque angle et affine chaque minimum local au
  dixième de degré. Elle trouve donc des solutions là où elle n'en voyait
  aucune, et elle centre le tir sur le milieu de la cible au lieu de le laisser
  frôler son bord.
- **Le plafond de trajectoire mordait.** `MAX_TRACE_DISTANCE` valait 40 tuiles,
  or un tir à deux bandes sur un plateau 18 × 18 atteint couramment cette
  longueur : la trajectoire était tronquée avant d'avoir pu revenir sur la
  cible. Porté à 90.
- **La mission 17, elle, n'a pas de solution du tout.** Son tracé est un
  empilement de barres horizontales ; depuis la position des verts, l'écart
  minimal au joueur est de 4,2 tuiles sur 3600 angles essayés, tous rebonds
  confondus. C'est un problème de **tracé**, pas d'IA — et la mission 17 fait
  partie des grilles écrites pour cette refonte, en attente de capture.

Le cône du vert passe par ailleurs à **zéro**. Sa valeur tient entièrement dans
le fait que son ricochet arrive là où il l'a calculé ; un cône, même minuscule,
se paie au bout d'une trentaine de tuiles de trajet.

### L'interception : abattre l'obus quand on ne peut pas l'esquiver

Signalé en jeu : un tank acculé encaisse sans rien tenter, alors qu'il pourrait
tirer sur l'obus qui arrive.

⚠ **La collision obus contre obus existait déjà**, dans `systems/damage.ts` —
c'est l'IA qui ne s'en servait pas. Deux corrections tout de même sur la
mécanique elle-même :

- **Test balayé.** Deux obus rapides qui se croisent de face se rapprochent de
  0,3 tuile par pas pour un rayon cumulé de 0,19 : comparer les seules positions
  les laissait se traverser un pas sur deux.
- **Exemption au canon.** Deux obus d'un même tireur ne se détruisent plus tant
  que l'un des deux n'est pas armé — le rose en garde trois en vol, tirés à la
  file.

Côté IA, `interceptionAngle` résout l'instant de rencontre par une équation du
second degré, et n'intervient **que si l'esquive n'a rien donné** : un tank qui
peut s'écarter s'écarte, ce qui est plus sûr et ne consomme pas son quota
d'obus. Survie à un obus tiré à bout portant sur un tank qui ne peut pas bouger,
20 graines :

| | Brun | Vert | Turquoise | Rose |
| --- | --- | --- | --- | --- |
| **obus à 8 tuiles** | 0/20 | 20/20 | 16/20 | 20/20 |
| **obus à 4 tuiles** | 0/20 | 0/20 | 16/20 | 18/20 |

La parade n'est pas gratuite : il faut amener le canon sur l'obus. Le brun, à
3,3 s le quart de tour, n'y arrive jamais — l'adversaire le plus faible du jeu
le reste. Le vert y arrive à huit tuiles, plus à quatre.

### Le rose fonçait dans son propre ricochet

Deux horizons d'esquive au lieu d'un. Esquiver l'obus d'un **adversaire** reste
un talent réservé au cendre et au noir ; ne pas foncer dans son **propre**
ricochet n'en est pas un, c'est de la conservation élémentaire, du même ordre que
fuir sa propre mine. Le second horizon est donc ouvert à tous les mobiles.

Sans cette distinction, le rose — qui n'esquive rien, garde trois obus en vol et
charge à trois tuiles — repartait droit dans l'obus qu'il venait de renvoyer
contre le mur d'en face. Ses suicides tombent à zéro sur toutes les missions
mesurées.

### Les tanks contournent les murs, et les poseurs les percent

Défaut le plus visible signalé en jeu : un ennemi qui « traque » poussait en
**ligne droite** vers sa cible. Devant un mur, le système de mouvement le faisait
glisser le long de la paroi et il restait collé derrière, à pousser dans le vide.
Le joueur se mettait à couvert et l'attaque s'arrêtait net.

`systems/ai/navigation.ts` ajoute un **champ de distance** — propagation en
largeur depuis la case de la cible, sur les cases franchissables — que chaque
tank descend en pente. Trois précautions :

- **La ligne droite reste prioritaire** quand la vue est dégagée, ce qui est le
  cas la plupart du temps en terrain ouvert. Le contournement n'intervient que
  lorsqu'il y a réellement quelque chose à éviter, et le mouvement garde sa
  fluidité d'avant.
- **Les mines vivantes sont des obstacles** dans la propagation. Un poseur ne
  traverse plus le souffle de sa propre mine pour rejoindre le joueur.
- **Sans chemin du tout**, le tank reprend sa patrouille. Pousser dans un
  obstacle se lit comme une panne.

Les mines détruisent le terrain cassable, et l'IA l'ignorait : elle contournait
sagement une cloison de liège qu'elle pouvait ouvrir. `breachGain` chiffre le
raccourci qu'ouvrirait chaque bloc à portée de souffle ; au-delà de trois cases
gagnées, le poseur mine le mur au lieu d'en faire le tour. C'est ce qui permet de
prendre en tenaille un joueur retranché — et sur un tracé comme la mission 9,
dont une colonne de liège coupe l'arène dans toute sa hauteur, c'est la
différence entre attaquer et défiler.

Coût mesuré : **moins de 0,6 % du budget d'une image à 60 Hz**, missions les plus
chargées comprises. Rien n'est mis en cache, délibérément — un cache demanderait
d'être invalidé par la grille, par les mines et par la position de la cible, et
une invalidation ratée se paierait en divergence réseau, bien plus cher que le
calcul lui-même.

### L'IA se tuait toute seule : quatre causes, mesurées puis corrigées

Signalé en jeu comme un comportement « auto-destructeur énorme » du violet et du
blanc. Un audit a attribué chaque mort d'IA à sa cause, joueur totalement passif,
12 graines, 60 s par mission.

| | Mission 15 | Mission 16 | Mission 19 | Mission 20 | Mission 100 |
| --- | --- | --- | --- | --- | --- |
| **Avant** | 1 | 0 | 14 | 7 | 1 |
| **Après** | 0 | 3 | 0 | 4 | 0 |

Quatre défauts distincts, tous confirmés par la mesure avant d'être touchés :

1. **Le cône d'erreur n'était pas pris en compte.** `findFiringSolution` écarte
   les angles traversant un allié, mais seulement l'angle **nominal** ; l'écart
   de visée est tiré *au tir*, après validation. `shotIsSafe` refait la
   vérification à l'instant du tir et sur tout le cône. Le tank ne corrige pas
   son angle, il **s'abstient**.
2. **Les alliés bougent.** Un couloir libre au moment du tir ne l'est plus une
   fraction de seconde plus tard. La boîte d'un allié est désormais élargie de
   ce qu'il peut parcourir pendant le vol de l'obus. **C'est de loin le
   correctif le plus efficace des quatre** : à lui seul il fait passer la
   mission 19 de 14 morts à 1.
3. **Une mine se pose en reculant, pas en chargeant.** Un traqueur qui minait en
   approche restait dans le souffle par construction : il continuait d'avancer
   vers l'adversaire, donc de tourner autour du point qu'il venait de miner.
   Poser exige maintenant de s'éloigner de la cible — sauf pour percer un mur,
   où le bloc visé est forcément devant.
4. **On ignorait son propre ricochet.** La règle du jeu veut qu'on puisse se
   tuer avec, et l'IA l'excluait de son esquive. Un obus **armé** compte
   désormais pour son propre tireur.

⚠ **Deux fausses pistes, à ne pas refaire.** Traiter les mines comme des murs
dans le tirage de patrouille a *empiré* les choses : la direction se retirait à
chaque pas et le tank piétinait sur place. Et le rayon de fuite calculé sur la
mèche restante oubliait la demi-boîte du châssis, si bien que la fuite se
relâchait une fraction de tuile trop tôt et que le tank revenait mourir dessus.

### Les alliés ne s'agglutinent plus

Tous les tanks d'une mission poursuivent la même cible par le même chemin :
sans rien pour les séparer ils s'empilent, arrivent en colonne, se masquent la
ligne de tir et se tirent dessus. Le turquoise en donnait le cas le plus visible,
puisqu'il se fige dès qu'il tient un angle et que le suivant venait se coller à
lui.

Une répulsion de proximité, minoritaire face à la consigne d'origine — le but est
d'arriver **en éventail**, pas de renoncer à approcher. Paires de tanks à moins
de 2,5 tuiles, 12 graines, 45 s :

| | Mission 7 | Mission 8 | Mission 19 |
| --- | --- | --- | --- |
| **Sans répulsion** | 2,0 % | 9,8 % | 5,3 % |
| **Avec** | 0,0 % | 5,4 % | 2,8 % |

### Le brun a retrouvé une portée de tir

⚠ **Une alternative a été essayée puis rejetée** : donner au brun une tourelle
qui balaie en continu (`turretMode: 'sweep'`) au lieu de suivre le joueur, ce
qui aurait permis de supprimer ce plafond de portée. Le soupçon était fondé — le
brun utilise aujourd'hui *exactement* le même algorithme de visée que le noir,
seulement bridé, ce qui est un tank intelligent rendu mauvais artificiellement
plutôt qu'un tank réellement rudimentaire. Mais le résultat en jeu n'a pas
convaincu l'auteur du projet, et le code a été retiré plutôt que gardé en
sommeil.

Deux constats mesurés à l'occasion, à ne pas réinventer :

- L'argument selon lequel un canon balayant tomberait plus rarement sur une
  cible lointaine (elle occupe moins d'angle : 11° à 4 tuiles, 3,7° à 12) est
  **faux**. Le pas de rotation par tick vaut 0,5°, bien plus fin que la cible la
  plus lointaine : la tourelle ne saute jamais par-dessus.
- Ce qui retient réellement le brun à distance est `maxActiveShells: 1` combiné
  au temps de vol — à trente tuiles un obus met sept secondes, pendant lesquelles
  il ne peut pas retirer. Ce mécanisme existe indépendamment du mode de tourelle.

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

| Palier | Tracé | Effectif | Source |
|---|---|---|---|
| 30 | propre au palier | blanc ×2, violet ×2, vert ×1 | capture |
| 40 | écrit ici | blanc ×3, violet ×2 | à l'œil |
| 50 | **celui de la mission 5** | noir ×2 | capture |
| 60 | écrit ici | noir ×2, blanc ×2, violet ×2 | à l'œil |
| 70 | écrit ici | noir ×3, blanc ×2, violet ×1 | à l'œil |
| 80 | écrit ici | noir ×3, blanc ×2, violet ×2 | à l'œil |
| 90 | **celui de la mission 4** | cendre ×8 | capture |
| 100 | **celui de la mission 1** | noir ×4, brun ×2, blanc ×1, vert ×1 | capture |

Quatre paliers ont depuis été relevés sur capture, et ils corrigent deux idées
fausses de la première passe.

**Un palier n'est pas forcément une arène neuve.** Le 50 rejoue le terrain de la
mission 5, le 90 celui de la 4, le 100 celui de la 1 — seul l'effectif change.
Le 30, lui, a bien son tracé propre. Les quatre paliers non relevés (40, 60, 70,
80) gardent le tracé écrit pour cette refonte, faute de savoir lequel des vingt
ils reprennent.

**L'effectif ne mesure pas la difficulté.** Le palier 50 n'aligne que deux tanks
noirs sur un terrain nu, là où le 40 en compte cinq. Un test vérifiait que
l'effectif des paliers ne redescendait jamais ; c'était une règle inventée faute
de données, et elle est tombée. Le commentaire laissé à sa place dans
`tests/missions.test.ts` explique pourquoi il ne faut pas la réintroduire.

Les effectifs encore marqués « à l'œil » restent choisis pour la cohérence de la
progression, pas calculés — sur une source unique et non recoupée, une formule
n'aurait relevé que de la précision de façade.

## Le wiki du jeu original, et les six écarts qu'il a révélés

Une fiche récapitulative du jeu original — vitesse, obus simultanés, rebonds,
mines, type de projectile et mission d'apparition pour les dix tanks — a été
confrontée ligne à ligne à `profiles.ts`.

**Les dix lignes chiffrées correspondent, sans exception.** Le portage depuis
l'ancienne version était juste sur tout ce qui est un nombre. Deux valeurs
jusque-là marquées « écrites à l'estime » s'y trouvent également confirmées :
trois tanks de réserve au départ et un tank offert toutes les cinq missions
(`CAMPAIGN_RULES` dans `shared/campaign.ts`).

Les écarts sont tous dans les **descriptions de comportement**, et ils se
rangent en trois catégories.

### Corrigés

| Couleur | Ce que dit la fiche | Ce qu'on faisait |
|---|---|---|
| gris | *« their movement does not [seek the player] … neither offensive or defensive »* | `hunt` — il traquait |
| sarcelle | *« defensive in their movement »*, mouvement qui ne cherche pas | `seekLine` — il allait chercher sa ligne de vue, puis se figeait |
| noir | *« defensive and tend to run away whenever you fire at them »* | `hunt` — il chargeait |

Le style `seekLine` a disparu avec ce changement : il n'existait que pour le
sarcelle. Sa disparition règle au passage un troisième point de la fiche, *« the
tanks that move never stop moving »* — c'était le seul style qui immobilisait un
châssis mobile.

Ajouté également : **les tanks mobiles poussent les tanks fixes**. La fiche en
fait une tactique explicite (déplacer un vert le long d'un mur pour aller le
miner de l'autre côté). `movement.ts` annulait jusque-là l'axe fautif dans tous
les cas. La poussée ne se propage pas d'un tank à l'autre — voir le commentaire
sur place pour le pourquoi.

### Écarts assumés, demandés par l'auteur du projet

Ces trois-là s'écartent de la fiche **délibérément**, sur des observations de
jeu réelles. Ils sont documentés ici pour qu'on ne les « corrige » pas par
inadvertance en relisant le wiki.

- **Le brun vise au lieu de balayer au hasard.** La fiche dit *« turrets do not
  actively seek the player, but only search randomly »*. Le balayage a été
  implémenté puis retiré : il rendait le brun inoffensif au point d'être ennuyeux.
- **Le sarcelle n'esquive pas.** La fiche lui prête *« avoid bullets and
  mines »*. L'esquive a été retirée à toutes les couleurs jusqu'au rose, parce
  que des adversaires faibles qui esquivent parfaitement se lisent comme un bug.
- **Le violet et le blanc ne se piègent plus avec leurs propres mines.** La
  fiche en fait leur **faiblesse principale** (*« Their biggest weakness is
  mines. They tend to lay mines for no reason, therefore trapping themselves »*)
  et la stratégie recommandée contre eux. `canLeaveMineBehind` et
  `canReachSafety` la suppriment. Conséquence à garder en tête : **nos violets
  et nos blancs sont plus durs que ceux de l'original.**

### Écarts connus, non traités

- Le **jaune** est en `erratic`, qui se dirige vers la cible une fois sur deux ;
  la fiche dit que son mouvement ne cherche pas le joueur.
- Le **vert** prend la meilleure solution de tir, ricochet ou pas ; la fiche dit
  *« They will rarely fire directly at you, if ever »*.
- L'esquive du **blanc** (0,6) est la deuxième du jeu, ce qui cadre mal avec son
  intelligence annoncée *« Normal-Low »*. La valeur est mesurée, pas devinée :
  l'aligner sur le violet le rendait deux fois plus facile à tuer à armement
  identique.
- Le **blanc** n'a pas ses indices sonores (*« a high or low sound »* selon qu'il
  passe à l'offensive ou en défense) et ses chenilles ne sont pas plus marquées
  que celles des autres.
- **Le verrou des vingt premières missions** n'est pas implémenté : la campagne
  enchaîne 1 → 100 d'un trait, là où l'original n'ouvre les cent qu'une fois la
  vingtième franchie.
