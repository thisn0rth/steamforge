import type { NextFunction, Request, Response } from 'express';
import { authEnabled, userFromRequest } from './auth.js';

/** Endpoints reachable without a session (login, status, health, GSI ingest). */
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/config', '/api/auth/login']);

/**
 * Guards the control API. Loopback (production host) and valid team tokens pass;
 * everyone else gets 401. When no team password is configured, auth is a no-op.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled()) {
    next();
    return;
  }
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }
  next();
}
