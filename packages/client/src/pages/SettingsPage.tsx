import { useEffect, useState } from 'react';
import { Cable, CheckCircle2, Download, LogOut, Plug, UserRound, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { clearSession, getColor, getName, getToken } from '@/lib/auth';

const PALETTE = ['#6c7bff', '#39d3c3', '#ff4d6d', '#f7b955', '#a78bfa', '#4ade80'];

export function SettingsPage() {
  const obs = useStore((s) => s.obs);
  const refreshObs = useStore((s) => s.refreshObs);
  const setIdentity = useStore((s) => s.setIdentity);
  const [name, setName] = useState(getName());
  const [color, setColor] = useState(getColor());
  const [savedAt, setSavedAt] = useState(0);

  function saveIdentity() {
    setIdentity(name.trim() || 'Operator', color);
    setSavedAt(Date.now());
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      // ignore network errors on logout
    }
    clearSession();
    location.reload();
  }
  const [url, setUrl] = useState('ws://127.0.0.1:4455');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayName, setOverlayName] = useState(obs.overlaySource.name);
  const [overlaySaved, setOverlaySaved] = useState(false);

  useEffect(() => {
    void refreshObs();
  }, [refreshObs]);

  // Keep the editable name in sync when server state arrives.
  useEffect(() => {
    setOverlayName(obs.overlaySource.name);
  }, [obs.overlaySource.name]);

  async function saveOverlaySource(patch: { name?: string; autoSwitch?: boolean }) {
    await api.obsSetOverlaySource(patch);
    await refreshObs();
    setOverlaySaved(true);
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api.obsConnect(url, password);
      await refreshObs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.obsDisconnect();
      await refreshObs();
    } finally {
      setBusy(false);
    }
  }

  const gsiEndpoint = `${location.origin}/gsi`;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Connect OBS and wire up Counter-Strike 2." />

      <div className="grid max-w-4xl grid-cols-1 gap-6 p-8">
        {/* Identity */}
        <section className="panel p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <UserRound size={16} className="text-accent" /> Your identity
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Display name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex h-[38px] items-center gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`color ${c}`}
                    className="h-6 w-6 rounded-full"
                    style={{
                      background: c,
                      outline: color === c ? '2px solid white' : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" onClick={saveIdentity}>
              Save identity
            </button>
            {savedAt > 0 && <span className="text-xs text-teal">Saved — teammates see it live.</span>}
            {getToken() && (
              <button className="btn-ghost ml-auto" onClick={() => void logout()}>
                <LogOut size={15} /> Sign out
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-text-faint">
            This name and color identify your actions to the rest of the team in presence and the
            activity feed.
          </p>
        </section>

        {/* OBS */}
        <section className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Cable size={16} className="text-accent" /> OBS WebSocket
            </h2>
            <span
              className={clsx(
                'chip',
                obs.connected ? 'border-teal/40 text-teal' : 'text-text-faint',
              )}
            >
              {obs.connected ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {obs.connected ? 'connected' : 'disconnected'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">WebSocket URL</label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="(from OBS → Tools → WebSocket Server Settings)"
              />
            </div>
          </div>

          {(error || obs.error) && (
            <p className="mt-3 text-xs text-live">{error ?? obs.error}</p>
          )}

          <div className="mt-4 flex items-center gap-2">
            {obs.connected ? (
              <button className="btn-ghost" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
            ) : (
              <button className="btn-primary" disabled={busy} onClick={() => void connect()}>
                <Plug size={15} /> {busy ? 'Connecting…' : 'Connect'}
              </button>
            )}
            {obs.connected && (
              <span className="text-xs text-text-faint">
                {obs.scenes.length} scenes · program: {obs.currentProgramScene ?? '—'}
              </span>
            )}
          </div>

          <p className="mt-4 text-xs text-text-faint">
            Enable the server in OBS under <b>Tools → WebSocket Server Settings</b> (default port
            4455), then paste the password here.
          </p>

          <div className="mt-5 border-t border-ink-600 pt-4">
            <h3 className="text-sm font-semibold">Overlay output source</h3>
            <p className="mt-1 text-xs text-text-faint">
              Add one Browser Source with this name and reuse it in every scene. StreamForge
              flips its URL between <code>/preview</code> and <code>/live</code> automatically.
            </p>
            <div className="mt-3 grid grid-cols-2 items-end gap-3">
              <div>
                <label className="label">Source name</label>
                <input
                  className="input"
                  value={overlayName}
                  onChange={(e) => {
                    setOverlayName(e.target.value);
                    setOverlaySaved(false);
                  }}
                />
              </div>
              <label className="flex h-[38px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={obs.overlaySource.autoSwitch}
                  onChange={(e) => void saveOverlaySource({ autoSwitch: e.target.checked })}
                />
                Auto-switch URL on push
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                className="btn-primary"
                onClick={() => void saveOverlaySource({ name: overlayName })}
              >
                Save source name
              </button>
              {overlaySaved && <span className="text-xs text-teal">Saved.</span>}
            </div>
          </div>
        </section>

        {/* CS2 GSI */}
        <section className="panel p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Download size={16} className="text-accent" /> Counter-Strike 2 GSI
          </h2>

          <ol className="space-y-3 text-sm text-text-muted">
            <li>
              <span className="font-medium text-text">1.</span> Download the config file:
              <a
                className="btn-primary ml-3 py-1.5"
                href={api.gsiConfigUrl()}
                download="gamestate_integration_streamforge.cfg"
              >
                <Download size={14} /> gamestate_integration_streamforge.cfg
              </a>
            </li>
            <li>
              <span className="font-medium text-text">2.</span> Place it in your CS2 config folder:
              <code className="mt-1 block rounded-md bg-ink-850 px-3 py-2 font-mono text-xs text-teal">
                …/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/cfg/
              </code>
            </li>
            <li>
              <span className="font-medium text-text">3.</span> Launch CS2. Live state will appear
              on the Control Surface. The game posts to:
              <code className="mt-1 block rounded-md bg-ink-850 px-3 py-2 font-mono text-xs text-teal">
                {gsiEndpoint}
              </code>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
