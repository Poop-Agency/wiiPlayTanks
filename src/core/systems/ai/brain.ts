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
import { secondsToTicks } from '../../tick.js';
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

/** Écart de visée toléré avant de tirer, en radians. */
const AIM_TOLERANCE_RADIANS = 0.08;

/** État d'IA neutre, attribué à tout tank non piloté par un joueur. */
export function createAiState(): TankAiState {
  return { solutionAngle: null, fireCooldownTicks: 0, roamAngle: 0, roamTicks: 0 };
}

/** Le tank que l'IA cherche à atteindre : le joueur vivant le plus proche. */
function findTarget(world: World, tank: Tank, profile: TankProfile): Tank | null {
  let best: Tank | null = null;
  let bestDistance = profile.detectionRangeTiles;

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

  return best;
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
  ai.roamTicks = Math.round(nextRange(world.rng, 30, 120));
}

/** Construit l'intention d'un tank de l'IA pour ce pas. */
export function decideAiInput(world: World, tank: Tank): InputCommand {
  const profile = profileOf(tank.color);
  const ai = tank.ai ?? createAiState();
  tank.ai = ai;

  if (ai.fireCooldownTicks > 0) ai.fireCooldownTicks--;

  const target = findTarget(world, tank, profile);

  // ── Visée ──
  // Recalcul périodique et décalé par identifiant, pour lisser le coût.
  if (target && (world.tick + tank.id) % AIM_PERIOD_TICKS === 0) {
    ai.solutionAngle = findFiringSolution(world.grid, tank.x, tank.y, target.x, target.y, {
      bounces: profile.plannedBounces,
      avoid: world.tanks
        .filter((other) => other.alive && (other.id === tank.id || other.playerId === null))
        .map((other) => ({ x: other.x, y: other.y })),
      hitRadius: TUNING.tank.sizeTiles / 2,
    });
  } else if (!target) {
    ai.solutionAngle = null;
  }

  // Faute de solution, la tourelle reste pointée vers la cible : le joueur voit
  // ainsi qu'il est repéré, et le tank est prêt dès qu'un angle s'ouvre.
  const aim =
    ai.solutionAngle ??
    (target ? Math.atan2(target.y - tank.y, target.x - tank.x) : tank.turretAngle);

  // ── Tir ──
  // On ne tire qu'une fois la tourelle effectivement alignée : sinon l'obus
  // partirait dans la direction où le canon se trouve, pas où il vise.
  const aligned = Math.abs(normalizeAngle(aim - tank.turretAngle)) <= AIM_TOLERANCE_RADIANS;
  const fire = ai.solutionAngle !== null && aligned && ai.fireCooldownTicks === 0;

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
  const mobile = profile.speedMultiplier > 0 && profile.movement !== 'hold';
  const evasion = mobile ? findEvasion(tank, world.shells) : null;
  const heading = evasion ?? desiredHeading(world, tank, ai, profile, target);

  return {
    moveX: heading.x,
    moveY: heading.y,
    // Le cône d'erreur du profil s'applique au tir, jamais à l'orientation
    // affichée : la tourelle doit rester lisible pour le joueur.
    aim,
    fire,
    mine: false,
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
