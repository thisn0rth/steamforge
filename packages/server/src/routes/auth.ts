import { Router } from 'express';
import {
  authEnabled,
  bearerToken,
  checkPassword,
  cleanName,
  issueSession,
  revokeToken,
  userFromRequest,
} from '../auth/auth.js';

export const authRouter = Router();

/** Public: tells the client whether a team password gate is in effect. */
authRouter.get('/api/auth/config', (_req, res) => {
  res.json({ authRequired: authEnabled() });
});

/** Public: exchange the shared team password for a session token. */
authRouter.post('/api/auth/login', (req, res) => {
  const { password, name, color } = req.body ?? {};
  if (!authEnabled()) {
    res.status(400).json({ error: 'team auth is not enabled on this server' });
    return;
  }
  if (!checkPassword(typeof password === 'string' ? password : '')) {
    res.status(401).json({ error: 'incorrect team password' });
    return;
  }
  const { token, user } = issueSession(cleanName(name), color);
  res.json({ token, user });
});

/** Who am I (token or trusted loopback host). */
authRouter.get('/api/auth/me', (req, res) => {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'authentication required' });
    return;
  }
  res.json({ user });
});

authRouter.post('/api/auth/logout', (req, res) => {
  revokeToken(bearerToken(req));
  res.status(204).end();
});
