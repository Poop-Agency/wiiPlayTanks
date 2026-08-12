/**
 * Ce que le point d'entrée sait faire d'une partie, quelle qu'elle soit.
 *
 * Trois implémentations :
 *
 *   - `LocalCampaign` — la campagne solo, vingt missions enchaînées ;
 *   - `createSandboxSession` — le terrain d'essai, une arène unique ;
 *   - `NetworkSession` — le co-op, qui prédit le tank local et interpole les
 *     autres.
 *
 * L'intérêt de cette interface n'est pas d'abstraire pour abstraire : c'est que
 * `main.ts` ne contienne **aucune** branche entre le solo et l'en-ligne. Le
 * point d'entrée assemble entrées → simulation → rendu, et rien d'autre.
 */

import type { InputCommand, Tank, World } from '@core/state';
import { enemiesRemaining, missionOutcome } from '@core/systems/mission';
import type { MissionOutcome } from '@core/systems/mission';
import { TUNING } from '@core/tuning';
import { CAMPAIGN_LENGTH } from '@shared/campaign';
import type { CampaignState, CampaignStatus } from '@shared/campaign';
import { missionByNumber } from '@shared/missions/missions';
import type { RenderSnapshot } from './render/snapshots';

/**
 * Tout ce que le HUD a besoin de savoir.
 *
 * Défini ici parce que c'est la valeur de retour de `Session.status()` : c'est
 * le contrat, pas un détail de l'une des implémentations.
 */
export interface CampaignView {
  mission: number;
  missionName: string;
  totalMissions: number;
  /** Tanks en réserve. */
  spares: number;
  /** Tentative en cours sur cette mission, à partir de 1. */
  attempt: number;
  status: CampaignStatus;
  /** Issue de la mission en cours. */
  outcome: MissionOutcome;
  enemiesLeft: number;

  activeShells: number;
  maxShells: number;
  activeMines: number;
  maxMines: number;
  playerAlive: boolean;

  /** Coéquipiers connectés, en co-op. Vide en solo. */
  teammates: string[];
}

/**
 * Compose la vue affichable.
 *
 * Partagé par la campagne solo et le co-op : l'état de campagne et le monde
 * viennent de deux sources différentes — l'une locale, l'autre du serveur — mais
 * ce qu'on en tire pour le HUD est identique, et le rester est justement ce
 * qu'on veut garantir.
 */
export function buildCampaignView(
  state: CampaignState,
  world: World,
  tank: Tank | undefined,
  teammates: string[] = [],
): CampaignView {
  const mission = missionByNumber(state.mission);

  return {
    mission: state.mission,
    missionName: mission?.name ?? '—',
    totalMissions: CAMPAIGN_LENGTH,
    spares: state.spares,
    attempt: state.attempt,
    status: state.status,
    // Pendant le temps mort la mission est jugée, mais pas encore résolue :
    // c'est ce qui permet au HUD d'afficher le bandeau au bon moment.
    outcome: missionOutcome(world),
    enemiesLeft: enemiesRemaining(world),

    activeShells: tank?.activeShells ?? 0,
    maxShells: TUNING.tank.maxActiveShells,
    activeMines: tank?.activeMines ?? 0,
    maxMines: TUNING.tank.maxActiveMines,
    playerAlive: tank?.alive ?? false,

    teammates,
  };
}

export interface Session {
  /** Monde en cours. Change d'identité à chaque nouvelle mission. */
  readonly world: World;
  /** Tank piloté, ou `undefined` s'il n'y en a pas (encore). */
  readonly playerTank: Tank | undefined;

  /** Avance d'un pas de simulation. */
  update(input: InputCommand): void;

  /** État à dessiner, interpolé entre les deux derniers pas. */
  view(alpha: number): RenderSnapshot;

  /**
   * État de campagne à afficher, ou `null` quand la notion n'a pas de sens —
   * le terrain d'essai n'a ni mission, ni réserve, ni progression.
   */
  status(): CampaignView | null;

  /** Repart de zéro. Sans effet là où ça n'a pas de sens. */
  restart(): void;
}
