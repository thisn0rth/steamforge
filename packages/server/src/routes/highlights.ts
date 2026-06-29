import fs from 'node:fs';
import { Router } from 'express';
import { highlightService } from '../highlights/highlightService.js';
import type { MontageCut } from '../highlights/montage.js';
import { userFromRequest } from '../auth/auth.js';

export const highlightsRouter = Router();

highlightsRouter.get('/api/highlights', (_req, res) => {
  res.json(highlightService.snapshot());
});

highlightsRouter.put('/api/highlights/settings', (req, res) => {
  const {
    preRollMs,
    postRollMs,
    mergeGapMs,
    transitionMs,
    autoRecordRounds,
    roundPostRollMs,
    autoSaveReplayOnKill,
  } = req.body ?? {};
  res.json(
    highlightService.updateSettings({
      preRollMs,
      postRollMs,
      mergeGapMs,
      transitionMs,
      autoRecordRounds,
      roundPostRollMs,
      autoSaveReplayOnKill,
    }),
  );
});

// Stream a recording's footage to the clip-editor <video> (with HTTP range
// support so the timeline can scrub). Non-MP4 recordings are remuxed on demand.
highlightsRouter.get('/api/highlights/recordings/:id/video', async (req, res) => {
  let file: { path: string; contentType: string } | null;
  try {
    file = await highlightService.previewVideo(req.params.id);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  if (!file) {
    res.status(404).json({ error: 'No playable footage for this recording yet.' });
    return;
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file.path);
  } catch {
    res.status(404).json({ error: 'Recording file is unavailable.' });
    return;
  }

  const total = stat.size;
  const range = req.headers.range;
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : total - 1;
    if (start >= total || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`).end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(file.path, { start, end }).pipe(res);
    return;
  }

  res.setHeader('Content-Length', total);
  fs.createReadStream(file.path).pipe(res);
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
