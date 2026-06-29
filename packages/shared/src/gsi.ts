/**
 * Counter-Strike 2 Game State Integration (GSI) payload types.
 *
 * CS2 POSTs JSON to a configured HTTP endpoint. Only the blocks enabled in the
 * `gamestate_integration_*.cfg` are present, and many fields are optional
 * depending on whether the local client is a player or an observer.
 */

export interface GsiProvider {
  name: string;
  appid: number;
  version: number;
  steamid: string;
  timestamp: number;
}

export interface GsiMapTeam {
  score: number;
  consecutive_round_losses?: number;
  timeouts_remaining?: number;
  matches_won_this_series?: number;
  name?: string;
  flag?: string;
}

export interface GsiMap {
  mode: string;
  name: string;
  phase: 'warmup' | 'live' | 'intermission' | 'gameover' | string;
  round: number;
  team_ct: GsiMapTeam;
  team_t: GsiMapTeam;
  num_matches_to_win_series?: number;
  current_spectators?: number;
  souvenirs_total?: number;
}

export interface GsiRound {
  phase: 'freezetime' | 'live' | 'over' | string;
  bomb?: 'planted' | 'exploded' | 'defused' | string;
  win_team?: 'CT' | 'T' | string;
}

export interface GsiPlayerState {
  health: number;
  armor: number;
  helmet: boolean;
  flashed: number;
  smoked: number;
  burning: number;
  money: number;
  round_kills: number;
  round_killhs: number;
  round_totaldmg?: number;
  equip_value?: number;
}

export interface GsiPlayerMatchStats {
  kills: number;
  assists: number;
  deaths: number;
  mvps: number;
  score: number;
}

export interface GsiWeapon {
  name: string;
  paintkit: string;
  type?: string;
  ammo_clip?: number;
  ammo_clip_max?: number;
  ammo_reserve?: number;
  state: 'active' | 'holstered' | 'reloading' | string;
}

export interface GsiPlayer {
  steamid?: string;
  name: string;
  observer_slot?: number;
  team?: 'CT' | 'T' | string;
  activity?: 'playing' | 'menu' | 'textinput' | string;
  state?: GsiPlayerState;
  match_stats?: GsiPlayerMatchStats;
  weapons?: Record<string, GsiWeapon>;
  position?: string;
  forward?: string;
}

export interface GsiBomb {
  state: 'carried' | 'planted' | 'planting' | 'defusing' | 'defused' | 'exploded' | 'dropped' | string;
  countdown?: string;
  player?: string;
  position?: string;
}

export interface GsiPhaseCountdowns {
  phase: string;
  phase_ends_in: string;
}

/** Full GSI payload as POSTed by CS2. All blocks optional. */
export interface GsiPayload {
  provider?: GsiProvider;
  map?: GsiMap;
  round?: GsiRound;
  player?: GsiPlayer;
  /** Present when observing/spectating with the proper auth + server access. */
  allplayers?: Record<string, GsiPlayer>;
  bomb?: GsiBomb;
  phase_countdowns?: GsiPhaseCountdowns;
  /** Previous-state deltas CS2 includes for change detection. */
  previously?: Partial<GsiPayload>;
  added?: Partial<GsiPayload>;
  auth?: Record<string, string>;
}

/** Connection status of the GSI listener as surfaced to the UI. */
export interface GsiStatus {
  connected: boolean;
  /** epoch ms of the last received payload, or null if none yet. */
  lastUpdate: number | null;
  /** Name reported by the most recent provider block. */
  provider: string | null;
}
