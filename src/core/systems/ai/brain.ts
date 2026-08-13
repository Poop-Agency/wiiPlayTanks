/**
 * Décisions des tanks pilotés par l'IA.
 *
 * Une seule machine à états pour les neuf couleurs, entièrement paramétrée par
 * le profil. L'ancienne version dispersait ce comportement dans trois `switch`
 * distincts sur le type d'IA, si bien qu'ajuster un tank obligeait à toucher
 * trois endroits — et que les couleurs finissaient par se ressembler.
 *
 * L'IA produit exactement le même `InputCommand` qu'un joueur. Elle passe donc
 * par le même chemin de simulation, subit les mêmes règles, et ne peut pas
 * tricher : un ennemi ne peut pas se déplacer plus vite que ne l'autorise le
 * système de mouvement, ni tirer plus souvent que son rechargement.
 */

import { blocksTank, boxOverlapsSolid } from '../../grid.js';
import { normalizeAngle } from '../../math.js';
import { nextFloat, nextRange } from '../../rng.js';
import { DT, TICK_RATE, secondsToTicks } from '../../tick.js';
import { TUNING } from '../../tuning.js';
import { findFiringSolution, pathReaches, traceShellPath } from './aiming.js';
import { breachGain, canReachSafety, hasClearPath, navigationHeading } from './navigation.js';
import { profileOf } from './profiles.js';
import { findEvasion, findIncomingShell, interceptSpot } from './threat.js';
import type { InputCommand, Mine, Tank, TankAiState, World } from '../../state.js';
import type { TankProfile } from './profiles.js';

/**
 * Période de recalcul d'un angle de tir, en ticks.
 *
 * La recherche coûte des centaines de lancers de rayon : la refaire à chaque
 * pas serait du gaspillage, la cible n'ayant pas pu se déplacer de plus d'un
 * vingtième de tuile entre-temps. Les tanks sont **décalés** par leur
 * identifiant pour qu'ils ne calculent jamais tous au même pas.
 */
const AIM_PERIOD_TICKS = 12;


/** État d'IA neutre, attribué à tout tank non piloté par un joueur. */
export function createAiState(): TankAiState {
  return {
    solutionAngle: null,
    fireCooldownTicks: 0,
    mineCooldownTicks: 0,
    targetLastX: null,
    targetLastY: null,
    roamAngle: 0,
    roamTicks: 0,
  };
}

/**
 * Joueur vivant le plus proche, sans aucune limite de portée.
 *
 * La portée de détection du profil gouverne le **déplacement**, et
 * `firingRangeTiles` le **tir** — deux limites distinctes parce qu'elles
 * répondent à deux questions différentes : à partir de quand le tank réagit, et
 * à partir de quand il ouvre le feu.
 *
 * Une seule portée gouvernait les deux, et un brun restait muet à l'autre bout
 * de l'arène alors qu'il avait une ligne dégagée — ce qui se lisait comme une
 * panne plutôt que comme de la prudence. L'avoir supprimée a produit l'excès
 * inverse : le même brun, adversaire le plus faible du jeu, canardait d'un bord
 * à l'autre. D'où deux réglages séparés.
 */
function findNearestPlayer(world: World, tank: Tank): { tank: Tank; distance: number } | null {
  let best: Tank | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of world.tanks) {
    if (candidate.id === tank.id || !candidate.alive) continue;
    // Les tanks de l'IA ne se battent pas entre eux.
    if (candidate.playerId === null) continue;

    const distance = Math.hypot(candidate.x - tank.x, candidate.y - tank.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best ? { tank: best, distance: bestDistance } : null;
}

/**
 * Nombre d'angles essayés dans le cône d'erreur avant d'autoriser un tir.
 *
 * Impair, pour que l'angle nominal soit toujours du lot. Cinq suffisent : un
 * châssis à trois tuiles occupe déjà plus du quart du cône le plus large, si
 * bien qu'un allié ne peut pas se glisser entre deux échantillons.
 */
const SAFETY_SAMPLES = 5;

/** Vitesse du projectile de ce profil, en tuiles par seconde. */
function shellSpeed(profile: TankProfile): number {
  return profile.shellKind === 'fast'
    ? TUNING.shell.fastSpeedTilesPerSecond
    : TUNING.shell.normalSpeedTilesPerSecond;
}

/**
 * Le tir est-il sûr sur toute la largeur du cône d'erreur ?
 *
 * `findFiringSolution` écarte déjà les angles qui traversent un allié — mais
 * seulement pour l'angle **nominal**, et seulement au moment du calcul. Deux
 * trous en découlaient, et l'audit des morts les a confirmés tous les deux :
 *
 *   - l'écart de visée est tiré **au tir**, après la validation. Un angle jugé
 *     sûr au centre du cône ne l'est plus à ±5,7°, et l'obus revient de bande
 *     dans son propre tireur ;
 *   - l'angle est mis en cache et rejoué pendant douze pas. Un allié qui file à
 *     130 % de la vitesse du joueur parcourt les deux tiers d'une tuile
 *     entre-temps, largement de quoi se placer dans la trajectoire.
 *
 * D'où cette vérification, refaite **à l'instant du tir** et sur tout le cône.
 * Le tank ne corrige pas son angle : il **s'abstient**. C'est le comportement
 * juste — on ne tire pas dans le dos d'un allié — et il ne coûte rien puisqu'il
 * ne s'exécute qu'au moment où le tir est déjà décidé.
 */
function shotIsSafe(
  world: World,
  tank: Tank,
  profile: TankProfile,
  target: Tank,
  angle: number,
): boolean {
  const hitRadius = TUNING.tank.sizeTiles / 2;
  // Le tireur ne compte que passé son propre châssis : l'obus s'arme en
  // quittant le canon, il ne peut pas le tuer avant d'en être sorti.
  const ignoreBefore = TUNING.tank.sizeTiles;
  const half = profile.aimErrorRadians / 2;

  for (let sample = 0; sample < SAFETY_SAMPLES; sample++) {
    const offset = -half + (sample / (SAFETY_SAMPLES - 1)) * profile.aimErrorRadians;
    const path = traceShellPath(world.grid, tank.x, tank.y, angle + offset, profile.shellBounces);

    // Tout ce qui suit l'impact sur la cible est fiction : l'obus disparaît en
    // la touchant. Ne pas s'arrêter là rendait le brun définitivement muet — sa
    // trajectoire de rebond repasse par lui après avoir traversé le joueur, et
    // la vérification y voyait un suicide qui n'aurait jamais lieu.
    const untilTarget = pathReaches(path, target.x, target.y, hitRadius) ?? Number.POSITIVE_INFINITY;

    // Le risque pour **soi** ne s'évalue que sur l'angle nominal : se tuer avec
    // son propre ricochet est une règle assumée du jeu, et l'étendre à tout le
    // cône ferait taire les tanks au cône large. Le tank a par ailleurs
    // `findEvasion` pour s'écarter de son obus une fois celui-ci armé.
    if (offset === 0) {
      const self = pathReaches(path, tank.x, tank.y, hitRadius, ignoreBefore);
      if (self !== null && self < untilTarget) return false;
    }

    for (const other of world.tanks) {
      if (!other.alive || other.id === tank.id || other.playerId !== null) continue;

      // Marge d'anticipation : l'allié n'est pas figé. Le temps que l'obus
      // arrive, il aura pu se déplacer de sa vitesse propre — on élargit donc
      // sa boîte de ce trajet-là. Sans cette marge, l'obus part sur un couloir
      // libre et l'allié s'y engage une fraction de seconde plus tard, ce qui
      // était de loin la première cause de tir fratricide relevée à l'audit.
      const straight = Math.hypot(other.x - tank.x, other.y - tank.y);
      const drift =
        TUNING.tank.speedTilesPerSecond *
        profileOf(other.color).speedMultiplier *
        (straight / shellSpeed(profile));

      const hit = pathReaches(path, other.x, other.y, hitRadius + drift);
      if (hit !== null && hit < untilTarget) return false;
    }
  }

  return true;
}

/**
 * Raccourci minimal, en cases, pour qu'il vaille la peine de faire sauter un
 * bloc plutôt que de le contourner.
 *
 * Trop bas, les poseurs raboteraient le décor à la moindre économie de pas.
 * Trois cases correspondent à un vrai détour évité, pas à un arrondi.
 */
const BREACH_MIN_GAIN_TILES = 3;

/**
 * Un bloc cassable à portée de souffle raccourcirait-il vraiment le chemin ?
 *
 * Les mines détruisent le terrain cassable ; l'IA l'ignorait complètement et
 * faisait sagement le tour d'un mur de liège qu'elle pouvait percer. C'est
 * pourtant la seule façon de prendre en tenaille un joueur retranché derrière
 * une cloison — et sur un tracé comme la mission 9, où une colonne de liège
 * coupe l'arène dans toute sa hauteur, c'est la différence entre attaquer et
 * défiler.
 *
 * On ne mine pas n'importe quel bloc à portée : seulement celui qui ouvre un
 * vrai raccourci, ou qui rend joignable une cible qui ne l'était pas.
 */
function worthBreaching(world: World, tank: Tank, target: Tank | null): boolean {
  if (!target) return false;
  // Un passage déjà dégagé n'a rien à percer.
  if (hasClearPath(world.grid, tank.x, tank.y, target.x, target.y)) return false;

  const reach = TUNING.mine.blastRadiusTiles;
  const minX = Math.floor(tank.x - reach);
  const maxX = Math.floor(tank.x + reach);
  const minY = Math.floor(tank.y - reach);
  const maxY = Math.floor(tank.y + reach);

  for (let tileY = minY; tileY <= maxY; tileY++) {
    for (let tileX = minX; tileX <= maxX; tileX++) {
      // Le souffle est circulaire : le coin d'une boîte carrée ne compte pas.
      if (Math.hypot(tileX + 0.5 - tank.x, tileY + 0.5 - tank.y) > reach) continue;
      if (breachGain(world.grid, tank.x, tank.y, target.x, target.y, tileX, tileY) >= BREACH_MIN_GAIN_TILES) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Angle vers lequel tirer pour abattre un obus entrant, ou `null`.
 *
 * Deux obus qui se rencontrent se détruisent : c'est une parade de l'original,
 * et elle est la **seule** issue d'un tank acculé. Sans elle, un tank coincé
 * contre une paroi encaissait sans rien tenter, ce qui se lit comme une panne.
 *
 * Réservé aux tanks qui ne peuvent pas s'écarter — soit parce qu'ils sont
 * immobiles, soit parce que l'esquive n'a rien trouvé. Un tank qui a le choix
 * s'écarte : c'est plus sûr, ça ne consomme pas son quota d'obus, et ça garde
 * l'abattage pour ce qu'il est, un geste de dernier recours.
 */
function interceptionAngle(
  world: World,
  tank: Tank,
  profile: TankProfile,
  canEvade: boolean,
): number | null {
  if (canEvade) return null;
  if (profile.maxActiveShells <= 0) return null;

  const incoming = findIncomingShell(tank, world.shells, TUNING.ai.interceptHorizonSeconds);
  if (!incoming) return null;

  const spot = interceptSpot(tank, incoming, shellSpeed(profile));
  if (!spot) return null;

  // Le point de rencontre doit être atteignable en ligne droite : tirer dans le
  // mur qui nous sépare de l'obus ne sauve personne.
  const angle = Math.atan2(spot.y - tank.y, spot.x - tank.x);
  const path = traceShellPath(world.grid, tank.x, tank.y, angle, 0);
  if (pathReaches(path, spot.x, spot.y, TUNING.shell.radiusTiles * 2) === null) return null;

  return angle;
}

/** Distance en dessous de laquelle deux tanks alliés se repoussent, en tuiles. */
const SPREAD_RADIUS_TILES = 3;

/**
 * Poids de la répulsion entre alliés face à la direction voulue.
 *
 * En dessous de 1 : la consigne d'origine reste dominante, la répulsion ne fait
 * que l'infléchir. Au-delà, les tanks se fuiraient au lieu de faire leur
 * travail.
 */
const SPREAD_WEIGHT = 0.8;

/**
 * Infléchit une direction pour éviter que les alliés ne s'agglutinent.
 *
 * Tous les tanks d'une mission poursuivent la même cible par le même chemin :
 * sans rien pour les séparer, ils s'empilent, arrivent en colonne, se masquent
 * mutuellement la ligne de tir et se tirent dessus. Le turquoise en donnait le
 * cas le plus visible — il se fige dès qu'il tient un angle, si bien que le
 * suivant vient se coller à lui.
 *
 * Une simple répulsion de proximité suffit à les étaler. Elle est pondérée en
 * inverse de la distance pour n'agir qu'au contact, et reste minoritaire face à
 * la consigne d'origine : le but est d'arriver **en éventail**, pas de renoncer
 * à approcher.
 */
function spreadOut(
  world: World,
  tank: Tank,
  heading: { x: number; y: number },
): { x: number; y: number } {
  const length = Math.hypot(heading.x, heading.y);

  let pushX = 0;
  let pushY = 0;

  for (const other of world.tanks) {
    if (!other.alive || other.id === tank.id || other.playerId !== null) continue;

    const dx = tank.x - other.x;
    const dy = tank.y - other.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > SPREAD_RADIUS_TILES) continue;

    const weight = (SPREAD_RADIUS_TILES - distance) / SPREAD_RADIUS_TILES;
    pushX += (dx / distance) * weight;
    pushY += (dy / distance) * weight;
  }

  const push = Math.hypot(pushX, pushY);
  if (push === 0) return heading;

  // Consigne nulle et voisin trop proche : c'est le cas du turquoise, qui se
  // fige dès qu'il tient son angle. Il se décale au lieu de rester collé.
  if (length === 0) return { x: pushX / push, y: pushY / push };

  const x = heading.x / length + (pushX / push) * SPREAD_WEIGHT;
  const y = heading.y / length + (pushY / push) * SPREAD_WEIGHT;
  const total = Math.hypot(x, y);
  return total === 0 ? heading : { x: x / total, y: y / total };
}

/** Direction de déplacement voulue, avant prise en compte des obstacles. */
function desiredHeading(
  world: World,
  tank: Tank,
  ai: TankAiState,
  profile: TankProfile,
  target: Tank | null,
): { x: number; y: number } {
  if (profile.speedMultiplier === 0 || profile.movement === 'hold') {
    return { x: 0, y: 0 };
  }

  const roam = (): { x: number; y: number } => ({
    x: Math.cos(ai.roamAngle),
    y: Math.sin(ai.roamAngle),
  });

  if (!target) return roam();

  const toTargetX = target.x - tank.x;
  const toTargetY = target.y - tank.y;
  const distance = Math.hypot(toTargetX, toTargetY);
  if (distance === 0) return roam();

  // Direction brute vers la cible, sans tenir compte du terrain. Elle sert
  // encore de repère pour le recul et pour l'approche en biais, où ce qui
  // compte est l'orientation relative à l'adversaire, pas le chemin.
  const direct = { x: toTargetX / distance, y: toTargetY / distance };
  const away = { x: -direct.x, y: -direct.y };

  // Direction réellement praticable : ligne droite s'il y a vue dégagée, chemin
  // contourné sinon. C'est ce qui empêche un traqueur de rester collé derrière
  // un mur à pousser dans le vide pendant que le joueur se met à couvert.
  //
  // Sans chemin du tout — cible enfermée, ou mine bouchant le seul passage —
  // on reprend la patrouille : pousser dans un obstacle ne mène nulle part et
  // se lit comme une panne.
  const towards = navigationHeading(world, tank.x, tank.y, target.x, target.y);

  switch (profile.movement) {
    case 'keepAway':
      // Ne recule que si la cible est trop près ; sinon continue sa patrouille,
      // sans quoi il resterait figé à la bonne distance comme une statue.
      return distance < profile.preferredRangeTiles ? away : roam();

    case 'hunt':
      return distance > profile.preferredRangeTiles ? (towards ?? roam()) : roam();

    case 'seekLine':
      // Tant qu'aucun angle n'est ouvert, se replacer ; dès qu'il y en a un,
      // tenir la position et laisser la tourelle finir le travail. C'est le
      // comportement de celui qui compte sur un tir direct : sans ricochet
      // planifié, il n'a que la ligne de vue, et il doit aller la chercher.
      if (ai.solutionAngle !== null) {
        return distance < profile.preferredRangeTiles ? away : { x: 0, y: 0 };
      }
      return towards ?? roam();

    case 'flank': {
      // Ni de face ni à l'opposé : en biais. On vise un point décalé d'un
      // quart de tour par rapport à la ligne directe, ce qui décrit une
      // approche en spirale plutôt qu'une charge. Le côté est fixé une fois
      // pour toutes par la parité de l'identifiant : tiré à chaque pas, le
      // tank oscillerait sur place, et lâchés à plusieurs ils contourneraient
      // tous du même côté — ce qui n'est pas une tenaille.
      // Le biais n'a de sens qu'en vue dégagée. Derrière un mur, la priorité
      // est de rejoindre l'adversaire ; contourner *et* obliquer produisait des
      // trajectoires qui repartaient à l'opposé du seul passage.
      if (!towards) return roam();
      if (towards.detoured) return towards;

      const side = tank.id % 2 === 0 ? 1 : -1;
      const perpendicular = { x: -direct.y * side, y: direct.x * side };
      const closing = distance > profile.preferredRangeTiles ? 1 : -1;

      const x = direct.x * closing + perpendicular.x;
      const y = direct.y * closing + perpendicular.y;
      const length = Math.hypot(x, y);
      return length === 0 ? roam() : { x: x / length, y: y / length };
    }

    case 'erratic':
      // Alterne approche et errance selon la direction de patrouille courante,
      // ce qui donne son allure imprévisible au tank jaune.
      return Math.cos(ai.roamAngle) > 0 ? (towards ?? roam()) : roam();

    case 'patrol':
    default:
      return roam();
  }
}

/**
 * Renouvelle la direction de patrouille quand son minuteur expire, ou quand la
 * direction courante mène droit dans un mur.
 */
function updateRoaming(world: World, tank: Tank, ai: TankAiState): void {
  const half = TUNING.tank.sizeTiles / 2;
  const probe = TUNING.tank.sizeTiles;

  const blocked = boxOverlapsSolid(
    world.grid,
    tank.x + Math.cos(ai.roamAngle) * probe,
    tank.y + Math.sin(ai.roamAngle) * probe,
    half,
    blocksTank,
  );

  if (ai.roamTicks > 0 && !blocked) {
    ai.roamTicks--;
    return;
  }

  ai.roamAngle = nextRange(world.rng, 0, Math.PI * 2);
  ai.roamTicks = Math.round(
    nextRange(
      world.rng,
      secondsToTicks(TUNING.ai.roamMinSeconds),
      secondsToTicks(TUNING.ai.roamMaxSeconds),
    ),
  );
}

/** Multiple du rayon de souffle à partir duquel un tank fuit une mine. */
const MINE_FLIGHT_RADIUS_FACTOR = 2;

/**
 * Distance à laquelle **cette** mine-ci est encore dangereuse pour ce tank.
 *
 * Pas un rayon fixe, mais le rayon de souffle augmenté de ce que le tank peut
 * parcourir avant la détonation. C'est la seule formulation correcte de « je
 * peux encore me faire prendre » : un rayon constant laissait le poseur sortir
 * de la zone, reprendre sa patrouille, et revenir pile au moment où la mèche
 * arrivait au bout. La moitié des suicides relevés à l'audit venaient de là.
 *
 * Le rayon **rétrécit** à mesure que la mèche brûle, et vaut le simple souffle
 * à la détonation : la fuite se relâche d'elle-même, sans mémoire ni minuteur
 * supplémentaire dans l'état.
 */
function mineDangerRadius(mine: Mine, profile: TankProfile): number {
  const remainingSeconds = mine.fuseTicks / TICK_RATE;
  const speed = TUNING.tank.speedTilesPerSecond * profile.speedMultiplier;
  // Le souffle tue à son rayon **plus la demi-boîte du châssis** ; l'oublier
  // relâchait la fuite une fraction de tuile trop tôt, et le tank revenait
  // mourir dessus. On prend la boîte entière, pour que la limite ne soit pas
  // exactement mortelle.
  return TUNING.mine.blastRadiusTiles + TUNING.tank.sizeTiles + speed * remainingSeconds;
}

/** Multiple du rayon de fuite imposé entre deux mines posées par l'IA. */
const MINE_SPACING_FACTOR = 1.5;

/**
 * Distance à laquelle un tank commence à fuir une mine, en tuiles.
 *
 * Le double du rayon de souffle, franchement au-delà de ce qui tue (≈ 2,4
 * tuiles, boîte du tank comprise). S'en tenir au rayon exact ferait osciller le
 * tank sur la limite, et la limite est mortelle.
 *
 * Fonction et non constante : le panneau de calibration édite `TUNING` en
 * direct, et une valeur figée à l'import ne suivrait pas le curseur.
 */
function mineFlightRadius(): number {
  return TUNING.mine.blastRadiusTiles * MINE_FLIGHT_RADIUS_FACTOR;
}

/**
 * Écart minimal entre deux mines posées par l'IA, en tuiles.
 *
 * Deux mines trop rapprochées ferment un couloir dont le poseur ne sort plus :
 * il fuit la première et entre dans le souffle de la seconde. C'est comme ça
 * que mourait le jaune, une fois la fuite implémentée.
 */
function mineSpacing(): number {
  return mineFlightRadius() * MINE_SPACING_FACTOR;
}

/**
 * Direction de fuite si une mine est trop proche, `null` sinon.
 *
 * Symétrique de `findEvasion`, qui ne connaît que les obus. Sans ça, un poseur
 * de mines finit par se tuer tout seul : il sème, continue de rôder dans le
 * même coin, et la mèche le rattrape — c'est exactement ce qui arrivait au
 * jaune, mort en quinze secondes à deux tuiles et demie de sa propre mine.
 *
 * Les mines des autres comptent autant que les siennes : une mine tue tout ce
 * qu'elle atteint, sans regarder qui l'a posée.
 *
 * Le rayon de fuite dépasse franchement celui du souffle. S'en tenir au rayon
 * exact ferait osciller le tank sur la limite, et la limite est mortelle.
 */
function findMineEscape(world: World, tank: Tank, profile: TankProfile): { x: number; y: number } | null {
  if (world.mines.length === 0) return null;

  let x = 0;
  let y = 0;

  for (const mine of world.mines) {
    const dx = tank.x - mine.x;
    const dy = tank.y - mine.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > mineDangerRadius(mine, profile)) continue;

    // Poids en inverse de la distance, et non linéaire : pris entre deux mines,
    // un tank qui les pondérait à parts presque égales partait en biais et
    // rentrait dans la seconde. La plus proche doit écraser les autres.
    const weight = 1 / distance;
    x += (dx / distance) * weight;
    y += (dy / distance) * weight;
  }

  const length = Math.hypot(x, y);
  if (length === 0) return null;

  // La direction radiale est la bonne en terrain libre, et un piège dans une
  // arène encombrée : le système de mouvement fait glisser le tank le long du
  // mur, souvent sans jamais le sortir du souffle. On balaie donc de part et
  // d'autre jusqu'à trouver un dégagement réel — la première direction libre
  // est aussi la moins détournée, donc celle qui éloigne le plus vite.
  const radial = Math.atan2(y / length, x / length);
  const clearance = TUNING.mine.blastRadiusTiles + TUNING.tank.sizeTiles;

  for (const offset of ESCAPE_FAN_RADIANS) {
    const angle = radial + offset;
    const free = !boxOverlapsSolid(
      world.grid,
      tank.x + Math.cos(angle) * clearance,
      tank.y + Math.sin(angle) * clearance,
      TUNING.tank.sizeTiles / 2,
      blocksTank,
    );
    if (free) return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  // Aucune issue dégagée : on part quand même droit à l'opposé, faute de mieux.
  return { x: x / length, y: y / length };
}

/**
 * Écarts essayés autour de la direction de fuite, du plus direct au plus
 * détourné. Symétriques, et s'arrêtant au quart de tour : au-delà, on ne
 * s'éloigne plus de la mine.
 */
const ESCAPE_FAN_RADIANS = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2];

/**
 * Le tank peut-il poser une mine sans se faire sauter avec ?
 *
 * Une mine tue son poseur comme n'importe qui, et la première version de cette
 * logique se contentait de vérifier que le tank « roulait ». Ça ne suffit pas :
 * un jaune, dont le déplacement alterne charge et errance, colle sa cible,
 * pose, puis continue de tourner autour d'elle — donc autour de sa mine. Trois
 * secondes plus tard, il meurt.
 *
 * Trois conditions, donc, toutes nécessaires :
 *
 *   1. une direction de fuite — un tank arrêté s'assoit sur sa mine ;
 *   2. cette direction ne bute pas dans un mur au-delà du souffle : une
 *      intention de déplacement n'est pas un déplacement, et un tank plaqué
 *      contre un obstacle a beau « avancer », il ne bouge pas ;
 *   3. la cible n'est pas dans le souffle. Poser sur les pieds de l'adversaire
 *      est une attaque-suicide, pas un piège ;
 *   4. aucune mine déjà posée à côté — voir `mineSpacing`.
 *
 * Le seuil du point 3 valait le rayon de fuite, quatre tuiles. C'était trop
 * large : les chasseurs — violet, blanc, noir — traquent à trois ou quatre
 * tuiles, donc la condition n'était jamais remplie et ils ne posaient jamais
 * leurs mines. Le rayon de souffle suffit à écarter le corps-à-corps, et c'est
 * la fuite (`findMineEscape`) qui les garde en vie une fois la mine posée.
 */
function canLeaveMineBehind(
  world: World,
  tank: Tank,
  profile: TankProfile,
  heading: { x: number; y: number },
  target: Tank | null,
  targetDistance: number,
  breaching: boolean,
): boolean {
  const length = Math.hypot(heading.x, heading.y);
  if (length === 0) return false;

  if (targetDistance <= TUNING.mine.blastRadiusTiles) return false;

  // Le tank doit **s'éloigner** de sa cible. C'est la condition qui manquait, et
  // celle qui explique l'essentiel des suicides : une mine est un piège qu'on
  // laisse derrière soi, pas une bombe qu'on lâche sous ses chenilles en
  // chargeant. Un traqueur qui posait en approche restait dans le souffle par
  // construction — il continuait d'avancer vers l'adversaire, donc de tourner
  // autour du point qu'il venait de miner, et aucune logique de fuite ne
  // rattrapait ça.
  //
  // Une exception, et une seule : percer un mur. Le bloc à faire sauter est
  // forcément devant, du côté de l'adversaire — exiger de s'en éloigner
  // reviendrait à interdire la brèche.
  if (target && !breaching) {
    const toTargetX = target.x - tank.x;
    const toTargetY = target.y - tank.y;
    const span = Math.hypot(toTargetX, toTargetY);
    if (span > 0) {
      const closing = (heading.x / length) * (toTargetX / span) + (heading.y / length) * (toTargetY / span);
      if (closing > 0) return false;
    }
  }

  for (const mine of world.mines) {
    if (Math.hypot(mine.x - tank.x, mine.y - tank.y) < mineSpacing()) return false;
  }

  // Pas non plus sous le nez d'un allié : trois jaunes lâchés dans la même
  // arène s'entretuaient en une minute, et la mission se terminait toute seule.
  for (const other of world.tanks) {
    if (other.id === tank.id || !other.alive || other.playerId !== null) continue;
    if (Math.hypot(other.x - tank.x, other.y - tank.y) < mineFlightRadius()) return false;
  }

  const lethal = TUNING.mine.blastRadiusTiles + TUNING.tank.sizeTiles;

  // Le couloir de fuite doit être franchissable sur toute sa longueur, pas
  // seulement libre à son extrémité : un point d'arrivée dégagé derrière un
  // bloc ne mène nulle part. Sans objet pour une brèche, où le tank vient
  // justement se coller au mur qu'il veut ouvrir : seule compte alors la
  // question de savoir s'il peut se mettre à l'abri, testée juste après.
  if (!breaching && !hasClearPath(
    world.grid,
    tank.x,
    tank.y,
    tank.x + (heading.x / length) * lethal,
    tank.y + (heading.y / length) * lethal,
  )) {
    return false;
  }

  const budget =
    TUNING.tank.speedTilesPerSecond * profile.speedMultiplier * TUNING.mine.fuseSeconds;

  return canReachSafety(world.grid, tank.x, tank.y, lethal, budget);
}

/**
 * Point que le tank cherche à atteindre : la cible, ou là où elle sera.
 *
 * ─── Pourquoi une estimation, et pas une vitesse lue ────────────────────────
 *
 * Les tanks n'ont pas de vecteur vitesse dans leur état : le système de
 * mouvement les déplace directement, contrainte par contrainte. Le tireur
 * mémorise donc où il a vu sa cible au calcul précédent, et en déduit un
 * déplacement par pas. L'intervalle est connu et fixe — `AIM_PERIOD_TICKS` —
 * ce qui rend l'estimation exacte à un pas près.
 *
 * ─── Ce que l'avance vaut ───────────────────────────────────────────────────
 *
 * Le temps de vol vaut la distance divisée par la vitesse de l'obus. On avance
 * la cible de sa vitesse estimée multipliée par ce temps. C'est faux dès que la
 * cible tourne, et c'est voulu : un tir parfait serait injouable, et le cône
 * d'erreur du profil s'applique par-dessus.
 *
 * L'avance est **abandonnée pour les tirs à ricochets** : la trajectoire n'y
 * est plus une droite, et le temps de vol calculé sur la distance à vol
 * d'oiseau n'a plus de sens. Le seul profil qui anticipe (le noir) tire sans
 * rebond, donc le cas ne se présente pas — la garde est là pour que ça reste
 * vrai si quelqu'un active `leadsTarget` ailleurs.
 *
 * Exportée pour être testable directement : mesurer l'anticipation à travers
 * `findFiringSolution` reviendrait à la lire au travers d'une recherche
 * échantillonnée tous les 2°, dont le bruit dépasse l'effet qu'on veut voir.
 */
export function aimSpot(
  tank: Tank,
  ai: TankAiState,
  target: Tank,
  profile: TankProfile,
): { x: number; y: number } {
  if (!profile.leadsTarget || profile.plannedBounces > 0) return { x: target.x, y: target.y };
  if (ai.targetLastX === null || ai.targetLastY === null) return { x: target.x, y: target.y };

  // Vitesse estimée de la cible, en tuiles par pas.
  const stepX = (target.x - ai.targetLastX) / AIM_PERIOD_TICKS;
  const stepY = (target.y - ai.targetLastY) / AIM_PERIOD_TICKS;

  // Vitesse de l'obus, relue sur la table plutôt qu'importée de `shells.ts` :
  // ce module y est déjà importé pour `aimErrorFor`, et l'importer en retour
  // fermerait le cycle.
  const shellSpeed =
    profile.shellKind === 'fast'
      ? TUNING.shell.fastSpeedTilesPerSecond
      : TUNING.shell.normalSpeedTilesPerSecond;

  const distance = Math.hypot(target.x - tank.x, target.y - tank.y);
  const flightTicks = (distance / shellSpeed) / DT;

  return { x: target.x + stepX * flightTicks, y: target.y + stepY * flightTicks };
}

/** Construit l'intention d'un tank de l'IA pour ce pas. */
export function decideAiInput(world: World, tank: Tank): InputCommand {
  const profile = profileOf(tank.color);
  const ai = tank.ai ?? createAiState();
  tank.ai = ai;

  if (ai.fireCooldownTicks > 0) ai.fireCooldownTicks--;
  if (ai.mineCooldownTicks > 0) ai.mineCooldownTicks--;

  const nearest = findNearestPlayer(world, tank);

  // Deux cibles pour deux usages, et deux portées distinctes : le déplacement
  // réagit à `detectionRangeTiles`, le tir à `firingRangeTiles`. C'est ce qui
  // laisse un brun rester une cible d'entraînement là où un vert tire de loin.
  const target =
    nearest && nearest.distance <= profile.firingRangeTiles ? nearest.tank : null;
  const moveTarget =
    nearest && nearest.distance <= profile.detectionRangeTiles ? nearest.tank : null;

  // ── Visée ──
  // Recalcul périodique et décalé par identifiant, pour lisser le coût.
  if (target && (world.tick + tank.id) % AIM_PERIOD_TICKS === 0) {
    const spot = aimSpot(tank, ai, target, profile);

    ai.solutionAngle = findFiringSolution(world.grid, tank.x, tank.y, spot.x, spot.y, {
      bounces: profile.plannedBounces,
      avoid: world.tanks
        .filter((other) => other.alive && (other.id === tank.id || other.playerId === null))
        .map((other) => ({ x: other.x, y: other.y })),
      hitRadius: TUNING.tank.sizeTiles / 2,
    });

    // Mémorisé après coup : c'est le déplacement **depuis** ce relevé qui
    // servira d'estimation de vitesse au prochain calcul.
    ai.targetLastX = target.x;
    ai.targetLastY = target.y;
  } else if (!target) {
    ai.solutionAngle = null;
    // Cible perdue : la mémoire de position aussi, sinon la prochaine
    // estimation de vitesse porterait sur un intervalle inconnu et donnerait
    // une avance absurde.
    ai.targetLastX = null;
    ai.targetLastY = null;
  }

  // ── Interception ──
  // Décidée avant la visée normale : abattre l'obus qui arrive prime sur
  // continuer à viser l'adversaire, puisqu'on ne survivra pas au second si on
  // ignore le premier. La question « puis-je m'écarter ? » est tranchée plus
  // bas mais nous est nécessaire ici ; on la pose donc en avance.
  const mobile = profile.speedMultiplier > 0 && profile.movement !== 'hold';
  const escape =
    mobile
      ? findEvasion(
          tank,
          world.shells,
          TUNING.ai.evasionHorizonSeconds * profile.evasionSkill,
          // Son propre ricochet se fuit toujours : pleine anticipation quelle
          // que soit la couleur.
          TUNING.ai.evasionHorizonSeconds,
        )
      : null;
  const intercept = interceptionAngle(world, tank, profile, escape !== null);

  // Faute de solution, la tourelle reste pointée vers la cible : le joueur voit
  // ainsi qu'il est repéré, et le tank est prêt dès qu'un angle s'ouvre.
  const aim =
    intercept ??
    ai.solutionAngle ??
    (target ? Math.atan2(target.y - tank.y, target.x - tank.x) : tank.turretAngle);

  // ── Tir ──
  // On ne tire qu'une fois la tourelle effectivement alignée : sinon l'obus
  // partirait dans la direction où le canon se trouve, pas où il vise.
  const aligned =
    Math.abs(normalizeAngle(aim - tank.turretAngle)) <= TUNING.ai.aimToleranceRadians;
  // Un profil sans obus autorisé n'essaie même pas : `fireShell` refuserait de
  // toute façon, mais le dire ici évite qu'un jaune consomme un rechargement
  // pour un tir qui n'a jamais lieu.
  const fire =
    profile.maxActiveShells > 0 &&
    aligned &&
    ai.fireCooldownTicks === 0 &&
    (intercept !== null ||
      (ai.solutionAngle !== null &&
        target !== null &&
        shotIsSafe(world, tank, profile, target, aim)));

  if (fire) {
    const jitter = profile.fireIntervalJitterSeconds * nextFloat(world.rng);
    ai.fireCooldownTicks = secondsToTicks(profile.fireIntervalSeconds + jitter);
  }

  // ── Déplacement ──
  updateRoaming(world, tank, ai);

  // L'esquive prime sur tout le reste : rester en vie d'abord. Elle ne
  // s'applique qu'aux tanks réellement mobiles — un brun ou un vert sont des
  // tourelles fixes, et leur faire « tenter » une esquive n'aurait aucun effet
  // tout en brouillant leur comportement.
  //
  // Une mine passe avant un obus : on esquive un obus, on ne survit pas à un
  // souffle de deux tuiles. La fuite devant les mines, elle, reste ouverte à
  // tous les mobiles quel que soit leur `evasionSkill` : c'est de la
  // conservation, pas du talent — sans elle le jaune se tue dans son propre
  // champ, ce qui ne ressemble à rien.
  const flight = mobile ? findMineEscape(world, tank, profile) : null;
  const evasion = flight ?? escape;
  const wanted = desiredHeading(world, tank, ai, profile, moveTarget);
  const heading = evasion ?? (mobile ? spreadOut(world, tank, wanted) : wanted);

  // ── Mines ──
  // Le quota et le rechargement restent ceux de `layMine`, qui a le dernier
  // mot ; ce qu'on décide ici est seulement l'intention.
  const laying =
    profile.mineIntervalSeconds > 0 &&
    ai.mineCooldownTicks === 0 &&
    tank.activeMines < profile.maxActiveMines &&
    canLeaveMineBehind(
      world,
      tank,
      profile,
      heading,
      nearest?.tank ?? null,
      nearest?.distance ?? Infinity,
      worthBreaching(world, tank, moveTarget),
    );

  if (laying) {
    ai.mineCooldownTicks = secondsToTicks(profile.mineIntervalSeconds);
  }

  return {
    moveX: heading.x,
    moveY: heading.y,
    // Le cône d'erreur du profil s'applique au tir, jamais à l'orientation
    // affichée : la tourelle doit rester lisible pour le joueur.
    aim,
    fire,
    mine: laying,
  };
}

/**
 * Écart de visée appliqué au moment du tir.
 *
 * Séparé de l'intention pour que l'erreur soit tirée une fois par obus, et non
 * à chaque pas — sinon la tourelle tremblerait à l'écran.
 */
export function aimErrorFor(world: World, tank: Tank): number {
  const spread = profileOf(tank.color).aimErrorRadians;
  return spread === 0 ? 0 : nextRange(world.rng, -spread / 2, spread / 2);
}
