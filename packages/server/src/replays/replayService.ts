import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { Replay, ReplaySettings } from '@streamforge/shared';
import { dataPath } from '../config.js';
import { obsService } from '../obs/obsService.js';

const MAX_REPLAYS = 100;

const DEFAULT_SETTINGS: ReplaySettings = {
  playerSource: null,
  autoLoad: true,
};

/**
 * Owns instant-replay persistence. Listens for OBS replay-buffer saves
 * (triggered by the web button or OBS's own global hotkey), copies each clip
 * into the data directory, keeps a registry, and can load the newest clip into
 * a designated "replay player" media source for replay scenes.
 */
class ReplayService extends EventEmitter {
  private readonly dir = dataPath('replays');
  private readonly registryFile = path.join(this.dir, 'replays.json');
  private readonly settingsFile = dataPath('replaySettings.json');
  private replays: Replay[] = [];
  private settings: ReplaySettings = { ...DEFAULT_SETTINGS };

  init(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    this.replays = this.readJson<Replay[]>(this.registryFile, []);
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...this.readJson<Partial<ReplaySettings>>(this.settingsFile, {}),
    };
    obsService.on('replaySaved', (e: { path: string; triggeredBy: string | null }) => {
      void this.onReplaySaved(e.path, e.triggeredBy);
    });
  }

  list(): Replay[] {
    return [...this.replays].sort((a, b) => b.savedAt - a.savedAt);
  }

  getSettings(): ReplaySettings {
    return { ...this.settings };
  }

  snapshot(): { replays: Replay[]; settings: ReplaySettings } {
    return { replays: this.list(), settings: this.getSettings() };
  }

  updateSettings(patch: Partial<ReplaySettings>): ReplaySettings {
    this.settings = {
      ...this.settings,
      ...('playerSource' in patch ? { playerSource: patch.playerSource ?? null } : {}),
      ...('autoLoad' in patch ? { autoLoad: Boolean(patch.autoLoad) } : {}),
    };
    this.writeJson(this.settingsFile, this.settings);
    this.emitChange();
    return this.getSettings();
  }

  /** Trigger a save; attribution + overlap protection live in obsService. */
  async requestSave(triggeredBy: string | null): Promise<void> {
    await obsService.saveReplay(triggeredBy);
  }

  async startBuffer(): Promise<void> {
    await obsService.startReplayBuffer();
  }

  /** Load an existing replay into the configured player source. */
  async load(id: string): Promise<Replay> {
    const replay = this.replays.find((r) => r.id === id);
    if (!replay) throw new Error('Replay not found');
    await this.loadIntoPlayer(replay);
    return replay;
  }

  remove(id: string): boolean {
    const replay = this.replays.find((r) => r.id === id);
    if (!replay) return false;
    this.replays = this.replays.filter((r) => r.id !== id);
    this.persist();
    const file = path.join(this.dir, replay.fileName);
    fs.rm(file, { force: true }, () => undefined);
    this.emitChange();
    return true;
  }

  /**
   * Register an already-rendered file (e.g. an auto-clip montage) into the
   * replay library. Copies it into the replays dir if it isn't already there.
   */
  async addLocalFile(
    srcPath: string,
    name: string,
    triggeredBy: string | null,
  ): Promise<Replay> {
    fs.mkdirSync(this.dir, { recursive: true });
    const id = nanoid(8);
    const base = path.basename(srcPath);
    const fileName = base.startsWith(id) ? base : `${id}-${base}`;
    const dest = path.join(this.dir, fileName);
    if (path.resolve(srcPath) !== path.resolve(dest)) {
      fs.copyFileSync(srcPath, dest);
    }
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(dest).size;
    } catch {
      // best effort
    }
    const savedAt = Date.now();
    const replay: Replay = {
      id,
      name,
      url: `/replays/${encodeURIComponent(fileName)}`,
      fileName,
      sizeBytes,
      savedAt,
      triggeredBy,
    };
    this.replays.push(replay);
    this.prune();
    this.persist();
    this.emit('saved', replay);
    this.emitChange();
    if (this.settings.autoLoad) {
      await this.loadIntoPlayer(replay).catch(() => undefined);
    }
    return replay;
  }

  private async onReplaySaved(srcPath: string, triggeredBy: string | null): Promise<void> {
    const id = nanoid(8);
    const base = path.basename(srcPath);
    const fileName = `${id}-${base}`;
    const dest = path.join(this.dir, fileName);
    try {
      fs.copyFileSync(srcPath, dest);
    } catch {
      // Server and OBS should share a filesystem; if the copy fails we can't
      // serve or load the clip, so skip registering it.
      return;
    }
    let sizeBytes = 0;
    try {
      sizeBytes = fs.statSync(dest).size;
    } catch {
      // best effort
    }
    const savedAt = Date.now();
    const replay: Replay = {
      id,
      name: `Replay ${new Date(savedAt).toLocaleTimeString()}`,
      url: `/replays/${encodeURIComponent(fileName)}`,
      fileName,
      sizeBytes,
      savedAt,
      triggeredBy,
    };
    this.replays.push(replay);
    this.prune();
    this.persist();
    this.emit('saved', replay);
    this.emitChange();

    if (this.settings.autoLoad) {
      await this.loadIntoPlayer(replay).catch(() => undefined);
    }
  }

  private async loadIntoPlayer(replay: Replay): Promise<void> {
    const source = this.settings.playerSource;
    if (!source) throw new Error('No replay player source configured');
    if (!obsService.isConnected()) throw new Error('OBS is not connected');
    const abs = path.join(this.dir, replay.fileName);
    await obsService.loadReplayIntoSource(source, abs);
  }

  private prune(): void {
    if (this.replays.length <= MAX_REPLAYS) return;
    const sorted = [...this.replays].sort((a, b) => a.savedAt - b.savedAt);
    const remove = sorted.slice(0, this.replays.length - MAX_REPLAYS);
    for (const r of remove) {
      fs.rm(path.join(this.dir, r.fileName), { force: true }, () => undefined);
    }
    const removeIds = new Set(remove.map((r) => r.id));
    this.replays = this.replays.filter((r) => !removeIds.has(r.id));
  }

  private emitChange(): void {
    this.emit('replays', this.snapshot());
  }

  private persist(): void {
    this.writeJson(this.registryFile, this.replays);
  }

  private readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
      return fallback;
    }
  }

  private writeJson(file: string, value: unknown): void {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }
}

export const replayService = new ReplayService();
