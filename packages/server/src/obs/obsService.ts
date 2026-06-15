import { EventEmitter } from 'node:events';
import OBSWebSocket from 'obs-websocket-js';
import type { ObsScene, ObsState } from '@streamforge/shared';
import { config } from '../config.js';

/**
 * Owns the single obs-websocket connection and exposes a normalized snapshot
 * plus high-level control methods used by the rig engine and REST routes. The
 * rest of the app works fine while OBS is disconnected (overlay editing, etc.).
 */
class ObsService extends EventEmitter {
  private obs = new OBSWebSocket();
  private connected = false;
  private error: string | null = null;
  private currentProgramScene: string | null = null;
  private currentPreviewScene: string | null = null;
  private studioModeEnabled = false;
  private scenes: ObsScene[] = [];
  private transitions: string[] = [];
  private currentTransition: string | null = null;

  constructor() {
    super();
    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      this.emitState();
    });
    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      this.currentProgramScene = sceneName;
      this.emitState();
    });
    this.obs.on('CurrentPreviewSceneChanged', ({ sceneName }) => {
      this.currentPreviewScene = sceneName;
      this.emitState();
    });
    this.obs.on('SceneItemEnableStateChanged', () => {
      void this.refreshScenes();
    });
    this.obs.on('StudioModeStateChanged', ({ studioModeEnabled }) => {
      this.studioModeEnabled = studioModeEnabled;
      this.emitState();
    });
  }

  async connect(url?: string, password?: string): Promise<void> {
    try {
      await this.obs.connect(url ?? config.obs.url, password ?? config.obs.password);
      this.connected = true;
      this.error = null;
      await this.refreshAll();
    } catch (err) {
      this.connected = false;
      this.error = err instanceof Error ? err.message : String(err);
      this.emitState();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.obs.disconnect();
    } finally {
      this.connected = false;
      this.emitState();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async refreshAll(): Promise<void> {
    await this.refreshScenes();
    await this.refreshTransitions();
    await this.refreshStudioMode();
    this.emitState();
  }

  private async refreshScenes(): Promise<void> {
    if (!this.connected) return;
    const { scenes, currentProgramSceneName, currentPreviewSceneName } =
      await this.obs.call('GetSceneList');
    this.currentProgramScene = currentProgramSceneName ?? null;
    this.currentPreviewScene = currentPreviewSceneName ?? null;

    const resolved: ObsScene[] = [];
    for (const s of scenes) {
      const sceneName = String(s.sceneName);
      const { sceneItems } = await this.obs.call('GetSceneItemList', { sceneName });
      resolved.push({
        name: sceneName,
        items: sceneItems.map((it) => ({
          sceneItemId: Number(it.sceneItemId),
          sourceName: String(it.sourceName),
          enabled: Boolean(it.sceneItemEnabled),
        })),
      });
    }
    this.scenes = resolved;
    this.emitState();
  }

  private async refreshTransitions(): Promise<void> {
    if (!this.connected) return;
    const { transitions, currentSceneTransitionName } = await this.obs.call(
      'GetSceneTransitionList',
    );
    this.transitions = transitions.map((t) => String(t.transitionName));
    this.currentTransition = currentSceneTransitionName ?? null;
  }

  private async refreshStudioMode(): Promise<void> {
    if (!this.connected) return;
    const { studioModeEnabled } = await this.obs.call('GetStudioModeEnabled');
    this.studioModeEnabled = studioModeEnabled;
  }

  // ---- High-level control -------------------------------------------------

  async setProgramScene(sceneName: string): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetCurrentProgramScene', { sceneName });
  }

  async setPreviewScene(sceneName: string): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetCurrentPreviewScene', { sceneName });
  }

  async setSourceEnabled(
    sceneName: string,
    sourceName: string,
    enabled: boolean,
  ): Promise<void> {
    this.assertConnected();
    const { sceneItemId } = await this.obs.call('GetSceneItemId', {
      sceneName,
      sourceName,
    });
    await this.obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId: Number(sceneItemId),
      sceneItemEnabled: enabled,
    });
  }

  async setCurrentTransition(transitionName: string): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetCurrentSceneTransition', { transitionName });
  }

  async triggerTransition(): Promise<void> {
    this.assertConnected();
    if (this.studioModeEnabled) {
      await this.obs.call('TriggerStudioModeTransition');
    }
  }

  async refresh(): Promise<void> {
    await this.refreshAll();
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new Error('OBS is not connected');
    }
  }

  state(): ObsState {
    return {
      connected: this.connected,
      error: this.error,
      currentProgramScene: this.currentProgramScene,
      currentPreviewScene: this.currentPreviewScene,
      studioModeEnabled: this.studioModeEnabled,
      scenes: this.scenes,
      transitions: this.transitions,
      currentTransition: this.currentTransition,
    };
  }

  private emitState(): void {
    this.emit('state', this.state());
  }
}

export const obsService = new ObsService();
