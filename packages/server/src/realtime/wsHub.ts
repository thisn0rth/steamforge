import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import { nanoid } from 'nanoid';
import type {
  ActivityEvent,
  ActivityKind,
  ClientMessage,
  ServerMessage,
  SessionUser,
} from '@streamforge/shared';
import { WS_PATH } from '@streamforge/shared';
import {
  authEnabled,
  cleanName,
  hostUser,
  isLoopback,
  userForToken,
} from '../auth/auth.js';

const ACTIVITY_LIMIT = 80;

/**
 * WebSocket fan-out hub. The control UI and overlay browser-source pages connect
 * here; the server pushes GSI/OBS/rig state plus operator presence and activity.
 */
class WsHub {
  private wss: WebSocketServer | null = null;
  /** Cache of the last message per "type" so new clients get current state. */
  private lastByType = new Map<string, ServerMessage>();
  /** Identity per connected socket (control surfaces + overlay sources). */
  private users = new Map<WebSocket, SessionUser>();
  /** Recent activity, newest last. */
  private activity: ActivityEvent[] = [];

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: WS_PATH });
    this.wss.on('connection', (socket, req) => this.onConnection(socket, req));
  }

  private resolveUser(req: IncomingMessage): SessionUser | null {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token');
    const name = url.searchParams.get('name');
    const color = url.searchParams.get('color');

    const tokenUser = userForToken(token);
    if (tokenUser) return tokenUser;
    if (isLoopback(req) || !authEnabled()) return hostUser(name, color);
    return null;
  }

  private onConnection(socket: WebSocket, req: IncomingMessage): void {
    const user = this.resolveUser(req);
    if (!user) {
      // Auth required and this remote client has no valid session.
      socket.close(4001, 'authentication required');
      return;
    }
    this.users.set(socket, user);

    this.send(socket, { type: 'hello', serverTime: Date.now(), you: user });
    // Replay cached state so a freshly-loaded overlay/UI is immediately correct.
    for (const msg of this.lastByType.values()) this.send(socket, msg);
    this.send(socket, { type: 'activityLog', events: this.activity });
    this.broadcastPresence();
    // Only surface joins for real operators, not OBS browser-source pages.
    if (!user.host) this.logActivity(user, 'join', `${user.name} joined`);

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        if (msg.type === 'identify') {
          const current = this.users.get(socket);
          if (current) {
            current.name = cleanName(msg.name);
            if (/^#[0-9a-fA-F]{6}$/.test(msg.color)) current.color = msg.color;
            this.broadcastPresence();
          }
        }
      } catch {
        // Ignore malformed client frames.
      }
    });

    socket.on('close', () => {
      const left = this.users.get(socket);
      this.users.delete(socket);
      this.broadcastPresence();
      if (left && !left.host && !this.hasUser(left.id)) {
        this.logActivity(left, 'leave', `${left.name} left`);
      }
    });
  }

  private hasUser(id: string): boolean {
    for (const u of this.users.values()) if (u.id === id) return true;
    return false;
  }

  private presenceList(): SessionUser[] {
    const byId = new Map<string, SessionUser>();
    for (const u of this.users.values()) byId.set(u.id, u);
    return [...byId.values()];
  }

  private broadcastPresence(): void {
    this.broadcast({ type: 'presence', users: this.presenceList() });
  }

  /** Record an attributed action and fan it out to every client. */
  logActivity(user: SessionUser, kind: ActivityKind, message: string): void {
    const event: ActivityEvent = {
      id: nanoid(8),
      ts: Date.now(),
      userId: user.id,
      userName: user.name,
      userColor: user.color,
      kind,
      message,
    };
    this.activity.push(event);
    if (this.activity.length > ACTIVITY_LIMIT) this.activity.shift();
    this.broadcast({ type: 'activity', event });
  }

  private send(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  }

  /** Broadcast a message to every connected client and cache it by type. */
  broadcast(msg: ServerMessage): void {
    // Only cache "state" messages, not one-shot events.
    if (
      msg.type !== 'rigActivated' &&
      msg.type !== 'hello' &&
      msg.type !== 'activity'
    ) {
      this.lastByType.set(msg.type, msg);
    }
    if (!this.wss) return;
    const data = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  clientCount(): number {
    return this.wss?.clients.size ?? 0;
  }
}

export const wsHub = new WsHub();
