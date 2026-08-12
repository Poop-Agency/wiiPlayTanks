/**
 * Écran-titre : choix du mode, avant que quoi que ce soit ne démarre.
 *
 * ─── Pourquoi il navigue au lieu de démarrer une partie ─────────────────────
 *
 * Chaque mode se distingue déjà par ses paramètres d'URL — c'est ce qui permet
 * de relancer exactement la même configuration, et ce dont les tests
 * bout-en-bout se servent. L'écran-titre se contente donc de composer l'URL
 * correspondante et d'y naviguer.
 *
 * L'alternative aurait été de démonter et remonter la session en place, ce qui
 * demanderait à `main.ts` de savoir défaire ce qu'il assemble : un chemin de
 * code de plus, exercé une fois par partie, pour un résultat identique.
 */

import { CAMPAIGN_LENGTH } from '@shared/campaign';

/**
 * Construction sans co-op, pour un hébergement statique.
 *
 * Posée à la construction (`VITE_SOLO_ONLY=1`) et non devinée à l'exécution :
 * un client ne peut pas savoir si l'origine qui l'a servi héberge un serveur
 * de jeu sans tenter la connexion, et échouer prend plusieurs secondes.
 */
const SOLO_ONLY = import.meta.env['VITE_SOLO_ONLY'] === '1';

/** Y a-t-il déjà un mode demandé dans l'URL ? */
export function hasMode(params: URLSearchParams): boolean {
  return params.has('mission') || params.has('enligne') || params.has('bac');
}

/** Construit l'écran-titre et l'installe. Ne rend jamais la main au jeu. */
export function showTitleScreen(host: HTMLElement = document.body): void {
  const screen = document.createElement('div');
  screen.className = 'ecran-titre';

  const panel = document.createElement('div');
  panel.className = 'ecran-titre-carte';

  const title = document.createElement('h1');
  title.textContent = 'TANKS!';

  const subtitle = document.createElement('p');
  subtitle.className = 'ecran-titre-sous-titre';
  subtitle.textContent = `${CAMPAIGN_LENGTH} missions — d'après le mini-jeu de Wii Play`;

  panel.append(title, subtitle);
  panel.append(soloSection());

  // Le co-op exige un serveur de jeu. Sur un hébergement statique il n'y en a
  // aucun : proposer le bouton mènerait à une connexion qui n'aboutit jamais,
  // ce qui se lit comme une panne plutôt que comme une absence.
  if (!SOLO_ONLY) panel.append(coopSection());

  panel.append(helpSection());

  screen.append(panel);
  host.append(screen);
}

/** Navigue vers un mode. */
function go(search: URLSearchParams): void {
  window.location.search = search.toString();
}

function soloSection(): HTMLElement {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Solo';
  section.append(heading);

  const row = document.createElement('div');
  row.className = 'ecran-titre-ligne';

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'principal';
  play.textContent = 'Commencer la campagne';
  play.addEventListener('click', () => go(new URLSearchParams({ mission: '1' })));

  // Reprendre à une mission choisie : la campagne se rejoue souvent par
  // morceaux, et redémarrer à la première pour en essayer une autre serait
  // pénible.
  const label = document.createElement('label');
  label.textContent = 'ou mission ';

  const mission = document.createElement('input');
  mission.type = 'number';
  mission.min = '1';
  mission.max = String(CAMPAIGN_LENGTH);
  mission.value = '1';
  mission.setAttribute('aria-label', 'Numéro de mission');

  const jump = document.createElement('button');
  jump.type = 'button';
  jump.textContent = 'Aller';
  jump.addEventListener('click', () => go(new URLSearchParams({ mission: mission.value })));

  label.append(mission);
  row.append(play, label, jump);
  section.append(row);

  return section;
}

function coopSection(): HTMLElement {
  const section = document.createElement('section');

  const heading = document.createElement('h2');
  heading.textContent = 'Co-op en ligne';
  section.append(heading);

  const note = document.createElement('p');
  note.className = 'ecran-titre-note';
  note.textContent =
    'Deux à quatre joueurs sur la même campagne. Partagez le nom du salon — ' +
    'qui arrive ensuite rejoint la partie en cours.';
  section.append(note);

  const row = document.createElement('div');
  row.className = 'ecran-titre-ligne';

  const room = document.createElement('input');
  room.type = 'text';
  room.value = 'principal';
  room.setAttribute('aria-label', 'Nom du salon');

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = 'Votre nom';
  name.setAttribute('aria-label', 'Votre nom');

  const join = document.createElement('button');
  join.type = 'button';
  join.className = 'principal';
  join.textContent = 'Rejoindre';
  join.addEventListener('click', () => {
    const search = new URLSearchParams({ enligne: '1', salon: room.value || 'principal' });
    if (name.value) search.set('nom', name.value);
    go(search);
  });

  row.append(room, name, join);
  section.append(row);

  return section;
}

function helpSection(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'ecran-titre-aide';

  const heading = document.createElement('h2');
  heading.textContent = 'Commandes';
  section.append(heading);

  const list = document.createElement('dl');

  const entries: Array<[string, string]> = [
    ['ZQSD · WASD · flèches', 'déplacer le tank'],
    ['Souris', 'viser — la tourelle est indépendante du châssis'],
    ['Clic gauche', 'tirer'],
    ['Clic droit · E · Maj', 'poser une mine'],
    ['Manette', 'stick gauche pour se déplacer, stick droit pour viser'],
    ['M', 'couper le son'],
    ['~', 'panneau de calibration'],
  ];

  for (const [keys, what] of entries) {
    const term = document.createElement('dt');
    term.textContent = keys;

    const description = document.createElement('dd');
    description.textContent = what;

    list.append(term, description);
  }

  section.append(list);
  return section;
}
