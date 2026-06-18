/**
 * Instant-replay types. The server drives OBS's replay buffer, persists saved
 * clips under the data directory, and can load the latest clip into a
 * designated "replay player" media source for replay scenes.
 */

export interface Replay {
  id: string;
  /** Display label, e.g. "Replay 14:32:05". */
  name: string;
  /** Public URL the clip is served from (under /replays). */
  url: string;
  /** Original file name as saved by OBS. */
  fileName: string;
  /** File size in bytes (0 if unknown). */
  sizeBytes: number;
  /** When the replay was saved (epoch ms). */
  savedAt: number;
  /** Display name of the operator who triggered the save (if known). */
  triggeredBy: string | null;
}

export interface ReplaySettings {
  /**
   * Name of the OBS media-source input that acts as the "replay player".
   * When set, newly saved replays are loaded into it and restarted.
   */
  playerSource: string | null;
  /** Automatically load each newly saved replay into the player source. */
  autoLoad: boolean;
}

/** Live replay-buffer status surfaced to the UI. */
export interface ObsReplayBufferStatus {
  /** Whether OBS's replay buffer output is currently running. */
  active: boolean;
  /** True while a save is in flight (used to block overlapping saves). */
  saving: boolean;
}
