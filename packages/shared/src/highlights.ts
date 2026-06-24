/**
 * Autonomous highlight / auto-clip types.
 *
 * The server detects every kill from CS2 GSI (observer `allplayers`), timestamps
 * each one against the active OBS recording, and can auto-assemble the kills into
 * a montage. Operators review the auto-generated clip plan, omit boring kills,
 * and nudge in/out points before rendering the final montage with ffmpeg.
 */

/** A single kill detected from GSI. */
export interface KillEvent {
  id: string;
  /** Epoch ms when the kill was detected. */
  ts: number;
  /** Map round number when the kill happened. */
  round: number;
  killerSteamId: string | null;
  killerName: string;
  killerTeam: 'CT' | 'T' | string | null;
  victimSteamId: string | null;
  victimName: string | null;
  victimTeam: 'CT' | 'T' | string | null;
  /** Killer's active weapon at kill time, if known. */
  weapon: string | null;
  headshot: boolean;
  /** Id of the recording session this kill belongs to, or null if not recording. */
  recordingId: string | null;
  /** Offset into that recording in ms, or null if not recording. */
  recordOffsetMs: number | null;
}

/**
 * One physical recording file within a session. OBS can roll over to a new file
 * mid-session (manual/auto split, or our generate-time split), so a session is a
 * sequence of segments, each covering a contiguous offset range of the session.
 */
export interface RecordingSegment {
  /** Absolute path to the finalized file (null until it's resolved/closed). */
  filePath: string | null;
  /** Offset (ms) from session start where this segment begins. */
  startOffsetMs: number;
  /** Offset (ms) from session start where it ends, or null while still writing. */
  endOffsetMs: number | null;
}

/** A span of OBS recording, used as montage source footage. */
export interface RecordingSession {
  id: string;
  /** Epoch ms recording started. */
  startedAt: number;
  /** Epoch ms recording stopped, or null while active. */
  endedAt: number | null;
  /** Whether this session is currently recording. */
  active: boolean;
  /** Absolute file path OBS reported on stop (null until then). */
  filePath: string | null;
  /** Recording files making up this session, in order. */
  segments: RecordingSegment[];
}

/** Tunables for how kills are turned into clips. */
export interface HighlightSettings {
  /** Seconds of footage to keep before each kill. */
  preRollMs: number;
  /** Seconds of footage to keep after each kill. */
  postRollMs: number;
  /**
   * Consecutive kills by the *same* player within this gap merge into one clip
   * (so quick multi-kills stack instead of becoming separate clips).
   */
  mergeGapMs: number;
  /** Crossfade duration between clips in the montage (ms). 0 = hard cut. */
  transitionMs: number;
  /**
   * When on, the server also triggers an OBS replay-buffer save on each kill,
   * for instant in-broadcast replays (independent of the montage flow).
   */
  autoSaveReplayOnKill: boolean;
}

export const DEFAULT_HIGHLIGHT_SETTINGS: HighlightSettings = {
  preRollMs: 1500,
  postRollMs: 1500,
  mergeGapMs: 2500,
  transitionMs: 400,
  autoSaveReplayOnKill: false,
};

/** One editable clip in a montage plan (a merged group of one or more kills). */
export interface HighlightClip {
  id: string;
  /** Kills covered by this clip, in chronological order. */
  killIds: string[];
  /** Human label, e.g. "s1mple 3K · ak47". */
  label: string;
  /** In point as an offset into the recording (ms). */
  inMs: number;
  /** Out point as an offset into the recording (ms). */
  outMs: number;
  /** Whether to include this clip in the rendered montage. */
  included: boolean;
}

/** Snapshot broadcast to clients. */
export interface HighlightState {
  kills: KillEvent[];
  recordings: RecordingSession[];
  settings: HighlightSettings;
  /** True while a montage render is in progress. */
  rendering: boolean;
  /** Whether ffmpeg was found on the host (montage rendering needs it). */
  ffmpegAvailable: boolean;
}

/** Group label like "3K", "2K", "ACE" for a clip covering N kills. */
export function multiKillLabel(n: number): string {
  if (n >= 5) return 'ACE';
  if (n <= 1) return '';
  return `${n}K`;
}

/** Every kill made by one player, clustered so close kills (multi-kills) stack. */
export interface KillerGroup {
  killerSteamId: string | null;
  killerName: string;
  killerTeam: 'CT' | 'T' | string | null;
  total: number;
  /** Kills clustered by proximity; each inner array is a multi-kill burst. */
  clusters: KillEvent[][];
  /** Most recent kill timestamp (for ordering). */
  latestTs: number;
}

/**
 * Group all kills by the player who made them, and within each player cluster
 * kills that happened close together (within `gapMs`) so multi-kills show as a
 * stacked group. Players are ordered by most-recent activity.
 */
export function groupKillsByKiller(
  kills: KillEvent[],
  gapMs: number,
): KillerGroup[] {
  const byKiller = new Map<string, KillEvent[]>();
  for (const k of kills) {
    const key = k.killerSteamId ?? `name:${k.killerName}`;
    const list = byKiller.get(key);
    if (list) list.push(k);
    else byKiller.set(key, [k]);
  }

  const groups: KillerGroup[] = [];
  for (const list of byKiller.values()) {
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const clusters: KillEvent[][] = [];
    let cur: KillEvent[] = [];
    let lastTs = -Infinity;
    for (const k of sorted) {
      if (cur.length > 0 && k.ts - lastTs <= gapMs) cur.push(k);
      else {
        if (cur.length) clusters.push(cur);
        cur = [k];
      }
      lastTs = k.ts;
    }
    if (cur.length) clusters.push(cur);
    const first = sorted[0];
    groups.push({
      killerSteamId: first.killerSteamId,
      killerName: first.killerName,
      killerTeam: first.killerTeam,
      total: sorted.length,
      clusters,
      latestTs: sorted[sorted.length - 1].ts,
    });
  }
  return groups.sort((a, b) => b.latestTs - a.latestTs);
}

/**
 * Pure helper: turn a recording's kills into an auto clip plan. Kills are grouped
 * per player, and a player's kills whose [kill - preRoll, kill + postRoll] windows
 * fall within `mergeGapMs` stack into one multi-kill clip — even if another player
 * traded a kill in between. Each cluster becomes one clip; clips are ordered by
 * start time. Only kills captured while recording (with a record offset) count.
 */
export function buildHighlightPlan(
  kills: KillEvent[],
  settings: HighlightSettings,
): HighlightClip[] {
  const clippable = kills.filter((k) => k.recordOffsetMs != null);
  if (clippable.length === 0) return [];

  // Group by killer, then cluster each killer's kills by window proximity.
  const byKiller = new Map<string, KillEvent[]>();
  for (const k of clippable) {
    const key = k.killerSteamId ?? `name:${k.killerName}`;
    const list = byKiller.get(key);
    if (list) list.push(k);
    else byKiller.set(key, [k]);
  }

  const groups: KillEvent[][] = [];
  for (const list of byKiller.values()) {
    const sorted = [...list].sort(
      (a, b) => (a.recordOffsetMs ?? 0) - (b.recordOffsetMs ?? 0),
    );
    let current: KillEvent[] = [];
    let lastOut = -Infinity;
    for (const k of sorted) {
      const offset = k.recordOffsetMs ?? 0;
      const start = offset - settings.preRollMs;
      if (current.length > 0 && start <= lastOut + settings.mergeGapMs) {
        current.push(k);
      } else {
        if (current.length) groups.push(current);
        current = [k];
      }
      lastOut = offset + settings.postRollMs;
    }
    if (current.length) groups.push(current);
  }

  return groups
    .map((group) => {
      const first = group[0].recordOffsetMs ?? 0;
      const last = group[group.length - 1].recordOffsetMs ?? 0;
      const inMs = Math.max(0, first - settings.preRollMs);
      const outMs = last + settings.postRollMs;
      const killer = group[0].killerName;
      const multi = multiKillLabel(group.length);
      const weapon = group[0].weapon ? ` · ${group[0].weapon}` : '';
      const label = `${killer}${multi ? ` ${multi}` : ''}${weapon}`.trim();
      return {
        id: group.map((k) => k.id).join('+'),
        killIds: group.map((k) => k.id),
        label,
        inMs,
        outMs,
        included: true,
      };
    })
    .sort((a, b) => a.inMs - b.inMs);
}
