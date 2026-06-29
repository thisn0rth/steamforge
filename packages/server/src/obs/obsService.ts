import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
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
  /** Epoch ms the current OBS recording started (null when not recording). */
  private recordStartedAt: number | null = null;
  /** Folder OBS writes recordings to (for resolving in-progress file paths). */
  private recordDirectory: string | null = null;
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
      this.recordStartedAt = null;
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
    this.obs.on('RecordStateChanged', ({ outputActive, outputPath }) => {
      this.setRecordingActive(outputActive, outputPath ?? null);
      this.emitState();
    });
    // Emitted when OBS rolls over to a new recording file (manual/auto split).
    this.obs.on('RecordFileChanged', ({ newOutputPath }) => {
      this.emit('recordFileChanged', { newPath: newOutputPath ?? null });
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
    // The control room is a Live/Preview model, which needs OBS Studio Mode.
    await this.ensureStudioMode().catch(() => undefined);
    await this.refreshReplayBuffer();
    await this.refreshRecordDirectory();
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
      const recordActive = Boolean(record.outputActive);
      // Detect a recording already in progress on (re)connect so kills are still
      // timestamped; the stop event carries the file path for clipping.
      if (recordActive && this.recordStartedAt == null) {
        this.recordStartedAt = Date.now() - Number(record.outputDuration ?? 0);
        this.recording.active = true;
        this.emit('recordingStarted', { startedAt: this.recordStartedAt });
      }
      this.recording = {
        active: recordActive,
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
    await this.ensureStudioMode();
    await this.obs.call('SetCurrentPreviewScene', { sceneName });
  }

  /** Studio Mode gives OBS a separate Preview scene; staging requires it. */
  async ensureStudioMode(): Promise<void> {
    if (this.studioModeEnabled) return;
    await this.obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
    this.studioModeEnabled = true;
    this.emitState();
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

  /**
   * Best-effort replay save for automated triggers (e.g. on every kill). Unlike
   * `saveReplay` it never throws — if the buffer is off or a save is already in
   * flight, it simply skips. Returns whether a save was actually started.
   */
  async trySaveReplay(triggeredBy: string | null): Promise<boolean> {
    if (!this.connected || !this.replayBufferActive || this.replaySaving) {
      return false;
    }
    try {
      await this.saveReplay(triggeredBy);
      return true;
    } catch {
      return false;
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
    // Called as part of TAKE; a disconnected OBS is non-fatal (overlay output
    // still commits), so no-op rather than throw.
    if (!this.connected || !this.studioModeEnabled) return;
    await this.obs.call('TriggerStudioModeTransition');
  }

  async toggleStream(): Promise<boolean> {
    this.assertConnected();
    const { outputActive } = await this.obs.call('ToggleStream');
    this.streaming.active = outputActive;
    if (!outputActive) this.streaming = { ...INACTIVE_STREAM };
    this.emitState();
    return outputActive;
  }

  /**
   * Transition the recording-active flag, emitting `recordingStarted` /
   * `recordingStopped` (with the file path) on edges. Safe to call from both the
   * OBS event and the status poll.
   */
  private setRecordingActive(active: boolean, outputPath: string | null): void {
    const was = this.recording.active;
    if (active && !was) {
      this.recordStartedAt = Date.now();
      this.recording.active = true;
      void this.refreshRecordDirectory();
      this.emit('recordingStarted', { startedAt: this.recordStartedAt });
    } else if (!active && was) {
      this.emit('recordingStopped', {
        outputPath,
        startedAt: this.recordStartedAt,
      });
      this.recordStartedAt = null;
      this.recording = { ...INACTIVE_RECORD };
    }
  }

  /** Current offset into the active recording in ms, or null if not recording. */
  recordOffsetMs(): number | null {
    if (!this.recording.active || this.recordStartedAt == null) return null;
    return Date.now() - this.recordStartedAt;
  }

  isRecording(): boolean {
    return this.recording.active;
  }

  private async refreshRecordDirectory(): Promise<void> {
    if (!this.connected) return;
    try {
      const { recordDirectory } = await this.obs.call('GetRecordDirectory');
      this.recordDirectory = recordDirectory ?? null;
    } catch {
      // Older OBS or transient failure; leave last known value.
    }
  }

  getRecordDirectory(): string | null {
    return this.recordDirectory;
  }

  /**
   * Best-effort resolve of the file OBS is *currently* writing to: the newest
   * video file in the record directory. Used to clip an in-progress recording
   * without stopping it (OBS only reports the path on stop).
   */
  resolveActiveRecordingFile(): string | null {
    const dir = this.recordDirectory;
    if (!dir) return null;
    const videoExts = new Set(['.mp4', '.mkv', '.mov', '.flv', '.ts', '.m4v']);
    let newest: { file: string; mtime: number } | null = null;
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!videoExts.has(path.extname(name).toLowerCase())) continue;
        const full = path.join(dir, name);
        let mtime = 0;
        try {
          mtime = fs.statSync(full).mtimeMs;
        } catch {
          continue;
        }
        if (!newest || mtime > newest.mtime) newest = { file: full, mtime };
      }
    } catch {
      return null;
    }
    return newest?.file ?? null;
  }

  /**
   * Roll OBS over to a new recording file *without stopping the recording*. This
   * finalizes the current file so it becomes a complete, readable clip source.
   * Requires OBS 30+ (SplitRecordFile request).
   */
  async splitRecordFile(): Promise<void> {
    this.assertConnected();
    if (!this.recording.active) {
      throw new Error('Not recording');
    }
    try {
      await this.obs.call('SplitRecordFile');
    } catch {
      throw new Error(
        'OBS could not split the recording file — this needs OBS 30+ (Settings → enable "Automatic File Splitting" is not required, just a recent OBS).',
      );
    }
  }

  async toggleRecord(): Promise<boolean> {
    this.assertConnected();
    const { outputActive } = await this.obs.call('ToggleRecord');
    this.recording.active = outputActive;
    if (!outputActive) this.recording = { ...INACTIVE_RECORD };
    this.emitState();
    return outputActive;
  }

  /** Start recording if not already recording. No-op when already active. */
  async startRecording(): Promise<void> {
    this.assertConnected();
    if (this.recording.active) return;
    await this.obs.call('StartRecord');
  }

  /**
   * Stop recording if active and return the output file path OBS reports. No-op
   * (returns null) when not recording.
   */
  async stopRecording(): Promise<string | null> {
    this.assertConnected();
    if (!this.recording.active) return null;
    const { outputPath } = await this.obs.call('StopRecord');
    return outputPath ?? null;
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
