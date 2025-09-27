# 🎮 Tanks - Style Wii Play

Un clone du célèbre jeu Tanks de Wii Play, développé en TypeScript avec WebSocket pour le multijoueur.

## 🚀 Fonctionnalités

- **Multijoueur en temps réel** via WebSocket
- **2 joueurs maximum** + spectateurs illimités
- **Graphismes style Wii Play** avec effets visuels
- **Collision detection** avec les murs et tanks
- **Système de respawn** automatique
- **Interface moderne** avec menu de connexion

## 🎯 Comment jouer

### Contrôles
- **ZQSD** ou **Flèches directionnelles** : Déplacement
- **Souris** : Viser
- **Clic gauche** ou **Espace** : Tirer

### Règles
1. Connectez-vous en tant que Joueur 1 ou Joueur 2
2. La partie commence quand 2 joueurs sont connectés
3. Les spectateurs peuvent regarder mais pas jouer
4. Touchez l'adversaire pour le faire respawn à sa position de départ
5. **Éliminez tous les ennemis** pour passer au niveau suivant
6. **Collectez les power-ups** (hexagones colorés) pour des bonus temporaires
7. **Attention aux mines** déployées par les tanks jaunes et violets
8. Les **tanks blancs sont invisibles** par intermittence

## 📦 Installation

```bash
# Installer les dépendances
npm install

# Compiler le TypeScript
npm run build

# Lancer les serveurs (WebSocket + HTTP)
npm run start
```

## 🌐 Accès au jeu

Une fois les serveurs lancés :
- **Jeu** : http://localhost:3000
- **WebSocket** : ws://localhost:8080

## 🛠️ Scripts disponibles

- `npm run build` - Compiler le TypeScript
- `npm run start` - Lancer les serveurs WebSocket et HTTP
- `npm run start:ws` - Lancer seulement le serveur WebSocket
- `npm run start:http` - Lancer seulement le serveur HTTP
- `npm run dev` - Build + Start
- `npm run build:watch` - Compilation en mode watch

## 🏗️ Architecture

```
TANKS/
├── public/          # Fichiers statiques (HTML, CSS)
│   ├── index.html   # Interface du jeu
│   └── dist/        # JavaScript compilé
├── server/          # Serveurs
│   ├── server.ts    # Serveur WebSocket
│   └── http-server.js # Serveur HTTP
└── src/             # Code source TypeScript
    ├── main.ts      # Point d'entrée
    ├── game.ts      # Logique du jeu
    ├── tank.ts      # Classe Tank
    ├── bullet.ts    # Classe Bullet
    ├── controls.ts  # Gestion des contrôles
    ├── level.ts     # Design du niveau
    └── types.ts     # Types TypeScript
```

## 🎨 Fonctionnalités complètes

- [x] **Différents types de munitions** - Chaque ennemi a des vitesses et ricochets de balles uniques
- [x] **Ennemis IA** - 9 types d'ennemis avec comportements IA distincts (faible, défensif, offensif, etc.)
- [x] **20 niveaux complets** - Tous les niveaux avec layouts d'arène, murs et positions ennemies
- [x] **Power-ups** - 5 types: Vitesse augmentée, Cadence de tir, Tir multiple, Bouclier, Tir rapide
- [x] **Système de score** - Points différents selon les ennemis éliminés et actions
- [x] **Effets sonores** - Sons procéduraux pour tirs, explosions, ricochets, power-ups
- [x] **Animations de destruction avancées** - Système de particules, explosions, fumée, débris
- [x] **Système de mines** - Tanks jaunes et violets peuvent déployer des mines
- [x] **Invisibilité** - Tanks blancs alternent entre visible/invisible
- [x] **Système de ricochets** - Balles rebondissent selon la configuration des ennemis

## 🎮 Types d'ennemis et capacités

| Couleur | Mobilité | Tir | Ricochets | Mines | Spécial | IA |
|---------|----------|-----|-----------|-------|---------|----| 
| **Brown** | Fixe | 1 balle lente | 1x | 0 | - | Faible |
| **Grey** | Lent | 1 balle lente | 1x | 0 | - | Défensive |
| **Teal** | Lent | 1 missile rapide | 0 | 0 | - | Moyenne |
| **Yellow** | Rapide | 1 balle lente | 1x | 4 | Mines | Incertaine |
| **Pink** | Normal | 3 balles lentes | 1x | 0 | Multi-tir | Offensive |
| **Green** | Fixe | 2 missiles rapides | 2x | 0 | Précision | Très précise |
| **Purple** | Rapide | 5 balles lentes | 1x | 2 | Mines | Offensive |
| **White** | Normal | 5 balles lentes | 1x | 2 | Invisibilité | Offensive moyenne |
| **Black** | Très rapide | Missiles rapides | 0 | 2 | Ultra-agressif | Très agressive |

## 🔥 Power-ups disponibles

- **⚡ Vitesse** - Augmente la vitesse de déplacement (8s)
- **↯ Cadence** - Augmente la cadence de tir (10s) 
- **※ Multi-tir** - Tire 3 balles en éventail (12s)
- **⬟ Bouclier** - Protection temporaire contre les dégâts (6s)
- **🔥 Tir rapide** - Cadence de tir très élevée (5s)

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir des issues ou à proposer des améliorations.

---

Inspiré du jeu Tanks de **Wii Play** 🎮
