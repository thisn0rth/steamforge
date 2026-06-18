import { Router } from 'express';
import { replayService } from '../replays/replayService.js';
import { userFromRequest } from '../auth/auth.js';

export const replaysRouter = Router();

replaysRouter.get('/api/replays', (_req, res) => {
  res.json(replayService.snapshot());
});

replaysRouter.post('/api/replays/save', async (req, res) => {
  const user = userFromRequest(req);
  try {
    await replayService.requestSave(user?.name ?? null);
    res.status(202).json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: errMsg(err) });
  }
});

replaysRouter.post('/api/replays/buffer/start', async (_req, res) => {
  try {
    await replayService.startBuffer();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ error: errMsg(err) });
  }
});

replaysRouter.put('/api/replays/settings', (req, res) => {
  const { playerSource, autoLoad } = req.body ?? {};
  res.json(replayService.updateSettings({ playerSource, autoLoad }));
});

replaysRouter.post('/api/replays/:id/load', async (req, res) => {
  try {
    const replay = await replayService.load(req.params.id);
    res.json(replay);
  } catch (err) {
    res.status(400).json({ error: errMsg(err) });
  }
});

replaysRouter.delete('/api/replays/:id', (req, res) => {
  const ok = replayService.remove(req.params.id);
  res.status(ok ? 204 : 404).end();
});

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
