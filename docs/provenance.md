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

## Effectifs des vingt missions

Transcrits depuis les listes `enemies` de `legacy/src/level.ts`. C'est la seule
donnée de progression que l'ancienne version contenait pour l'ensemble de la
campagne, et `tests/missions.test.ts` vérifie que chaque grille la respecte.
La couleur `grey` y est devenue `ash`, seul renommage.


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
