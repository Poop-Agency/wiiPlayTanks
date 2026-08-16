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

import { resolve } from 'node:path';
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

    // `pathname` est **encodé** : un fichier dont le nom porte une espace
    // arrive en `%20`, et le chercher tel quel sur le disque échouerait. Les
    // morceaux de musique en portent tous. Un nom indécodable est un client
    // malformé, pas une raison d'interrompre le serveur.
    let relative: string;
    try {
      relative = decodeURIComponent(path.replace(/^\//, ''));
    } catch {
      return new Response('Chemin invalide', { status: 400 });
    }

    // Le décodage peut faire apparaître des `..` qui n'étaient pas visibles
    // avant : sans ce garde-fou, une requête pourrait remonter hors de `dist/`
    // et lire n'importe quel fichier de la machine.
    //
    // `resolve` et non `new URL` : cette dernière ré-encoderait le chemin
    // qu'on vient de décoder, et `Bun.file` chercherait alors un fichier dont
    // le nom contient littéralement « %20 ».
    const resolved = resolve(STATIC_ROOT, relative);
    if (!resolved.startsWith(STATIC_ROOT)) {
      return new Response('Chemin invalide', { status: 400 });
    }

    const file = Bun.file(resolved);

    if (await file.exists()) return new Response(file);

    // Un chemin qui porte une extension désigne un fichier précis : répondre
    // `index.html` à sa place le ferait passer pour présent, et l'erreur
    // ressortirait bien plus loin — un lecteur audio qui reçoit du HTML dit
    // seulement « format illisible ». Le client, lui, est une application
    // d'une seule page : ses routes n'ont pas d'extension.
    if (/\.[a-z0-9]+$/i.test(resolved)) {
      return new Response('Fichier introuvable', { status: 404 });
    }

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
          const outgoing = room.join(ws.data.playerId, message.name, message.settings);
          dispatch(room, outgoing);

          // Un salon plein a refusé ce joueur (`bye` ci-dessus) : la connexion
          // n'a rien à faire de plus qu'être fermée.
          if (outgoing.some((entry) => entry.message.t === 'bye')) {
            sockets.delete(ws.data.playerId);
            ws.close();
          }
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
