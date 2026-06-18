import { useState } from 'react';
import clsx from 'clsx';
import { Eye, EyeOff, Layers } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

/** Live source visibility for the current program scene. */
export function ProgramSources() {
  const obs = useStore((s) => s.obs);
  const [busy, setBusy] = useState<string | null>(null);

  const scene = obs.scenes.find((s) => s.name === obs.currentProgramScene);

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

      {!obs.connected || !scene ? (
        <p className="px-4 py-8 text-center text-sm text-text-faint">
          {obs.connected ? 'No program scene selected.' : 'OBS not connected.'}
        </p>
      ) : scene.items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-text-faint">No sources in this scene.</p>
      ) : (
        <ul className="divide-y divide-ink-600/60">
          {scene.items.map((item) => (
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
