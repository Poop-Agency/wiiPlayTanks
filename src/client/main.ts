/**
 * Point d'entrée du client : un aiguillage, et rien d'autre.
 *
 * ─── Modes ───────────────────────────────────────────────────────────────────
 *
 *   (aucun paramètre)  l'écran-titre
 *   ?mission=N         la campagne solo, à partir de la mission N
 *   ?enligne=1         le co-op, salon « principal »
 *   ?enligne=1&salon=X un salon nommé
 *   ?bac=1             le terrain d'essai des tests bout-en-bout
 *   ?bac=1&calme=1     le même, sans ennemis
 *
 * La touche `~` ouvre le panneau de calibration, `M` coupe le son.
 */

import { hasMode, showTitleScreen } from './ui/title';

const params = new URLSearchParams(window.location.search);

if (hasMode(params)) {
  // Import différé : l'écran-titre n'a pas besoin du moteur, et ne doit donc
  // ni le télécharger ni le démarrer derrière lui.
  void import('./boot').then((module) => module.boot(params));
} else {
  showTitleScreen();
}
