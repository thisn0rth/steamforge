import { EventEmitter } from 'node:events';
import type { GsiPayload, GsiStatus } from '@streamforge/shared';

/**
 * Receives CS2 GSI payloads (via the HTTP route), tracks connection liveness,
 * and emits updates. Considered "connected" if a payload arrived recently.
 */
const STALE_AFTER_MS = 15_000;

class GsiService extends EventEmitter {
  private latest: GsiPayload | null = null;
  private lastUpdate: number | null = null;
  private provider: string | null = null;
  private staleTimer: NodeJS.Timeout | null = null;

  ingest(payload: GsiPayload): void {
    this.latest = payload;
    this.lastUpdate = Date.now();
    this.provider = payload.provider?.name ?? this.provider;
    this.emit('payload', payload);
    this.emit('status', this.status());
    this.armStaleTimer();
  }

  private armStaleTimer(): void {
    if (this.staleTimer) clearTimeout(this.staleTimer);
    this.staleTimer = setTimeout(() => {
      this.emit('status', this.status());
    }, STALE_AFTER_MS + 500);
  }

  status(): GsiStatus {
    const connected =
      this.lastUpdate != null && Date.now() - this.lastUpdate < STALE_AFTER_MS;
    return {
      connected,
      lastUpdate: this.lastUpdate,
      provider: this.provider,
    };
  }

  current(): GsiPayload | null {
    return this.latest;
  }
}

export const gsiService = new GsiService();
