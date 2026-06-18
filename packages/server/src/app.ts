import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gsiRouter } from './routes/gsi.js';
import { obsRouter } from './routes/obs.js';
import { rigsRouter } from './routes/rigs.js';
import { overlaysRouter } from './routes/overlays.js';
import { transitionsRouter } from './routes/transitions.js';
import { replaysRouter } from './routes/replays.js';
import { authRouter } from './routes/auth.js';
import { requireAuth } from './auth/middleware.js';
import { dataPath } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(): express.Express {
  const app = express();

  app.use(cors());
  // CS2 GSI payloads can be sizeable when allplayers is enabled.
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'streamforge', time: Date.now() });
  });

  // Auth endpoints are public; the GSI ingest uses its own token. Everything
  // else under /api requires a session (loopback host is always trusted).
  app.use(authRouter);
  // POST /gsi (CS2 ingest) lives outside /api and keeps its own token, so it is
  // unaffected by the team-auth guard mounted below.
  app.use('/api', requireAuth);
  app.use(gsiRouter);
  app.use(obsRouter);
  app.use(rigsRouter);
  app.use(overlaysRouter);
  app.use(transitionsRouter);
  app.use(replaysRouter);

  // Saved replay clips are served as static media for the UI and OBS.
  const replaysDir = dataPath('replays');
  fs.mkdirSync(replaysDir, { recursive: true });
  app.use('/replays', express.static(replaysDir));

  // In production, serve the built client (control UI + overlay renderer).
  // dist layout: packages/server/dist/app.js -> ../../client/dist
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback for client-side routes (e.g. /overlay/:id, /editor/:id).
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path === '/gsi') return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  return app;
}
