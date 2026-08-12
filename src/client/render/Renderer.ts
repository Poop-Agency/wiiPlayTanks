/**
 * Contrat de rendu.
 *
 * Le reste du client ne connaît que cette interface. C'est ce qui permettra de
 * brancher un renderer 3D (#14 et au-delà) sans toucher une ligne de gameplay :
 * la simulation est en 2D sur un plan, seule la façon de la regarder change.
 *
 * Un renderer ne lit jamais le `World` directement — il reçoit un
 * {@link RenderSnapshot} déjà interpolé. La séparation est stricte : le rendu ne
 * peut pas, même par accident, modifier l'état simulé.
 */

import type { Grid, World } from '@core/state';
import type { DebugOptions } from '../ui/tuning-panel';
import type { EffectsView } from './effects';
import type { RenderSnapshot } from './snapshots';

export interface Renderer {
  /**
   * Adapte la surface de rendu aux dimensions du terrain.
   * À appeler au chargement d'une mission.
   */
  resize(grid: Grid): void;

  /**
   * Signale que le terrain a changé et que son cache doit être reconstruit.
   * Appelé quand une mine détruit un bloc (#9).
   */
  invalidateTerrain(): void;

  /**
   * Dessine une frame.
   *
   * `effects` est purement décoratif — traces, débris, étincelles — et n'a
   * aucune incidence sur la simulation. Il est passé à part de l'instantané
   * parce qu'il ne se déduit pas du monde : il vit côté client, et lui seul.
   */
  draw(grid: Grid, view: RenderSnapshot, effects?: EffectsView): void;

  /**
   * Superpose les calques de débogage demandés par le panneau de calibration.
   *
   * Seule méthode à recevoir le `World` plutôt qu'un instantané, et c'est
   * assumé : ces calques servent à vérifier ce que la simulation fait
   * réellement. Une boîte de collision interpolée, décalée d'une fraction de
   * pas par rapport à celle qui décide des impacts, ne prouverait rien.
   *
   * Elle ne lit jamais que l'état — la règle « le rendu ne modifie rien » tient.
   */
  drawDebug(world: World, options: Readonly<DebugOptions>): void;

  /**
   * Convertit des coordonnées de pointeur (repère de la fenêtre) en coordonnées
   * monde, en tuiles. C'est le renderer qui détient la transformation, donc
   * c'est à lui de l'inverser.
   */
  pointerToWorld(clientX: number, clientY: number): { x: number; y: number };
}
