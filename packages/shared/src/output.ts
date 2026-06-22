/**
 * Live output state. Instead of one OBS browser source per overlay, the app
 * exposes a single `/live` and `/preview` render endpoint each. The server
 * tracks which overlays are currently on each channel (as a back-to-front
 * stack) and pushes changes to the render pages, so OBS sources never change.
 */
export interface OutputState {
  /** Overlay ids shown on the live/program output, back-to-front. */
  program: string[];
  /** Overlay ids staged on the preview output, back-to-front. */
  preview: string[];
}

export type OutputChannel = 'program' | 'preview';

export const EMPTY_OUTPUT_STATE: OutputState = { program: [], preview: [] };
