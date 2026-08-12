/**
 * Serveur de jeu : fichiers statiques et WebSocket, sans aucune dépendance.
 *
 * `Bun.serve` fait les deux. L'ancienne version demandait `ws`, `concurrently`
 * et un second script Node pour servir les fichiers ; il n'en reste rien.
 *
 *     bun run serve            # port 3000 par défaut
 *     PORT=8080 bun run serve
 *
 * En développement, Vite sert le client et ce serveur ne fait que le jeu : le
 * client s'y connecte par `?enligne=1`. En production, `bun run build` remplit
 * `dist/`, que ce serveur sert lui-même.
 */

import { PROTOCOL_VERSION, decode, encode } from '@shared/protocol';
import type { ClientMessage } from '@shared/protocol';
import { Room } from './Room';
import { startServerLoop } from './loop';

/** Données attachées à chaque socket. */
interface SocketData {
  playerId: string;
  room: string;
}

const PORT = Number(process.env['PORT'] ?? 3000);

/** Racine des fichiers statiques. Absente tant que `bun run build` n'a pas tourné. */
const STATIC_ROOT = new URL('../../dist/', import.meta.url).pathname;

const rooms = new Map<string, Room>();

/** Sockets ouvertes, par identifiant de joueur. */
const sockets = new Map<string, Bun.ServerWebSocket<SocketData>>();

function roomFor(name: string): Room {
  const existing = rooms.get(name);
  if (existing) return existing;

  const created = new Room(name);
  rooms.set(name, created);
  return created;
}

/** Achemine les messages qu'une salle veut émettre. */
function dispatch(room: Room, outgoing: ReturnType<Room['broadcast']>): void {
  for (const { to, message } of outgoing) {
    const payload = encode(message);

    if (to !== null) {
      sockets.get(to)?.send(payload);
      continue;
    }

    // Diffusion : le serveur publie sur le sujet du salon plutôt que de
    // parcourir la liste des sockets, ce que Bun sait faire nativement.
    server.publish(room.name, payload);
  }
}

const server = Bun.serve<SocketData>({
  port: PORT,

  async fetch(request, bunServer) {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      // L'identité vient de l'URL et non du premier message : il faut la
      // connaître avant même que le socket s'ouvre, pour pouvoir rattacher une
      // reconnexion à son siège.
      const playerId = url.searchParams.get('joueur') ?? crypto.randomUUID();
      const room = url.searchParams.get('salon') ?? 'principal';

      if (bunServer.upgrade(request, { data: { playerId, room } })) return undefined;
      return new Response('Échec de la bascule en WebSocket', { status: 400 });
    }

    // Fichiers statiques. Toute route inconnue rend `index.html` : le client
    // est une application d'une seule page.
    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file(STATIC_ROOT + path.replace(/^\//, ''));

    if (await file.exists()) return new Response(file);

    const index = Bun.file(`${STATIC_ROOT}index.html`);
    if (await index.exists()) return new Response(index);

    return new Response(
      'Client non construit. Lancez `bun run build`, ou `bun run dev` pour le mode développement.',
      { status: 404 },
    );
  },

  websocket: {
    open(ws) {
      ws.subscribe(ws.data.room);
    },

    message(ws, raw) {
      const message = decode<ClientMessage>(typeof raw === 'string' ? raw : raw.toString());
      // Un pair distant peut envoyer n'importe quoi : un message illisible est
      // ignoré, jamais une cause d'interruption.
      if (!message) return;

      const room = roomFor(ws.data.room);

      switch (message.t) {
        case 'join': {
          if (message.version !== PROTOCOL_VERSION) {
            ws.send(encode({ t: 'bye', reason: 'Version de protocole incompatible' }));
            ws.close();
            return;
          }

          sockets.set(ws.data.playerId, ws);
          dispatch(room, room.join(ws.data.playerId, message.name));

          // Le premier arrivant lance la partie : en co-op, attendre un signal
          // explicite pour jouer seul n'apporterait rien.
          if (!room.started) dispatch(room, room.start());
          break;
        }

        case 'start':
          dispatch(room, room.start());
          break;

        case 'input':
          room.input(ws.data.playerId, message);
          break;
      }
    },

    close(ws) {
      sockets.delete(ws.data.playerId);

      const room = rooms.get(ws.data.room);
      if (!room) return;

      dispatch(room, room.disconnect(ws.data.playerId));
    },
  },
});

startServerLoop({
  step(): void {
    for (const room of rooms.values()) room.step();
  },

  broadcast(): void {
    for (const [name, room] of rooms) {
      // Une salle vidée de ses joueurs ne doit pas continuer à simuler
      // indéfiniment : elle serait retenue en mémoire jusqu'à l'arrêt du serveur.
      if (room.isEmpty) {
        rooms.delete(name);
        continue;
      }

      dispatch(room, room.broadcast());
    }
  },
});

console.log(`Tanks! — serveur sur http://localhost:${PORT} (WebSocket sur /ws)`);
