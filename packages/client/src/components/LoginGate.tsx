import { useEffect, useState, type ReactNode } from 'react';
import { Radio, LogIn } from 'lucide-react';
import { api } from '@/lib/api';
import { getColor, getName, getToken, setSession } from '@/lib/auth';

const PALETTE = ['#6c7bff', '#39d3c3', '#ff4d6d', '#f7b955', '#a78bfa', '#4ade80'];

type Phase = 'checking' | 'login' | 'ready';

/**
 * Gates the control UI behind the shared team password when the server requires
 * it. The production host (loopback) is trusted and passes straight through.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [name, setName] = useState(getName());
  const [color, setColor] = useState(getColor());
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { authRequired } = await api.authConfig();
        if (cancelled) return;
        if (!authRequired) {
          setPhase('ready');
          return;
        }
        // Auth required, but the server still trusts the production host
        // (loopback) and valid tokens. Probe /api/auth/me: if it resolves we're
        // already authorized (host or returning operator) and skip the form.
        try {
          await api.me();
          if (!cancelled) setPhase('ready');
          return;
        } catch {
          if (getToken()) setSession({ token: null });
        }
        if (!cancelled) setPhase('login');
      } catch {
        // If we can't reach the server, let the app render and surface its own
        // connection state rather than trapping the user on a blank gate.
        if (!cancelled) setPhase('ready');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const trimmed = name.trim() || 'Operator';
      const { token, user } = await api.login(password, trimmed, color);
      setSession({ token, name: user.name, color: user.color });
      setPhase('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, '') : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-900 text-text-muted">
        <span className="text-sm">Connecting to StreamForge…</span>
      </div>
    );
  }

  if (phase === 'login') {
    return (
      <div className="flex h-screen items-center justify-center bg-ink-900 text-text">
        <form
          onSubmit={submit}
          className="w-[360px] rounded-2xl border border-ink-600 bg-ink-850 p-7 shadow-xl"
        >
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white shadow-glow">
              <Radio size={18} />
            </div>
            <div className="leading-tight">
              <div className="text-base font-extrabold tracking-tight">StreamForge</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
                team sign-in
              </div>
            </div>
          </div>

          <label className="mb-1 block text-xs font-medium text-text-muted">Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Alex"
            autoFocus
            className="mb-4 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <label className="mb-1.5 block text-xs font-medium text-text-muted">Your color</label>
          <div className="mb-4 flex gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`color ${c}`}
                className="h-7 w-7 rounded-full transition-transform"
                style={{
                  background: c,
                  outline: color === c ? '2px solid white' : 'none',
                  outlineOffset: 2,
                  transform: color === c ? 'scale(1.1)' : 'none',
                }}
              />
            ))}
          </div>

          <label className="mb-1 block text-xs font-medium text-text-muted">Team password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-4 w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm outline-none focus:border-accent"
          />

          {error && (
            <div className="mb-3 rounded-md border border-live/40 bg-live/10 px-3 py-2 text-xs text-live">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <LogIn size={16} />
            {busy ? 'Signing in…' : 'Enter control room'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
