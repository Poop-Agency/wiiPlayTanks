# `src/core/` — la simulation

Ce dossier contient **toute** la logique de jeu, et rien d'autre.

## Le contrat

Trois règles, vérifiées automatiquement par `tests/core-purity.test.ts` :

1. **Aucune dépendance au navigateur.** Pas de `document`, `window`, `navigator`,
   `localStorage`, `requestAnimationFrame`. Ce code doit tourner à l'identique dans
   un onglet, dans le processus serveur Bun, et dans un test headless.

2. **Aucune source d'indéterminisme.** Pas de `Math.random()`, `Date.now()`,
   `new Date()`, `performance.now()`. Le hasard passe par le PRNG dont l'état vit
   dans le `World` ; le temps se lit dans `world.tick`.

3. **Aucun import sortant.** `core/` ne connaît ni `client/`, ni `server/`, ni
   `shared/`. Les dépendances vont toujours vers l'intérieur.

## Pourquoi

Ces trois règles ne sont pas de la cosmétique : ce sont elles qui rendent possibles
la fidélité de gameplay et le multijoueur.

- Sans la règle 1, la logique ne peut pas s'exécuter côté serveur, donc pas
  d'autorité, donc pas de multijoueur robuste.
- Sans la règle 2, deux machines partant du même état divergent, donc la prédiction
  côté client est impossible et les tests de non-régression n'ont aucune valeur.
- Sans la règle 3, le graphe de dépendances finit par former des cycles et le code
  redevient le plat de spaghettis qu'on remplace.

## Forme de l'état

`WorldState` est du **pur JSON** : aucune classe, aucune méthode, aucune référence
circulaire. `structuredClone(world)` et `JSON.stringify(world)` fonctionnent tels
quels, ce qui rend les snapshots réseau et le rejeu d'inputs triviaux.

Les systèmes (`systems/`) sont des fonctions qui transforment cet état. C'est
délibérément un « ECS allégé » : on garde la séparation stricte données/comportement
et la sérialisabilité totale, sans l'indirection d'un registry de composants qui ne
rapporterait rien sur une cinquantaine d'entités.

## Point d'entrée

`tick(world, inputs)` fait avancer la simulation d'exactement un pas de `1/60` s.
C'est la **seule** façon de faire évoluer l'état. Trois appelants : le serveur
(autorité), le client (prédiction), les tests (headless).
