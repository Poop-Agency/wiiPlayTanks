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

import type { Grid } from '@core/state';
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

  /** Dessine une frame. */
  draw(grid: Grid, view: RenderSnapshot): void;

  /**
   * Convertit des coordonnées de pointeur (repère de la fenêtre) en coordonnées
   * monde, en tuiles. C'est le renderer qui détient la transformation, donc
   * c'est à lui de l'inverser.
   */
  pointerToWorld(clientX: number, clientY: number): { x: number; y: number };
}
