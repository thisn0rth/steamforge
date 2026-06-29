import { Router } from 'express';
import { nanoid } from 'nanoid';
import type { OverlayAssignments, Rig } from '@streamforge/shared';
import { store } from '../store/store.js';
import { applyRig } from '../rigs/rigEngine.js';
import { wsHub } from '../realtime/wsHub.js';
import { userFromRequest } from '../auth/auth.js';

export const rigsRouter = Router();

rigsRouter.get('/api/rigs', (_req, res) => {
  res.json(store.rigs.all().sort((a, b) => a.order - b.order));
});

rigsRouter.post('/api/rigs', (req, res) => {
  const now = Date.now();
  const body = req.body ?? {};
  const rig: Rig = {
    id: nanoid(10),
    name: body.name ?? 'New Rig',
    description: body.description ?? '',
    color: body.color ?? '#6c5ce7',
    targetScene: body.targetScene ?? '',
    transitionId: body.transitionId ?? null,
    sources: Array.isArray(body.sources) ? body.sources : [],
    overlays: Array.isArray(body.overlays) ? body.overlays : [],
    order: typeof body.order === 'number' ? body.order : store.rigs.all().length,
    createdAt: now,
    updatedAt: now,
  };
  store.rigs.upsert(rig);
  broadcastRigs();
  res.status(201).json(rig);
});

rigsRouter.put('/api/rigs/:id', (req, res) => {
  const existing = store.rigs.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'rig not found' });
    return;
  }
  const updated: Rig = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  store.rigs.upsert(updated);
  broadcastRigs();
  res.json(updated);
});

rigsRouter.delete('/api/rigs/:id', (req, res) => {
  const ok = store.rigs.remove(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'rig not found' });
    return;
  }
  broadcastRigs();
  res.status(204).end();
});

/** The marquee action: switch the whole production to a rig in one call. */
rigsRouter.post('/api/rigs/:id/activate', async (req, res) => {
  const rig = store.rigs.get(req.params.id);
  if (!rig) {
    res.status(404).json({ error: 'rig not found' });
    return;
  }
  // Per-overlay focus chosen at stage time (the data-binding popup).
  const assignments = (req.body?.assignments ?? {}) as Record<string, OverlayAssignments>;
  const result = await applyRig(rig, assignments);
  wsHub.broadcast({ type: 'rigActivated', rigId: rig.id });
  const user = userFromRequest(req);
  if (user) {
    wsHub.logActivity(user, 'rigActivated', `went live with ${rig.name}`);
  }
  res.json(result);
});

function broadcastRigs(): void {
  wsHub.broadcast({
    type: 'rigsUpdated',
    rigs: store.rigs.all().sort((a, b) => a.order - b.order),
  });
}
