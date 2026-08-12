// src/game.ts
import { Tank } from "./tank.js";
import { Bullet } from "./bullet.js";
import { setupControls, updateControls } from "./controls.js";
import { drawLevel, walls, getPlayerSpawns, nextLevel, getCurrentLevelNumber, getTotalLevels, getEnemies, getCurrentLevel,resetToFirstLevel } from "./level.js";
import { Enemy } from "./enemy.js";
import { Role, MoveMessage, ShootMessage, EnemyMoveMessage, EnemyShootMessage, EnemyDeathMessage } from "./types.js";

let ctx: CanvasRenderingContext2D;
let player1: Tank;
let player2: Tank;
let enemies: Enemy[] = []; // Liste des ennemis
const bullets: Bullet[] = [];
const player1Bullets: Bullet[] = []; // Balles du joueur 1
const player2Bullets: Bullet[] = []; // Balles du joueur 2
const MAX_BULLETS_PER_PLAYER = 4; // Limite de balles par joueur
const GAME_TIMEOUT_MINUTES = 10; // Temps limite en minutes (paramètre modifiable)
let gameRole: Role = 'spectator';
let websocket: WebSocket | null = null;
let lastSentTime = 0;
let lastCannonSentTime = 0;
let gameStartTime = 0; // Timestamp du début de partie
let gameLoopId = 0; // ID de la boucle de jeu pour pouvoir l'arrêter
let gameRunning = false; // Flag pour savoir si le jeu tourne
const NETWORK_UPDATE_INTERVAL = 50; // 20 FPS pour les mises à jour de position
const CANNON_UPDATE_INTERVAL = 16; // ~60 FPS pour les mises à jour de visée (plus fluide)

export function startGame(canvas: HTMLCanvasElement, role: Role, ws: WebSocket) {
  // Arrêter la boucle de jeu précédente si elle existe
  if (gameRunning && gameLoopId) {
    cancelAnimationFrame(gameLoopId);
    console.log('Boucle de jeu précédente arrêtée');
  }
  
  ctx = canvas.getContext("2d")!;
  gameRole = role;
  websocket = ws;
  gameStartTime = Date.now(); // Enregistrer le début de partie
  gameRunning = true; // Marquer le jeu comme actif
  // Configuration du canvas
  resizeCanvas();
  
  // IMPORTANT: Remettre le jeu au niveau 1 (nouvelle partie)
  resetToFirstLevel();
  
  // Réinitialiser complètement toutes les variables globales
  bullets.length = 0;
  player1Bullets.length = 0;
  player2Bullets.length = 0;
  enemies.length = 0;
  
  // Créer les tanks avec des couleurs distinctes style Wii Play
  const spawns = getPlayerSpawns();
  player1 = new Tank(spawns.player1[0], spawns.player1[1], "#4CAF50", "player1"); // Vert
  player2 = new Tank(spawns.player2[0], spawns.player2[1], "#F44336", "player2"); // Rouge

  // Initialiser les ennemis du niveau actuel
  initializeEnemies();

  setupControls();
    // Exposer la fonction de gestion des messages
  window.handleGameMessage = handleNetworkMessage;
  
  // Démarrer la boucle de jeu
  gameLoopId = requestAnimationFrame(gameLoop);
  console.log('Nouvelle boucle de jeu démarrée, ID:', gameLoopId);
}

function handleNetworkMessage(data: any) {
  switch (data.type) {
    case 'move':
      const moveMsg = data as MoveMessage;
      if (moveMsg.id === 'player1') {
        player1.x = moveMsg.x;
        player1.y = moveMsg.y;
        player1.direction = moveMsg.direction;
        player1.cannonDirection = moveMsg.cannonDirection;
      } else if (moveMsg.id === 'player2') {
        player2.x = moveMsg.x;
        player2.y = moveMsg.y;
        player2.direction = moveMsg.direction;
        player2.cannonDirection = moveMsg.cannonDirection;
      }
      break;

    case 'shoot':
      const shootMsg = data as ShootMessage;

      // Vérifier la limite de balles pour le joueur qui tire
      const shooterBullets = shootMsg.id === 'player1' ? player1Bullets : player2Bullets;
      if (shooterBullets.length >= MAX_BULLETS_PER_PLAYER) {
        break; // Ne pas créer la balle si la limite est atteinte
      }

      const bullet = new Bullet(
        shootMsg.x,
        shootMsg.y,
        shootMsg.cannonDirection, // Utiliser cannonDirection pour la direction de la balle
        shootMsg.id === 'player1' ? "#4CAF50" : "#F44336"
      );
      bullets.push(bullet);
      shooterBullets.push(bullet);
      break;

    case 'enemyMove':
      const enemyMoveMsg = data as EnemyMoveMessage;
      console.log(`[${gameRole}] Reçu enemyMove pour ennemi ${enemyMoveMsg.enemyId}:`, enemyMoveMsg);
      const enemyToMove = enemies.find(e => e.id === enemyMoveMsg.enemyId);
      if (enemyToMove) {
        console.log(`[${gameRole}] Mise à jour position ennemi ${enemyMoveMsg.enemyId}: (${enemyMoveMsg.x}, ${enemyMoveMsg.y})`);
        enemyToMove.updateFromNetwork(
          enemyMoveMsg.x,
          enemyMoveMsg.y,
          enemyMoveMsg.direction,
          enemyMoveMsg.cannonDirection
        );
      } else {
        console.log(`[${gameRole}] Ennemi ${enemyMoveMsg.enemyId} non trouvé dans la liste:`, enemies.map(e => e.id));
      }
      break;
    case 'enemyShoot':
      const enemyShootMsg = data as EnemyShootMessage;
      console.log(`[${gameRole}] Reçu enemyShoot pour ennemi ${enemyShootMsg.enemyId}:`, enemyShootMsg);
      const enemyToShoot = enemies.find(e => e.id === enemyShootMsg.enemyId);
      if (enemyToShoot) {
        console.log(`[${gameRole}] Création balle pour ennemi ${enemyShootMsg.enemyId}`);
        const newBullet = enemyToShoot.shootFromNetwork(
          enemyShootMsg.x,
          enemyShootMsg.y,
          enemyShootMsg.cannonDirection,
          enemyShootMsg.bulletSpeed,
          enemyShootMsg.bulletColor
        );
        // Ajouter la balle à la liste principale si elle a été créée
        if (newBullet && !bullets.includes(newBullet)) {
          bullets.push(newBullet);
          console.log(`[${gameRole}] Balle d'ennemi ajoutée à la liste principale`);
        }
      } else {
        console.log(`[${gameRole}] Ennemi ${enemyShootMsg.enemyId} non trouvé pour tir`);
      }
      break;

    case 'enemyDeath':
      const enemyDeathMsg = data as EnemyDeathMessage;
      const enemyIndex = enemies.findIndex(e => e.id === enemyDeathMsg.enemyId);
      if (enemyIndex !== -1) {
        enemies.splice(enemyIndex, 1);

        // Vérifier si tous les ennemis sont éliminés
        if (enemies.length === 0) {
          setTimeout(() => {
            goToNextLevel();
          }, 1000);
        }
      } else {
        console.log(`[${gameRole}] Ennemi ${enemyDeathMsg.enemyId} non trouvé pour suppression`);
      }
      break;
      
    case 'levelChanged':
      const levelChangeMsg = data as any;
      console.log(`[${gameRole}] Niveau changé vers ${levelChangeMsg.levelNumber}`);
      // Réinitialiser les ennemis pour s'assurer de la synchronisation
      setTimeout(() => {
        initializeEnemies();
      }, 100); // Petit délai pour s'assurer que le niveau est bien changé
      break;
  }
}

function sendNetworkUpdate(tank: Tank, type: 'move' | 'shoot', isCannonOnly: boolean = false) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

  if (type === 'move') {
    const moveMsg: MoveMessage = {
      type: 'move',
      id: gameRole,
      x: tank.x,
      y: tank.y,
      direction: tank.direction,
      cannonDirection: tank.cannonDirection
    };
    console.log('Envoi message move:', moveMsg); // Debug
    websocket.send(JSON.stringify(moveMsg));
  } else if (type === 'shoot') {
    const shootMsg: ShootMessage = {
      type: 'shoot',
      id: gameRole,
      x: tank.x + Math.cos(tank.cannonDirection) * (tank.width / 2 + 5), // Ajusté aux nouvelles dimensions
      y: tank.y + Math.sin(tank.cannonDirection) * (tank.width / 2 + 5),
      direction: tank.direction,
      cannonDirection: tank.cannonDirection
    };
    websocket.send(JSON.stringify(shootMsg));
  }
}

function sendEnemyNetworkUpdate(type: string, data: any) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) return;

  console.log(`Envoi message ennemi ${type}:`, data); // Debug
  websocket.send(JSON.stringify(data));
}

function gameLoop() {
  // Mettre à jour les contrôles seulement si on est un joueur actif
  if (gameRole === 'player1' || gameRole === 'player2') {
    const playerTank = gameRole === 'player1' ? player1 : player2;
    const otherTank = gameRole === 'player1' ? player2 : player1;
    const playerBullets = gameRole === 'player1' ? player1Bullets : player2Bullets;
    const previousPos = { x: playerTank.x, y: playerTank.y, direction: playerTank.direction, cannonDirection: playerTank.cannonDirection };

    updateControls(playerTank, otherTank, bullets, (bullet) => {
      // Vérifier si le joueur peut tirer (limite de 4 balles)
      if (playerBullets.length < MAX_BULLETS_PER_PLAYER) {
        bullets.push(bullet);
        playerBullets.push(bullet);
        sendNetworkUpdate(playerTank, 'shoot');
      }
    });
    // Envoyer les mises à jour de position si le tank a bougé OU si le canon a tourné
    const positionChanged = previousPos.x !== playerTank.x ||
      previousPos.y !== playerTank.y ||
      previousPos.direction !== playerTank.direction;
    const cannonChanged = previousPos.cannonDirection !== playerTank.cannonDirection;
    if (positionChanged || cannonChanged) {
      // Si seule la visée a changé, utiliser un intervalle plus court
      const onlyCannonChanged = !positionChanged && cannonChanged;
      sendNetworkUpdate(playerTank, 'move', onlyCannonChanged);
    }
  }
  // Mettre à jour les bullets
  bullets.forEach((bullet, index) => {
    bullet.update();
  });

  // Vérifier les collisions entre balles (avant les autres vérifications)
  checkBulletBulletCollisions();

  // Vérifier les autres collisions pour chaque balle restante
  bullets.forEach((bullet, index) => {
    // Vérifier collision avec les murs (avec rebond)
    if (bullet.checkCollisionAndRebound(walls)) {
      bullets.splice(index, 1);
      // Retirer aussi de la liste du joueur correspondant
      removeBulletFromPlayer(bullet);
      return;
    }    // Supprimer les bullets hors écran
    const currentLevel = getCurrentLevel();
    const arenaWidth = currentLevel.dimensions?.width || 800;
    const arenaHeight = currentLevel.dimensions?.height || 600;
    if (bullet.x < 0 || bullet.x > arenaWidth || bullet.y < 0 || bullet.y > arenaHeight) {
      bullets.splice(index, 1);
      removeBulletFromPlayer(bullet);
      return;
    }

    // Vérifier collision avec les tanks
    if (checkBulletTankCollision(bullet, index)) {
      removeBulletFromPlayer(bullet);
    }
  });
  // Mettre à jour les ennemis
  const playerTanks = [player1, player2];
  enemies.forEach((enemy, enemyIndex) => {
    // Seul le player1 contrôle l'IA et envoie les updates réseau
    if (gameRole === 'player1') {
      enemy.update(playerTanks, 16, sendEnemyNetworkUpdate); // 16ms = ~60fps
    } else {
      // Les autres joueurs mettent à jour sans IA
      enemy.update(playerTanks, 16); // 16ms = ~60fps
    }

    // Ajouter les balles des ennemis à la liste principale
    enemy.getBullets().forEach(enemyBullet => {
      if (!bullets.includes(enemyBullet)) {
        bullets.push(enemyBullet);
      }
    });
  });
  // Vérifier les collisions entre balles des joueurs et ennemis
  bullets.forEach((bullet, bulletIndex) => {
    // Collision balle joueur -> ennemi
    if (bullet.color === "#4CAF50" || bullet.color === "#F44336") { // Balles des joueurs
      enemies.forEach((enemy, enemyIndex) => {
        if (enemy.isHitBy(bullet)) {
          // Envoyer le message de mort de l'ennemi si on est player1
          if (gameRole === 'player1') {
            sendEnemyNetworkUpdate('enemyDeath', {
              type: 'enemyDeath',
              enemyId: enemy.id
            });
          }

          // Ennemi touché, le supprimer
          enemies.splice(enemyIndex, 1);
          bullets.splice(bulletIndex, 1);
          removeBulletFromPlayer(bullet);

          // Vérifier si tous les ennemis sont éliminés
          if (enemies.length === 0) {
            setTimeout(() => {
              goToNextLevel();
            }, 1000); // Délai de 1 seconde avant le niveau suivant
          }
        }
      });
    }

    // Collision balle ennemi -> joueur
    enemies.forEach(enemy => {
      if (enemy.getBullets().includes(bullet)) {
        // Vérifier collision avec les joueurs
        const playerHit = checkBulletTankCollision(bullet, bulletIndex);
        if (playerHit) {
          enemy.removeBullet(bullet);
        }
      }
    });
  });

  // Vérifier les collisions entre balles
  checkBulletBulletCollisions();

  // Mettre à jour les informations de l'interface
  updateGameInfo();
  // Dessiner tout
  drawGame();
  
  // Continuer la boucle seulement si le jeu est actif
  if (gameRunning) {
    gameLoopId = requestAnimationFrame(gameLoop);
  }
}

function checkBulletTankCollision(bullet: Bullet, bulletIndex: number): boolean {
  const tanks = [player1, player2];

  for (const tank of tanks) {
    const distance = Math.sqrt(
      Math.pow(bullet.x - tank.x, 2) + Math.pow(bullet.y - tank.y, 2)
    );

    // Collision plus précise basée sur les vraies dimensions
    const collisionRadius = Math.max(tank.width, tank.height) / 2 + bullet.radius;

    if (distance < collisionRadius) { // Utiliser les vraies dimensions
      // Collision détectée
      bullets.splice(bulletIndex, 1);

      // Effet de respawn style Wii Play
      respawnTank(tank);
      return true; // Collision détectée
    }
  }
  return false; // Pas de collision
}

function respawnTank(tank: Tank) {
  // Effet visuel de destruction (simple flash) - ajusté aux nouvelles dimensions
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
  const flashSize = Math.max(tank.width, tank.height) + 10;
  ctx.fillRect(tank.x - flashSize / 2, tank.y - flashSize / 2, flashSize, flashSize);
  ctx.restore();

  // Repositionner le tank à sa position de départ (utiliser les spawns du niveau)
  const spawns = getPlayerSpawns();
  if (tank.id === 'player1') {
    tank.x = spawns.player1[0];
    tank.y = spawns.player1[1];
    tank.direction = 0;
    tank.cannonDirection = 0;
  } else {
    tank.x = spawns.player2[0];
    tank.y = spawns.player2[1];
    tank.direction = 0;
    tank.cannonDirection = 0;
  }
}

function removeBulletFromPlayer(bullet: Bullet) {
  // Retirer la balle de la liste du joueur correspondant
  const p1Index = player1Bullets.indexOf(bullet);
  if (p1Index !== -1) {
    player1Bullets.splice(p1Index, 1);
    return;
  }

  const p2Index = player2Bullets.indexOf(bullet);
  if (p2Index !== -1) {
    player2Bullets.splice(p2Index, 1);
  }
}

function drawGame() {
  // Fond avec style Wii Play (dégradé vert)
  const currentLevel = getCurrentLevel();
  const arenaWidth = currentLevel.dimensions?.width || 800;
  const arenaHeight = currentLevel.dimensions?.height || 600;

  const gradient = ctx.createLinearGradient(0, 0, 0, arenaHeight);
  gradient.addColorStop(0, '#8FBC8F');
  gradient.addColorStop(1, '#90EE90');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, arenaWidth, arenaHeight);

  // Dessiner le niveau
  drawLevel(ctx);

  // Dessiner les ennemis
  enemies.forEach(enemy => enemy.draw(ctx));

  // Dessiner les tanks des joueurs
  player1.draw(ctx);
  player2.draw(ctx);

  // Dessiner les bullets
  bullets.forEach((bullet) => bullet.draw(ctx));
}

function drawUI() {
  // Mettre à jour les informations dans l'interface HTML
  updateGameInfo();

  // Afficher le rôle du joueur sur le canvas
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(10, 10, 250, 120);

  ctx.fillStyle = 'white';
  ctx.font = '16px Arial';
  ctx.fillText(`Rôle: ${gameRole}`, 20, 30);

  if (gameRole === 'spectator') {
    ctx.fillStyle = '#9c27b0';
    ctx.fillText('Mode Spectateur', 20, 50);
    ctx.fillText('Vous ne pouvez pas jouer', 20, 70);
  } else {
    ctx.fillStyle = gameRole === 'player1' ? '#4CAF50' : '#F44336';
    ctx.fillText(`Vous êtes le ${gameRole}`, 20, 50);

    // Afficher le nombre de balles restantes
    const playerBullets = gameRole === 'player1' ? player1Bullets : player2Bullets;
    const remaining = MAX_BULLETS_PER_PLAYER - playerBullets.length;
    ctx.fillText(`Balles: ${remaining}/${MAX_BULLETS_PER_PLAYER}`, 20, 70);

    // Afficher le temps de jeu
    const gameTimeMs = Date.now() - gameStartTime;
    const minutes = Math.floor(gameTimeMs / 60000);
    const seconds = Math.floor((gameTimeMs % 60000) / 1000);
    ctx.fillText(`Temps: ${minutes}:${seconds.toString().padStart(2, '0')}`, 20, 90);

    // Vérifier le timeout
    if (minutes >= GAME_TIMEOUT_MINUTES) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText('TEMPS ÉCOULÉ !', 20, 110);
    }
  }

  ctx.restore();
}

function updateGameInfo() {
  // Mettre à jour les informations dans l'interface HTML
  // Mettre à jour les informations de niveau
  updateLevelInfo();

  // Pour les balles restantes, afficher selon le rôle
  let remaining = 0;
  if (gameRole === 'player1') {
    remaining = MAX_BULLETS_PER_PLAYER - player1Bullets.length;
  } else if (gameRole === 'player2') {
    remaining = MAX_BULLETS_PER_PLAYER - player2Bullets.length;
  } else {
    // Spectateur : afficher P1/P2 ou juste les balles totales
    remaining = MAX_BULLETS_PER_PLAYER; // Valeur par défaut pour spectateur
  }

  const remainingBulletsSpan = document.getElementById('remainingBullets');
  if (remainingBulletsSpan) {
    if (gameRole === 'spectator') {
      remainingBulletsSpan.textContent = `P1:${MAX_BULLETS_PER_PLAYER - player1Bullets.length} P2:${MAX_BULLETS_PER_PLAYER - player2Bullets.length}`;
    } else {
      remainingBulletsSpan.textContent = remaining.toString();
    }
  }
  // Temps de jeu dégressif (5:00 -> 0:00)
  const gameTimeMs = Date.now() - gameStartTime;
  const totalTimeMs = GAME_TIMEOUT_MINUTES * 60 * 1000; // 5 minutes en ms
  const remainingTimeMs = Math.max(0, totalTimeMs - gameTimeMs);

  const minutes = Math.floor(remainingTimeMs / 60000);
  const seconds = Math.floor((remainingTimeMs % 60000) / 1000);

  const gameTimeSpan = document.getElementById('gameTime');
  if (gameTimeSpan) {
    gameTimeSpan.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Si le temps est écoulé, déclencher la fin de partie
  if (remainingTimeMs <= 0) {
    handleTimeExpired();
    return; // Arrêter les mises à jour
  }
  // Afficher le bouton d'arrêt seulement si on est proche de l'expiration (dernière minute)
  const stopGameButton = document.getElementById('stopGameBtn') as HTMLButtonElement;
  if (stopGameButton) {
    if (minutes <= 1) { // Dernière minute
      stopGameButton.style.display = 'block';
      if (remainingTimeMs <= 0) {
        stopGameButton.textContent = 'Partie expirée - Retour au menu';
      } else {
        stopGameButton.textContent = `Arrêter la partie (${minutes}:${seconds.toString().padStart(2, '0')})`;
      }
    } else {
      stopGameButton.style.display = 'none';
    }
  }
}

// Fonction pour changer de niveau (passer au niveau suivant)
export function goToNextLevel(): boolean {
  if (nextLevel()) {
    // Redimensionner le canvas pour le nouveau niveau
    resizeCanvas();

    // Repositionner les tanks aux nouvelles positions de spawn
    const spawns = getPlayerSpawns();
    player1.x = spawns.player1[0];
    player1.y = spawns.player1[1];
    player1.direction = 0;
    player1.cannonDirection = 0;

    player2.x = spawns.player2[0];
    player2.y = spawns.player2[1];
    player2.direction = 0;
    player2.cannonDirection = 0;

    // Vider les balles
    bullets.length = 0;
    player1Bullets.length = 0;
    player2Bullets.length = 0;
      // Réinitialiser les ennemis pour le nouveau niveau
    initializeEnemies();
    
    // Envoyer un message réseau pour synchroniser le changement de niveau
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({
        type: 'levelChanged',
        levelNumber: getCurrentLevelNumber()
      }));
    }
    
    // Mettre à jour l'UI avec le nouveau niveau
    updateLevelInfo();

    return true;
  }

  return false; // Pas de niveau suivant (fin du jeu)
}

// Fonction pour mettre à jour les informations de niveau dans l'UI
function updateLevelInfo() {
  const levelInfoSpan = document.getElementById('levelInfo');
  if (levelInfoSpan) {
    levelInfoSpan.textContent = `${getCurrentLevelNumber()}/${getTotalLevels()}`;
  }
}

// Exposer la fonction globalement pour les contrôles UI
(window as any).goToNextLevel = goToNextLevel;

// Fonction pour vérifier les collisions entre balles
function checkBulletBulletCollisions() {
  const bulletsToRemove: number[] = [];

  for (let i = 0; i < bullets.length; i++) {
    for (let j = i + 1; j < bullets.length; j++) {
      const bullet1 = bullets[i];
      const bullet2 = bullets[j];

      // Calculer la distance entre les deux balles
      const dx = bullet1.x - bullet2.x;
      const dy = bullet1.y - bullet2.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Si les balles se touchent (somme de leurs rayons)
      if (distance < bullet1.radius + bullet2.radius) {
        // Marquer les deux balles pour suppression
        if (!bulletsToRemove.includes(i)) bulletsToRemove.push(i);
        if (!bulletsToRemove.includes(j)) bulletsToRemove.push(j);
      }
    }
  }

  // Supprimer les balles en collision (en commençant par les indices les plus élevés)
  bulletsToRemove.sort((a, b) => b - a);
  bulletsToRemove.forEach(index => {
    const bullet = bullets[index];
    bullets.splice(index, 1);
    removeBulletFromPlayer(bullet);
  });

  return bulletsToRemove.length > 0;
}

// Variable pour éviter les appels multiples
let timeExpiredHandled = false;

function handleTimeExpired() {
  // Éviter les appels multiples
  if (timeExpiredHandled) return;
  timeExpiredHandled = true;

  // Afficher une popup
  alert('⏰ Temps écoulé ! La partie est terminée.\n\nRetour au menu principal...');
  // Envoyer un message d'arrêt de partie si on est un joueur actif
  if ((gameRole === 'player1' || gameRole === 'player2') && websocket && websocket.readyState === WebSocket.OPEN) {
    const stopMsg = {
      type: 'stopGame',
      initiator: gameRole,
      reason: 'timeout'
    };
    websocket.send(JSON.stringify(stopMsg));
  }

  // Rediriger vers la page principale après un court délai
  setTimeout(() => {
    window.location.reload();
  }, 1000);
}

// Fonction pour initialiser les ennemis
function initializeEnemies() {
  // Vider complètement la liste des ennemis et réinitialiser
  enemies.forEach(enemy => {
    // Nettoyer les balles des ennemis de la liste principale
    enemy.getBullets().forEach(bullet => {
      const bulletIndex = bullets.indexOf(bullet);
      if (bulletIndex !== -1) {
        bullets.splice(bulletIndex, 1);
      }
    });
  });
  enemies.length = 0; // Vider la liste des ennemis

  const levelEnemies = getEnemies();

  // Créer les ennemis seulement s'ils ont des positions valides
  for (let i = 0; i < levelEnemies.length; i++) {
    const enemyData = levelEnemies[i];
    // Vérifier si l'ennemi a des coordonnées valides
    if (enemyData.x === null || enemyData.y === null) {
      console.log(`Ennemi ${enemyData.type} ignoré - pas de coordonnées définies`);
      continue; // Ignorer cet ennemi
    }    // Créer un nouvel ennemi complètement frais
    const enemy = new Enemy(enemyData.x, enemyData.y, enemyData.type, enemyData.direction);
    // Utiliser un ID déterministe basé sur l'index pour assurer la synchronisation
    enemy.id = `${enemyData.type}_${i}_${getCurrentLevelNumber()}`;
    
    // Réinitialiser complètement l'ennemi AVANT de définir isNetworkControlled
    enemy.reset();
    
    // Marquer les ennemis comme contrôlés par le réseau si on n'est pas player1
    if (gameRole !== 'player1') {
      enemy.setNetworkControlled(true);
    } else {
      enemy.setNetworkControlled(false);
    }

    enemies.push(enemy);
    console.log(`[${gameRole}] Ennemi ${enemyData.type} créé avec ID: ${enemy.id} à (${enemyData.x}, ${enemyData.y}) - NetworkControlled: ${enemy.isNetworkControlled}`);
  }
  
  console.log(`[${gameRole}] Niveau ${getCurrentLevelNumber()}: ${enemies.length} ennemis créés sur ${levelEnemies.length} définis`);
  console.log(`[${gameRole}] IDs des ennemis:`, enemies.map(e => e.id));
}

// Fonction pour arrêter le jeu proprement
export function stopGame() {
  gameRunning = false;
  if (gameLoopId) {
    cancelAnimationFrame(gameLoopId);
    console.log('Boucle de jeu arrêtée, ID:', gameLoopId);
  }
}

// Fonction pour redimensionner le canvas selon le niveau actuel
function resizeCanvas() {
  const currentLevel = getCurrentLevel();
  const canvas = ctx.canvas;
  canvas.width = currentLevel.dimensions?.width || 800;
  canvas.height = currentLevel.dimensions?.height || 600;
}