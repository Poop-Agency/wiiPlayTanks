// src/main.ts
import { startGame, stopGame as stopGameLoop } from "./game.js";
import { Role, RoleMessage, GameStateMessage } from "./types.js";

let ws: WebSocket;
let role: Role = 'spectator';
let gameStarted = false;
let playersConnected = { player1: false, player2: false };

// Éléments DOM
const menu = document.getElementById('menu')!;
const canvas = document.querySelector('canvas')!;
const gameInfo = document.getElementById('gameInfo')!;
const joinP1Button = document.getElementById('joinP1')! as HTMLButtonElement;
const joinP2Button = document.getElementById('joinP2')! as HTMLButtonElement;
const statusP1 = document.getElementById('statusP1')!;
const statusP2 = document.getElementById('statusP2')!;
const connectionStatus = document.getElementById('connectionStatus')!;
const playerRoleSpan = document.getElementById('playerRole')!;
const playersCountSpan = document.getElementById('playersCount')!;
const remainingBulletsSpan = document.getElementById('remainingBullets')!;
const gameTimeSpan = document.getElementById('gameTime')!;
const stopGameButton = document.getElementById('stopGameBtn')! as HTMLButtonElement;
const newGameButton = document.getElementById('newGameBtn')! as HTMLButtonElement;
const nextLevelButton = document.getElementById('nextLevelBtn')! as HTMLButtonElement;

// Connexion WebSocket
function connectWebSocket() {
  try {
    ws = new WebSocket('ws://localhost:8080');
    
    ws.onopen = () => {
      console.log('Connecté au serveur');
      connectionStatus.textContent = 'Connecté au serveur';
      connectionStatus.className = 'status connected';
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleMessage(data);
    };
    
    ws.onclose = () => {
      console.log('Connexion fermée');
      connectionStatus.textContent = 'Connexion perdue - Reconnexion...';
      connectionStatus.className = 'status waiting';
      // Tentative de reconnexion après 3 secondes
      setTimeout(connectWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('Erreur WebSocket:', error);
      connectionStatus.textContent = 'Erreur de connexion';
      connectionStatus.className = 'status waiting';
    };
  } catch (error) {
    console.error('Impossible de se connecter au serveur:', error);
    connectionStatus.textContent = 'Serveur non disponible';
  }
}

function handleMessage(data: any) {
  switch (data.type) {
    case 'role':
      const roleMsg = data as RoleMessage;
      role = roleMsg.role;
      playerRoleSpan.textContent = role;
      updatePlayerStatus();
      break;
      
    case 'gameState':
      const gameStateMsg = data as GameStateMessage;
      playersConnected = gameStateMsg.players;
      updatePlayerStatus();
      updatePlayersCount();
      
      // Démarrer le jeu si deux joueurs sont connectés
      if (playersConnected.player1 && playersConnected.player2 && !gameStarted) {
        startGameSession();
      }
      break;
        case 'playerDisconnected':
      // Gérer la déconnexion d'un joueur
      if (gameStarted) {
        alert('Un joueur s\'est déconnecté. Retour au menu.');
        returnToMenu();
      }
      break;
        case 'gameStop':
      // Gérer l'arrêt de la partie
      if (gameStarted) {
        const stopData = data as any;
        const message = stopData.reason === 'timeout' 
          ? '⏰ Temps écoulé ! La partie est terminée.' 
          : `Partie arrêtée par ${stopData.initiator}.`;
        alert(message + '\n\nRetour au menu...');
        returnToMenu();
      }      break;
        case 'nextLevel':
      // Un autre joueur a changé de niveau
      if (gameStarted && (window as any).goToNextLevel) {
        const nextLevelData = data as any;
        console.log(`Niveau changé par ${nextLevelData.initiator}`);
        (window as any).goToNextLevel();
      }
      break;
      
    case 'newGame':
      // Un autre joueur a démarré une nouvelle partie
      if (gameStarted) {
        const newGameData = data as any;
        console.log(`Nouvelle partie démarrée par ${newGameData.initiator}`);
        // Redémarrer le jeu pour tous les joueurs
        startGame(canvas, role, ws);
      }
      break;
      
    default:
      // Passer les autres messages au jeu
      if (gameStarted && window.handleGameMessage) {
        window.handleGameMessage(data);
      }
  }
}

function updatePlayerStatus() {
  // Statut Joueur 1
  if (playersConnected.player1) {
    if (role === 'player1') {
      statusP1.textContent = 'Vous êtes le Joueur 1';
      statusP1.className = 'status connected';
      joinP1Button.disabled = false;
      joinP1Button.textContent = 'Se déconnecter';
      joinP1Button.className = 'disconnect';
    } else {
      statusP1.textContent = 'Joueur 1 connecté';
      statusP1.className = 'status connected';
      joinP1Button.disabled = false;
      joinP1Button.textContent = 'Prendre la place';
      joinP1Button.className = 'takeover';
    }
  } else {
    statusP1.textContent = 'En attente...';
    statusP1.className = 'status waiting';
    joinP1Button.disabled = false;
    joinP1Button.textContent = 'Rejoindre comme Joueur 1';
    joinP1Button.className = '';
  }
  
  // Statut Joueur 2
  if (playersConnected.player2) {
    if (role === 'player2') {
      statusP2.textContent = 'Vous êtes le Joueur 2';
      statusP2.className = 'status connected';
      joinP2Button.disabled = false;
      joinP2Button.textContent = 'Se déconnecter';
      joinP2Button.className = 'disconnect';
    } else {
      statusP2.textContent = 'Joueur 2 connecté';
      statusP2.className = 'status connected';
      joinP2Button.disabled = false;
      joinP2Button.textContent = 'Prendre la place';
      joinP2Button.className = 'takeover';
    }
  } else {
    statusP2.textContent = 'En attente...';
    statusP2.className = 'status waiting';
    joinP2Button.disabled = false;
    joinP2Button.textContent = 'Rejoindre comme Joueur 2';
    joinP2Button.className = '';
  }
  
  // Si spectateur
  if (role === 'spectator' && (playersConnected.player1 || playersConnected.player2)) {
    connectionStatus.textContent = 'Vous êtes spectateur';
    connectionStatus.className = 'status spectator';
  } else if (role === 'spectator') {
    connectionStatus.textContent = 'Connecté - Choisissez votre rôle';
    connectionStatus.className = 'status connected';
  }
}

function updatePlayersCount() {
  const count = (playersConnected.player1 ? 1 : 0) + (playersConnected.player2 ? 1 : 0);
  playersCountSpan.textContent = count.toString();
}

function startGameSession() {
  gameStarted = true;
  menu.style.display = 'none';
  canvas.style.display = 'block';
  gameInfo.style.display = 'block';
    // Afficher le bouton d'arrêt pour les joueurs actifs
  if (role === 'player1' || role === 'player2') {
    stopGameButton.style.display = 'block';
    newGameButton.style.display = 'block';
    nextLevelButton.style.display = 'block';
  } else {
    // Spectateur : ne pas afficher les boutons de contrôle
    newGameButton.style.display = 'none';
    nextLevelButton.style.display = 'none';
  }
  
  console.log('Démarrage du jeu avec le rôle:', role);
  startGame(canvas, role, ws);
}

function returnToMenu() {
  gameStarted = false;
  
  // Arrêter la boucle de jeu si elle tourne encore
  stopGameLoop();
  
  menu.style.display = 'block';  canvas.style.display = 'none';
  gameInfo.style.display = 'none';
  stopGameButton.style.display = 'none';
  newGameButton.style.display = 'none';
  nextLevelButton.style.display = 'none';
}

function requestRole(requestedRole: Role) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'requestRole',
      role: requestedRole
    }));
  } else {
    alert('Pas de connexion au serveur');
  }
}

function stopGame() {
  // Arrêter la boucle de jeu d'abord
  stopGameLoop();
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'stopGame',
      initiator: role
    }));
  }
  returnToMenu();
}

function goToNextLevel() {
  // Vérifier si le joueur peut changer de niveau
  if (role === 'player1' || role === 'player2') {
    if ((window as any).goToNextLevel) {
      const success = (window as any).goToNextLevel();
      if (success) {
        console.log('Passage au niveau suivant');
        // Optionnel : envoyer un message aux autres joueurs
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'nextLevel',
            initiator: role
          }));
        }
      } else {
        alert('Tous les niveaux ont été terminés ! 🎉\n\nFélicitations !');
      }
    }
  } else {
    alert('Seuls les joueurs actifs peuvent changer de niveau');
  }
}

function newGame() {
  // Vérifier si le joueur peut démarrer une nouvelle partie
  if (role === 'player1' || role === 'player2') {
    console.log('Démarrage d\'une nouvelle partie');
    
    // Notifier le serveur qu'on démarre une nouvelle partie
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'newGame',
        initiator: role
      }));
    }
    
    // Redémarrer le jeu directement
    startGame(canvas, role, ws);
  } else {
    alert('Seuls les joueurs actifs peuvent démarrer une nouvelle partie');
  }
}

// Event listeners
joinP1Button.onclick = () => requestRole('player1');
joinP2Button.onclick = () => requestRole('player2');
stopGameButton.onclick = () => stopGame();
newGameButton.onclick = () => newGame();
nextLevelButton.onclick = () => goToNextLevel();
newGameButton.onclick = () => newGame();

// Démarrer la connexion WebSocket au chargement
connectWebSocket();

// Exposer handleGameMessage globalement pour le jeu
declare global {
  interface Window {
    handleGameMessage: (data: any) => void;
    goToNextLevel: () => boolean;
  }
}
