/**
 * League data mirrored from Firestore. The server reads the `players`, `teams`,
 * and `matches` collections and exposes the documents (and the union of field
 * names) so overlays can bind to league fields like `avgKills`, `logo`, or
 * `bestOf`. Documents are kept generic — the user maintains the schema in
 * Firestore and we surface whatever fields exist.
 */

export type LeagueCollection = 'players' | 'teams' | 'matches';

/** A single Firestore document, flattened to id + field map. */
export interface LeagueDoc {
  id: string;
  /** Convenience label for pickers (name/nickname/title if present, else id). */
  label: string;
  fields: Record<string, unknown>;
}

/** Snapshot of all league collections plus the field names seen in each. */
export interface LeagueData {
  /** Whether the server has a working Firestore connection. */
  connected: boolean;
  /** Human-readable status/error for the UI. */
  status: string;
  updatedAt: number | null;
  players: LeagueDoc[];
  teams: LeagueDoc[];
  matches: LeagueDoc[];
  /** Union of field names per collection, for the binding reference catalog. */
  fields: Record<LeagueCollection, string[]>;
}

export const EMPTY_LEAGUE_DATA: LeagueData = {
  connected: false,
  status: 'Firestore not configured',
  updatedAt: null,
  players: [],
  teams: [],
  matches: [],
  fields: { players: [], teams: [], matches: [] },
};
