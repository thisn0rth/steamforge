import { Router } from 'express';
import { obsService } from '../obs/obsService.js';
import { wsHub } from '../realtime/wsHub.js';
import { userFromRequest } from '../auth/auth.js';

export const obsRouter = Router();

obsRouter.get('/api/obs/state', (_req, res) => {
  res.json(obsService.state());
});

obsRouter.post('/api/obs/connect', async (req, res) => {
  const { url, password } = req.body ?? {};
  try {
    await obsService.connect(url, password);
    const user = userFromRequest(req);
    if (user) wsHub.logActivity(user, 'obsConnection', 'connected OBS');
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err), state: obsService.state() });
  }
});

obsRouter.post('/api/obs/disconnect', async (req, res) => {
  await obsService.disconnect();
  const user = userFromRequest(req);
  if (user) wsHub.logActivity(user, 'obsConnection', 'disconnected OBS');
  res.json(obsService.state());
});

obsRouter.post('/api/obs/overlay-source', (req, res) => {
  const { name, autoSwitch } = req.body ?? {};
  if (name != null && typeof name !== 'string') {
    res.status(400).json({ error: 'name must be a string' });
    return;
  }
  if (autoSwitch != null && typeof autoSwitch !== 'boolean') {
    res.status(400).json({ error: 'autoSwitch must be a boolean' });
    return;
  }
  obsService.setOverlaySource({ name, autoSwitch });
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
      const user = userFromRequest(req);
      if (user) wsHub.logActivity(user, 'sceneSwitched', `switched to ${sceneName}`);
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

obsRouter.post('/api/obs/stream', async (req, res) => {
  try {
    const active = await obsService.toggleStream();
    const user = userFromRequest(req);
    if (user) {
      wsHub.logActivity(user, 'obsConnection', active ? 'started streaming' : 'stopped streaming');
    }
    res.json(obsService.state());
  } catch (err) {
    res.status(502).json({ error: errMsg(err) });
  }
});

obsRouter.post('/api/obs/record', async (req, res) => {
  try {
    const active = await obsService.toggleRecord();
    const user = userFromRequest(req);
    if (user) {
      wsHub.logActivity(user, 'obsConnection', active ? 'started recording' : 'stopped recording');
    }
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
