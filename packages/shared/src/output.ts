import type { OverlayAssignments } from './overlay.js';

/**
 * Live output state. Instead of one OBS browser source per overlay, the app
 * exposes a single `/live` and `/preview` render endpoint each. The server
 * tracks which overlays are on each channel (as a back-to-front stack) and
 * pushes changes to the render pages, so OBS sources never change.
 *
 * Each entry carries the focus assignments chosen at push time — focus is a
 * per-push decision, not stored on the overlay design.
 */
export interface OutputItem {
  overlayId: string;
  /** Slot focus assignments selected when this overlay was pushed. */
  assignments: OverlayAssignments;
}

export interface OutputState {
  /** Overlays shown on the live/program output, back-to-front. */
  program: OutputItem[];
  /** Overlays staged on the preview output, back-to-front. */
  preview: OutputItem[];
}

export type OutputChannel = 'program' | 'preview';

export const EMPTY_OUTPUT_STATE: OutputState = { program: [], preview: [] };
