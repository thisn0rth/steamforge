import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { ClientMessage, ServerMessage } from '@streamforge/shared';
import { WS_PATH } from '@streamforge/shared';

/**
 * WebSocket fan-out hub. The control UI and overlay browser-source pages both
 * connect here; the server pushes GSI/OBS/rig state to all of them.
 */
class WsHub {
  private wss: WebSocketServer | null = null;
  /** Cache of the last message per "type" so new clients get current state. */
  private lastByType = new Map<string, ServerMessage>();

  attach(server: Server): void {
    this.wss = new WebSocketServer({ server, path: WS_PATH });
    this.wss.on('connection', (socket) => this.onConnection(socket));
  }

  private onConnection(socket: WebSocket): void {
    this.send(socket, { type: 'hello', serverTime: Date.now() });
    // Replay cached state so a freshly-loaded overlay/UI is immediately correct.
    for (const msg of this.lastByType.values()) {
      this.send(socket, msg);
    }

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        if (msg.type === 'ping') {
          // Liveness only; nothing to do.
        }
      } catch {
        // Ignore malformed client frames.
      }
    });
  }

  private send(socket: WebSocket, msg: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }

  /** Broadcast a message to every connected client and cache it by type. */
  broadcast(msg: ServerMessage): void {
    // Only cache "state" messages, not one-shot events.
    if (msg.type !== 'rigActivated' && msg.type !== 'hello') {
      this.lastByType.set(msg.type, msg);
    }
    if (!this.wss) return;
    const data = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  clientCount(): number {
    return this.wss?.clients.size ?? 0;
  }
}

export const wsHub = new WsHub();
