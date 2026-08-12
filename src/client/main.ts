/**
 * Point d'entrée du client.
 *
 * Assemble les couches et rien de plus : entrées → simulation → rendu → HUD,
 * cadencées par la boucle à pas fixe. Aucune logique de jeu ici — c'est la
 * {@link Session} qui la porte, et c'est ce qui permettra de brancher la
 * session réseau de #13 sans toucher à ce fichier.
 *
 * ─── Modes ───────────────────────────────────────────────────────────────────
 *
 *   (aucun paramètre)  la campagne solo, à partir de la mission 1
 *   ?mission=N         la campagne solo, à partir de la mission N
 *   ?enligne=1         le co-op, salon « principal »
 *   ?enligne=1&salon=X un salon nommé
 *   ?bac=1             le terrain d'essai des tests bout-en-bout
 *   ?bac=1&calme=1     le même, sans ennemis
 *
 * La touche `~` ouvre le panneau de calibration, dans tous les modes.
 */

import { TICK_RATE } from '@core/tick';
import { TUNING } from '@core/tuning';
import { CAMPAIGN_LENGTH } from '@shared/campaign';
import { exposeDebugBridge } from './debug-bridge';
import type { RateProbe, TanksDebugBridge } from './debug-bridge';
import { InputSampler } from './input/sampler';
import { LocalCampaign } from './local/LocalCampaign';
import { createSandboxSession } from './local/sandbox';
import { startGameLoop } from './loop';
import { Connection, stablePlayerId } from './net/connection';
import { NetworkSession } from './net/NetworkSession';
import { BOARD_BOTTOM_BAND_PX, Canvas2DRenderer } from './render/canvas2d/Canvas2DRenderer';
import type { Session } from './session';
import { drawHud } from './ui/hud';
import { TuningPanel } from './ui/tuning-panel';

/**
 * Récupère le canevas.
 *
 * Passer par une fonction au type de retour explicite plutôt que par des
 * `const` en portée de module : le rétrécissement de type après un `if (!x)
 * throw` ne traverse pas les frontières de fonction.
 */
function mountCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Canevas #game introuvable dans index.html');
  return canvas;
}

/** Numéro de mission demandé dans l'URL, ramené dans les bornes de la campagne. */
function requestedMission(params: URLSearchParams): number {
  const raw = Number(params.get('mission'));
  if (!Number.isInteger(raw)) return 1;
  return Math.min(Math.max(raw, 1), CAMPAIGN_LENGTH);
}

/** Port sur lequel Vite sert la page en développement. */
const VITE_DEV_PORT = '5173';

/** Port du serveur de jeu. */
const GAME_SERVER_PORT = '3000';

/**
 * Adresse du serveur de jeu.
 *
 * Deux situations. En développement, Vite sert la page et le serveur de jeu
 * tourne à côté : il faut donc changer de port. En production, le serveur de jeu
 * sert lui-même les fichiers, et l'hôte courant est le bon.
 *
 * `?serveur=` court-circuite la déduction, pour pointer une autre machine.
 */
function serverUrl(params: URLSearchParams): string {
  const explicit = params.get('serveur');
  if (explicit) return explicit;

  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host =
    window.location.port === VITE_DEV_PORT
      ? `${window.location.hostname}:${GAME_SERVER_PORT}`
      : window.location.host;

  return `${scheme}//${host}/ws`;
}

function createSession(params: URLSearchParams): Session {
  if (params.has('bac')) {
    return createSandboxSession({ withEnemies: !params.has('calme') });
  }

  if (params.has('enligne')) {
    const room = params.get('salon') ?? 'principal';
    const playerId = stablePlayerId();

    // La session est construite avant la connexion : le transport lui est
    // donné, et les messages lui arrivent ensuite. C'est ce qui permet de la
    // tester avec un transport factice, sans WebSocket.
    let network: NetworkSession;
    const connection = new Connection({
      url: serverUrl(params),
      playerId,
      room,
      name: params.get('nom') ?? `Joueur ${playerId.slice(0, 4)}`,
      onMessage: (message) => network.handle(message),
      onClose: () => network.disconnected(),
    });

    network = new NetworkSession(connection);
    return network;
  }

  return new LocalCampaign(requestedMission(params));
}

const canvas = mountCanvas();
const renderer = new Canvas2DRenderer(canvas);

const params = new URLSearchParams(window.location.search);
const session = createSession(params);

/**
 * Dimensions pour lesquelles la surface de rendu est dimensionnée.
 *
 * Vérifiées à chaque frame plutôt qu'une fois au démarrage : en co-op, le
 * terrain n'arrive qu'après la connexion, et le canevas serait resté à la
 * taille du monde d'attente.
 */
let sizedFor = { width: 0, height: 0 };

const sampler = new InputSampler(canvas, (clientX, clientY) =>
  renderer.pointerToWorld(clientX, clientY),
);

// Reprendre une campagne perdue ou terminée n'est pas une intention de jeu :
// ça ne passe donc pas par `InputCommand`, qui est ce qui partira sur le
// réseau. C'est une action d'interface, et elle reste ici.
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Enter') return;

  const status = session.status();
  if (status && status.status !== 'playing') session.restart();
});

/** Diagnostic de cadence, affiché en surimpression. Sans effet sur la simulation. */
const rates: RateProbe = {
  ticks: 0,
  frames: 0,
  ticksPerSecond: 0,
  framesPerSecond: 0,
  windowStartMs: 0,
};

function sampleRates(nowMs: number): void {
  if (rates.windowStartMs === 0) rates.windowStartMs = nowMs;

  const elapsed = nowMs - rates.windowStartMs;
  if (elapsed < 1000) return;

  rates.ticksPerSecond = Math.round((rates.ticks * 1000) / elapsed);
  rates.framesPerSecond = Math.round((rates.frames * 1000) / elapsed);
  rates.ticks = 0;
  rates.frames = 0;
  rates.windowStartMs = nowMs;
}

/**
 * Bandeau de diagnostic.
 *
 * Il occupe la bande que le renderer réserve sous le plateau, et ne recouvre
 * donc aucune tuile.
 */
function drawDiagnostics(ctx: CanvasRenderingContext2D): void {
  const top = ctx.canvas.height - BOARD_BOTTOM_BAND_PX;

  ctx.save();
  ctx.fillStyle = 'rgba(28, 20, 12, 0.72)';
  ctx.fillRect(0, top, ctx.canvas.width, BOARD_BOTTOM_BAND_PX);

  ctx.font = '11px ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  const middle = top + BOARD_BOTTOM_BAND_PX / 2;

  ctx.fillStyle = '#b9a98c';
  ctx.textAlign = 'left';
  ctx.fillText('ZQSD · souris viser · clic tirer · clic droit miner · ~ réglages', 14, middle);

  // À droite, et volontairement court : les deux textes partagent une bande de
  // la largeur du plateau, et se chevauchaient dès que l'un des deux s'allongeait.
  ctx.textAlign = 'right';
  ctx.fillText(
    `${rates.ticksPerSecond} pas/s (${TICK_RATE} attendus) · ${rates.framesPerSecond} img/s`,
    ctx.canvas.width - 14,
    middle,
  );
  ctx.restore();
}

const overlayCtx = canvas.getContext('2d');

const panel = new TuningPanel();

/**
 * Coût moyen d'un pas de simulation, lissé.
 *
 * Mesuré ici et non dans `core/` : `performance.now()` y est proscrit, et à
 * juste titre — une simulation qui lirait l'horloge ne serait plus déterministe.
 */
const SMOOTHING = 0.1;
let msPerTick = 0;

const bridge: TanksDebugBridge = { world: session.world, rates, tuning: TUNING };
exposeDebugBridge(bridge);

startGameLoop({
  update(): void {
    rates.ticks++;

    // La visée se recalcule depuis la position courante du tank : un pointeur
    // immobile au-dessus d'un tank qui se déplace doit rester visé.
    const tank = session.playerTank;
    if (tank) sampler.setAimOrigin(tank.x, tank.y);

    const startedMs = performance.now();
    session.update(sampler.sample());
    msPerTick += (performance.now() - startedMs - msPerTick) * SMOOTHING;

    // La campagne remplace son monde à chaque mission : la passerelle doit
    // suivre, sinon les tests bout-en-bout observeraient la mission précédente.
    bridge.world = session.world;
    const status = session.status();
    if (status) bridge.campaign = status;

    const world = session.world;
    panel.update({
      tick: world.tick,
      tanks: world.tanks.filter((each) => each.alive).length,
      shells: world.shells.length,
      mines: world.mines.length,
      msPerTick,
      ticksPerSecond: rates.ticksPerSecond,
      framesPerSecond: rates.framesPerSecond,
    });
  },

  render(alpha): void {
    rates.frames++;
    sampleRates(performance.now());

    const grid = session.world.grid;
    if (grid.width !== sizedFor.width || grid.height !== sizedFor.height) {
      sizedFor = { width: grid.width, height: grid.height };
      renderer.resize(grid);
    }

    renderer.draw(grid, session.view(alpha));
    renderer.drawDebug(session.world, panel.debug);

    if (overlayCtx) {
      const status = session.status();
      if (status) drawHud(overlayCtx, status);
      drawDiagnostics(overlayCtx);
    }
  },
});
