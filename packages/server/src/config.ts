import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/**
 * Runtime configuration, overridable via environment variables. Sensible
 * local-first defaults so the app "just works" on a single machine.
 */
export interface ServerConfig {
  /** HTTP + WebSocket port for the API and control UI. */
  port: number;
  /** Host to bind. Defaults to 127.0.0.1 for a local-only tool. */
  host: string;
  /** Directory where rigs/overlays/transitions JSON is persisted. */
  dataDir: string;
  /** Token CS2 must include in its GSI config `auth.token`. Empty disables. */
  gsiAuthToken: string;
  /**
   * Shared password remote operators must enter to control the production.
   * Empty disables team auth (pure local mode). Loopback clients on the
   * production host are always trusted regardless of this setting.
   */
  teamPassword: string;
  /** Default OBS websocket connection. */
  obs: {
    url: string;
    password: string;
    autoConnect: boolean;
    /**
     * Name of the single shared browser source in OBS the app drives. Its URL
     * is flipped between `/preview` and `/live` as overlays are staged/pushed,
     * so you only need one "Overlay" source per scene.
     */
    overlaySourceName: string;
    /** Whether to auto-switch that source's URL on output changes. */
    overlayAutoSwitch: boolean;
    /** Base URL OBS uses to reach the render pages (host-local). */
    overlayBaseUrl: string;
  };
  /** Firestore league-data integration. Disabled when no credentials given. */
  firestore: {
    /** Raw service-account JSON (string) — takes precedence if set. */
    serviceAccountJson: string;
    /** Path to a service-account JSON file (alternative to the inline JSON). */
    serviceAccountPath: string;
    /** Explicit project id (otherwise read from the service account). */
    projectId: string;
    /** Collection names to mirror. */
    collections: { players: string; teams: string; matches: string };
    /** Auto-refresh interval in ms (0 disables periodic refresh). */
    refreshMs: number;
  };
  /** Live monitor preview (screenshot streaming) settings. */
  preview: {
    /** Frames per second to grab for the Program/Preview monitors. */
    fps: number;
    /** Downscaled frame width in pixels (height keeps aspect). */
    width: number;
    /** JPEG quality 1-100. */
    quality: number;
  };
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const dataDir =
  process.env.STREAMFORGE_DATA_DIR ?? path.join(process.cwd(), 'data');

fs.mkdirSync(dataDir, { recursive: true });

export const config: ServerConfig = {
  port: Number(process.env.PORT ?? 4500),
  host: process.env.HOST ?? '127.0.0.1',
  dataDir,
  gsiAuthToken: process.env.STREAMFORGE_GSI_TOKEN ?? '',
  teamPassword: process.env.STREAMFORGE_TEAM_PASSWORD ?? '',
  obs: {
    url: process.env.OBS_WS_URL ?? 'ws://127.0.0.1:4455',
    password: process.env.OBS_WS_PASSWORD ?? '',
    autoConnect: envBool('OBS_AUTO_CONNECT', false),
    overlaySourceName: process.env.STREAMFORGE_OVERLAY_SOURCE ?? 'Overlay',
    overlayAutoSwitch: envBool('STREAMFORGE_OVERLAY_AUTOSWITCH', true),
    overlayBaseUrl:
      process.env.STREAMFORGE_OVERLAY_BASE_URL ??
      `http://localhost:${Number(process.env.PORT ?? 4500)}`,
  },
  firestore: {
    serviceAccountJson: process.env.FIRESTORE_SERVICE_ACCOUNT ?? '',
    serviceAccountPath:
      process.env.FIRESTORE_SERVICE_ACCOUNT_PATH ??
      process.env.GOOGLE_APPLICATION_CREDENTIALS ??
      '',
    projectId: process.env.FIRESTORE_PROJECT_ID ?? '',
    collections: {
      players: process.env.FIRESTORE_PLAYERS_COLLECTION ?? 'players',
      teams: process.env.FIRESTORE_TEAMS_COLLECTION ?? 'teams',
      matches: process.env.FIRESTORE_MATCHES_COLLECTION ?? 'matches',
    },
    refreshMs: clamp(Number(process.env.FIRESTORE_REFRESH_MS ?? 60_000), 0, 3_600_000),
  },
  preview: {
    fps: clamp(Number(process.env.STREAMFORGE_PREVIEW_FPS ?? 6), 1, 30),
    width: clamp(Number(process.env.STREAMFORGE_PREVIEW_WIDTH ?? 480), 160, 1920),
    quality: clamp(Number(process.env.STREAMFORGE_PREVIEW_QUALITY ?? 50), 1, 100),
  },
};

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Absolute path helper for files inside the data directory. */
export function dataPath(...segments: string[]): string {
  return path.join(config.dataDir, ...segments);
}

export const HOME = os.homedir();
