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
  /** Kills whose windows are within this gap get merged into one clip. */
  mergeGapMs: number;
  /**
   * When on, the server also triggers an OBS replay-buffer save on each kill,
   * for instant in-broadcast replays (independent of the montage flow).
   */
  autoSaveReplayOnKill: boolean;
}

export const DEFAULT_HIGHLIGHT_SETTINGS: HighlightSettings = {
  preRollMs: 4000,
  postRollMs: 3000,
  mergeGapMs: 6000,
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

/**
 * Pure helper: turn a recording's kills into an auto clip plan. Each kill gets a
 * [kill - preRoll, kill + postRoll] window; windows closer than `mergeGapMs` are
 * merged so multi-kills become a single clip. Only kills with a record offset
 * (i.e. captured while recording) are considered.
 */
export function buildHighlightPlan(
  kills: KillEvent[],
  settings: HighlightSettings,
): HighlightClip[] {
  const clippable = kills
    .filter((k) => k.recordOffsetMs != null)
    .sort((a, b) => (a.recordOffsetMs ?? 0) - (b.recordOffsetMs ?? 0));
  if (clippable.length === 0) return [];

  const groups: KillEvent[][] = [];
  let current: KillEvent[] = [];
  let lastOut = -Infinity;
  for (const k of clippable) {
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

  return groups.map((group) => {
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
  });
}
