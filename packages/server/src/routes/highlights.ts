import { Router } from 'express';
import { highlightService } from '../highlights/highlightService.js';
import type { MontageCut } from '../highlights/montage.js';
import { userFromRequest } from '../auth/auth.js';

export const highlightsRouter = Router();

highlightsRouter.get('/api/highlights', (_req, res) => {
  res.json(highlightService.snapshot());
});

highlightsRouter.put('/api/highlights/settings', (req, res) => {
  const { preRollMs, postRollMs, mergeGapMs, autoSaveReplayOnKill } = req.body ?? {};
  res.json(
    highlightService.updateSettings({
      preRollMs,
      postRollMs,
      mergeGapMs,
      autoSaveReplayOnKill,
    }),
  );
});

highlightsRouter.post('/api/highlights/recheck-ffmpeg', (_req, res) => {
  res.json({ ffmpegAvailable: highlightService.recheckFfmpeg() });
});

highlightsRouter.delete('/api/highlights/kills/:id', (req, res) => {
  const ok = highlightService.removeKill(req.params.id);
  res.status(ok ? 204 : 404).end();
});

highlightsRouter.post('/api/highlights/kills/clear', (req, res) => {
  const recordingId =
    typeof req.body?.recordingId === 'string' ? req.body.recordingId : undefined;
  highlightService.clearKills(recordingId);
  res.json({ ok: true });
});

highlightsRouter.post('/api/highlights/montage', async (req, res) => {
  const user = userFromRequest(req);
  const recordingId = String(req.body?.recordingId ?? '');
  const name = typeof req.body?.name === 'string' ? req.body.name : null;
  const rawClips = Array.isArray(req.body?.clips) ? req.body.clips : [];
  const clips: MontageCut[] = rawClips
    .map((c: { inMs?: unknown; outMs?: unknown }) => ({
      inMs: Number(c.inMs),
      outMs: Number(c.outMs),
    }))
    .filter((c: MontageCut) => Number.isFinite(c.inMs) && Number.isFinite(c.outMs));

  if (!recordingId) {
    res.status(400).json({ error: 'recordingId is required' });
    return;
  }
  try {
    const result = await highlightService.generateMontage(
      recordingId,
      clips,
      name,
      user?.name ?? null,
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
