import { Router } from 'express';
import type { OutputChannel, OutputState } from '@streamforge/shared';
import { outputStore } from '../output/outputStore.js';
import { store } from '../store/store.js';
import { wsHub } from '../realtime/wsHub.js';
import { userFromRequest } from '../auth/auth.js';

export const outputRouter = Router();

const CHANNELS: OutputChannel[] = ['program', 'preview'];

function isChannel(value: string): value is OutputChannel {
  return CHANNELS.includes(value as OutputChannel);
}

function publish(state: OutputState): void {
  wsHub.broadcast({ type: 'output', output: state });
}

function logOutput(req: Parameters<typeof userFromRequest>[0], message: string): void {
  const user = userFromRequest(req);
  if (user) wsHub.logActivity(user, 'outputChanged', message);
}

function overlayName(id: string): string {
  return store.overlays.get(id)?.name ?? id;
}

outputRouter.get('/api/output', (_req, res) => {
  res.json(outputStore.get());
});

outputRouter.put('/api/output', (req, res) => {
  const body = (req.body ?? {}) as Partial<OutputState>;
  const state = outputStore.replace(body);
  publish(state);
  res.json(state);
});

outputRouter.post('/api/output/:channel/:overlayId', (req, res) => {
  const { channel, overlayId } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: 'invalid channel' });
    return;
  }
  if (!store.overlays.get(overlayId)) {
    res.status(404).json({ error: 'overlay not found' });
    return;
  }
  // ?toggle=1 flips presence; otherwise add to the stack.
  const state =
    req.query.toggle === '1'
      ? outputStore.toggle(channel, overlayId)
      : outputStore.add(channel, overlayId);
  publish(state);
  logOutput(req, `set ${overlayName(overlayId)} on ${channel}`);
  res.json(state);
});

outputRouter.delete('/api/output/:channel/:overlayId', (req, res) => {
  const { channel, overlayId } = req.params;
  if (!isChannel(channel)) {
    res.status(400).json({ error: 'invalid channel' });
    return;
  }
  const state = outputStore.remove(channel, overlayId);
  publish(state);
  res.json(state);
});

outputRouter.post('/api/output/take', (req, res) => {
  const state = outputStore.take();
  publish(state);
  logOutput(req, 'took preview to live');
  res.json(state);
});

outputRouter.post('/api/output/clear', (req, res) => {
  const channel = (req.query.channel as string) ?? 'all';
  if (channel !== 'all' && !isChannel(channel)) {
    res.status(400).json({ error: 'invalid channel' });
    return;
  }
  const state = outputStore.clear(channel as OutputChannel | 'all');
  publish(state);
  res.json(state);
});
