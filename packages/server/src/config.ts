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
  /** Default OBS websocket connection. */
  obs: {
    url: string;
    password: string;
    autoConnect: boolean;
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
  obs: {
    url: process.env.OBS_WS_URL ?? 'ws://127.0.0.1:4455',
    password: process.env.OBS_WS_PASSWORD ?? '',
    autoConnect: envBool('OBS_AUTO_CONNECT', false),
  },
};

/** Absolute path helper for files inside the data directory. */
export function dataPath(...segments: string[]): string {
  return path.join(config.dataDir, ...segments);
}

export const HOME = os.homedir();
