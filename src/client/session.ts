/**
 * Ce que le point d'entrée sait faire d'une partie, quelle qu'elle soit.
 *
 * Trois implémentations, présentes ou à venir :
 *
 *   - `LocalCampaign` — la campagne solo, vingt missions enchaînées ;
 *   - `createSandboxSession` — le terrain d'essai, une arène unique ;
 *   - la session réseau de #13, qui prédira le tank local et interpolera les
 *     autres.
 *
 * L'intérêt de cette interface n'est pas d'abstraire pour abstraire : c'est que
 * `main.ts` ne contienne **aucune** branche entre le solo et l'en-ligne. Le
 * point d'entrée assemble entrées → simulation → rendu, et rien d'autre.
 */

import type { InputCommand, Tank, World } from '@core/state';
import type { CampaignView } from './local/LocalCampaign';
import type { RenderSnapshot } from './render/snapshots';

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
