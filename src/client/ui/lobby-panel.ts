/**
 * Salon d'attente et acceptation des spectateurs, en DOM.
 *
 * ─── Pourquoi pas dans le canevas comme le reste du HUD ─────────────────────
 *
 * Le salon a cessé d'être un panneau d'affichage : on y règle la partie. Des
 * cases à cocher et des boutons dessinés à la main demanderaient de refaire à la
 * main la détection de clic, le focus clavier, l'accessibilité et les cibles
 * tactiles — tout ce qu'un `<input>` apporte gratuitement.
 *
 * `tuning-panel.ts` a fait ce choix avant celui-ci, pour les mêmes raisons.
 *
 * ─── Ce qu'il ne fait pas ───────────────────────────────────────────────────
 *
 * Il n'a **aucun état à lui**. Il reçoit une vue à chaque image et se contente
 * de la refléter ; toute action part au serveur, qui fait autorité et renvoie
 * l'état. Sans ça, deux joueurs qui règlent en même temps verraient chacun sa
 * propre version des règles.
 */

import type { CampaignSettings } from '@shared/campaign';
import type { CampaignView } from '../session';

/** Ce que le panneau sait faire remonter. */
export interface LobbyPanelActions {
  configure(settings: CampaignSettings): void;
  admit(playerId: string): void;
  start(): void;
}

export class LobbyPanel {
  readonly #root: HTMLElement;

  /* ── Salon ────────────────────────────────────────────────────────────── */

  readonly #title: HTMLElement;
  readonly #hint: HTMLElement;
  readonly #roster: HTMLElement;
  readonly #bonus: HTMLInputElement;
  readonly #persist: HTMLInputElement;
  readonly #start: HTMLButtonElement;

  /* ── Spectateurs, pendant la partie ───────────────────────────────────── */

  readonly #waiting: HTMLElement;

  readonly #actions: LobbyPanelActions;

  /**
   * Signature de ce qui est affiché.
   *
   * Le panneau est rafraîchi soixante fois par seconde ; reconstruire la liste
   * à chaque image ferait perdre le focus du champ qu'on est en train de
   * modifier, et la case cochée sauterait sous le doigt.
   */
  #shownLobby = '';
  #shownWaiting = '';

  constructor(actions: LobbyPanelActions, host: HTMLElement = document.body) {
    this.#actions = actions;

    this.#root = document.createElement('div');
    this.#root.className = 'salon';
    this.#root.hidden = true;

    const card = document.createElement('div');
    card.className = 'salon-carte';

    this.#title = document.createElement('h1');
    this.#hint = document.createElement('p');
    this.#hint.className = 'salon-consigne';
    this.#roster = document.createElement('ul');
    this.#roster.className = 'salon-liste';

    const rules = document.createElement('div');
    rules.className = 'salon-regles';

    const bonusLabel = document.createElement('label');
    bonusLabel.append('Tank bonus toutes les ');

    this.#bonus = document.createElement('input');
    this.#bonus.type = 'number';
    this.#bonus.min = '0';
    this.#bonus.max = '50';
    this.#bonus.setAttribute('aria-label', 'Périodicité du tank bonus, 0 pour aucun');

    bonusLabel.append(this.#bonus, ' missions — 0 pour aucun');

    const persistLabel = document.createElement('label');
    this.#persist = document.createElement('input');
    this.#persist.type = 'checkbox';
    persistLabel.append(this.#persist, ' Les ennemis abattus ne reviennent pas');

    rules.append(bonusLabel, persistLabel);

    this.#start = document.createElement('button');
    this.#start.type = 'button';
    this.#start.className = 'principal';
    this.#start.textContent = 'Démarrer la partie';

    card.append(this.#title, this.#hint, this.#roster, rules, this.#start);

    this.#waiting = document.createElement('div');
    this.#waiting.className = 'salon-attente';
    this.#waiting.hidden = true;

    this.#root.append(card);
    host.append(this.#root, this.#waiting);

    this.#bonus.addEventListener('change', () => this.#emitSettings());
    this.#persist.addEventListener('change', () => this.#emitSettings());
    this.#start.addEventListener('click', () => this.#actions.start());
  }

  /** Reflète la vue courante. Appelé à chaque image. */
  update(view: CampaignView | null): void {
    const lobby = view?.lobby ?? null;

    this.#root.hidden = lobby === null;
    if (lobby) this.#renderLobby(lobby);

    // Les spectateurs en attente sont annoncés **pendant** la partie, et à ceux
    // qui jouent : c'est à eux de décider, et ils n'ont pas à quitter le jeu
    // pour le faire.
    const pending = !lobby && !view?.spectating ? (view?.spectators ?? []) : [];
    this.#renderWaiting(pending);
  }

  dispose(): void {
    this.#root.remove();
    this.#waiting.remove();
  }

  /* ── Rendu ────────────────────────────────────────────────────────────── */

  #renderLobby(lobby: NonNullable<CampaignView['lobby']>): void {
    const seated = lobby.players.filter((player) => !player.spectator);
    const ready = seated.length >= lobby.minPlayers;

    const signature = JSON.stringify([lobby.room, lobby.players, lobby.settings, lobby.error]);
    if (signature === this.#shownLobby) return;
    this.#shownLobby = signature;

    this.#title.textContent = `Salon « ${lobby.room} »`;

    this.#hint.textContent = lobby.error
      ? lobby.error
      : ready
        ? 'Tout le monde est là. Démarrez quand vous voulez.'
        : `En attente d'au moins ${lobby.minPlayers} joueurs (${seated.length}/${lobby.maxPlayers}).`;
    this.#hint.classList.toggle('est-erreur', lobby.error !== null);

    this.#roster.replaceChildren(
      ...lobby.players.map((player, index) => {
        const row = document.createElement('li');
        row.dataset['seat'] = String(index);
        row.textContent = player.connected ? player.name : `${player.name} (hors ligne)`;
        return row;
      }),
      ...Array.from({ length: Math.max(lobby.maxPlayers - lobby.players.length, 0) }, () => {
        const row = document.createElement('li');
        row.className = 'est-vide';
        row.textContent = 'en attente…';
        return row;
      }),
    );

    // Les champs ne sont réécrits que lorsque la valeur reçue diffère : sinon on
    // effacerait ce que l'utilisateur est en train de taper.
    const bonus = String(lobby.settings.bonusEveryMissions);
    if (this.#bonus.value !== bonus) this.#bonus.value = bonus;

    const persist = !lobby.settings.respawnEnemiesOnRetry;
    if (this.#persist.checked !== persist) this.#persist.checked = persist;
  }

  #renderWaiting(spectators: CampaignView['spectators']): void {
    this.#waiting.hidden = spectators.length === 0;

    // Vidé et pas seulement masqué : un bouton « Faire entrer » qui reste dans
    // le document continue de répondre au clavier et aux outils d'assistance,
    // alors que la personne qu'il désignait est déjà entrée.
    if (spectators.length === 0) {
      if (this.#shownWaiting !== '') {
        this.#waiting.replaceChildren();
        this.#shownWaiting = '';
      }
      return;
    }

    const signature = JSON.stringify(spectators);
    if (signature === this.#shownWaiting) return;
    this.#shownWaiting = signature;

    this.#waiting.replaceChildren(
      ...spectators.map((player) => {
        const row = document.createElement('div');
        row.className = 'salon-attente-ligne';

        const label = document.createElement('span');
        label.textContent = `${player.name} regarde`;

        const admit = document.createElement('button');
        admit.type = 'button';
        admit.textContent = 'Faire entrer';
        admit.addEventListener('click', () => this.#actions.admit(player.playerId));

        row.append(label, admit);
        return row;
      }),
    );
  }

  #emitSettings(): void {
    const bonus = Number(this.#bonus.value);

    this.#actions.configure({
      bonusEveryMissions: Number.isInteger(bonus) && bonus > 0 ? bonus : 0,
      respawnEnemiesOnRetry: !this.#persist.checked,
    });
  }
}
