import { EventEmitter } from 'node:events';
import OBSWebSocket from 'obs-websocket-js';
import type {
  ObsScene,
  ObsState,
  ObsStreamStatus,
  ObsRecordStatus,
  ObsStats,
  OutputChannel,
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
  private frameTimer: NodeJS.Timeout | null = null;
  private grabbing = false;
  private viewers = 0;
  private lastPreviewSent: string | null = null;
  private replayBufferActive = false;
  private replaySaving = false;
  private overlaySourceName = config.obs.overlaySourceName;
  private overlayAutoSwitch = config.obs.overlayAutoSwitch;
  private lastOverlayChannel: OutputChannel = 'program';
  private pendingReplayTriggeredBy: string | null = null;
  private replaySaveTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.obs.on('ConnectionClosed', () => {
      this.connected = false;
      this.stopPolling();
      this.stopFrameCapture();
      this.streaming = { ...INACTIVE_STREAM };
      this.recording = { ...INACTIVE_RECORD };
      this.stats = null;
      this.replayBufferActive = false;
      this.clearReplayLock();
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
    this.obs.on('CurrentSceneTransitionChanged', ({ transitionName }) => {
      this.currentTransition = transitionName;
      this.emitState();
    });
    this.obs.on('ReplayBufferStateChanged', ({ outputActive }) => {
      this.replayBufferActive = outputActive;
      this.emitState();
    });
    this.obs.on('ReplayBufferSaved', ({ savedReplayPath }) => {
      const triggeredBy = this.pendingReplayTriggeredBy;
      this.clearReplayLock();
      this.emit('replaySaved', { path: savedReplayPath, triggeredBy });
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
      this.stopFrameCapture();
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
    await this.refreshReplayBuffer();
    await this.refreshOutputs();
    this.startPolling();
    this.updateFrameCapture();
    // Re-apply the shared overlay source URL on (re)connect.
    void this.setOverlayChannel(this.lastOverlayChannel);
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

  /** Track how many clients are watching so frame capture only runs when needed. */
  setViewers(count: number): void {
    this.viewers = Math.max(0, count);
    this.updateFrameCapture();
  }

  private updateFrameCapture(): void {
    const shouldRun = this.connected && this.viewers > 0;
    if (shouldRun) {
      this.startFrameCapture();
    } else {
      this.stopFrameCapture();
    }
  }

  private startFrameCapture(): void {
    if (this.frameTimer) return;
    const interval = Math.round(1000 / config.preview.fps);
    this.frameTimer = setInterval(() => void this.grabFrames(), interval);
  }

  private stopFrameCapture(): void {
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
  }

  /** Grab JPEG snapshots of the Program (and Preview) scenes and emit them. */
  private async grabFrames(): Promise<void> {
    if (!this.connected || this.grabbing) return;
    this.grabbing = true;
    try {
      const program = this.currentProgramScene;
      const preview = this.studioModeEnabled ? this.currentPreviewScene : null;

      if (program) {
        const dataUrl = await this.screenshot(program);
        if (dataUrl) this.emit('frame', { channel: 'program', dataUrl, ts: Date.now() });
      }

      if (preview) {
        const dataUrl = await this.screenshot(preview);
        if (dataUrl) this.emit('frame', { channel: 'preview', dataUrl, ts: Date.now() });
        this.lastPreviewSent = preview;
      } else if (this.lastPreviewSent !== null) {
        // Studio Mode turned off — clear the stale preview frame once.
        this.emit('frame', { channel: 'preview', dataUrl: null, ts: Date.now() });
        this.lastPreviewSent = null;
      }
    } finally {
      this.grabbing = false;
    }
  }

  private async screenshot(sourceName: string): Promise<string | null> {
    try {
      const { imageData } = await this.obs.call('GetSourceScreenshot', {
        sourceName,
        imageFormat: 'jpg',
        imageWidth: config.preview.width,
        imageCompressionQuality: config.preview.quality,
      });
      return imageData ?? null;
    } catch {
      return null;
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
    this.currentTransition = transitionName;
    this.emitState();
  }

  // ---- Replay buffer ------------------------------------------------------

  private async refreshReplayBuffer(): Promise<void> {
    if (!this.connected) return;
    try {
      const { outputActive } = await this.obs.call('GetReplayBufferStatus');
      this.replayBufferActive = outputActive;
    } catch {
      // Replay buffer may be unsupported / disabled; treat as inactive.
      this.replayBufferActive = false;
    }
  }

  async startReplayBuffer(): Promise<void> {
    this.assertConnected();
    await this.obs.call('StartReplayBuffer');
    this.replayBufferActive = true;
    this.emitState();
  }

  /**
   * Trigger an OBS replay-buffer save. Refuses overlapping saves so two
   * operators can't clip at the same time; the lock clears on the
   * `ReplayBufferSaved` event or after a timeout fallback.
   */
  async saveReplay(triggeredBy: string | null): Promise<void> {
    this.assertConnected();
    if (!this.replayBufferActive) {
      throw new Error('Replay buffer is not running — start it first');
    }
    if (this.replaySaving) {
      throw new Error('A replay is already being saved');
    }
    this.replaySaving = true;
    this.pendingReplayTriggeredBy = triggeredBy;
    this.emitState();
    this.replaySaveTimer = setTimeout(() => this.clearReplayLock(), 15000);
    try {
      await this.obs.call('SaveReplayBuffer');
    } catch (err) {
      this.clearReplayLock();
      throw err;
    }
  }

  private clearReplayLock(): void {
    this.replaySaving = false;
    this.pendingReplayTriggeredBy = null;
    if (this.replaySaveTimer) {
      clearTimeout(this.replaySaveTimer);
      this.replaySaveTimer = null;
    }
    this.emitState();
  }

  /** Point a media-source input at a replay file and restart playback. */
  async loadReplayIntoSource(inputName: string, filePath: string): Promise<void> {
    this.assertConnected();
    await this.obs.call('SetInputSettings', {
      inputName,
      inputSettings: { local_file: filePath },
      overlay: true,
    });
    try {
      await this.obs.call('TriggerMediaInputAction', {
        inputName,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
    } catch {
      // Not all source types support restart; the new file still loads.
    }
  }

  /**
   * Point the single shared "Overlay" browser source at the given render
   * channel (`/live` or `/preview`). No-ops when disconnected, auto-switch is
   * off, or the source doesn't exist — so it's safe to call on every output
   * change.
   */
  async setOverlayChannel(channel: OutputChannel): Promise<void> {
    this.lastOverlayChannel = channel;
    if (!this.connected || !this.overlayAutoSwitch) return;
    const inputName = this.overlaySourceName;
    if (!inputName) return;
    const path = channel === 'program' ? '/live' : '/preview';
    const url = `${config.obs.overlayBaseUrl.replace(/\/$/, '')}${path}`;
    try {
      await this.obs.call('SetInputSettings', {
        inputName,
        inputSettings: { url },
        overlay: true,
      });
    } catch {
      // Source missing or not a browser source — ignore.
    }
  }

  /** Update the shared overlay source config (from Settings). */
  setOverlaySource(patch: { name?: string; autoSwitch?: boolean }): void {
    if (typeof patch.name === 'string') this.overlaySourceName = patch.name.trim();
    if (typeof patch.autoSwitch === 'boolean') this.overlayAutoSwitch = patch.autoSwitch;
    // Re-apply so the source reflects the latest config immediately.
    void this.setOverlayChannel(this.lastOverlayChannel);
    this.emitState();
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
      replayBuffer: {
        active: this.replayBufferActive,
        saving: this.replaySaving,
      },
      overlaySource: {
        name: this.overlaySourceName,
        autoSwitch: this.overlayAutoSwitch,
      },
    };
  }

  private emitState(): void {
    this.emit('state', this.state());
  }
}

export const obsService = new ObsService();
