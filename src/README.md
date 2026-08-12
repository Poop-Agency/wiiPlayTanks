# Organisation du code

Les dépendances vont toujours de l'extérieur vers l'intérieur. `core/` est au
centre et ne connaît personne.

```
        ┌──────────┐        ┌──────────┐
        │  client  │        │  server  │
        └────┬─────┘        └─────┬────┘
             │                    │
             └────────┬───────────┘
                      ▼
                 ┌─────────┐
                 │ shared  │   protocole réseau, données de mission
                 └────┬────┘
                      ▼
                 ┌─────────┐
                 │  core   │   simulation pure, déterministe
                 └─────────┘
```

| Dossier | Rôle | Peut importer |
|---|---|---|
| `core/` | Simulation déterministe. Zéro DOM, zéro hasard non seedé. | rien |
| `shared/` | Protocole client↔serveur, définitions des 20 missions. | `core/` |
| `client/` | Rendu, saisie, réseau côté client, interface. | `core/`, `shared/` |
| `server/` | Serveur autoritaire Bun, salons de jeu. | `core/`, `shared/` |

La règle « `core/` n'importe rien » est vérifiée par `tests/core-purity.test.ts`.

Le mode solo n'est pas un chemin de code à part : `client/local/` instancie en
mémoire le même salon que le serveur, avec le même `tick()`. Il ne peut donc pas
diverger du mode en ligne.

L'ancienne implémentation a été supprimée après extraction de ses données. Ce
qui en a été tiré — mesures de vitesse, caractéristiques des tanks, effectifs des
vingt missions — est figé dans `docs/provenance.md` ; le code lui-même reste
consultable dans l'historique git.
