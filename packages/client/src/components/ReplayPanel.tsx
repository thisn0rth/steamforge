import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  CircleDot,
  Download,
  Film,
  Play,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

/**
 * Instant-replay control. Anyone can save a clip from the OBS replay buffer
 * (web button or OBS's global hotkey); saves are deduped server-side and the
 * newest clip can be pushed into a designated replay-player media source.
 */
export function ReplayPanel() {
  const obs = useStore((s) => s.obs);
  const replays = useStore((s) => s.replays);
  const settings = useStore((s) => s.replaySettings);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = obs.replayBuffer.saving;

  // Unique source names across all scenes — candidates for the replay player.
  const sourceNames = useMemo(() => {
    const set = new Set<string>();
    for (const scene of obs.scenes) for (const it of scene.items) set.add(it.sourceName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [obs.scenes]);

  async function save() {
    if (!obs.connected || saving) return;
    setBusy(true);
    setError(null);
    try {
      await api.saveReplay();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  // Global "R" shortcut (when not typing in a field) to clip a replay.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (el?.isContentEditable) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        void saveRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function startBuffer() {
    setError(null);
    try {
      await api.startReplayBuffer();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : 'Failed to start buffer');
    }
  }

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Film size={16} className="text-accent" />
          Instant Replay
        </div>
        <span
          className={clsx(
            'flex items-center gap-1.5 text-xs',
            obs.replayBuffer.active ? 'text-preview' : 'text-text-faint',
          )}
        >
          <CircleDot size={12} className={obs.replayBuffer.active ? 'animate-pulse' : ''} />
          buffer {obs.replayBuffer.active ? 'live' : 'off'}
        </span>
      </header>

      <div className="space-y-3 p-4">
        {!obs.connected ? (
          <p className="py-6 text-center text-sm text-text-faint">OBS not connected.</p>
        ) : (
          <>
            {!obs.replayBuffer.active ? (
              <button onClick={() => void startBuffer()} className="btn-ghost w-full">
                Start replay buffer
              </button>
            ) : (
              <button
                onClick={() => void save()}
                disabled={busy || saving}
                className={clsx(
                  'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold transition',
                  saving
                    ? 'cursor-wait bg-ink-700 text-text-faint'
                    : 'bg-live text-white hover:brightness-110',
                )}
              >
                <CircleDot size={18} />
                {saving ? 'Saving…' : 'Save Replay'}
                <kbd className="ml-1 rounded bg-black/25 px-1.5 py-0.5 text-xs font-normal">R</kbd>
              </button>
            )}

            {error && <p className="text-xs text-live">{error}</p>}

            <div className="space-y-2 rounded-lg border border-ink-600 bg-ink-750 p-3">
              <label className="block text-xs font-medium text-text-muted">Replay player source</label>
              <select
                value={settings.playerSource ?? ''}
                onChange={(e) =>
                  void api.updateReplaySettings({ playerSource: e.target.value || null })
                }
                className="input w-full py-1.5 text-xs"
              >
                <option value="">— none —</option>
                {settings.playerSource && !sourceNames.includes(settings.playerSource) && (
                  <option value={settings.playerSource}>{settings.playerSource}</option>
                )}
                {sourceNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={settings.autoLoad}
                  onChange={(e) => void api.updateReplaySettings({ autoLoad: e.target.checked })}
                />
                Auto-load newest replay into this source
              </label>
            </div>
          </>
        )}

        {replays.length === 0 ? (
          <p className="py-4 text-center text-xs text-text-faint">No replays saved yet.</p>
        ) : (
          <ul className="max-h-[18rem] space-y-1.5 overflow-y-auto">
            {replays.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-ink-600 bg-ink-750 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{r.name}</p>
                  <p className="truncate text-xs text-text-faint">
                    {r.triggeredBy ?? 'OBS hotkey'} · {formatSize(r.sizeBytes)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void api.loadReplay(r.id).catch(() => undefined)}
                    disabled={!settings.playerSource}
                    title={settings.playerSource ? 'Load into replay player' : 'Set a player source first'}
                    className="icon-btn"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <a href={r.url} target="_blank" rel="noreferrer" title="Open clip" className="icon-btn">
                    <Play size={15} />
                  </a>
                  <a href={r.url} download title="Download" className="icon-btn">
                    <Download size={15} />
                  </a>
                  <button
                    onClick={() => void api.deleteReplay(r.id).catch(() => undefined)}
                    title="Delete"
                    className="icon-btn hover:text-live"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
