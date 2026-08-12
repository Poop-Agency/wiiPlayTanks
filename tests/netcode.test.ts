import { describe, expect, test } from 'bun:test';

import type { InputCommand, TileKind } from '../src/core/state.js';
import { NEUTRAL_INPUT } from '../src/core/state.js';
import { DT } from '../src/core/tick.js';
import { TUNING } from '../src/core/tuning.js';
import { hashWorld } from '../src/core/world.js';
import { Reconciler } from '../src/client/net/reconciler.js';
import { Room } from '../src/server/Room.js';
import type { Outgoing } from '../src/server/Room.js';
import { decode, encode, stripTiles, withTiles } from '../src/shared/protocol.js';
import type { ClientMessage, ServerMessage, SnapshotMessage } from '../src/shared/protocol.js';

/**
 * Le co-op ne repose sur aucun code de gameplay nouveau — c'était tout l'objet
 * de l'architecture. Ce qui est vérifié ici est donc l'autorité et la
 * réconciliation, pas la physique.
 *
 * Ces tests n'ouvrent aucun socket : `Room` ne connaît pas le transport, elle
 * reçoit des messages décodés et rend des messages à envoyer. C'est
 * précisément ce qui les rend rapides et déterministes.
 */

/**
 * Distance parcourue par un tank en un pas, en tuiles.
 *
 * Les seuils de saut s'expriment en multiples de cette valeur plutôt qu'en
 * nombres absolus : un réglage de vitesse ne doit pas faire échouer un test de
 * réseau.
 */
const MOVEMENT_STEP_TILES = TUNING.tank.speedTilesPerSecond * DT;

/** Intention de déplacement vers la droite, tourelle à l'horizontale. */
const RIGHT: InputCommand = { ...NEUTRAL_INPUT, moveX: 1 };
const LEFT: InputCommand = { ...NEUTRAL_INPUT, moveX: -1 };

/** Récupère les instantanés destinés à un joueur. */
function snapshotsFor(outgoing: Outgoing[], playerId: string): SnapshotMessage[] {
  return outgoing
    .filter((entry) => entry.to === playerId && entry.message.t === 'snapshot')
    .map((entry) => entry.message as SnapshotMessage);
}

/**
 * Ouvre une salle avec les joueurs donnés, partie démarrée **et lancée**.
 *
 * Une mission commence par son annonce, pendant laquelle la simulation est
 * figée. Ces tests-ci portent sur le réseau, pas sur la transition : on la
 * traverse une fois pour toutes ici.
 */
function openRoom(...playerIds: string[]): Room {
  const room = new Room('essai');
  for (const playerId of playerIds) room.join(playerId, playerId);
  room.start();
  skipTransitions(room);
  return room;
}

/** Fait tourner la salle jusqu'à ce que la simulation reparte. */
function skipTransitions(room: Room, limit = 600): void {
  for (let step = 0; step < limit; step++) {
    const before = room.world?.tick ?? 0;
    room.step();
    if ((room.world?.tick ?? 0) > before) return;
  }
  throw new Error('la simulation n\'a jamais repris');
}

/**
 * Client d'essai : la partie de `NetworkSession` qui touche au réseau, sans le
 * rendu.
 *
 * ⚠ Le passage par `encode` / `decode` n'est pas décoratif. `stripTiles` ne fait
 * qu'un étalement superficiel : sans aller-retour JSON, les tableaux `tanks`,
 * `shells` et `mines` restent **partagés** entre la salle et le client. Le
 * client mutait alors l'état du serveur en rejouant ses intentions, et les
 * tests de convergence vérifiaient que deux références égales sont égales —
 * c'est-à-dire rien. Le réseau sérialise ; le test doit sérialiser aussi.
 */
class TestClient {
  readonly reconciler = new Reconciler();
  #tiles: TileKind[] | null = null;
  #seq = 0;

  /** Numéro de la prochaine intention. */
  nextSeq(): number {
    return this.#seq++;
  }

  /** Consomme des messages déjà sérialisés, exactement comme le vrai client. */
  receiveWire(payloads: readonly string[]): void {
    for (const payload of payloads) {
      const wire = decode<ServerMessage>(payload);
      if (!wire) continue;

      if (wire.t === 'terrain') this.#tiles = wire.grid.tiles;

      if (wire.t === 'snapshot' && this.#tiles) {
        this.reconciler.reconcile(withTiles(wire.world, this.#tiles), wire.ack, wire.yourTankId);
      }
    }
  }

  /** Raccourci pour une livraison immédiate, sans lien simulé. */
  receive(outgoing: Outgoing[], playerId: string): void {
    this.receiveWire(toWire(outgoing, playerId));
  }

  /** Position du tank piloté, ou `null` avant le premier instantané. */
  localTank(): { x: number; y: number } | null {
    const world = this.reconciler.world;
    const id = this.reconciler.localTankId;
    if (!world || id === null) return null;

    const tank = world.tanks.find((each) => each.id === id);
    return tank ? { x: tank.x, y: tank.y } : null;
  }
}

/**
 * Met sur le fil ce qui est destiné à un joueur.
 *
 * ⚠ La sérialisation doit avoir lieu **à l'émission**, pas à la livraison.
 * `stripTiles` ne fait qu'un étalement superficiel : un `Outgoing` conservé tel
 * quel dans une file d'attente continue de pointer sur les tableaux vivants de
 * la salle, et le « vieil instantané » livré six pas plus tard contient en fait
 * l'état courant. Le client rejouait alors ses intentions sur un état trop
 * récent et bondissait d'un aller-retour complet. Le vrai serveur encode au
 * moment de l'envoi ; le test doit faire pareil.
 */
function toWire(outgoing: Outgoing[], playerId: string): string[] {
  return outgoing
    .filter((entry) => entry.to === null || entry.to === playerId)
    .map((entry) => encode(entry.message));
}

/**
 * Lien réseau simulé : retard fixe et pertes reproductibles.
 *
 * Les pertes sont périodiques et non tirées au hasard : un test de réseau qui
 * échoue une fois sur vingt n'apprend rien à personne.
 */
class Link<T> {
  readonly #queue: Array<{ at: number; payload: T }> = [];
  #sent = 0;

  constructor(
    private readonly delayTicks: number,
    /** Une perte toutes les N émissions. 0 pour un lien parfait. */
    private readonly dropOneIn = 0,
  ) {}

  send(now: number, payload: T): void {
    this.#sent++;
    if (this.dropOneIn > 0 && this.#sent % this.dropOneIn === 0) return;
    this.#queue.push({ at: now + this.delayTicks, payload });
  }

  /** Retire et rend tout ce qui est arrivé à échéance. */
  deliver(now: number): T[] {
    const ready = this.#queue.filter((entry) => entry.at <= now);
    for (const entry of ready) this.#queue.splice(this.#queue.indexOf(entry), 1);
    return ready.map((entry) => entry.payload);
  }
}

describe('autorité du serveur', () => {
  test('la salle installe un tank par joueur', () => {
    const room = openRoom('a', 'b', 'c');
    const world = room.world!;

    const players = world.tanks.filter((tank) => tank.playerId !== null);
    expect(players).toHaveLength(3);
    expect(new Set(players.map((tank) => tank.playerId))).toEqual(new Set(['a', 'b', 'c']));
  });

  test('le protocole ne transporte aucune position', () => {
    // Le seul message qu'un client peut envoyer sur le gameplay est une
    // intention. Une position falsifiée n'a aucun champ où se loger : c'est
    // structurel, pas une validation qu'on pourrait oublier.
    const forged = { t: 'input', seq: 0, input: { ...RIGHT, x: 999, y: 999 } };
    const room = openRoom('a');

    const before = room.world!.tanks[0]!.x;
    room.input('a', decode<ClientMessage>(encode(forged as ClientMessage)) as never);
    room.step();

    // Le tank a bougé selon la règle, d'une fraction de tuile — pas jusqu'à 999.
    const after = room.world!.tanks[0]!.x;
    expect(after).toBeGreaterThan(before);
    expect(after - before).toBeLessThan(1);
  });

  test('une intention en retard ou dupliquée est ignorée', () => {
    const room = openRoom('a');

    room.input('a', { t: 'input', seq: 5, input: RIGHT });
    room.step();

    const afterFirst = room.world!.tanks[0]!.x;

    // Même numéro : c'est un doublon. Un numéro plus ancien : c'est un message
    // arrivé après son successeur. Appliquer l'un ou l'autre ferait reculer le tank.
    room.input('a', { t: 'input', seq: 5, input: LEFT });
    room.input('a', { t: 'input', seq: 2, input: LEFT });
    room.step();

    // La dernière intention connue est rejouée : le tank continue vers la droite.
    expect(room.world!.tanks[0]!.x).toBeGreaterThan(afterFirst);
  });

  test('un message illisible ne fait rien tomber', () => {
    expect(decode('ceci n\'est pas du JSON')).toBeNull();
    expect(decode('[]')).toBeNull();
    expect(decode('{"pas_de_type":1}')).toBeNull();
    expect(decode(42)).toBeNull();
  });
});

describe('tampon anti-gigue', () => {
  test('un tampon vide rejoue la dernière intention', () => {
    // Les intentions n'arrivent pas à intervalle régulier. Sans ce report, le
    // tank s'arrêterait à chaque trou dans le flux — un déplacement est un état
    // maintenu, pas un évènement.
    const room = openRoom('a');
    room.input('a', { t: 'input', seq: 0, input: RIGHT });

    room.step();
    const afterFirst = room.world!.tanks[0]!.x;

    room.step();
    room.step();

    expect(room.world!.tanks[0]!.x).toBeGreaterThan(afterFirst);
  });

  test('une rafale est absorbée sans être jetée', () => {
    const room = openRoom('a');

    // Cinq intentions d'un bloc, comme après un hoquet du réseau.
    for (let seq = 0; seq < 5; seq++) {
      room.input('a', { t: 'input', seq, input: RIGHT });
    }

    // Cinq intentions consommées en quatre pas, aucune jetée : au-delà de la
    // profondeur visée, le serveur en prend deux par pas pour résorber l'avance
    // plutôt que de laisser la latence s'installer.
    for (let index = 0; index < 4; index++) room.step();

    const snapshot = snapshotsFor(room.broadcast(), 'a')[0]!;
    expect(snapshot.ack).toBe(4);
  });

  test('une inondation ne fait pas gonfler la salle sans fin', () => {
    const room = openRoom('a');
    for (let seq = 0; seq < 500; seq++) {
      room.input('a', { t: 'input', seq, input: RIGHT });
    }

    // Le tampon est plafonné : les plus anciennes intentions sont abandonnées,
    // et le serveur reste sur les plus récentes.
    room.step();
    const snapshot = snapshotsFor(room.broadcast(), 'a')[0]!;
    expect(snapshot.ack).toBeGreaterThan(400);
  });
});

describe('diffusion', () => {
  test('le terrain part une fois, puis seulement au changement', () => {
    const room = openRoom('a');

    const first = room.broadcast();
    expect(first.filter((entry) => entry.message.t === 'terrain')).toHaveLength(1);

    const second = room.broadcast();
    expect(second.filter((entry) => entry.message.t === 'terrain')).toHaveLength(0);
  });

  test('le changement de mission renvoie le terrain, à numéro de version égal', () => {
    // Une mission franchie sans détruire un seul bloc garde sa grille en
    // version 0 — et la mission suivante s'ouvre elle aussi en version 0.
    // Comparer les numéros seuls conclut « rien n'a changé » et laisse le
    // client sur le terrain de la mission précédente : il voit des murs
    // absents du serveur, et les obus les traversent.
    const room = openRoom('a');
    room.broadcast();

    const before = room.world!.grid;
    const beforeTiles = [...before.tiles];
    expect(before.version).toBe(0);

    for (const tank of room.world!.tanks) {
      if (tank.playerId === null) tank.alive = false;
    }
    // Fin de manche puis annonce du round suivant : deux transitions à
    // traverser avant que la mission 2 ne soit réellement en place.
    for (let index = 0; index < 400; index++) room.step();

    expect(room.world!.grid).not.toBe(before);
    expect(room.world!.grid.version).toBe(before.version);

    const terrain = room
      .broadcast()
      .filter((entry) => entry.message.t === 'terrain')
      .map((entry) => entry.message as { grid: { tiles: TileKind[] } });

    expect(terrain).toHaveLength(1);
    // Et ce qui repart est bien le nouveau terrain : renvoyer l'ancien
    // satisferait le compte de messages sans corriger quoi que ce soit.
    expect(terrain[0]!.grid.tiles).toEqual(room.world!.grid.tiles);
    expect(terrain[0]!.grid.tiles).not.toEqual(beforeTiles);
  });

  test('chaque joueur reçoit son propre accusé et son propre tank', () => {
    const room = openRoom('a', 'b');

    room.input('a', { t: 'input', seq: 7, input: RIGHT });
    room.step();

    const outgoing = room.broadcast();
    const toA = snapshotsFor(outgoing, 'a')[0]!;
    const toB = snapshotsFor(outgoing, 'b')[0]!;

    expect(toA.ack).toBe(7);
    expect(toB.ack).toBe(-1);
    expect(toA.yourTankId).toBe(room.tankIdOf('a')!);
    expect(toB.yourTankId).toBe(room.tankIdOf('b')!);
    expect(toA.yourTankId).not.toBe(toB.yourTankId);
  });

  test('l\'instantané voyage sans les tuiles, et se recompose à l\'identique', () => {
    // Le terrain est de loin le plus gros objet de l'état ; le renvoyer vingt
    // fois par seconde pour rien multiplierait le débit.
    const room = openRoom('a');
    const world = room.world!;

    const partial = stripTiles(world);
    expect('tiles' in partial.grid).toBe(false);

    const restored = withTiles(
      JSON.parse(JSON.stringify(partial)) as typeof partial,
      world.grid.tiles,
    );
    expect(hashWorld(restored)).toBe(hashWorld(world));
  });
});

describe('convergence client / serveur', () => {
  /**
   * Fait tourner une partie complète à travers un lien simulé.
   *
   * Le retard s'applique dans les deux sens, comme un vrai aller-retour.
   */
  function play(options: {
    ticks: number;
    delayTicks: number;
    dropOneIn?: number;
    inputAt(tick: number): InputCommand;
  }): { room: Room; client: TestClient; maxJump: number } {
    const room = openRoom('a');
    const client = new TestClient();

    const upstream = new Link<{ seq: number; input: InputCommand }>(
      options.delayTicks,
      options.dropOneIn ?? 0,
    );
    const downstream = new Link<string[]>(options.delayTicks);

    const snapshotEvery = 3;
    let maxJump = 0;

    for (let now = 0; now < options.ticks; now++) {
      const input = options.inputAt(now);

      const before = client.localTank();

      // Côté client : on émet, puis on prédit sans attendre.
      const seq = client.nextSeq();
      upstream.send(now, { seq, input });
      client.reconciler.predict(seq, input);

      // Côté serveur : on applique ce qui est arrivé, puis on avance.
      for (const message of upstream.deliver(now)) {
        room.input('a', { t: 'input', seq: message.seq, input: message.input });
      }
      room.step();

      if (now % snapshotEvery === 0) downstream.send(now, toWire(room.broadcast(), 'a'));
      for (const batch of downstream.deliver(now)) client.receiveWire(batch);

      const after = client.localTank();
      if (before && after) {
        maxJump = Math.max(maxJump, Math.hypot(after.x - before.x, after.y - before.y));
      }
    }

    return { room, client, maxJump };
  }

  test('sans latence, le client retombe exactement sur l\'état serveur', () => {
    const { room, client } = play({
      ticks: 60,
      delayTicks: 0,
      inputAt: () => RIGHT,
    });

    // Un dernier instantané, pour que rien ne reste en attente : les
    // instantanés ne partent qu'un pas sur trois.
    client.receive(room.broadcast(), 'a');

    // Toutes les intentions sont confirmées : le monde prédit doit être le
    // monde serveur, au bit près.
    expect(client.reconciler.pendingCount).toBe(0);
    expect(hashWorld(client.reconciler.world!)).toBe(hashWorld(room.world!));
  });

  test('à 100 ms de latence, le tank local ne saute jamais', () => {
    // Six pas de retard dans chaque sens : un aller-retour de 200 ms, soit
    // largement au-delà de ce qu'une partie normale rencontre.
    const { maxJump, client } = play({
      ticks: 240,
      delayTicks: 6,
      inputAt: (tick) => (tick % 40 < 20 ? RIGHT : LEFT),
    });

    // Le tank ne doit jamais avancer de plus d'un pas entre deux images : sur un
    // lien sans perte, la prédiction et l'autorité appliquent exactement les
    // mêmes intentions, donc la correction est nulle. Une correction qui
    // déplacerait visiblement le tank serait pire que la latence qu'elle compense.
    expect(maxJump).toBeLessThan(2 * MOVEMENT_STEP_TILES);
    // Et la prédiction ne s'emballe pas : il reste l'aller-retour en attente,
    // pas une seconde entière d'intentions.
    expect(client.reconciler.pendingCount).toBeLessThan(20);
  });

  test('avec 5 % de pertes, la divergence ne s\'installe pas', () => {
    const { room, client, maxJump } = play({
      ticks: 300,
      delayTicks: 6,
      dropOneIn: 20,
      inputAt: (tick) => (tick % 40 < 20 ? RIGHT : LEFT),
    });

    // Une intention perdue coûte exactement un pas de correction — soit deux
    // pas de déplacement sur l'image concernée, moins de deux pixels à l'écran.
    // C'est le plancher : on ne peut pas rattraper une intention que le serveur
    // n'a jamais reçue.
    expect(maxJump).toBeLessThan(3 * MOVEMENT_STEP_TILES);

    // Une intention perdue est une intention que le serveur n'appliquera jamais :
    // les deux positions ne peuvent pas coïncider au bit près. Ce qui compte est
    // que l'écart reste borné au lieu de s'accumuler.
    const server = room.world!.tanks.find((tank) => tank.playerId === 'a')!;
    const predicted = client.localTank()!;

    expect(Math.hypot(predicted.x - server.x, predicted.y - server.y)).toBeLessThan(1);
  });

  test('les intentions non confirmées sont rejouées, pas perdues', () => {
    const room = openRoom('a');
    const client = new TestClient();

    client.reconciler.predict(client.nextSeq(), NEUTRAL_INPUT);
    room.input('a', { t: 'input', seq: 0, input: NEUTRAL_INPUT });
    room.step();
    client.receive(room.broadcast(), 'a');

    const startX = client.localTank()!.x;

    // Cinq intentions dont le serveur n'a pas encore accusé réception.
    for (let index = 0; index < 5; index++) client.reconciler.predict(client.nextSeq(), RIGHT);
    const predictedX = client.localTank()!.x;
    expect(predictedX).toBeGreaterThan(startX);

    // Le serveur renvoie un état plus ancien : le client doit le reprendre,
    // puis rejouer ses cinq intentions — et retomber à la même position.
    client.receive(room.broadcast(), 'a');

    expect(client.reconciler.pendingCount).toBe(5);
    expect(client.localTank()!.x).toBeCloseTo(predictedX, 9);
  });

  test('le client ne rejoue pas ce que le serveur a déjà appliqué', () => {
    const room = openRoom('a');
    const client = new TestClient();

    for (let seq = 0; seq < 10; seq++) {
      client.reconciler.predict(seq, RIGHT);
      room.input('a', { t: 'input', seq, input: RIGHT });
      room.step();
    }

    client.receive(room.broadcast(), 'a');

    // Sans ce filtrage, les dix intentions seraient appliquées deux fois et le
    // tank ferait un bond en avant à chaque instantané.
    expect(client.reconciler.pendingCount).toBe(0);
    expect(client.localTank()!.x).toBeCloseTo(
      room.world!.tanks.find((tank) => tank.playerId === 'a')!.x,
      9,
    );
  });
});

describe('résilience', () => {
  test('la déconnexion arrête le tank sans arrêter la partie', () => {
    const room = openRoom('a', 'b');
    room.input('a', { t: 'input', seq: 0, input: RIGHT });
    room.step();

    room.disconnect('a');
    const stoppedAt = room.world!.tanks.find((tank) => tank.playerId === 'a')!.x;

    for (let index = 0; index < 10; index++) room.step();

    // Sans ce garde-fou, le tank continuerait sur sa lancée, touche enfoncée,
    // sans personne derrière.
    expect(room.world!.tanks.find((tank) => tank.playerId === 'a')!.x).toBe(stoppedAt);
    // Et la simulation, elle, continue pour tout le monde.
    expect(room.world!.tick).toBeGreaterThan(10);
  });

  test('le tank d\'un joueur parti finit par disparaître', () => {
    const room = openRoom('a', 'b');
    room.disconnect('a');

    // Le délai de grâce couvre une coupure passagère ; au-delà, l'épave ne doit
    // pas encaisser les tirs à la place des autres.
    for (let index = 0; index < 60 * 11; index++) room.step();

    expect(room.world!.tanks.some((tank) => tank.playerId === 'a')).toBe(false);
    expect(room.world!.tanks.some((tank) => tank.playerId === 'b')).toBe(true);
  });

  test('l\'IA continue quand tous les joueurs sont partis', () => {
    // L'ancienne version désignait `player1` maître de l'IA : son départ
    // arrêtait net les ennemis. Ici l'IA appartient à la salle.
    const room = openRoom('a');
    room.disconnect('a');

    const enemiesBefore = room.world!.tanks.filter((tank) => tank.playerId === null).length;
    for (let index = 0; index < 120; index++) room.step();

    expect(room.world!.tanks.filter((tank) => tank.playerId === null)).toHaveLength(
      enemiesBefore,
    );
  });

  test('une reconnexion reprend le siège', () => {
    const room = openRoom('a', 'b');
    const tankId = room.tankIdOf('a')!;

    room.disconnect('a');
    for (let index = 0; index < 60; index++) room.step();

    room.join('a', 'a');
    expect(room.tankIdOf('a')).toBe(tankId);
  });

  test('un joueur qui arrive en cours de partie reçoit un tank', () => {
    const room = openRoom('a');
    for (let index = 0; index < 30; index++) room.step();

    room.join('c', 'c');
    expect(room.tankIdOf('c')).toBeDefined();
    expect(room.world!.tanks.filter((tank) => tank.playerId !== null)).toHaveLength(2);
  });
});

describe('lobby', () => {
  test('l\'arrivée annonce la table de réglages et la liste des joueurs', () => {
    const room = new Room('salon');
    const outgoing = room.join('a', 'Aurélien');

    const welcome = outgoing.find((entry) => entry.message.t === 'welcome')!;
    expect(welcome.to).toBe('a');
    // La prédiction doit tourner sur exactement les constantes de l'autorité.
    expect((welcome.message as { tuning: unknown }).tuning).toBeDefined();

    const lobby = outgoing.find((entry) => entry.message.t === 'lobby')!;
    expect(lobby.to).toBeNull();
    expect((lobby.message as { players: Array<{ name: string }> }).players[0]!.name).toBe(
      'Aurélien',
    );
  });

  test('démarrer deux fois n\'ouvre pas deux parties', () => {
    const room = new Room('salon');
    room.join('a', 'a');

    room.start();
    const world = room.world;
    room.start();

    expect(room.world).toBe(world);
  });

  test('un message de type inconnu est simplement ignoré', () => {
    const message = decode<ServerMessage>(encode({ t: 'bye', reason: 'test' }));
    expect(message?.t).toBe('bye');
  });

  test('un cinquième joueur est refusé, le salon plafonne à quatre', () => {
    const room = new Room('salon');
    for (const playerId of ['a', 'b', 'c', 'd']) room.join(playerId, playerId);

    const outgoing = room.join('e', 'e');

    const bye = outgoing.find((entry) => entry.message.t === 'bye');
    expect(bye?.to).toBe('e');
    expect((bye?.message as { reason: string }).reason).toContain('complet');
    // Le refus ne doit rien changer pour les quatre déjà installés.
    expect(
      (room.join('a', 'a').find((entry) => entry.message.t === 'lobby')!.message as {
        players: unknown[];
      }).players,
    ).toHaveLength(4);
  });

  test('un siège déjà occupé se reprend même un salon plein', () => {
    const room = new Room('salon');
    for (const playerId of ['a', 'b', 'c', 'd']) room.join(playerId, playerId);

    const outgoing = room.join('a', 'Aurélien de retour');
    expect(outgoing.some((entry) => entry.message.t === 'bye')).toBe(false);
  });
});
