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
import { DT, secondsToTicks } from '../../tick.js';
import { TUNING } from '../../tuning.js';
import { findFiringSolution } from './aiming.js';
import { profileOf } from './profiles.js';
import { findEvasion } from './threat.js';
import type { InputCommand, Tank, TankAiState, World } from '../../state.js';
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

  const towards = { x: toTargetX / distance, y: toTargetY / distance };
  const away = { x: -towards.x, y: -towards.y };

  switch (profile.movement) {
    case 'keepAway':
      // Ne recule que si la cible est trop près ; sinon continue sa patrouille,
      // sans quoi il resterait figé à la bonne distance comme une statue.
      return distance < profile.preferredRangeTiles ? away : roam();

    case 'hunt':
      return distance > profile.preferredRangeTiles ? towards : roam();

    case 'seekLine':
      // Tant qu'aucun angle n'est ouvert, se replacer ; dès qu'il y en a un,
      // tenir la position et laisser la tourelle finir le travail. C'est le
      // comportement de celui qui compte sur un tir direct : sans ricochet
      // planifié, il n'a que la ligne de vue, et il doit aller la chercher.
      if (ai.solutionAngle !== null) {
        return distance < profile.preferredRangeTiles ? away : { x: 0, y: 0 };
      }
      return towards;

    case 'flank': {
      // Ni de face ni à l'opposé : en biais. On vise un point décalé d'un
      // quart de tour par rapport à la ligne directe, ce qui décrit une
      // approche en spirale plutôt qu'une charge. Le côté est fixé une fois
      // pour toutes par la parité de l'identifiant : tiré à chaque pas, le
      // tank oscillerait sur place, et lâchés à plusieurs ils contourneraient
      // tous du même côté — ce qui n'est pas une tenaille.
      const side = tank.id % 2 === 0 ? 1 : -1;
      const perpendicular = { x: -towards.y * side, y: towards.x * side };
      const closing = distance > profile.preferredRangeTiles ? 1 : -1;

      const x = towards.x * closing + perpendicular.x;
      const y = towards.y * closing + perpendicular.y;
      const length = Math.hypot(x, y);
      return length === 0 ? roam() : { x: x / length, y: y / length };
    }

    case 'erratic':
      // Alterne approche et errance selon la direction de patrouille courante,
      // ce qui donne son allure imprévisible au tank jaune.
      return Math.cos(ai.roamAngle) > 0 ? towards : roam();

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
function findMineEscape(world: World, tank: Tank): { x: number; y: number } | null {
  if (world.mines.length === 0) return null;

  let x = 0;
  let y = 0;

  for (const mine of world.mines) {
    const dx = tank.x - mine.x;
    const dy = tank.y - mine.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0 || distance > mineFlightRadius()) continue;

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
  heading: { x: number; y: number },
  targetDistance: number,
): boolean {
  const length = Math.hypot(heading.x, heading.y);
  if (length === 0) return false;

  if (targetDistance <= TUNING.mine.blastRadiusTiles) return false;

  for (const mine of world.mines) {
    if (Math.hypot(mine.x - tank.x, mine.y - tank.y) < mineSpacing()) return false;
  }

  // Pas non plus sous le nez d'un allié : trois jaunes lâchés dans la même
  // arène s'entretuaient en une minute, et la mission se terminait toute seule.
  for (const other of world.tanks) {
    if (other.id === tank.id || !other.alive || other.playerId !== null) continue;
    if (Math.hypot(other.x - tank.x, other.y - tank.y) < mineFlightRadius()) return false;
  }

  const escape = TUNING.mine.blastRadiusTiles + TUNING.tank.sizeTiles;
  return !boxOverlapsSolid(
    world.grid,
    tank.x + (heading.x / length) * escape,
    tank.y + (heading.y / length) * escape,
    TUNING.tank.sizeTiles / 2,
    blocksTank,
  );
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

  // Faute de solution, la tourelle reste pointée vers la cible : le joueur voit
  // ainsi qu'il est repéré, et le tank est prêt dès qu'un angle s'ouvre.
  const aim =
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
    ai.solutionAngle !== null &&
    aligned &&
    ai.fireCooldownTicks === 0;

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
  // souffle de deux tuiles.
  const mobile = profile.speedMultiplier > 0 && profile.movement !== 'hold';
  const flight = mobile ? findMineEscape(world, tank) : null;
  const evasion = flight ?? (mobile ? findEvasion(tank, world.shells) : null);
  const heading = evasion ?? desiredHeading(world, tank, ai, profile, moveTarget);

  // ── Mines ──
  // Le quota et le rechargement restent ceux de `layMine`, qui a le dernier
  // mot ; ce qu'on décide ici est seulement l'intention.
  const laying =
    profile.mineIntervalSeconds > 0 &&
    ai.mineCooldownTicks === 0 &&
    tank.activeMines < profile.maxActiveMines &&
    canLeaveMineBehind(world, tank, heading, nearest?.distance ?? Infinity);

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
