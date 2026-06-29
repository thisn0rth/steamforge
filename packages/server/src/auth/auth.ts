import type { IncomingMessage } from 'node:http';
import type { Request } from 'express';
import { nanoid } from 'nanoid';
import type { SessionUser } from '@streamforge/shared';
import { config } from '../config.js';

/** Palette assigned round-robin to operators who don't pick a color. */
const PALETTE = ['#6c7bff', '#39d3c3', '#ff4d6d', '#f7b955', '#a78bfa', '#4ade80'];
let paletteCursor = 0;

/** token -> user, in-memory (sessions reset on server restart). */
const sessions = new Map<string, SessionUser>();

export function authEnabled(): boolean {
  return config.teamPassword.trim() !== '';
}

export function checkPassword(password: string): boolean {
  return authEnabled() && password === config.teamPassword;
}

function nextColor(): string {
  const c = PALETTE[paletteCursor % PALETTE.length];
  paletteCursor += 1;
  return c;
}

/** Mint a session for a remote operator who provided the team password. */
export function issueSession(name: string, color?: string): { token: string; user: SessionUser } {
  const user: SessionUser = {
    id: nanoid(8),
    name: cleanName(name),
    color: color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : nextColor(),
    host: false,
  };
  const token = nanoid(32);
  sessions.set(token, user);
  return { token, user };
}

export function userForToken(token: string | undefined | null): SessionUser | undefined {
  if (!token) return undefined;
  return sessions.get(token);
}

export function revokeToken(token: string | undefined | null): void {
  if (token) sessions.delete(token);
}

export function cleanName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim().slice(0, 32) : '';
  return n || 'Operator';
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopback(req: IncomingMessage | Request): boolean {
  const addr = req.socket?.remoteAddress ?? '';
  return LOOPBACK.has(addr);
}

export function bearerToken(req: IncomingMessage | Request): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  return undefined;
}

/** Default identity for trusted production-host (loopback) clients. */
export function hostUser(name?: unknown, color?: unknown): SessionUser {
  return {
    id: 'host',
    name: typeof name === 'string' && name.trim() ? cleanName(name) : 'Host',
    color: typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#6c7bff',
    host: true,
  };
}

/**
 * Resolve the acting user for an HTTP request: a valid token wins, otherwise
 * loopback clients are trusted as the host (optionally named via headers).
 */
export function userFromRequest(req: Request): SessionUser | null {
  // Bearer header wins; fall back to a `?token=` query param so plain media
  // elements (e.g. <video src>) that can't set headers can still authenticate.
  const queryToken =
    typeof req.query?.token === 'string' ? (req.query.token as string) : undefined;
  const tokenUser = userForToken(bearerToken(req) ?? queryToken);
  if (tokenUser) return tokenUser;
  if (isLoopback(req) || !authEnabled()) {
    return hostUser(req.headers['x-sf-name'], req.headers['x-sf-color']);
  }
  return null;
}
