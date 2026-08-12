/**
 * Connexion WebSocket typée.
 *
 * Le seul module du client qui connaisse `WebSocket`. Tout ce qui est au-dessus
 * ne manipule que des messages du protocole — ce qui rend `NetworkSession`
 * testable en lui donnant un transport factice.
 */

import { PROTOCOL_VERSION, decode, encode } from '@shared/protocol';
import type { ClientMessage, ServerMessage } from '@shared/protocol';

/** Ce que la session attend d'un transport. */
export interface Transport {
  send(message: ClientMessage): void;
  close(): void;
}

export interface ConnectionOptions {
  url: string;
  /** Identifiant stable du joueur, pour qu'une reconnexion reprenne son siège. */
  playerId: string;
  name: string;
  room: string;
  onMessage(message: ServerMessage): void;
  onOpen?(): void;
  onClose?(): void;
}

/**
 * Identifiant de joueur stable pour cet onglet.
 *
 * Conservé dans `sessionStorage` et non `localStorage` : deux onglets doivent
 * pouvoir jouer côte à côte avec deux identités — c'est ce dont les tests
 * bout-en-bout ont besoin, et ce qu'un joueur attend s'il ouvre une seconde
 * fenêtre.
 */
export function stablePlayerId(): string {
  const KEY = 'tanks.playerId';

  const stored = sessionStorage.getItem(KEY);
  if (stored) return stored;

  const created = crypto.randomUUID();
  sessionStorage.setItem(KEY, created);
  return created;
}

export class Connection implements Transport {
  readonly #socket: WebSocket;
  readonly #options: ConnectionOptions;

  constructor(options: ConnectionOptions) {
    this.#options = options;

    const url = new URL(options.url);
    // L'identité voyage dans l'URL : le serveur doit la connaître avant même
    // que le socket s'ouvre, pour rattacher une reconnexion à son siège.
    url.searchParams.set('joueur', options.playerId);
    url.searchParams.set('salon', options.room);

    this.#socket = new WebSocket(url);

    this.#socket.addEventListener('open', () => {
      this.send({
        t: 'join',
        version: PROTOCOL_VERSION,
        room: options.room,
        name: options.name,
      });
      options.onOpen?.();
    });

    this.#socket.addEventListener('message', (event: MessageEvent) => {
      const message = decode<ServerMessage>(event.data);
      // Un message illisible est ignoré : il ne doit jamais interrompre la
      // boucle de jeu.
      if (message) options.onMessage(message);
    });

    this.#socket.addEventListener('close', () => options.onClose?.());
  }

  send(message: ClientMessage): void {
    if (this.#socket.readyState !== WebSocket.OPEN) return;
    this.#socket.send(encode(message));
  }

  close(): void {
    this.#socket.close();
  }
}
