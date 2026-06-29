import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { wsHub } from './realtime/wsHub.js';
import { gsiService } from './gsi/gsiService.js';
import { obsService } from './obs/obsService.js';
import { replayService } from './replays/replayService.js';
import { highlightService } from './highlights/highlightService.js';
import { leagueService } from './league/leagueService.js';
import { outputStore } from './output/outputStore.js';
import { authEnabled } from './auth/auth.js';
import type { HighlightState, Replay, ReplaySettings } from '@streamforge/shared';

const app = createApp();
const server = http.createServer(app);

wsHub.attach(server);

// Fan out service events to all connected control UIs and overlay pages.
gsiService.on('payload', (payload) => wsHub.broadcast({ type: 'gsi', payload }));
gsiService.on('status', (status) => wsHub.broadcast({ type: 'gsiStatus', status }));
obsService.on('state', (state) => wsHub.broadcast({ type: 'obsState', state }));
obsService.on('frame', (frame) =>
  wsHub.broadcast({
    type: 'obsFrame',
    channel: frame.channel,
    dataUrl: frame.dataUrl,
    ts: frame.ts,
  }),
);

replayService.init();
// Seed the cached snapshot so freshly-connected clients get current replays.
{
  const snap = replayService.snapshot();
  wsHub.broadcast({ type: 'replays', replays: snap.replays, settings: snap.settings });
}
replayService.on('replays', (snapshot: { replays: Replay[]; settings: ReplaySettings }) =>
  wsHub.broadcast({ type: 'replays', replays: snapshot.replays, settings: snapshot.settings }),
);
// Seed the live output state so freshly-connected render pages are correct.
wsHub.broadcast({ type: 'output', output: outputStore.get() });

// Autonomous highlight/auto-clip system: tracks kills from GSI and renders
// montages from OBS recordings.
highlightService.init();
wsHub.broadcast({ type: 'highlights', state: highlightService.snapshot() });
highlightService.on('highlights', (state: HighlightState) =>
  wsHub.broadcast({ type: 'highlights', state }),
);
highlightService.on(
  'roundReady',
  (e: { recordingId: string; round: number | null }) =>
    wsHub.broadcast({ type: 'roundReplayReady', recordingId: e.recordingId, round: e.round }),
);

// League data (Firestore mirror). Inert when no credentials are configured.
leagueService.init();
leagueService.on('league', (league) => wsHub.broadcast({ type: 'league', league }));

replayService.on('saved', (replay: Replay) => {
  const who = replay.triggeredBy ?? 'OBS hotkey';
  wsHub.logActivity(
    { id: 'replay', name: who, color: '#9aa3b2', host: true },
    'replaySaved',
    `saved a replay (${replay.name})`,
  );
});

server.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `\n  StreamForge server\n  ▸ control UI / API : http://${config.host}:${config.port}\n  ▸ CS2 GSI endpoint : http://${config.host}:${config.port}/gsi\n  ▸ OBS websocket    : ${config.obs.url} (autoConnect=${config.obs.autoConnect})\n  ▸ team auth        : ${authEnabled() ? 'ON (remote operators need the team password)' : 'OFF (local only — set STREAMFORGE_TEAM_PASSWORD for remote access)'}\n`,
  );

  if (config.obs.autoConnect) {
    obsService.connect().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('  OBS auto-connect failed:', err instanceof Error ? err.message : err);
    });
  }
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
