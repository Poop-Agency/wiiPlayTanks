/**
 * Assemblage d'une partie.
 *
 * Entrées → simulation → rendu → HUD, cadencés par la boucle à pas fixe. Aucune
 * logique de jeu ici : c'est la {@link Session} qui la porte, et c'est ce qui
 * permet au co-op de se brancher sans que ce fichier le sache.
 *
 * Séparé de `main.ts` pour que l'écran-titre n'entraîne pas le jeu avec lui :
 * tant qu'aucun mode n'est choisi, rien de tout ceci n'est chargé ni exécuté.
 */

import { TICK_RATE } from '@core/tick';
import { TUNING } from '@core/tuning';
import { CAMPAIGN_LENGTH } from '@shared/campaign';
import { exposeDebugBridge } from './debug-bridge';
import type { RateProbe, TanksDebugBridge } from './debug-bridge';
import { InputSampler } from './input/sampler';
import { SoundDirector } from './audio/SoundDirector';
import { Music } from './audio/music';
import { Synth } from './audio/synth';
import { LocalCampaign } from './local/LocalCampaign';
import { createSandboxSession } from './local/sandbox';
import { startGameLoop } from './loop';
import { Connection, stablePlayerId } from './net/connection';
import { NetworkSession } from './net/NetworkSession';
import { BOARD_BOTTOM_BAND_PX, Canvas2DRenderer } from './render/canvas2d/Canvas2DRenderer';
import type { CampaignView, Session } from './session';
import { Effects } from './render/effects';
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
 * Adresse du serveur de jeu, par ordre de priorité décroissante.
 *
 * 1. `?serveur=` — court-circuite tout, pour pointer une machine à la volée.
 *    C'est ce qui permet d'essayer un serveur sans reconstruire le client.
 * 2. `VITE_GAME_SERVER`, figée à la construction. Nécessaire dès que la page
 *    et le jeu ne vivent plus au même endroit : un client servi par un
 *    hébergeur statique (Vercel) n'a aucun `/ws` sur sa propre origine, et la
 *    déduction ci-dessous le ferait se connecter à lui-même.
 * 3. À défaut, l'origine courante — le cas normal quand le serveur de jeu
 *    sert lui-même les fichiers. En développement, Vite sert la page et le
 *    serveur tourne à côté : il faut alors changer de port.
 */
function serverUrl(params: URLSearchParams): string {
  const explicit = params.get('serveur');
  if (explicit) return explicit;

  const configured = import.meta.env['VITE_GAME_SERVER'];
  if (configured) return configured;

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


/** Démarre une partie dans le mode décrit par les paramètres d'URL. */
export function boot(params: URLSearchParams): void {
  const canvas = mountCanvas();
  const renderer = new Canvas2DRenderer(canvas);
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
    if (!status) return;

    // Dans le salon, `restart()` sert de déclencheur de départ (#13) : c'est
    // le même message `t: 'start'` que la partie n'ait jamais commencé ou
    // qu'elle reprenne après une issue de mission.
    if (status.lobby || status.status !== 'playing') session.restart();
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

    // À droite, et volontairement court : les deux textes partagent une bande de
    // la largeur du plateau, et se chevauchaient dès que l'un des deux s'allongeait.
    const diagnostics = `${rates.ticksPerSecond} pas/s (${TICK_RATE} attendus) · ${rates.framesPerSecond} img/s`;
    const available = ctx.canvas.width - 28 - ctx.measureText(diagnostics).width - 16;

    // Le rappel des touches cède du terrain avant les diagnostics : il s'apprend
    // une fois, eux se relisent. La bande a rétréci avec le plateau (736 → 576 px
    // au passage en 18 × 18), et la version longue n'y tient plus.
    const hints = [
      'ZQSD · clic tirer · clic droit miner · M son · ~ réglages',
      'ZQSD · clic tirer · clic droit miner · ~ réglages',
      'ZQSD · clic tirer · clic droit miner',
      'ZQSD · clic tirer',
    ];

    ctx.fillStyle = '#b9a98c';
    ctx.textAlign = 'left';
    ctx.fillText(hints.find((hint) => ctx.measureText(hint).width <= available) ?? '', 14, middle);

    ctx.textAlign = 'right';
    ctx.fillText(diagnostics, ctx.canvas.width - 14, middle);
    ctx.restore();
  }

  const overlayCtx = canvas.getContext('2d');

  const panel = new TuningPanel();

  /**
   * Retour à l'écran-titre.
   *
   * On navigue vers une URL sans paramètre plutôt que de démonter la session
   * en place : c'est déjà la façon dont l'écran-titre lance un mode, et ça
   * garantit qu'aucun état — connexion, boucle, contexte audio — ne survive
   * d'une partie à l'autre. Quitter un salon revient donc simplement à fermer
   * la page, ce que le serveur sait déjà traiter.
   */
  function goHome(): void {
    window.location.href = window.location.pathname;
  }

  const quit = document.createElement('button');
  quit.type = 'button';
  quit.className = 'bouton-quitter';
  quit.textContent = '← Accueil';
  quit.title = 'Revenir à l’écran-titre (Échap)';
  quit.addEventListener('click', goHome);
  document.body.append(quit);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') return;
    goHome();
  });

  const effects = new Effects();
  const synth = new Synth();
  const sound = new SoundDirector(synth);
  const music = new Music();

  /**
   * Phase de mission au pas précédent.
   *
   * Les jingles ponctuent une **bascule**, pas un état : sans cette mémoire,
   * la fin de manche se rejouerait soixante fois par seconde pendant tout le
   * temps mort. Remise à `null` au déblocage de l'audio, pour rattraper la
   * bascule survenue avant le premier geste du joueur.
   */
  let previousPhase: CampaignView['phase'] | null = null;

  music.setMuted(synth.muted);
  music.setVolume(synth.settings.volume);

  // Les navigateurs refusent d'ouvrir un contexte audio sans geste préalable :
  // on l'ouvre au premier, quel qu'il soit.
  for (const type of ['pointerdown', 'keydown'] as const) {
    window.addEventListener(
      type,
      () => {
        synth.resume();
        music.unlock();
        // Jusqu'ici le navigateur interdisait tout son : la phase en cours a
        // donc basculé sans que sa bande-son parte. En oubliant la phase
        // précédente, on force sa redétection au pas suivant — c'est ce qui
        // fait entendre l'annonce d'ouverture, dont la bascule a lieu bien
        // avant le premier geste du joueur.
        previousPhase = null;
      },
      { once: true },
    );
  }

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyM') return;
    // La musique suit le même interrupteur : couper le son et continuer
    // d'entendre la mélodie n'aurait aucun sens.
    music.setMuted(synth.toggleMute());
  });

  /** Instant de la frame précédente, pour faire vivre les effets en temps réel. */
  let previousFrameMs = performance.now();

  /**
   * Coût moyen d'un pas de simulation, lissé.
   *
   * Mesuré ici et non dans `core/` : `performance.now()` y est proscrit, et à
   * juste titre — une simulation qui lirait l'horloge ne serait plus déterministe.
   */
  const SMOOTHING = 0.1;
  let msPerTick = 0;

  const bridge: TanksDebugBridge = { world: session.world, rates, tuning: TUNING, music };
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
      if (status) {
        bridge.campaign = status;

        if (!status.lobby) {
          // Chaque phase a sa bande-son, et elle se déclenche sur la
          // **bascule** : comparée à la précédente, sinon le jingle repartirait
          // soixante fois par seconde pendant toute la transition.
          if (status.phase !== previousPhase) {
            if (status.phase === 'ending') {
              // La musique de mission s'arrête : elle couvrirait la ponctuation.
              music.stop();
              music.playJingle(status.outcome === 'cleared' ? 'cleared' : 'failed');
            } else if (status.phase === 'briefing') {
              // L'entre-deux accompagne l'annonce des ennemis à venir.
              music.playJingle('interlude');
            }
            previousPhase = status.phase;
          }

          // La musique de mission ne démarre qu'avec la mission elle-même :
          // pendant les transitions le monde est figé, et elle partirait avant
          // que le joueur ne puisse bouger. `playForMission` compare avec la
          // mission en cours, donc l'appeler à chaque pas ne relance rien.
          if (status.phase === 'playing') music.playForMission(status.mission);
        }
      }

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
      const nowMs = performance.now();
      rates.frames++;
      sampleRates(nowMs);

      const grid = session.world.grid;
      if (grid.width !== sizedFor.width || grid.height !== sizedFor.height) {
        sizedFor = { width: grid.width, height: grid.height };
        renderer.resize(grid);
      }

      // Effets et sons se déduisent de l'image dessinée, et non d'évènements
      // émis par la simulation — qui n'en émet aucun, par choix. Conséquence
      // heureuse en co-op : on entend exactement ce qu'on voit, retard
      // d'interpolation compris.
      const view = session.view(alpha);
      effects.update(view, (nowMs - previousFrameMs) / 1000);
      sound.update(view);
      previousFrameMs = nowMs;

      renderer.draw(grid, view, effects.view());
      renderer.drawDebug(session.world, panel.debug);

      if (overlayCtx) {
        const status = session.status();
        if (status) drawHud(overlayCtx, status);
        drawDiagnostics(overlayCtx);
      }
    },
  });
}
