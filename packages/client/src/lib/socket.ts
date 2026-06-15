import { WS_PATH, type ServerMessage } from '@streamforge/shared';

export type ServerMessageHandler = (msg: ServerMessage) => void;

/**
 * Reconnecting WebSocket to the StreamForge server. Used by both the control UI
 * and overlay browser-source pages to receive live GSI/OBS/rig updates.
 */
export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private handler: ServerMessageHandler;
  private reconnectTimer: number | null = null;
  private closed = false;
  private onStatus?: (connected: boolean) => void;

  constructor(handler: ServerMessageHandler, onStatus?: (c: boolean) => void) {
    this.handler = handler;
    this.onStatus = onStatus;
  }

  connect(): void {
    this.closed = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}${WS_PATH}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => this.onStatus?.(true);
    ws.onmessage = (event) => {
      try {
        this.handler(JSON.parse(event.data) as ServerMessage);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      this.onStatus?.(false);
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer != null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer != null) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
