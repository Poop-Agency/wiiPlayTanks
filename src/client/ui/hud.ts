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
import type { CampaignView } from '../session';
import { TANK_COLORS } from '../render/palette';

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

/** Dessine le HUD par-dessus l'image de jeu. */
export function drawHud(ctx: CanvasRenderingContext2D, view: CampaignView): void {
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

  const banner = bannerFor(view);
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
}
