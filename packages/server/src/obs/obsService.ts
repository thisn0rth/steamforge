import { EventEmitter } from 'node:events';
import OBSWebSocket from 'obs-websocket-js';
import type {
  ObsScene,
  ObsState,
  ObsStreamStatus,
  ObsRecordStatus,
  ObsStats,
} from '@streamforge/shared';
import { config } from '../config.js';

const INACTIVE_STREAM: ObsStreamStatus = {
  active: false,
  durationMs: 0,
  kbitsPerSec: 0,
  skippedFrames: 0,
  totalFrames: 0,
  congestion: 0,
};
const INACTIVE_RECORD: ObsRecordStatus = {
  active: false,
  paused: false,
  durationMs: 0,
};

/** How often to poll OBS for live output/encoder stats while connected. */
const POLL_INTERVAL_MS = 1000;

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
  private streaming: ObsStreamStatus = { ...INACTIVE_STREAM };
  private recording: ObsRecordStatus = { ...INACTIVE_RECORD };
  private stats: ObsStats | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastOutputBytes = 0;
  private lastBytesAt = 0;

  constructor() {
    super();
    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      this.stopPolling();
      this.streaming = { ...INACTIVE_STREAM };
      this.recording = { ...INACTIVE_RECORD };
      this.stats = null;
      this.emitState();
    });
    this.obs.on('StreamStateChanged', ({ outputActive }) => {
      this.streaming.active = outputActive;
      if (!outputActive) this.streaming = { ...INACTIVE_STREAM };
      this.emitState();
    });
    this.obs.on('RecordStateChanged', ({ outputActive }) => {
      this.recording.active = outputActive;
      if (!outputActive) this.recording = { ...INACTIVE_RECORD };
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
      this.stopPolling();
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
    await this.refreshOutputs();
    this.startPolling();
    this.emitState();
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      void this.refreshOutputs();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Poll streaming/recording/encoder stats. Quiet on failure. */
  private async refreshOutputs(): Promise<void> {
    if (!this.connected) return;
    try {
      const [stream, record, stats] = await Promise.all([
        this.obs.call('GetStreamStatus'),
        this.obs.call('GetRecordStatus'),
        this.obs.call('GetStats'),
      ]);

      const now = Date.now();
      const bytes = Number(stream.outputBytes ?? 0);
      let kbitsPerSec = 0;
      if (stream.outputActive && this.lastBytesAt > 0) {
        const seconds = (now - this.lastBytesAt) / 1000;
        if (seconds > 0) {
          kbitsPerSec = Math.max(0, ((bytes - this.lastOutputBytes) * 8) / 1000 / seconds);
        }
      }
      this.lastOutputBytes = bytes;
      this.lastBytesAt = now;

      this.streaming = {
        active: Boolean(stream.outputActive),
        durationMs: Number(stream.outputDuration ?? 0),
        kbitsPerSec: Math.round(kbitsPerSec),
        skippedFrames: Number(stream.outputSkippedFrames ?? 0),
        totalFrames: Number(stream.outputTotalFrames ?? 0),
        congestion: Number(stream.outputCongestion ?? 0),
      };
      this.recording = {
        active: Boolean(record.outputActive),
        paused: Boolean(record.outputPaused),
        durationMs: Number(record.outputDuration ?? 0),
      };
      this.stats = {
        cpuUsage: Number(stats.cpuUsage ?? 0),
        memoryUsageMb: Number(stats.memoryUsage ?? 0),
        activeFps: Number(stats.activeFps ?? 0),
        averageFrameRenderMs: Number(stats.averageFrameRenderTime ?? 0),
        renderTotalFrames: Number(stats.renderTotalFrames ?? 0),
        renderSkippedFrames: Number(stats.renderSkippedFrames ?? 0),
        outputTotalFrames: Number(stats.outputTotalFrames ?? 0),
        outputSkippedFrames: Number(stats.outputSkippedFrames ?? 0),
      };
      this.emitState();
    } catch {
      // Transient poll failures are non-fatal; keep last known values.
    }
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

  async toggleStream(): Promise<boolean> {
    this.assertConnected();
    const { outputActive } = await this.obs.call('ToggleStream');
    this.streaming.active = outputActive;
    if (!outputActive) this.streaming = { ...INACTIVE_STREAM };
    this.emitState();
    return outputActive;
  }

  async toggleRecord(): Promise<boolean> {
    this.assertConnected();
    const { outputActive } = await this.obs.call('ToggleRecord');
    this.recording.active = outputActive;
    if (!outputActive) this.recording = { ...INACTIVE_RECORD };
    this.emitState();
    return outputActive;
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
      streaming: this.streaming,
      recording: this.recording,
      stats: this.stats,
    };
  }

  private emitState(): void {
    this.emit('state', this.state());
  }
}

export const obsService = new ObsService();
