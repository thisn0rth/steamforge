/**
 * Realtime WebSocket protocol shared by the server, the control UI, and overlay
 * browser-source pages. All messages are JSON with a discriminating `type`.
 */

import type { GsiPayload, GsiStatus } from './gsi.js';
import type { ObsState } from './obs.js';
import type { Overlay } from './overlay.js';
import type { Rig } from './rig.js';
import type { ActivityEvent, SessionUser } from './presence.js';

/** Messages the server broadcasts to connected clients. */
export type ServerMessage =
  | { type: 'gsi'; payload: GsiPayload }
  | { type: 'gsiStatus'; status: GsiStatus }
  | { type: 'obsState'; state: ObsState }
  | { type: 'rigActivated'; rigId: string }
  | { type: 'overlayUpdated'; overlay: Overlay }
  | { type: 'rigsUpdated'; rigs: Rig[] }
  | { type: 'presence'; users: SessionUser[] }
  | { type: 'activity'; event: ActivityEvent }
  | { type: 'activityLog'; events: ActivityEvent[] }
  | { type: 'obsFrame'; channel: ObsFrameChannel; dataUrl: string | null; ts: number }
  | { type: 'hello'; serverTime: number; you: SessionUser | null };

/** Which monitor a pushed video frame belongs to. */
export type ObsFrameChannel = 'program' | 'preview';

/** Messages a client can send to the server over the socket. */
export type ClientMessage =
  | { type: 'subscribe'; channels: SocketChannel[] }
  | { type: 'identify'; name: string; color: string }
  | { type: 'ping' };

export type SocketChannel = 'gsi' | 'obs' | 'rigs' | 'overlays';

export const WS_PATH = '/ws';
