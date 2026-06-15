import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { wsHub } from './realtime/wsHub.js';
import { gsiService } from './gsi/gsiService.js';
import { obsService } from './obs/obsService.js';

const app = createApp();
const server = http.createServer(app);

wsHub.attach(server);

// Fan out service events to all connected control UIs and overlay pages.
gsiService.on('payload', (payload) => wsHub.broadcast({ type: 'gsi', payload }));
gsiService.on('status', (status) => wsHub.broadcast({ type: 'gsiStatus', status }));
obsService.on('state', (state) => wsHub.broadcast({ type: 'obsState', state }));

server.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(
    `\n  StreamForge server\n  ▸ control UI / API : http://${config.host}:${config.port}\n  ▸ CS2 GSI endpoint : http://${config.host}:${config.port}/gsi\n  ▸ OBS websocket    : ${config.obs.url} (autoConnect=${config.obs.autoConnect})\n`,
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
