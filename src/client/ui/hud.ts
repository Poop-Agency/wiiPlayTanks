/**
 * Affichage de tête : mission, réserve de tanks, munitions, bandeaux d'issue.
 *
 * Dessiné sur le même canevas que le jeu, après le terrain. C'est un choix
 * assumé plutôt que du DOM superposé : le HUD doit rester aligné au pixel près
 * avec le plateau quand la fenêtre change de taille, et une couche HTML
 * séparée exigerait de synchroniser deux systèmes de coordonnées.
 *
 * Ce module ne lit **que** son modèle : il ne connaît ni le monde, ni la
 * campagne, ni la simulation. C'est ce qui permettra de le réutiliser tel quel
 * pour afficher l'état reçu du serveur (#13).
 */

import { BOARD_TOP_BAND_PX } from '../render/canvas2d/Canvas2DRenderer';
import type { CampaignView, LobbyView } from '../session';
import { PLAYER_SEAT_COLORS, TANK_COLORS } from '../render/palette';
import type { TankColor } from '@core/state';
import { enemyComposition } from '@shared/missions/composition';
import { missionByNumber } from '@shared/missions/missions';

/** Nom affiché de chaque type d'ennemi, pour le récap d'avant-round. */
const ENEMY_LABELS: Partial<Record<TankColor, string>> = {
  brown: 'Brun',
  ash: 'Cendre',
  teal: 'Sarcelle',
  yellow: 'Jaune',
  pink: 'Rose',
  green: 'Vert',
  purple: 'Violet',
  white: 'Blanc',
  black: 'Noir',
};

const HUD = {
  bandBackground: 'rgba(28, 20, 12, 0.72)',
  text: '#f0e6d2',
  textDim: '#b9a98c',
  bannerBackground: 'rgba(20, 14, 8, 0.82)',
  bannerSuccess: '#7ed07e',
  bannerFailure: '#e8734a',
  bannerNeutral: '#f0e6d2',
};

/**
 * Hauteur du bandeau supérieur.
 *
 * C'est exactement la bande que le renderer réserve au-dessus du plateau : le
 * HUD la remplit, il ne déborde jamais sur le jeu.
 */
const BAND_HEIGHT = BOARD_TOP_BAND_PX;

/** Bandeau d'issue : titre et sous-titre, ou `null` si la mission continue. */
interface Banner {
  title: string;
  subtitle: string;
  color: string;
}

/**
 * Message correspondant à l'état courant.
 *
 * L'ordre compte : la fin de campagne l'emporte sur l'issue de la mission, sans
 * quoi la dernière mission réussie afficherait « mission réussie » au lieu de
 * la victoire.
 */
function bannerFor(view: CampaignView): Banner | null {
  if (view.status === 'victory') {
    return {
      title: 'CAMPAGNE TERMINÉE',
      subtitle: 'Les vingt missions sont franchies — Entrée pour rejouer',
      color: HUD.bannerSuccess,
    };
  }

  if (view.status === 'gameOver') {
    return {
      title: 'PARTIE TERMINÉE',
      subtitle: `Plus de tank en réserve — arrêté à la mission ${view.mission} — Entrée pour reprendre`,
      color: HUD.bannerFailure,
    };
  }

  if (view.outcome === 'cleared') {
    return {
      title: 'MISSION RÉUSSIE',
      subtitle:
        view.mission % 5 === 0 && view.mission < view.totalMissions
          ? 'Un tank rejoint la réserve'
          : `Mission ${view.mission + 1} dans un instant`,
      color: HUD.bannerSuccess,
    };
  }

  if (view.outcome === 'failed') {
    return {
      title: 'TANK DÉTRUIT',
      subtitle:
        view.spares > 0
          ? `${view.spares} en réserve — nouvelle tentative`
          : 'Dernier tank de la réserve',
      color: HUD.bannerFailure,
    };
  }

  return null;
}

/** Petite silhouette de tank, utilisée pour figurer la réserve. */
function drawTankPip(ctx: CanvasRenderingContext2D, x: number, y: number, filled: boolean): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = filled ? TANK_COLORS.player : 'rgba(240, 230, 210, 0.22)';
  ctx.fillRect(-5, -3.5, 10, 7);
  ctx.fillRect(-1, -6.5, 8, 3);

  ctx.restore();
}

/**
 * Salon d'attente, avant que la partie ne démarre.
 *
 * Remplace tout le HUD habituel plutôt que de s'y ajouter : tant que la
 * partie n'a pas commencé, ni la mission, ni la réserve, ni les munitions
 * n'ont de sens à afficher.
 */
function drawLobby(ctx: CanvasRenderingContext2D, lobby: LobbyView): void {
  const { width, height } = ctx.canvas;
  const ready = lobby.players.length >= lobby.minPlayers;

  ctx.save();
  ctx.textBaseline = 'middle';

  ctx.fillStyle = HUD.bannerBackground;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.fillStyle = HUD.text;
  ctx.font = 'bold 24px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(`Salon « ${lobby.room} »`, width / 2, height / 2 - 96);

  ctx.font = '14px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = ready ? HUD.bannerSuccess : HUD.textDim;
  ctx.fillText(
    ready
      ? 'Entrée pour démarrer'
      : `En attente d'au moins ${lobby.minPlayers} joueurs (${lobby.players.length}/${lobby.maxPlayers})`,
    width / 2,
    height / 2 - 66,
  );

  const rowHeight = 28;
  const firstRow = height / 2 - 20;

  lobby.players.forEach((player, index) => {
    const y = firstRow + index * rowHeight;
    const color = TANK_COLORS[PLAYER_SEAT_COLORS[index] ?? 'player'];

    ctx.fillStyle = player.connected ? color : 'rgba(240, 230, 210, 0.25)';
    ctx.fillRect(width / 2 - 100, y - 7, 14, 14);

    ctx.textAlign = 'left';
    ctx.fillStyle = player.connected ? HUD.text : HUD.textDim;
    ctx.font = '15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(
      player.connected ? player.name : `${player.name} (hors ligne)`,
      width / 2 - 78,
      y,
    );
  });

  for (let seat = lobby.players.length; seat < lobby.maxPlayers; seat++) {
    const y = firstRow + seat * rowHeight;

    ctx.fillStyle = 'rgba(240, 230, 210, 0.12)';
    ctx.fillRect(width / 2 - 100, y - 7, 14, 14);

    ctx.textAlign = 'left';
    ctx.fillStyle = HUD.textDim;
    ctx.font = '15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('en attente…', width / 2 - 78, y);
  }

  if (lobby.error) {
    ctx.textAlign = 'center';
    ctx.fillStyle = HUD.bannerFailure;
    ctx.font = 'bold 14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(lobby.error, width / 2, firstRow + lobby.maxPlayers * rowHeight + 16);
  }

  ctx.restore();
}

/**
 * Petite silhouette de tank ennemi, dans sa couleur.
 *
 * Reprend la forme du pion de réserve : le récap doit se lire d'un coup d'oeil,
 * et une silhouette reconnue en un instant vaut mieux qu'un aplat de couleur.
 */
function drawEnemyPip(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = color;
  ctx.fillRect(-7, -5, 14, 10);
  ctx.fillStyle = darkenHex(color, 0.35);
  ctx.fillRect(-2, -2, 12, 4);

  ctx.restore();
}

/** Assombrit une couleur `#rrggbb`. Local au HUD, qui n'a que cet usage. */
function darkenHex(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.round(((value >> 16) & 0xff) * (1 - factor));
  const g = Math.round(((value >> 8) & 0xff) * (1 - factor));
  const b = Math.round((value & 0xff) * (1 - factor));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Récap du round suivant, pendant le temps mort qui suit une mission réussie.
 *
 * L'original annonce ce qui attend avant de lancer la manche ; sans ça, on
 * découvre un peloton de tanks noirs en même temps qu'il ouvre le feu. La durée
 * d'affichage est celle du temps mort, réglée dans `CampaignRunner`.
 */
function drawNextRoundRecap(ctx: CanvasRenderingContext2D, view: CampaignView): void {
  // La mission annoncée est **celle qui est déjà chargée** : pendant le
  // briefing, le monde suivant est en place mais figé. Annoncer `mission + 1`
  // décrirait le round d'après, pas celui qui va démarrer.
  const next = view.mission;
  const mission = missionByNumber(next);
  if (!mission) return;

  const groups = enemyComposition(next);
  if (groups.length === 0) return;

  const { width } = ctx.canvas;
  const rowHeight = 26;
  const height = 78 + groups.length * rowHeight;
  // Centré : pendant le briefing il n'y a plus de bandeau d'issue à éviter,
  // c'est le seul élément à l'écran et il doit tomber sous les yeux.
  const top = ctx.canvas.height / 2 - height / 2;
  const panelWidth = 340;
  const left = width / 2 - panelWidth / 2;

  ctx.save();
  ctx.textBaseline = 'middle';

  ctx.fillStyle = HUD.bannerBackground;
  ctx.fillRect(left, top, panelWidth, height);
  ctx.strokeStyle = 'rgba(240, 230, 210, 0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, panelWidth - 1, height - 1);

  ctx.textAlign = 'center';
  ctx.fillStyle = HUD.textDim;
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText(`PROCHAIN ROUND — MISSION ${next}`, width / 2, top + 22);

  ctx.fillStyle = HUD.text;
  ctx.font = 'bold 15px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(mission.name, width / 2, top + 46);

  groups.forEach((group, index) => {
    const y = top + 76 + index * rowHeight;
    const color = TANK_COLORS[group.color];

    drawEnemyPip(ctx, left + 46, y, color);

    ctx.textAlign = 'left';
    ctx.fillStyle = HUD.text;
    ctx.font = '14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(ENEMY_LABELS[group.color] ?? group.color, left + 70, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = HUD.textDim;
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText(`×${group.count}`, left + panelWidth - 46, y);
  });

  ctx.restore();
}

/** Dessine le HUD par-dessus l'image de jeu. */
export function drawHud(ctx: CanvasRenderingContext2D, view: CampaignView): void {
  if (view.lobby) {
    drawLobby(ctx, view.lobby);
    return;
  }

  const { width } = ctx.canvas;

  ctx.save();
  ctx.textBaseline = 'middle';

  /* ── Bandeau supérieur ─────────────────────────────────────────────── */

  ctx.fillStyle = HUD.bandBackground;
  ctx.fillRect(0, 0, width, BAND_HEIGHT);

  // En co-op, deux lignes tiennent dans la bande : la ligne principale remonte
  // pour laisser la place aux coéquipiers en dessous. Déborder sur le plateau
  // masquerait le mur d'enceinte, ce qu'on vient justement de corriger.
  const coop = view.teammates.length > 0;
  const middle = coop ? 13 : BAND_HEIGHT / 2;

  ctx.fillStyle = HUD.text;
  ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`MISSION ${view.mission}/${view.totalMissions}`, 14, middle);

  ctx.fillStyle = HUD.textDim;
  ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(view.missionName, 132, middle);

  // Réserve, au centre : la seule information qu'on cherche du regard en
  // pleine partie, donc à l'endroit le plus lisible du bandeau.
  const pips = Math.min(view.spares, 6);
  const pipsStart = width / 2 - ((pips - 1) * 16) / 2;
  for (let index = 0; index < pips; index++) {
    drawTankPip(ctx, pipsStart + index * 16, middle, true);
  }
  if (view.spares > 6) {
    ctx.fillStyle = HUD.textDim;
    ctx.font = '12px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`+${view.spares - 6}`, pipsStart + pips * 16, middle);
  }
  if (view.spares === 0) {
    ctx.fillStyle = HUD.bannerFailure;
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DERNIER TANK', width / 2, middle);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = HUD.text;
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText(
    `obus ${view.activeShells}/${view.maxShells}   mines ${view.activeMines}/${view.maxMines}   ennemis ${view.enemiesLeft}`,
    width - 14,
    middle,
  );

  if (coop) {
    ctx.fillStyle = HUD.textDim;
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`avec ${view.teammates.join(', ')}`, 14, BAND_HEIGHT - 11);
  }

  /* ── Bandeau d'issue ───────────────────────────────────────────────── */

  // Pendant le briefing, la mission suivante est déjà chargée : son issue se
  // lit « en cours », mais le bandeau de la mission écoulée n'a plus lieu
  // d'être et se superposerait à l'annonce.
  const banner = view.phase === 'briefing' ? null : bannerFor(view);
  if (banner) {
    const top = ctx.canvas.height / 2 - 46;

    ctx.fillStyle = HUD.bannerBackground;
    ctx.fillRect(0, top, width, 92);

    ctx.textAlign = 'center';
    ctx.fillStyle = banner.color;
    ctx.font = 'bold 30px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(banner.title, width / 2, top + 36);

    ctx.fillStyle = HUD.textDim;
    ctx.font = '14px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(banner.subtitle, width / 2, top + 66);
  }

  ctx.restore();

  // L'annonce du round, pendant la phase où il est chargé mais encore figé.
  if (view.phase === 'briefing') drawNextRoundRecap(ctx, view);
}
