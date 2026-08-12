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

L'ancienne implémentation est conservée dans `legacy/` à la racine — elle sert de
référence pour porter les données (tracés des missions, caractéristiques des tanks)
et n'est ni compilée ni importée.
