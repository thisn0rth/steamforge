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
}
