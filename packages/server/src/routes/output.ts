import { Router } from 'express';
import type { OutputChannel, OutputState, OverlayAssignments } from '@streamforge/shared';
import { outputStore } from '../output/outputStore.js';
import { store } from '../store/store.js';
import { wsHub } from '../realtime/wsHub.js';
import { obsService } from '../obs/obsService.js';
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
  // Focus assignments are chosen at push time (per instance).
  const assignments = (req.body?.assignments ?? {}) as OverlayAssignments;
  const state = outputStore.add(channel, overlayId, assignments);
  publish(state);
  // Single shared "Overlay" source follows the most recent action's channel.
  void obsService.setOverlayChannel(channel);
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
  // One TAKE commits both: the staged OBS scene (Studio Mode transition) and
  // the overlay output, then points the shared "Overlay" source at /live.
  void obsService.triggerTransition();
  void obsService.setOverlayChannel('program');
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
