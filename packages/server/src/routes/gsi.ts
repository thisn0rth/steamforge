import { Router } from 'express';
import type { GsiPayload } from '@streamforge/shared';
import { gsiService } from '../gsi/gsiService.js';
import { config } from '../config.js';

export const gsiRouter = Router();

/**
 * CS2 GSI endpoint. The game POSTs JSON here at a high rate. We optionally
 * verify the shared token CS2 includes under `auth.token`.
 */
gsiRouter.post('/gsi', (req, res) => {
  const payload = req.body as GsiPayload;

  if (config.gsiAuthToken) {
    const token = payload?.auth?.token;
    if (token !== config.gsiAuthToken) {
      res.status(403).json({ error: 'invalid gsi token' });
      return;
    }
  }

  gsiService.ingest(payload);
  res.status(200).end();
});

/** Read endpoints for the control UI (also pushed over WS). */
gsiRouter.get('/api/gsi/status', (_req, res) => {
  res.json(gsiService.status());
});

gsiRouter.get('/api/gsi/current', (_req, res) => {
  res.json(gsiService.current());
});

/**
 * Generates the `gamestate_integration_streamforge.cfg` the user drops into
 * their CS2 `csgo/cfg` folder. Pre-fills the host/port/token in use.
 */
gsiRouter.get('/api/gsi/config', (req, res) => {
  const host = req.query.host ? String(req.query.host) : config.host;
  const uri = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${config.port}/gsi`;
  const tokenLine = config.gsiAuthToken
    ? `\n  "auth"\n  {\n    "token" "${config.gsiAuthToken}"\n  }`
    : '';
  const cfg = `"StreamForge GSI"
{
  "uri" "${uri}"
  "timeout" "5.0"
  "buffer" "0.1"
  "throttle" "0.1"
  "heartbeat" "10.0"${tokenLine}
  "data"
  {
    "provider"            "1"
    "map"                 "1"
    "round"               "1"
    "player_id"           "1"
    "player_state"        "1"
    "player_weapons"      "1"
    "player_match_stats"  "1"
    "allplayers_id"       "1"
    "allplayers_state"    "1"
    "allplayers_match_stats" "1"
    "allplayers_weapons"  "1"
    "bomb"                "1"
    "phase_countdowns"    "1"
  }
}
`;
  res.type('text/plain').send(cfg);
});
