# Musique

Ce dossier reçoit un morceau par mission. **Il est vide dans le dépôt** : aucun
fichier audio n'est distribué avec le jeu.

## Nommage

Un fichier MP3 par mission, numéroté sur deux chiffres :

```
public/musique/
├── 01.mp3      ← mission 1
├── 02.mp3      ← mission 2
├── …
└── 20.mp3      ← mission 20
```

Les deux chiffres ne sont pas cosmétiques : ils font correspondre l'ordre
alphabétique du dossier à l'ordre des missions, alors que `10` se glisserait
entre `1` et `2`.

Un fichier absent n'est pas une erreur — la mission se joue simplement en
silence, et le jeu ne réessaie plus de le charger.

## Comportement

Le morceau tourne en boucle pendant la mission et se fond dans le suivant au
changement (~0,9 s). La touche `M` coupe la musique avec le reste du son, et le
volume général s'applique — la musique à 45 % de celui-ci, pour que les tirs et
les mines restent lisibles par-dessus.

Réglages dans [`src/client/audio/music.ts`](../../src/client/audio/music.ts).

## Provenance des fichiers

À toi de les fournir, et de t'assurer que tu as le droit de les utiliser et de
les diffuser. La bande-son originale de *Wii Play* appartient à Nintendo :
l'extraire et la publier dans un dépôt public serait de la contrefaçon, même
pour des morceaux courts. Selon ton usage :

- **Dépôt public** — musique libre de droits ou composition originale. Il
  existe des banques sous licences Creative Commons ou CC0 ; vérifie la licence
  de chaque morceau, elles ne se valent pas (l'attribution est souvent exigée).
- **Usage strictement privé** — garde tes fichiers en local et ajoute
  `public/musique/*.mp3` à `.gitignore`, pour qu'ils ne partent jamais dans un
  commit.
