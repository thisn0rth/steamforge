import { useEffect, useState } from 'react';
import { Cable, CheckCircle2, Download, Plug, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';

export function SettingsPage() {
  const obs = useStore((s) => s.obs);
  const refreshObs = useStore((s) => s.refreshObs);
  const [url, setUrl] = useState('ws://127.0.0.1:4455');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshObs();
  }, [refreshObs]);

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
