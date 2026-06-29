import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff, Layers, Search } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

/** Live source visibility for the current program scene. */
export function ProgramSources() {
  const obs = useStore((s) => s.obs);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const scene = obs.scenes.find((s) => s.name === obs.currentProgramScene);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = scene?.items ?? [];
    if (!q) return all;
    return all.filter((i) => i.sourceName.toLowerCase().includes(q));
  }, [scene, query]);

  async function toggle(sourceName: string, enabled: boolean) {
    if (!scene) return;
    setBusy(sourceName);
    try {
      await api.obsSetSource(scene.name, sourceName, enabled);
    } catch {
      // surfaced via OBS state
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers size={16} className="text-accent" />
          Program Sources
        </div>
        <span className="truncate text-xs text-text-faint">
          {obs.currentProgramScene ?? 'no scene'}
        </span>
      </header>

      {obs.connected && scene && (scene.items.length > 8 || query !== '') && (
        <div className="relative border-b border-ink-600 px-3 py-2">
          <Search
            size={13}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sources…"
            className="input w-full py-1.5 pl-7 pr-2 text-xs"
          />
        </div>
      )}

      {!obs.connected || !scene ? (
        <p className="px-4 py-8 text-center text-sm text-text-faint">
          {obs.connected ? 'No program scene selected.' : 'OBS not connected.'}
        </p>
      ) : scene.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-faint">No sources in this scene.</p>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-faint">
          No sources match “{query}”.
        </p>
      ) : (
        <ul className="max-h-[20rem] divide-y divide-ink-600/60 overflow-y-auto">
          {items.map((item) => (
            <li
              key={item.sceneItemId}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span
                className={clsx(
                  'truncate text-sm',
                  item.enabled ? 'text-text' : 'text-text-faint line-through',
                )}
              >
                {item.sourceName}
              </span>
              <button
                onClick={() => void toggle(item.sourceName, !item.enabled)}
                disabled={busy === item.sourceName}
                title={item.enabled ? 'Hide source' : 'Show source'}
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-md border transition',
                  item.enabled
                    ? 'border-preview/40 bg-preview/10 text-preview hover:bg-preview/20'
                    : 'border-ink-600 bg-ink-750 text-text-faint hover:text-text',
                )}
              >
                {item.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
