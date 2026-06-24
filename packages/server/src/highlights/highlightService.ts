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
  RecordingSession,
} from '@streamforge/shared';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '@streamforge/shared';
import { dataPath } from '../config.js';
import { gsiService } from '../gsi/gsiService.js';
import { obsService } from '../obs/obsService.js';
import { replayService } from '../replays/replayService.js';
import { ffmpegAvailable, renderMontage, type MontageCut } from './montage.js';

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
  private seeded = false;
  private activeRecordingId: string | null = null;

  init(): void {
    fs.mkdirSync(this.workDir, { recursive: true });
    const saved = this.readState();
    this.kills = saved.kills ?? [];
    this.recordings = saved.recordings ?? [];
    this.settings = { ...DEFAULT_HIGHLIGHT_SETTINGS, ...(saved.settings ?? {}) };
    // Any session left "active" from a previous run is stale.
    this.recordings = this.recordings.map((r) =>
      r.active ? { ...r, active: false } : r,
    );

    gsiService.on('payload', (payload: GsiPayload) => this.onPayload(payload));
    obsService.on('recordingStarted', (e: { startedAt: number }) =>
      this.onRecordingStarted(e.startedAt),
    );
    obsService.on(
      'recordingStopped',
      (e: { outputPath: string | null; startedAt: number | null }) =>
        this.onRecordingStopped(e.outputPath),
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
    if (typeof patch.autoSaveReplayOnKill === 'boolean') {
      next.autoSaveReplayOnKill = patch.autoSaveReplayOnKill;
    }
    this.settings = next;
    this.persist();
    this.emitChange();
    return { ...this.settings };
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

  /** Render a montage from explicit cuts against a finished recording. */
  async generateMontage(
    recordingId: string,
    cuts: MontageCut[],
    name: string | null,
    triggeredBy: string | null,
  ): Promise<{ replayId: string }> {
    if (this.rendering) throw new Error('A montage is already rendering');
    const recording = this.recordings.find((r) => r.id === recordingId);
    if (!recording) throw new Error('Recording not found');
    if (recording.active || !recording.filePath) {
      throw new Error(
        'Stop the OBS recording first — the montage reads the finished file',
      );
    }
    if (!fs.existsSync(recording.filePath)) {
      throw new Error(`Recording file is missing: ${recording.filePath}`);
    }
    const usable = cuts.filter((c) => c.outMs > c.inMs);
    if (usable.length === 0) throw new Error('No clips selected');

    this.rendering = true;
    this.emitChange();
    const outFile = path.join(this.workDir, `${nanoid(8)}.mp4`);
    try {
      await renderMontage(recording.filePath, usable, outFile);
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

  // ---- recording sessions -------------------------------------------------

  private onRecordingStarted(startedAt: number): void {
    // Close any lingering active session defensively.
    this.recordings = this.recordings.map((r) =>
      r.active ? { ...r, active: false, endedAt: r.endedAt ?? Date.now() } : r,
    );
    const session: RecordingSession = {
      id: nanoid(8),
      startedAt,
      endedAt: null,
      active: true,
      filePath: null,
    };
    this.recordings.push(session);
    this.activeRecordingId = session.id;
    this.prune();
    this.persist();
    this.emitChange();
  }

  private onRecordingStopped(outputPath: string | null): void {
    const session = this.recordings.find((r) => r.id === this.activeRecordingId);
    if (session) {
      session.active = false;
      session.endedAt = Date.now();
      session.filePath = outputPath;
    }
    this.activeRecordingId = null;
    this.persist();
    this.emitChange();
  }

  // ---- kill detection -----------------------------------------------------

  private onPayload(payload: GsiPayload): void {
    const all = payload.allplayers;
    if (!all) return;
    const phase = payload.map?.phase;
    const round = payload.map?.round ?? 0;

    const entries = Object.entries(all);
    const current = new Map<string, PlayerStat>();
    let reset = false;
    for (const [key, player] of entries) {
      const id = player.steamid ?? key;
      const stat: PlayerStat = {
        kills: player.match_stats?.kills ?? 0,
        deaths: player.match_stats?.deaths ?? 0,
        roundHs: player.state?.round_killhs ?? 0,
      };
      current.set(id, stat);
      const prev = this.prevStats.get(id);
      if (prev && stat.kills < prev.kills) reset = true;
    }

    // First payload (or a new match) seeds the baseline without emitting kills.
    if (!this.seeded || reset) {
      this.prevStats = current;
      this.seeded = true;
      return;
    }

    // Warmup kills are noise; skip but keep the baseline current.
    if (phase === 'warmup') {
      this.prevStats = current;
      return;
    }

    // Build a pool of victims (players whose death count rose this tick).
    const victims: GsiPlayer[] = [];
    for (const [key, player] of entries) {
      const id = player.steamid ?? key;
      const prev = this.prevStats.get(id);
      if (!prev) continue;
      const deaths = player.match_stats?.deaths ?? 0;
      const delta = deaths - prev.deaths;
      for (let i = 0; i < delta && i < 5; i++) victims.push(player);
    }

    const recordOffsetMs = obsService.recordOffsetMs();
    const recordingId = recordOffsetMs != null ? this.activeRecordingId : null;
    let produced = 0;

    for (const [key, player] of entries) {
      const id = player.steamid ?? key;
      const prev = this.prevStats.get(id);
      if (!prev) continue;
      const kills = player.match_stats?.kills ?? 0;
      const delta = kills - prev.kills;
      if (delta <= 0 || delta > 5) continue;
      const hsDelta = Math.max(0, (player.state?.round_killhs ?? 0) - prev.roundHs);
      const weapon = activeWeapon(player);
      for (let i = 0; i < delta; i++) {
        // Don't let a killer be their own victim in the pairing.
        const victim = popVictim(victims, id);
        const kill: KillEvent = {
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
        };
        this.kills.push(kill);
        produced++;
      }
    }

    this.prevStats = current;

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
