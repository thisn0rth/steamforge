/**
 * A "rig" is a saved production state: a target OBS scene plus the exact set of
 * overlays/sources that should be visible, and the transition used to get
 * there. Switching to a rig applies all of it in one click instead of toggling
 * scenes and overlays individually.
 */

export interface RigSourceState {
  /** OBS source name to toggle within the target scene. */
  sourceName: string;
  enabled: boolean;
}

export interface RigOverlayState {
  /** StreamForge overlay id to show as a browser source. */
  overlayId: string;
  /** OBS source name the overlay is wired to (browser source). */
  sourceName: string;
  enabled: boolean;
}

export interface Rig {
  id: string;
  name: string;
  description?: string;
  /** Hex color for the rig button in the control surface. */
  color: string;
  /** Target OBS program scene to switch to. */
  targetScene: string;
  /** Transition id to apply when switching to this rig. */
  transitionId: string | null;
  /** Raw OBS source visibility states to enforce. */
  sources: RigSourceState[];
  /** StreamForge overlay states to enforce. */
  overlays: RigOverlayState[];
  /** Display order in the control surface grid. */
  order: number;
  createdAt: number;
  updatedAt: number;
}
