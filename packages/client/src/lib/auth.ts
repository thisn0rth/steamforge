import type { SessionUser } from '@streamforge/shared';

/**
 * Client-side session storage. The token (if any) authorizes API + WebSocket
 * access; the display name/color identify the operator to teammates.
 */
const TOKEN_KEY = 'sf.token';
const NAME_KEY = 'sf.name';
const COLOR_KEY = 'sf.color';

const PALETTE = ['#6c7bff', '#39d3c3', '#ff4d6d', '#f7b955', '#a78bfa', '#4ade80'];

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getName(): string {
  return localStorage.getItem(NAME_KEY) ?? '';
}

export function getColor(): string {
  let c = localStorage.getItem(COLOR_KEY);
  if (!c) {
    c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    localStorage.setItem(COLOR_KEY, c);
  }
  return c;
}

export function setSession(opts: { token?: string | null; name?: string; color?: string }): void {
  if (opts.token !== undefined) {
    if (opts.token) localStorage.setItem(TOKEN_KEY, opts.token);
    else localStorage.removeItem(TOKEN_KEY);
  }
  if (opts.name !== undefined) localStorage.setItem(NAME_KEY, opts.name);
  if (opts.color !== undefined) localStorage.setItem(COLOR_KEY, opts.color);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function storedUser(): Pick<SessionUser, 'name' | 'color'> {
  return { name: getName(), color: getColor() };
}
