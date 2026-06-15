/**
 * Realtime WebSocket protocol shared by the server, the control UI, and overlay
 * browser-source pages. All messages are JSON with a discriminating `type`.
 */

import type { GsiPayload, GsiStatus } from './gsi.js';
import type { ObsState } from './obs.js';
import type { Overlay } from './overlay.js';
import type { Rig } from './rig.js';

/** Messages the server broadcasts to connected clients. */
export type ServerMessage =
  | { type: 'gsi'; payload: GsiPayload }
  | { type: 'gsiStatus'; status: GsiStatus }
  | { type: 'obsState'; state: ObsState }
  | { type: 'rigActivated'; rigId: string }
  | { type: 'overlayUpdated'; overlay: Overlay }
  | { type: 'rigsUpdated'; rigs: Rig[] }
  | { type: 'hello'; serverTime: number };

/** Messages a client can send to the server over the socket. */
export type ClientMessage =
  | { type: 'subscribe'; channels: SocketChannel[] }
  | { type: 'ping' };

export type SocketChannel = 'gsi' | 'obs' | 'rigs' | 'overlays';

export const WS_PATH = '/ws';
