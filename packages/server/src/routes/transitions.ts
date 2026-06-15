import { Router } from 'express';
import { nanoid } from 'nanoid';
import type { Transition } from '@streamforge/shared';
import { store } from '../store/store.js';

export const transitionsRouter = Router();

transitionsRouter.get('/api/transitions', (_req, res) => {
  res.json(store.transitions.all());
});

transitionsRouter.post('/api/transitions', (req, res) => {
  const now = Date.now();
  const body = req.body ?? {};
  const transition: Transition = {
    id: nanoid(10),
    name: body.name ?? 'New Transition',
    kind: body.kind ?? 'fade',
    duration: typeof body.duration === 'number' ? body.duration : 300,
    stingerSource: body.stingerSource,
    direction: body.direction,
    createdAt: now,
    updatedAt: now,
  };
  store.transitions.upsert(transition);
  res.status(201).json(transition);
});

transitionsRouter.put('/api/transitions/:id', (req, res) => {
  const existing = store.transitions.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'transition not found' });
    return;
  }
  const updated: Transition = {
    ...existing,
    ...req.body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };
  store.transitions.upsert(updated);
  res.json(updated);
});

transitionsRouter.delete('/api/transitions/:id', (req, res) => {
  const ok = store.transitions.remove(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'transition not found' });
    return;
  }
  res.status(204).end();
});
