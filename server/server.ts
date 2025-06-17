// server/server.ts
import WebSocket, { WebSocketServer } from 'ws';
import { Role, RequestRoleMessage, GameStateMessage, PlayerDisconnectedMessage } from '../src/types';

const wss = new WebSocketServer({ port: 8080 });
const clients = new Map<WebSocket, Role>();

console.log('Serveur WebSocket démarré sur le port 8080');

function broadcastGameState() {
  const players = {
    player1: Array.from(clients.values()).includes('player1'),
    player2: Array.from(clients.values()).includes('player2')
  };
  
  const gameStateMsg: GameStateMessage = {
    type: 'gameState',
    players
  };
    // Envoyer l'état du jeu à tous les clients
  for (const [client] of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(gameStateMsg));
    }
  }
  
  console.log('État du jeu diffusé:', players);
}

function broadcastToPlayers(message: string, sender?: WebSocket) {
  for (const [client] of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on('connection', (ws) => {
  console.log('Nouvelle connexion');
  
  // Assigner le rôle de spectateur par défaut
  clients.set(ws, 'spectator');
  
  // Envoyer le rôle actuel
  ws.send(JSON.stringify({ type: 'role', role: 'spectator' }));
  
  // Envoyer l'état actuel du jeu
  broadcastGameState();
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {        case 'requestRole':
          const requestMsg = data as RequestRoleMessage;
          const requestedRole = requestMsg.role;
          const currentRole = clients.get(ws);
          
          console.log(`Client demande le rôle: ${requestedRole}, rôle actuel: ${currentRole}`);
          
          // Si le joueur clique sur son rôle actuel, le libérer
          if (currentRole === requestedRole && (requestedRole === 'player1' || requestedRole === 'player2')) {
            clients.set(ws, 'spectator');
            ws.send(JSON.stringify({ type: 'role', role: 'spectator' }));
            console.log(`${requestedRole} s'est déconnecté et est devenu spectateur`);
            broadcastGameState();
            break;
          }
          
          // Si le joueur demande un autre rôle
          if (requestedRole === 'player1') {
            // Vérifier si joueur1 est déjà pris par quelqu'un d'autre
            const player1Client = Array.from(clients.entries()).find(([client, role]) => role === 'player1' && client !== ws);
            
            if (player1Client) {
              // Libérer l'ancien joueur1
              clients.set(player1Client[0], 'spectator');
              player1Client[0].send(JSON.stringify({ type: 'role', role: 'spectator' }));
              console.log('Ancien joueur1 libéré');
            }
            
            clients.set(ws, 'player1');
            ws.send(JSON.stringify({ type: 'role', role: 'player1' }));
            console.log('Nouveau joueur1 connecté');
            
          } else if (requestedRole === 'player2') {
            // Vérifier si joueur2 est déjà pris par quelqu'un d'autre
            const player2Client = Array.from(clients.entries()).find(([client, role]) => role === 'player2' && client !== ws);
            
            if (player2Client) {
              // Libérer l'ancien joueur2
              clients.set(player2Client[0], 'spectator');
              player2Client[0].send(JSON.stringify({ type: 'role', role: 'spectator' }));
              console.log('Ancien joueur2 libéré');
            }
            
            clients.set(ws, 'player2');
            ws.send(JSON.stringify({ type: 'role', role: 'player2' }));
            console.log('Nouveau joueur2 connecté');
            
          } else {
            // Devenir spectateur
            clients.set(ws, 'spectator');
            ws.send(JSON.stringify({ type: 'role', role: 'spectator' }));
            console.log('Client devient spectateur');
          }
          
          // Diffuser le nouvel état
          broadcastGameState();
          break;
            case 'move':
        case 'shoot':
          // Relayer les messages de jeu seulement des joueurs actifs
          const senderRole = clients.get(ws);
          if (senderRole === 'player1' || senderRole === 'player2') {
            broadcastToPlayers(message.toString(), ws);
          }
          break;        case 'stopGame':
          // Seuls les joueurs actifs peuvent arrêter la partie
          const stopperRole = clients.get(ws);
          if (stopperRole === 'player1' || stopperRole === 'player2') {
            const incomingStopMsg = JSON.parse(message.toString());
            const reason = incomingStopMsg.reason || 'manual';
            
            console.log(`Partie arrêtée par ${stopperRole} (${reason})`);
            
            // Informer tous les clients que la partie est arrêtée
            const stopMsg = {
              type: 'gameStop',
              initiator: stopperRole,
              reason: reason
            };
            
            for (const [client] of clients) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(stopMsg));
              }
            }
          }
          break;

        case 'nextLevel':
          // Seuls les joueurs actifs peuvent changer de niveau
          const changerRole = clients.get(ws);
          if (changerRole === 'player1' || changerRole === 'player2') {
            console.log(`Changement de niveau demandé par ${changerRole}`);
            
            // Relayer le message à tous les autres clients
            const nextLevelMsg = {
              type: 'nextLevel',
              initiator: changerRole
            };
            
            broadcastToPlayers(JSON.stringify(nextLevelMsg), ws);
          }
          break;
          
        default:
          // Relayer autres messages (pour extensibilité future)
          broadcastToPlayers(message.toString(), ws);
      }
    } catch (error) {
      console.error('Erreur lors du traitement du message:', error);
    }
  });

  ws.on('close', () => {
    const disconnectedRole = clients.get(ws);
    console.log(`Déconnexion du ${disconnectedRole}`);
    
    // Informer les autres clients de la déconnexion
    if (disconnectedRole === 'player1' || disconnectedRole === 'player2') {
      const disconnectMsg: PlayerDisconnectedMessage = {
        type: 'playerDisconnected',
        role: disconnectedRole
      };
      
      broadcastToPlayers(JSON.stringify(disconnectMsg), ws);
    }
    
    clients.delete(ws);
    broadcastGameState();
  });

  ws.on('error', (error) => {
    console.error('Erreur WebSocket:', error);
  });
});