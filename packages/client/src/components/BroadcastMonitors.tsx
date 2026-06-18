import { useState } from 'react';
import clsx from 'clsx';
import { Cable, ArrowRightLeft, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

/**
 * The on-air picture: PROGRAM (live) and PREVIEW (staged) monitors with the
 * TAKE control between them. Mirrors an OBS Studio-Mode broadcast layout.
 */
export function BroadcastMonitors() {
  const obs = useStore((s) => s.obs);
  const [busy, setBusy] = useState(false);

  const programFrame = useStore((s) => s.programFrame);
  const previewFrame = useStore((s) => s.previewFrame);
  const programScene = obs.scenes.find((s) => s.name === obs.currentProgramScene);
  const previewScene = obs.scenes.find((s) => s.name === obs.currentPreviewScene);
  const studio = obs.studioModeEnabled;

  async function take() {
    setBusy(true);
    try {
      await api.obsTransition(undefined, true);
    } catch {
      // surfaced via OBS state
    } finally {
      setBusy(false);
    }
  }

  async function setTransition(name: string) {
    try {
      await api.obsTransition(name, false);
    } catch {
      // ignore
    }
  }

  if (!obs.connected) {
    return (
      <section className="panel flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <Cable size={28} className="text-text-faint" />
        <p className="text-sm text-text-muted">OBS not connected.</p>
        <Link to="/settings" className="btn-ghost mt-1">
          Connect in Settings
        </Link>
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto_1fr]">
      <Monitor
        kind="program"
        sceneName={obs.currentProgramScene}
        sourceCount={programScene?.items.length ?? 0}
        frame={programFrame}
      />

      <div className="flex flex-row items-center justify-center gap-3 lg:flex-col">
        <button
          onClick={() => void take()}
          disabled={!studio || busy}
          title={studio ? 'Send Preview to Program' : 'Enable Studio Mode in OBS to use TAKE'}
          className={clsx(
            'flex h-14 w-28 flex-col items-center justify-center rounded-xl border text-sm font-bold uppercase tracking-wide transition lg:h-20 lg:w-20',
            studio
              ? 'border-accent/40 bg-accent text-ink-900 hover:bg-accent-soft'
              : 'cursor-not-allowed border-ink-600 bg-ink-750 text-text-faint',
          )}
        >
          <ArrowRightLeft size={18} />
          Take
        </button>
        <select
          value={obs.currentTransition ?? ''}
          onChange={(e) => void setTransition(e.target.value)}
          className="input max-w-[7rem] px-2 py-1 text-xs"
          title="Transition"
        >
          {obs.transitions.length === 0 && <option value="">—</option>}
          {obs.transitions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <Monitor
        kind="preview"
        sceneName={obs.currentPreviewScene}
        sourceCount={previewScene?.items.length ?? 0}
        frame={studio ? previewFrame : null}
        hint={!studio ? 'Studio Mode off' : undefined}
      />
    </section>
  );
}

function Monitor({
  kind,
  sceneName,
  sourceCount,
  frame,
  hint,
}: {
  kind: 'program' | 'preview';
  sceneName: string | null;
  sourceCount: number;
  frame: string | null;
  hint?: string;
}) {
  const isProgram = kind === 'program';
  return (
    <div
      className={clsx(
        'relative flex aspect-video flex-col justify-between overflow-hidden rounded-xl border p-4',
        isProgram
          ? 'border-live/60 bg-live/[0.06] shadow-onair'
          : 'border-preview/50 bg-preview/[0.05]',
      )}
    >
      {frame ? (
        <img
          src={frame}
          alt={`${kind} output`}
          className="pointer-events-none absolute inset-0 h-full w-full bg-black object-contain"
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-text-faint">
          {isProgram ? 'awaiting program feed…' : hint ?? 'awaiting preview…'}
        </div>
      )}
      <div className="relative flex items-center justify-between">
        <span
          className={clsx(
            'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-widest',
            isProgram ? 'bg-live/20 text-live' : 'bg-preview/20 text-preview',
          )}
        >
          <span
            className={clsx(
              'h-1.5 w-1.5 rounded-full',
              isProgram ? 'animate-pulse bg-live' : 'bg-preview',
            )}
          />
          {isProgram ? 'On Air' : 'Preview'}
        </span>
        {hint && <span className="text-[11px] text-text-faint">{hint}</span>}
      </div>

      {!frame && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5] bg-grid-faint"
          style={{ backgroundSize: '28px 28px' }}
        />
      )}

      <div
        className={clsx(
          'relative -mx-4 -mb-4 mt-auto px-4 pb-3 pt-6',
          frame && 'bg-gradient-to-t from-black/80 to-transparent',
        )}
      >
        <div className="truncate text-2xl font-bold tracking-tight">
          {sceneName ?? <span className="text-text-faint">no scene</span>}
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
          <Layers size={12} />
          {sourceCount} source{sourceCount === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}
