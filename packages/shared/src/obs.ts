/**
 * OBS connection + state types surfaced to the UI. The server owns the actual
 * obs-websocket connection; clients see a normalized snapshot.
 */

export interface ObsConnectionConfig {
  url: string;
  password?: string;
  /** Auto-connect on server startup. */
  autoConnect: boolean;
}

export interface ObsSceneItem {
  sceneItemId: number;
  sourceName: string;
  enabled: boolean;
}

export interface ObsScene {
  name: string;
  items: ObsSceneItem[];
}

/** Live streaming output status, polled from OBS while connected. */
export interface ObsStreamStatus {
  active: boolean;
  /** Milliseconds the current stream has been live. */
  durationMs: number;
  /** Outgoing bitrate in kbit/s. */
  kbitsPerSec: number;
  /** Frames dropped due to network congestion. */
  skippedFrames: number;
  totalFrames: number;
  /** 0..1 network congestion indicator reported by OBS. */
  congestion: number;
}

/** Local recording status. */
export interface ObsRecordStatus {
  active: boolean;
  paused: boolean;
  durationMs: number;
}

/** Encoder / performance stats, polled from OBS while connected. */
export interface ObsStats {
  cpuUsage: number;
  memoryUsageMb: number;
  activeFps: number;
  averageFrameRenderMs: number;
  renderTotalFrames: number;
  renderSkippedFrames: number;
  outputTotalFrames: number;
  outputSkippedFrames: number;
}

export interface ObsState {
  connected: boolean;
  /** Last connection error message, if any. */
  error: string | null;
  currentProgramScene: string | null;
  currentPreviewScene: string | null;
  studioModeEnabled: boolean;
  scenes: ObsScene[];
  transitions: string[];
  currentTransition: string | null;
  streaming: ObsStreamStatus;
  recording: ObsRecordStatus;
  stats: ObsStats | null;
}
