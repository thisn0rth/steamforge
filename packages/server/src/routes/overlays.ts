import { Router } from 'express';
import { nanoid } from 'nanoid';
import type { Overlay } from '@streamforge/shared';
import { store } from '../store/store.js';
import { wsHub } from '../realtime/wsHub.js';
import { createBlankOverlay } from '../overlays/defaults.js';

export const overlaysRouter = Router();

overlaysRouter.get('/api/overlays', (_req, res) => {
  res.json(store.overlays.all().sort((a, b) => b.updatedAt - a.updatedAt));
});

overlaysRouter.get('/api/overlays/:id', (req, res) => {
  const overlay = store.overlays.get(req.params.id);
  if (!overlay) {
    res.status(404).json({ error: 'overlay not found' });
    return;
  }
  res.json(overlay);
});

overlaysRouter.post('/api/overlays', (req, res) => {
  const name = req.body?.name ?? 'Untitled Overlay';
  const overlay = createBlankOverlay(nanoid(10), name);
  if (req.body?.composition) {
    overlay.composition = { ...overlay.composition, ...req.body.composition };
  }
  store.overlays.upsert(overlay);
  res.status(201).json(overlay);
});

overlaysRouter.put('/api/overlays/:id', (req, res) => {
  const existing = store.overlays.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'overlay not found' });
    return;
  }
  const updated: Overlay = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  store.overlays.upsert(updated);
  wsHub.broadcast({ type: 'overlayUpdated', overlay: updated });
  res.json(updated);
});

overlaysRouter.delete('/api/overlays/:id', (req, res) => {
  const ok = store.overlays.remove(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'overlay not found' });
    return;
  }
  res.status(204).end();
});
