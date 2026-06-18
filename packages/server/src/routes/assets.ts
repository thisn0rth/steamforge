import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import type { Asset } from '@streamforge/shared';
import { store } from '../store/store.js';
import { wsHub } from '../realtime/wsHub.js';
import { dataPath } from '../config.js';
import { userFromRequest } from '../auth/auth.js';

export const assetsDir = dataPath('assets');
fs.mkdirSync(assetsDir, { recursive: true });

const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
]);

const EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB — plenty for VFX PNGs/SVGs.
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

export const assetsRouter = Router();

function broadcastAssets(): void {
  wsHub.broadcast({ type: 'assets', assets: listAssets() });
}

function listAssets(): Asset[] {
  return store.assets.all().sort((a, b) => b.createdAt - a.createdAt);
}

assetsRouter.get('/api/assets', (_req, res) => {
  res.json(listAssets());
});

assetsRouter.post('/api/assets', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No image file (expected a supported image type ≤ 25 MB)' });
    return;
  }
  const id = nanoid(10);
  const ext = EXT[file.mimetype] ?? path.extname(file.originalname) ?? '';
  const fileName = `${id}${ext}`;
  fs.writeFileSync(path.join(assetsDir, fileName), file.buffer);

  const asset: Asset = {
    id,
    name: file.originalname || fileName,
    url: `/assets/${fileName}`,
    mime: file.mimetype,
    sizeBytes: file.size,
    createdAt: Date.now(),
  };
  store.assets.upsert(asset);
  broadcastAssets();

  const user = userFromRequest(req);
  if (user) wsHub.logActivity(user, 'assetUploaded', `uploaded ${asset.name}`);
  res.status(201).json(asset);
});

assetsRouter.delete('/api/assets/:id', (req, res) => {
  const asset = store.assets.get(req.params.id);
  if (!asset) {
    res.status(404).json({ error: 'asset not found' });
    return;
  }
  try {
    fs.unlinkSync(path.join(assetsDir, path.basename(asset.url)));
  } catch {
    // file may already be gone; drop the record regardless
  }
  store.assets.remove(asset.id);
  broadcastAssets();
  res.status(204).end();
});
