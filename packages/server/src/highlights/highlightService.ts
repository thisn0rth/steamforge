import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type {
  GsiPayload,
  GsiPlayer,
  HighlightSettings,
  HighlightState,
  KillEvent,
  RecordingSegment,
  RecordingSession,
} from '@streamforge/shared';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '@streamforge/shared';
import { dataPath } from '../config.js';
import { gsiService } from '../gsi/gsiService.js';
import { obsService } from '../obs/obsService.js';
import { replayService } from '../replays/replayService.js';
import {
  ffmpegAvailable,
  isBrowserPlayable,
  refreshFfmpeg,
  remuxToMp4,
  renderMontage,
  type MontageCut,
  type RenderCut,
} from './montage.js';

const MAX_KILLS = 1000;
const MAX_RECORDINGS = 25;

interface PlayerStat {
  kills: number;
  deaths: number;
  roundHs: number;
}

/**
 * Watches CS2 GSI for kills (by diffing the observer `allplayers` block),
 * timestamps each one against the active OBS recording, and turns them into
 * editable montage clip plans rendered with ffmpeg.
 */
class HighlightService extends EventEmitter {
  private readonly stateFile = dataPath('highlights.json');
  private readonly workDir = dataPath('montages');
  private kills: KillEvent[] = [];
  private recordings: RecordingSession[] = [];
  private settings: HighlightSettings = { ...DEFAULT_HIGHLIGHT_SETTINGS };
  private rendering = false;

  private prevStats = new Map<string, PlayerStat>();
  private activeRecordingId: string | null = null;
  /** Path OBS is currently writing to (the open segment's file). */
  private activeSegmentPath: string | null = null;

  // ---- per-round auto recording ----
  /** Last seen GSI round phase, to detect transitions. */
  private prevRoundPhase: string | null = null;
  /** Pending stop after a round ends (canceled if a new round starts first). */
  private roundStopTimer: ReturnType<typeof setTimeout> | null = null;
  /** Round number + auto flag to stamp onto the next session OBS reports. */
  private pendingRound: number | null = null;
  private pendingAuto = false;
  /** True while an auto round recording is in flight (so we auto-stop it). */
  private autoRoundActive = false;
  /** Cache of remuxed, browser-playable preview files keyed by recording id. */
  private previewCache = new Map<string, { src: string; mtimeMs: number; out: string }>();

  init(): void {
    fs.mkdirSync(this.workDir, { recursive: true });
    const saved = this.readState();
    this.kills = saved.kills ?? [];
    this.recordings = saved.recordings ?? [];
    this.settings = { ...DEFAULT_HIGHLIGHT_SETTINGS, ...(saved.settings ?? {}) };
    // Any session left "active" from a previous run is stale. Also backfill the
    // segments array for sessions persisted before segment tracking existed.
    this.recordings = this.recordings.map((r) => ({
      ...r,
      active: false,
      segments: r.segments ?? [],
      round: r.round ?? null,
      auto: r.auto ?? false,
    }));

    gsiService.on('payload', (payload: GsiPayload) => this.onPayload(payload));
    obsService.on('recordingStarted', (e: { startedAt: number }) =>
      this.onRecordingStarted(e.startedAt),
    );
    obsService.on(
      'recordingStopped',
      (e: { outputPath: string | null; startedAt: number | null }) =>
        this.onRecordingStopped(e.outputPath),
    );
    obsService.on('recordFileChanged', (e: { newPath: string | null }) =>
      this.onRecordFileChanged(e.newPath),
    );
  }

  snapshot(): HighlightState {
    return {
      kills: [...this.kills].sort((a, b) => a.ts - b.ts),
      recordings: [...this.recordings].sort((a, b) => b.startedAt - a.startedAt),
      settings: { ...this.settings },
      rendering: this.rendering,
      ffmpegAvailable: ffmpegAvailable(),
    };
  }

  updateSettings(patch: Partial<HighlightSettings>): HighlightSettings {
    const next = { ...this.settings };
    if (typeof patch.preRollMs === 'number') next.preRollMs = clampMs(patch.preRollMs);
    if (typeof patch.postRollMs === 'number') next.postRollMs = clampMs(patch.postRollMs);
    if (typeof patch.mergeGapMs === 'number') next.mergeGapMs = clampMs(patch.mergeGapMs);
    if (typeof patch.transitionMs === 'number') {
      next.transitionMs = Math.min(2000, Math.max(0, Math.round(patch.transitionMs)));
    }
    if (typeof patch.autoRecordRounds === 'boolean') {
      next.autoRecordRounds = patch.autoRecordRounds;
    }
    if (typeof patch.roundPostRollMs === 'number') {
      next.roundPostRollMs = Math.min(30_000, Math.max(0, Math.round(patch.roundPostRollMs)));
    }
    if (typeof patch.autoSaveReplayOnKill === 'boolean') {
      next.autoSaveReplayOnKill = patch.autoSaveReplayOnKill;
    }
    this.settings = next;
    this.persist();
    this.emitChange();
    return { ...this.settings };
  }

  /** Re-detect ffmpeg (e.g. after the user installs it) and rebroadcast. */
  recheckFfmpeg(): boolean {
    const available = refreshFfmpeg();
    this.emitChange();
    return available;
  }

  /** Drop a kill from the feed (e.g. a false positive). */
  removeKill(id: string): boolean {
    const before = this.kills.length;
    this.kills = this.kills.filter((k) => k.id !== id);
    if (this.kills.length === before) return false;
    this.persist();
    this.emitChange();
    return true;
  }

  /** Clear the kill feed (optionally only for one recording). */
  clearKills(recordingId?: string): void {
    this.kills = recordingId
      ? this.kills.filter((k) => k.recordingId !== recordingId)
      : [];
    this.persist();
    this.emitChange();
  }

  killsForRecording(recordingId: string): KillEvent[] {
    return this.kills
      .filter((k) => k.recordingId === recordingId)
      .sort((a, b) => (a.recordOffsetMs ?? 0) - (b.recordOffsetMs ?? 0));
  }

  /**
   * Render a montage from explicit cuts. Works whether or not the recording is
   * still running: if it's active, OBS is asked to split the recording file
   * (which finalizes the footage-so-far without interrupting recording), then the
   * cuts are mapped onto the resulting segment files.
   */
  async generateMontage(
    recordingId: string,
    cuts: MontageCut[],
    name: string | null,
    triggeredBy: string | null,
  ): Promise<{ replayId: string }> {
    if (this.rendering) throw new Error('A montage is already rendering');
    const recording = this.recordings.find((r) => r.id === recordingId);
    if (!recording) throw new Error('Recording not found');
    const usable = cuts.filter((c) => c.outMs > c.inMs);
    if (usable.length === 0) throw new Error('No clips selected');

    // If still recording, finalize the current footage so it's readable.
    if (recording.active) {
      await this.finalizeActiveFootage(recording);
    }

    const segments = this.renderableSegments(recording);
    if (segments.length === 0) {
      throw new Error(
        recording.active
          ? 'No finalized footage yet — start recording before the kills you want to clip.'
          : 'Recording file is unavailable.',
      );
    }

    // Map each clip (session-relative offsets) onto the segment files.
    const renderCuts: RenderCut[] = [];
    for (const c of usable) {
      renderCuts.push(...mapCutToSegments(segments, c.inMs, c.outMs));
    }
    if (renderCuts.length === 0) {
      throw new Error('Selected clips fall outside the available footage.');
    }

    this.rendering = true;
    this.emitChange();
    const outFile = path.join(this.workDir, `${nanoid(8)}.mp4`);
    try {
      await renderMontage(renderCuts, outFile, this.settings.transitionMs);
      const label =
        name?.trim() ||
        `Montage · ${usable.length} clip${usable.length === 1 ? '' : 's'}`;
      const replay = await replayService.addLocalFile(outFile, label, triggeredBy);
      return { replayId: replay.id };
    } finally {
      fs.rm(outFile, { force: true }, () => undefined);
      this.rendering = false;
      this.emitChange();
    }
  }

  /**
   * Resolve a browser-playable preview file for a recording's footage. Returns
   * the source file directly when it's already an MP4/WebM, otherwise remuxes it
   * to a cached faststart MP4 (so the clip editor can scrub mkv recordings).
   */
  async previewVideo(
    recordingId: string,
  ): Promise<{ path: string; contentType: string } | null> {
    const recording = this.recordings.find((r) => r.id === recordingId);
    if (!recording) return null;
    const src =
      recording.filePath ??
      this.renderableSegments(recording).find((s) => s.filePath)?.filePath ??
      null;
    if (!src || !fs.existsSync(src)) return null;

    if (isBrowserPlayable(src)) {
      return { path: src, contentType: contentTypeFor(src) };
    }

    // Remux non-MP4 (e.g. mkv) into a cached preview, keyed by source mtime.
    const mtimeMs = fs.statSync(src).mtimeMs;
    const cached = this.previewCache.get(recordingId);
    if (cached && cached.src === src && cached.mtimeMs === mtimeMs && fs.existsSync(cached.out)) {
      return { path: cached.out, contentType: 'video/mp4' };
    }
    const out = path.join(this.workDir, `preview-${recordingId}.mp4`);
    await remuxToMp4(src, out);
    this.previewCache.set(recordingId, { src, mtimeMs, out });
    return { path: out, contentType: 'video/mp4' };
  }

  /**
   * Finalized, readable segments for a recording, in order. Falls back to the
   * single `filePath` for sessions recorded before segment tracking existed.
   */
  private renderableSegments(recording: RecordingSession): RecordingSegment[] {
    const closed = recording.segments.filter(
      (s) => s.filePath && s.endOffsetMs != null,
    );
    if (closed.length > 0) return closed;
    if (recording.filePath) {
      const end =
        recording.endedAt && recording.startedAt
          ? recording.endedAt - recording.startedAt
          : Number.MAX_SAFE_INTEGER;
      return [{ filePath: recording.filePath, startOffsetMs: 0, endOffsetMs: end }];
    }
    return [];
  }

  /**
   * Split the active recording so footage up to now becomes a complete, readable
   * file (recording continues). Falls back to clipping the in-progress file
   * directly when OBS can't split (older OBS + a streamable format like mkv).
   */
  private async finalizeActiveFootage(recording: RecordingSession): Promise<void> {
    // Make sure we know the open file before splitting so it can be recorded.
    if (this.activeSegmentPath == null) {
      this.resolveOpenSegmentPath(recording.id);
    }
    const rolled = new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.off('segment-rolled', done);
        resolve();
      }, 8000);
      this.once('segment-rolled', done);
    });
    try {
      await obsService.splitRecordFile();
      await rolled;
    } catch {
      // OBS couldn't split: fall back to clipping the open file in place. This
      // only works if OBS records a streamable format (mkv / fragmented mp4).
      const file = this.activeSegmentPath ?? obsService.resolveActiveRecordingFile();
      const open = recording.segments[recording.segments.length - 1];
      if (file && open && open.endOffsetMs == null) {
        open.filePath = file;
        open.endOffsetMs = Date.now() - recording.startedAt;
        this.persist();
      }
    }
  }

  // ---- recording sessions -------------------------------------------------

  private onRecordingStarted(startedAt: number): void {
    // Close any lingering active session defensively.
    this.recordings = this.recordings.map((r) =>
      r.active ? { ...r, active: false, endedAt: r.endedAt ?? Date.now() } : r,
    );
    const auto = this.pendingAuto;
    const round = this.pendingRound;
    this.pendingAuto = false;
    this.pendingRound = null;
    this.autoRoundActive = auto;
    const session: RecordingSession = {
      id: nanoid(8),
      startedAt,
      endedAt: null,
      active: true,
      filePath: null,
      segments: [{ filePath: null, startOffsetMs: 0, endOffsetMs: null }],
      round,
      auto,
    };
    this.recordings.push(session);
    this.activeRecordingId = session.id;
    this.activeSegmentPath = null;
    // OBS reports the path only on stop/split; resolve the first file shortly
    // after it's created so an in-progress montage knows the source footage.
    setTimeout(() => this.resolveOpenSegmentPath(session.id), 1500);
    this.prune();
    this.persist();
    this.emitChange();
  }

  /** Fill in the open segment's file path by scanning OBS's record directory. */
  private resolveOpenSegmentPath(sessionId: string): void {
    if (this.activeRecordingId !== sessionId) return;
    if (this.activeSegmentPath) return;
    const file = obsService.resolveActiveRecordingFile();
    if (!file) return;
    this.activeSegmentPath = file;
    const session = this.recordings.find((r) => r.id === sessionId);
    const open = session?.segments[session.segments.length - 1];
    if (open && open.endOffsetMs == null && open.filePath == null) {
      open.filePath = file;
      this.persist();
    }
  }

  /** OBS rolled to a new file: finalize the open segment and start a new one. */
  private onRecordFileChanged(newPath: string | null): void {
    const session = this.recordings.find((r) => r.id === this.activeRecordingId);
    if (!session) return;
    if (this.activeSegmentPath == null) {
      this.activeSegmentPath = obsService.resolveActiveRecordingFile();
    }
    const offset = Date.now() - session.startedAt;
    const open = session.segments[session.segments.length - 1];
    if (open && open.endOffsetMs == null) {
      open.endOffsetMs = offset;
      if (open.filePath == null) open.filePath = this.activeSegmentPath;
    }
    session.segments.push({
      filePath: newPath,
      startOffsetMs: offset,
      endOffsetMs: null,
    });
    this.activeSegmentPath = newPath;
    this.persist();
    this.emitChange();
    this.emit('segment-rolled');
  }

  private onRecordingStopped(outputPath: string | null): void {
    const session = this.recordings.find((r) => r.id === this.activeRecordingId);
    if (session) {
      session.active = false;
      session.endedAt = Date.now();
      session.filePath = outputPath;
      const open = session.segments[session.segments.length - 1];
      if (open && open.endOffsetMs == null) {
        open.endOffsetMs = Date.now() - session.startedAt;
        open.filePath = outputPath ?? open.filePath ?? this.activeSegmentPath;
      }
    }
    this.activeRecordingId = null;
    this.activeSegmentPath = null;
    this.autoRoundActive = false;
    this.persist();
    this.emitChange();
    // Auto round recording finalized → prompt operators to open the clip editor.
    if (session?.auto) {
      this.emit('roundReady', {
        recordingId: session.id,
        round: session.round ?? null,
      });
    }
  }

  // ---- per-round auto recording -------------------------------------------

  /**
   * Drive OBS recording from GSI round phases: start at round start (freezetime,
   * so the whole round is captured even with OBS's ~1s startup), and stop a few
   * seconds after the round ends. Each round becomes its own clip-ready file.
   */
  private maybeAutoRecord(payload: GsiPayload): void {
    const phase = payload.round?.phase ?? null;
    if (!this.settings.autoRecordRounds) {
      this.prevRoundPhase = phase;
      return;
    }
    const mapPhase = payload.map?.phase;
    const round = payload.map?.round ?? 0;
    const prev = this.prevRoundPhase;
    if (phase === prev) return;
    this.prevRoundPhase = phase;

    // Round begins (buy time, or live if we joined mid-round). Skip warmup.
    const roundStarting =
      phase === 'freezetime' || (phase === 'live' && prev !== 'freezetime');
    if (roundStarting && mapPhase !== 'warmup') {
      this.cancelRoundStop();
      void this.startRoundRecording(round);
      return;
    }
    // Round ends: stop after a short buffer so the final kill is captured.
    if (phase === 'over' && this.autoRoundActive) {
      this.scheduleRoundStop();
    }
  }

  private async startRoundRecording(round: number): Promise<void> {
    try {
      // Finalize a still-open previous round first (its stop buffer may not have
      // fired yet, or rounds came back-to-back) so each round is its own file.
      if (obsService.isRecording()) {
        await obsService.stopRecording();
      }
      this.pendingRound = round;
      this.pendingAuto = true;
      await obsService.startRecording();
    } catch {
      // OBS not connected / refused — leave recording off, nothing to clip.
      this.pendingRound = null;
      this.pendingAuto = false;
    }
  }

  private scheduleRoundStop(): void {
    this.cancelRoundStop();
    this.roundStopTimer = setTimeout(() => {
      this.roundStopTimer = null;
      void obsService.stopRecording().catch(() => undefined);
    }, this.settings.roundPostRollMs);
  }

  private cancelRoundStop(): void {
    if (this.roundStopTimer) {
      clearTimeout(this.roundStopTimer);
      this.roundStopTimer = null;
    }
  }

  // ---- kill detection -----------------------------------------------------

  private onPayload(payload: GsiPayload): void {
    this.maybeAutoRecord(payload);
    const all = payload.allplayers;
    if (!all) return;
    const round = payload.map?.round ?? 0;
    // Kills are only counted during live play; warmup/intermission are noise but
    // we still keep baselines current so the first live kill isn't a false jump.
    const emitting = payload.map?.phase !== 'warmup';

    // Only consider players who actually report match_stats this tick. CS2 can
    // omit a player's stats during transitions; treating that as kills=0 was the
    // main cause of miscounted/phantom kills, so we skip them entirely instead.
    const present: { id: string; player: GsiPlayer; stat: PlayerStat }[] = [];
    for (const [key, player] of Object.entries(all)) {
      if (!player.match_stats) continue;
      present.push({
        id: player.steamid ?? key,
        player,
        stat: {
          kills: player.match_stats.kills ?? 0,
          deaths: player.match_stats.deaths ?? 0,
          roundHs: player.state?.round_killhs ?? 0,
        },
      });
    }
    if (present.length === 0) return;

    // Victim pool: players whose death count rose this tick (known players only).
    const victims: GsiPlayer[] = [];
    if (emitting) {
      for (const { id, player, stat } of present) {
        const prev = this.prevStats.get(id);
        if (!prev) continue;
        const dd = stat.deaths - prev.deaths;
        for (let i = 0; i < dd && i < 5; i++) victims.push(player);
      }
    }

    const recordOffsetMs = obsService.recordOffsetMs();
    const recordingId = recordOffsetMs != null ? this.activeRecordingId : null;
    let produced = 0;

    for (const { id, player, stat } of present) {
      const prev = this.prevStats.get(id);
      // Emit only on a sane positive delta. A first sighting (no prev), a
      // decrease (reconnect / new match), or an implausible jump (>6 in one
      // tick, i.e. a baseline reseed) just updates the baseline silently.
      if (prev && emitting) {
        const delta = stat.kills - prev.kills;
        if (delta > 0 && delta <= 6) {
          const hsDelta = Math.min(
            delta,
            Math.max(0, stat.roundHs - prev.roundHs),
          );
          const weapon = activeWeapon(player);
          for (let i = 0; i < delta; i++) {
            const victim = popVictim(victims, id);
            this.kills.push({
              id: nanoid(10),
              ts: Date.now(),
              round,
              killerSteamId: player.steamid ?? null,
              killerName: player.name,
              killerTeam: player.team ?? null,
              victimSteamId: victim?.steamid ?? null,
              victimName: victim?.name ?? null,
              victimTeam: victim?.team ?? null,
              weapon,
              headshot: i < hsDelta,
              recordingId,
              recordOffsetMs,
            });
            produced++;
          }
        }
      }
      this.prevStats.set(id, stat);
    }

    if (produced > 0) {
      if (this.kills.length > MAX_KILLS) {
        this.kills = this.kills.slice(this.kills.length - MAX_KILLS);
      }
      this.persist();
      this.emitChange();
      if (this.settings.autoSaveReplayOnKill) {
        void obsService.trySaveReplay('Auto (kill)');
      }
    }
  }

  // ---- persistence --------------------------------------------------------

  private prune(): void {
    if (this.recordings.length <= MAX_RECORDINGS) return;
    const sorted = [...this.recordings].sort((a, b) => a.startedAt - b.startedAt);
    const keep = new Set(sorted.slice(-MAX_RECORDINGS).map((r) => r.id));
    this.recordings = this.recordings.filter((r) => keep.has(r.id));
  }

  private emitChange(): void {
    this.emit('highlights', this.snapshot());
  }

  private persist(): void {
    const tmp = `${this.stateFile}.tmp`;
    const data = {
      kills: this.kills,
      recordings: this.recordings,
      settings: this.settings,
    };
    try {
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.stateFile);
    } catch {
      // best effort
    }
  }

  private readState(): {
    kills?: KillEvent[];
    recordings?: RecordingSession[];
    settings?: Partial<HighlightSettings>;
  } {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return {};
    }
  }
}

function clampMs(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(60_000, Math.max(0, Math.round(n)));
}

function contentTypeFor(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.m4v':
      return 'video/x-m4v';
    default:
      return 'video/mp4';
  }
}

/**
 * Map a clip window (session-relative offsets) onto the segment files it spans,
 * producing per-file cuts. A clip that straddles a split boundary yields one cut
 * per segment; portions outside any finalized segment are dropped (clamped).
 */
function mapCutToSegments(
  segments: RecordingSegment[],
  inMs: number,
  outMs: number,
): RenderCut[] {
  const cuts: RenderCut[] = [];
  for (const seg of segments) {
    if (!seg.filePath || seg.endOffsetMs == null) continue;
    const overlapStart = Math.max(inMs, seg.startOffsetMs);
    const overlapEnd = Math.min(outMs, seg.endOffsetMs);
    if (overlapEnd > overlapStart) {
      cuts.push({
        input: seg.filePath,
        inMs: overlapStart - seg.startOffsetMs,
        outMs: overlapEnd - seg.startOffsetMs,
      });
    }
  }
  return cuts;
}

function activeWeapon(player: GsiPlayer): string | null {
  const weapons = player.weapons;
  if (!weapons) return null;
  for (const w of Object.values(weapons)) {
    if (w.state === 'active') {
      return w.name.replace(/^weapon_/, '');
    }
  }
  return null;
}

/** Take the first victim that isn't the killer themselves. */
function popVictim(victims: GsiPlayer[], killerId: string): GsiPlayer | null {
  const idx = victims.findIndex((v) => (v.steamid ?? '') !== killerId);
  if (idx < 0) return null;
  return victims.splice(idx, 1)[0];
}

export const highlightService = new HighlightService();
