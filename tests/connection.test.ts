import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { stablePlayerId } from '../src/client/net/connection.js';

/**
 * Identité du joueur en co-op.
 *
 * Ce fichier existe pour une seule raison : `crypto.randomUUID` n'est
 * disponible **que** dans un contexte sécurisé — HTTPS, ou `localhost`. Un
 * serveur de jeu servi en clair sur une IP nue, ce qui est le cas d'une VM sans
 * nom de domaine, n'en est pas un.
 *
 * Le co-op y mourait donc au démarrage, avant d'ouvrir sa socket, sur un
 * `TypeError` qui ne laissait qu'une page noire. Le solo, lui, marchait très
 * bien — de quoi conclure à un problème de réseau ou de pare-feu et chercher
 * longtemps du mauvais côté.
 */

const originalCrypto = globalThis.crypto;
let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } satisfies Storage,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  Reflect.deleteProperty(globalThis, 'sessionStorage');
});

/** Remplace `crypto` par une version sans `randomUUID` — un contexte non sécurisé. */
function withoutSecureContext(): void {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: <T extends ArrayBufferView>(array: T): T =>
        originalCrypto.getRandomValues(array),
    },
  });
}

describe('identifiant de joueur', () => {
  test('il est stable pour un même onglet', () => {
    const first = stablePlayerId();
    expect(stablePlayerId()).toBe(first);
    expect(first.length).toBeGreaterThan(0);
  });

  test('il se génère aussi hors contexte sécurisé', () => {
    // Le cas d'un serveur en http:// sur une IP : `crypto.randomUUID` n'existe
    // pas, et l'appeler lève. `getRandomValues`, lui, est toujours là.
    withoutSecureContext();

    const id = stablePlayerId();

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(stablePlayerId()).toBe(id);
  });

  test('deux onglets tirent deux identités différentes', () => {
    withoutSecureContext();
    const first = stablePlayerId();

    // Un autre onglet, donc un autre `sessionStorage`.
    store = new Map();

    expect(stablePlayerId()).not.toBe(first);
  });
});
