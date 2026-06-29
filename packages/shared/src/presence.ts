/**
 * Identity, presence, and activity types for multi-operator collaboration.
 * A "session user" is whoever is driving a connected control-surface client.
 */

export interface SessionUser {
  id: string;
  name: string;
  /** Hex accent color used for avatars/cursors. */
  color: string;
  /** True for clients on the production host (loopback, no login required). */
  host: boolean;
}

export type ActivityKind =
  | 'join'
  | 'leave'
  | 'rigActivated'
  | 'sceneSwitched'
  | 'overlayEdited'
  | 'obsConnection'
  | 'replaySaved'
  | 'assetUploaded'
  | 'outputChanged';

export interface ActivityEvent {
  id: string;
  ts: number;
  userId: string;
  userName: string;
  userColor: string;
  kind: ActivityKind;
  message: string;
}
