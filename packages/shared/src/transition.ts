/**
 * Transition definitions. These map to OBS scene transitions and/or in-overlay
 * intro/outro animations.
 */

export type TransitionKind = 'cut' | 'fade' | 'slide' | 'stinger' | 'swipe' | 'custom';

export interface Transition {
  id: string;
  name: string;
  kind: TransitionKind;
  /** Duration in milliseconds. */
  duration: number;
  /** For `stinger`: media file or overlay id used as the wipe. */
  stingerSource?: string;
  /** For `slide`/`swipe`: direction of motion. */
  direction?: 'left' | 'right' | 'up' | 'down';
  createdAt: number;
  updatedAt: number;
}
