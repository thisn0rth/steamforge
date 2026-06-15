import { Router } from 'express';
import { obsService } from '../obs/obsService.js';

export const obsRouter = Router();

obsRouter.get('/api/obs/state', (_req, res) => {
  res.json(obsService.state());
});

obsRouter.post('/api/obs/connect', async (req, res) => {
  const { url, password } = req.body ?? {};
  try {
    await obsService.connect(url, password);
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err), state: obsService.state() });
  }
});

obsRouter.post('/api/obs/disconnect', async (_req, res) => {
  await obsService.disconnect();
  res.json(obsService.state());
});

obsRouter.post('/api/obs/refresh', async (_req, res) => {
  try {
    await obsService.refresh();
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err) });
  }
});

obsRouter.post('/api/obs/scene', async (req, res) => {
  const { sceneName, preview } = req.body ?? {};
  if (!sceneName) {
    res.status(400).json({ error: 'sceneName required' });
    return;
  }
  try {
    if (preview) {
      await obsService.setPreviewScene(sceneName);
    } else {
      await obsService.setProgramScene(sceneName);
    }
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err) });
  }
});

obsRouter.post('/api/obs/source', async (req, res) => {
  const { sceneName, sourceName, enabled } = req.body ?? {};
  if (!sceneName || !sourceName || typeof enabled !== 'boolean') {
    res.status(400).json({ error: 'sceneName, sourceName, enabled required' });
    return;
  }
  try {
    await obsService.setSourceEnabled(sceneName, sourceName, enabled);
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err) });
  }
});

obsRouter.post('/api/obs/transition', async (req, res) => {
  const { transitionName, trigger } = req.body ?? {};
  try {
    if (transitionName) await obsService.setCurrentTransition(transitionName);
    if (trigger) await obsService.triggerTransition();
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err) });
  }
});

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
