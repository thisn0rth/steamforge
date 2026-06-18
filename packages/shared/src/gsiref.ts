/**
 * GSI data reference + path resolution shared by the editor (to offer a
 * searchable catalog of bindable fields with live values) and the renderer
 * (to resolve a binding path to a value).
 *
 * Beyond plain dotted paths into the GSI payload (e.g. `map.team_ct.score`),
 * this supports a virtual `players.<team>.<slot>.<field>` namespace so overlays
 * can reference any player on either team by position — the building block for
 * full team/player overlays. Players are resolved from the observer
 * `allplayers` block and ordered by observer slot.
 */
import type { GsiPayload, GsiPlayer } from './gsi.js';

export type GsiTeamRef = 'ct' | 't' | 'all';

/** A single bindable field shown in the editor's reference panel. */
export interface GsiRefEntry {
  /** Binding path, e.g. `map.team_ct.score` or `players.ct.1.state.health`. */
  path: string;
  /** Human label, e.g. "CT score". */
  label: string;
  /** Grouping for the reference UI. */
  group: string;
}

/** Per-player fields, relative to a player object. */
export const PLAYER_FIELDS: { suffix: string; label: string }[] = [
  { suffix: 'name', label: 'Name' },
  { suffix: 'team', label: 'Team' },
  { suffix: 'steamid', label: 'SteamID' },
  { suffix: 'state.health', label: 'Health' },
  { suffix: 'state.armor', label: 'Armor' },
  { suffix: 'state.helmet', label: 'Helmet' },
  { suffix: 'state.money', label: 'Money' },
  { suffix: 'state.round_kills', label: 'Round kills' },
  { suffix: 'state.equip_value', label: 'Equipment value' },
  { suffix: 'match_stats.kills', label: 'Kills' },
  { suffix: 'match_stats.assists', label: 'Assists' },
  { suffix: 'match_stats.deaths', label: 'Deaths' },
  { suffix: 'match_stats.mvps', label: 'MVPs' },
  { suffix: 'match_stats.score', label: 'Score' },
];

/** Static (non-player) reference entries grouped for the editor catalog. */
export const STATIC_GSI_ENTRIES: GsiRefEntry[] = [
  { path: 'map.name', label: 'Map name', group: 'Map' },
  { path: 'map.phase', label: 'Map phase', group: 'Map' },
  { path: 'map.round', label: 'Round number', group: 'Map' },
  { path: 'map.team_ct.name', label: 'CT team name', group: 'Map' },
  { path: 'map.team_ct.score', label: 'CT score', group: 'Map' },
  { path: 'map.team_ct.consecutive_round_losses', label: 'CT loss bonus streak', group: 'Map' },
  { path: 'map.team_ct.timeouts_remaining', label: 'CT timeouts left', group: 'Map' },
  { path: 'map.team_t.name', label: 'T team name', group: 'Map' },
  { path: 'map.team_t.score', label: 'T score', group: 'Map' },
  { path: 'map.team_t.consecutive_round_losses', label: 'T loss bonus streak', group: 'Map' },
  { path: 'map.team_t.timeouts_remaining', label: 'T timeouts left', group: 'Map' },
  { path: 'round.phase', label: 'Round phase', group: 'Round' },
  { path: 'round.bomb', label: 'Bomb round state', group: 'Round' },
  { path: 'round.win_team', label: 'Round winner', group: 'Round' },
  { path: 'bomb.state', label: 'Bomb state', group: 'Bomb' },
  { path: 'bomb.countdown', label: 'Bomb countdown', group: 'Bomb' },
  { path: 'bomb.player', label: 'Bomb carrier/defuser', group: 'Bomb' },
  { path: 'phase_countdowns.phase', label: 'Phase', group: 'Timing' },
  { path: 'phase_countdowns.phase_ends_in', label: 'Phase ends in', group: 'Timing' },
  { path: 'player.name', label: 'Observed player name', group: 'Observed player' },
  { path: 'player.state.health', label: 'Observed player health', group: 'Observed player' },
  { path: 'player.state.money', label: 'Observed player money', group: 'Observed player' },
  { path: 'player.match_stats.kills', label: 'Observed player kills', group: 'Observed player' },
];

const TEAM_LABEL: Record<GsiTeamRef, string> = { ct: 'CT', t: 'T', all: 'All' };

/** Players for a team, ordered by observer slot (slot 0 treated as last). */
export function orderedPlayers(gsi: GsiPayload | null, team: GsiTeamRef): GsiPlayer[] {
  if (!gsi) return [];
  const pool: GsiPlayer[] = gsi.allplayers
    ? Object.entries(gsi.allplayers).map(([steamid, p]) => ({ steamid, ...p }))
    : gsi.player
      ? [gsi.player]
      : [];
  const slot = (p: GsiPlayer): number => {
    const s = p.observer_slot;
    if (s == null) return 99;
    return s === 0 ? 10 : s;
  };
  return pool
    .filter((p) => {
      if (team === 'all') return true;
      const t = (p.team ?? '').toUpperCase();
      return team === 'ct' ? t === 'CT' : t === 'T';
    })
    .sort((a, b) => slot(a) - slot(b) || (a.name ?? '').localeCompare(b.name ?? ''));
}

/**
 * Build reference entries for every player slot of a team, using the live
 * roster for friendly labels (falls back to generic slot labels).
 */
export function playerRefEntries(
  gsi: GsiPayload | null,
  team: Exclude<GsiTeamRef, 'all'>,
  maxSlots = 5,
): GsiRefEntry[] {
  const players = orderedPlayers(gsi, team);
  const group = `Players · ${TEAM_LABEL[team]}`;
  const entries: GsiRefEntry[] = [];
  for (let i = 1; i <= maxSlots; i++) {
    const who = players[i - 1]?.name;
    const slotLabel = who ? `${TEAM_LABEL[team]} ${i} (${who})` : `${TEAM_LABEL[team]} ${i}`;
    for (const f of PLAYER_FIELDS) {
      entries.push({
        path: `players.${team}.${i}.${f.suffix}`,
        label: `${slotLabel} · ${f.label}`,
        group,
      });
    }
  }
  return entries;
}

/** Read a plain dotted path out of an object. */
export function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

const PLAYER_RE = /^players\.(ct|t|all)\.(\d+)(?:\.(.+))?$/;

/**
 * Resolve a binding path against a GSI payload, including the virtual
 * `players.<team>.<slot>.<field>` namespace.
 */
export function resolveGsiValue(gsi: GsiPayload | null, path: string): unknown {
  if (!gsi || !path) return undefined;
  const m = PLAYER_RE.exec(path);
  if (m) {
    const team = m[1] as GsiTeamRef;
    const idx = Number(m[2]) - 1;
    const rest = m[3];
    const player = orderedPlayers(gsi, team)[idx];
    if (!player) return undefined;
    return rest ? readPath(player, rest) : player.name;
  }
  return readPath(gsi, path);
}
