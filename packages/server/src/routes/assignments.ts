import { Router } from 'express';
import type { OverlayAssignments } from '@streamforge/shared';
import { store, assignmentsMap } from '../store/store.js';
import { wsHub } from '../realtime/wsHub.js';

export const assignmentsRouter = Router();

assignmentsRouter.get('/api/assignments', (_req, res) => {
  res.json(assignmentsMap());
});

assignmentsRouter.put('/api/overlays/:id/assignments', (req, res) => {
  const overlay = store.overlays.get(req.params.id);
  if (!overlay) {
    res.status(404).json({ error: 'overlay not found' });
    return;
  }
  const assignments = (req.body?.assignments ?? {}) as OverlayAssignments;
  store.assignments.upsert({ id: overlay.id, assignments });
  wsHub.broadcast({ type: 'assignments', assignments: assignmentsMap() });
  res.json({ ok: true });
});
