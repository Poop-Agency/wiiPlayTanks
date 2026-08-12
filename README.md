# Tanks!

Un clone du mini-jeu **Tanks!** de Wii Play : vingt missions, neuf couleurs de
tanks ennemies, et un co-op en ligne à deux à quatre joueurs.

Le projet a été entièrement réécrit autour de trois exigences : que le jeu soit
**fidèle** à l'original, que le code soit **lisible**, et que le multijoueur ne
demande **aucun remaniement** du gameplay.

---

## Démarrer

Il faut [Bun](https://bun.sh) — tout le reste s'installe avec.

```bash
bun install

bun run dev      # solo : http://localhost:5173
bun run coop     # co-op : construit le client et sert le tout sur :3000
```

En co-op, ouvrez `http://localhost:3000` dans deux fenêtres, choisissez le même
nom de salon, et jouez. Qui arrive ensuite rejoint la partie en cours.

### Commandes

| | |
|---|---|
| **ZQSD** · **WASD** · flèches | déplacer le tank |
| **Souris** | viser — la tourelle est indépendante du châssis |
| **Clic gauche** | tirer |
| **Clic droit** · **E** · **Maj** | poser une mine |
| **Manette** | stick gauche pour se déplacer, stick droit pour viser |
| **M** | couper le son |
| **~** | panneau de calibration |
| **Entrée** | reprendre après une fin de partie |

La manette est la transposition la plus proche de l'original, où le stick du
nunchuk déplace le tank pendant que le pointeur de la Wiimote vise séparément.

### Adresses utiles

| URL | Mode |
|---|---|
| `/` | écran-titre |
| `/?mission=12` | campagne solo, à partir de la mission 12 |
| `/?enligne=1&salon=x&nom=y` | co-op |
| `/?bac=1` | terrain d'essai (géométrie stable, pour les tests) |
| `/?bac=1&calme=1` | le même, sans ennemis |

---

## Architecture

Le principe tient en une phrase : **la simulation est une fonction pure de
l'état et des intentions**, et tout le reste est branché autour.

```
        ┌──────────┐        ┌──────────┐
        │  client  │        │  server  │
        └────┬─────┘        └─────┬────┘
             │                    │
             └────────┬───────────┘
                      ▼
                 ┌─────────┐
                 │ shared  │   protocole réseau, missions, campagne
                 └────┬────┘
                      ▼
                 ┌─────────┐
                 │  core   │   simulation pure, déterministe
                 └─────────┘
```

| Dossier | Rôle | Peut importer |
|---|---|---|
| `core/` | Simulation déterministe. Zéro DOM, zéro hasard non seedé. | rien |
| `shared/` | Protocole, les 20 missions, progression de campagne. | `core/` |
| `client/` | Rendu, saisie, réseau, interface, audio. | `core/`, `shared/` |
| `server/` | Serveur autoritaire Bun, salons. | `core/`, `shared/` |

### Les six décisions qui portent tout le reste

**1. Un seul `tick()`, trois appelants.** Le serveur, le client qui prédit, et
les tests appellent exactement la même fonction. Il n'existe aucune seconde
implémentation de la physique — le mode solo n'est pas un chemin de code à
part, c'est un salon instancié en mémoire.

**2. Pas de temps fixe à 60 Hz.** La simulation avance par pas de `1/60 s`
quelle que soit la fréquence d'affichage. Sans ça, parler de « vitesse fidèle à
l'original » n'aurait aucun sens : l'ancienne version tournait 2,4 fois plus
vite sur un écran 144 Hz.

**3. L'état est du pur JSON.** Aucune classe, aucune méthode, aucune référence
circulaire. `structuredClone` et `JSON.stringify` fonctionnent tels quels —
c'est ce qui rend le snapshot réseau et le rejeu triviaux.

**4. Déterminisme strict.** Aucun `Math.random()` ni `Date.now()` dans `core/`.
Le générateur pseudo-aléatoire est seedé et **son état vit dans le monde**, donc
il est snapshoté et rejoué avec lui. Un test rejoue 10 000 pas et compare une
empreinte.

**5. Le client n'envoie que des intentions.** Jamais une position. Un client ne
peut donc pas se téléporter : c'est structurel, pas une validation qu'on
pourrait oublier.

**6. Tout le gameplay est en données.** `core/tuning.ts` porte les constantes
globales, `core/systems/ai/profiles.ts` les caractéristiques des neuf couleurs.
Aucun `switch` sur la couleur n'existe dans la logique — l'ancienne version en
avait trois, dispersés.

### Le réseau en trois lignes

Le serveur détient la seule partie qui fasse foi et exécute toute l'IA. Le
client **prédit son seul tank** : il applique son intention immédiatement, et à
chaque instantané reçu il adopte l'état serveur puis rejoue ce qui n'a pas
encore été confirmé. Les autres entités sont **interpolées avec 100 ms de
retard, jamais prédites** — le client ignore les intentions des autres joueurs,
une prédiction serait une invention que chaque instantané corrigerait par une
téléportation.

---

## Fidélité

C'est l'exigence la plus difficile, parce que les constantes du jeu Wii ne sont
documentées nulle part. La méthode retenue est en deux temps.

**D'abord les faits.** Les seules grandeurs observables sont des temps de
traversée, relevés image par image sur l'original : un obus franchit l'arène de
736 px en 4 s, le tank du joueur en 7 s, un missile va exactement deux fois plus
vite. Tout le reste en dérive, et des tests le vérifient directement.

C'est aussi pourquoi **toutes les arènes font 23 tuiles de large** : 23 × 32 px
= 736 px, très exactement la règle graduée qui a servi à mesurer. « Un obus
traverse l'arène en 4 s » se vérifie donc chronomètre en main, dans le jeu qui
tourne.

**Ensuite le ressenti.** Le panneau de calibration (touche `~`) expose une
quarantaine de réglages, appliqués **en direct sans rechargement**, et les
vitesses s'y règlent en secondes de traversée — la grandeur qu'on sait
chronométrer, donc celle dans laquelle on compare. Ce qu'on retient s'exporte en
JSON et se recopie dans la source.

Ce qui n'a **pas** été mesuré est signalé en clair dans le code : les valeurs de
mines (`TUNING.mine`) et les règles de progression (`CAMPAIGN_RULES`).

`docs/provenance.md` fige ce qui a été extrait de l'ancienne version, et ce qui
ne l'a pas été.

### Un mot sur les vingt arènes

Les effectifs des vingt missions sont portés tels quels de l'ancienne version :
c'est la vraie donnée de progression, et un test verrouille chaque grille
dessus. **Les tracés, en revanche, n'existaient que pour les deux premières
missions** — les dix-huit autres ont été écrits pour cette refonte, et
`src/shared/missions/missions.ts` le dit sans détour.

Ce qui les rend défendables n'est pas leur provenance mais leur vérification :
bordure étanche, effectif conforme, tous les ennemis accessibles depuis le
départ, aucun ennemi à moins de huit tuiles du joueur. Ces deux dernières règles
viennent d'erreurs commises en chemin — un tracé trop cloisonné rend les
ennemis muets et ressemble à une panne d'IA ; un tank vert à cinq tuiles tue
avant qu'on ait bougé.

Le format est de l'ASCII, précisément pour que les corriger soit trivial :

```
#######################
#.....................#
#....##.........a.....#
#.........XX...b......#
#..1..................#
#######################
```

`#` incassable · `X` cassable (mines seules) · `H` trou · `.` sol libre ·
`1`–`4` départs joueurs · une lettre par couleur d'ennemi.

---

## Développement

```bash
bun run dev         # serveur de développement Vite
bun run serve       # serveur de jeu seul, sur :3000
bun run typecheck   # TypeScript, sans émission
bun test ./tests    # tests unitaires
bun run e2e         # tests bout-en-bout Playwright
bun run build       # typecheck + bundle dans dist/
```

`bun run dev` et `bun run serve` côte à côte suffisent pour travailler sur le
co-op : le client trouve le serveur tout seul.

### Ce que les tests garantissent

Quatre garde-fous méritent d'être connus, parce qu'ils sont ce qui empêche le
projet de redevenir ce qu'il était :

| Test | Ce qu'il interdit |
|---|---|
| `core-purity` | tout DOM ou toute source d'indéterminisme dans `core/` |
| `determinism` | qu'une même suite d'intentions produise deux états différents |
| `tuning-guard` | qu'un nombre de gameplay réapparaisse anonymement dans la logique |
| `missions` | qu'une arène devienne injouable, inaccessible ou trop dangereuse au départ |

### Calibrer

1. lancer le jeu, ouvrir le panneau avec `~` ;
2. jouer, ajuster, comparer — les changements sont immédiats ;
3. cliquer sur **Copier** : l'export commence par le bloc `mesures`, celui qui
   se vérifie au chronomètre ;
4. recopier dans `src/core/tuning.ts` ou `src/core/systems/ai/profiles.ts`.

Le panneau expose aussi trois calques de débogage : boîtes de collision,
trajectoires prévues des obus (rebonds compris), et rayons de souffle des mines.
Les trajectoires réutilisent la fonction dont l'IA se sert pour viser — on voit
donc ce que les ennemis calculent, pas une seconde implémentation.

---

## Historique

Ce dépôt contenait une première version, abandonnée. Elle a servi de source de
données — mesures de vitesse, caractéristiques des tanks, effectifs des missions
— puis son code a été supprimé. Il reste consultable dans l'historique git, et
`docs/provenance.md` conserve tout ce qui en a été extrait.

Aucune ligne de sa logique n'a été reprise.
