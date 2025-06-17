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

## 🎨 Améliorations futures

- [ ] Différents types de munitions
- [ ] Ennemis IA
- [ ] Plusieurs niveaux
- [ ] Power-ups
- [ ] Système de score
- [ ] Effets sonores
- [ ] Animations de destruction plus poussées

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir des issues ou à proposer des améliorations.

---

Inspiré du jeu Tanks de **Wii Play** 🎮
