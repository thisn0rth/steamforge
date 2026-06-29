import { useMemo, useState } from 'react';
import { MonitorPlay, RefreshCw, Cable, Search } from 'lucide-react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

export function SceneSwitcher() {
  const obs = useStore((s) => s.obs);
  const refreshObs = useStore((s) => s.refreshObs);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const studio = obs.studioModeEnabled;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return obs.scenes;
    return obs.scenes.filter((s) => s.name.toLowerCase().includes(q));
  }, [obs.scenes, query]);

  async function pickScene(name: string) {
    setBusy(name);
    try {
      // In Studio Mode a click stages the scene in Preview; otherwise it cuts
      // straight to Program.
      await api.obsSetScene(name, studio);
      await refreshObs();
    } catch {
      // surfaced via OBS state error
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MonitorPlay size={16} className="text-accent" />
          Scenes
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-medium text-text-muted">
            {obs.scenes.length}
          </span>
          <span className="text-xs font-normal text-text-faint">
            {studio ? 'click to preview' : 'click to cut live'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {obs.connected && (
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search scenes…"
                className="input w-40 py-1.5 pl-7 pr-2 text-xs"
              />
            </div>
          )}
          <button
            className="text-text-faint transition hover:text-text"
            onClick={() => void refreshObs()}
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {!obs.connected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <Cable size={26} className="text-text-faint" />
          <p className="text-sm text-text-muted">OBS not connected.</p>
          <Link to="/settings" className="btn-ghost mt-1">
            Connect in Settings
          </Link>
        </div>
      ) : (
        <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((scene) => {
            const isProgram = scene.name === obs.currentProgramScene;
            const isPreview = studio && scene.name === obs.currentPreviewScene;
            return (
              <button
                key={scene.name}
                onClick={() => void pickScene(scene.name)}
                disabled={busy === scene.name}
                className={clsx(
                  'group relative flex h-20 flex-col justify-between rounded-lg border p-3 text-left transition',
                  isProgram
                    ? 'border-live/60 bg-live/10'
                    : isPreview
                      ? 'border-preview/60 bg-preview/10'
                      : 'border-ink-600 bg-ink-750 hover:border-accent/50 hover:bg-ink-700',
                )}
              >
                <span className="truncate text-sm font-medium">{scene.name}</span>
                <span className="flex items-center justify-between text-[10px] uppercase tracking-wide text-text-faint">
                  <span>{scene.items.length} src</span>
                  {isProgram && (
                    <span className="flex items-center gap-1 font-semibold text-live">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" />
                      live
                    </span>
                  )}
                  {isPreview && (
                    <span className="flex items-center gap-1 font-semibold text-preview">
                      <span className="h-1.5 w-1.5 rounded-full bg-preview" />
                      prev
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full py-6 text-center text-sm text-text-faint">
              {obs.scenes.length === 0
                ? 'No scenes found in OBS.'
                : `No scenes match “${query}”.`}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
