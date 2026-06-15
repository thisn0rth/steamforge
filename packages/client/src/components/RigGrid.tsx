import { useState } from 'react';
import { Pencil, Plus, Zap } from 'lucide-react';
import clsx from 'clsx';
import type { Rig } from '@streamforge/shared';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { RigEditorModal } from '@/components/RigEditorModal';

export function RigGrid() {
  const rigs = useStore((s) => s.rigs);
  const lastActivated = useStore((s) => s.lastActivatedRigId);
  const refreshRigs = useStore((s) => s.refreshRigs);
  const [editing, setEditing] = useState<Rig | null>(null);
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function activate(rig: Rig) {
    setActivating(rig.id);
    setWarning(null);
    try {
      const result = await api.activateRig(rig.id);
      if (result.warnings.length) setWarning(result.warnings.join(' · '));
    } catch (err) {
      setWarning(err instanceof Error ? err.message : 'Failed to activate rig');
    } finally {
      setActivating(null);
    }
  }

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Zap size={16} className="text-accent" />
          Rigs
          <span className="text-xs font-normal text-text-faint">
            one-click scene + overlay presets
          </span>
        </div>
        <button className="btn-ghost py-1.5" onClick={() => setCreating(true)}>
          <Plus size={14} /> New rig
        </button>
      </header>

      {warning && (
        <div className="border-b border-ink-600 bg-live/10 px-4 py-2 text-xs text-live">
          {warning}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {rigs.map((rig) => {
          const isLast = rig.id === lastActivated;
          return (
            <div key={rig.id} className="group relative">
              <button
                onClick={() => void activate(rig)}
                disabled={activating === rig.id}
                className={clsx(
                  'relative flex h-28 w-full flex-col justify-between overflow-hidden rounded-xl border p-3 text-left transition',
                  isLast
                    ? 'border-transparent shadow-glow'
                    : 'border-ink-600 hover:border-accent/60',
                )}
                style={{
                  background: `linear-gradient(160deg, ${hexA(rig.color, 0.28)}, ${hexA(
                    rig.color,
                    0.06,
                  )})`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: rig.color }}
                  />
                  {isLast && (
                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                      active
                    </span>
                  )}
                </div>
                <div>
                  <div className="truncate text-sm font-semibold text-white">{rig.name}</div>
                  <div className="truncate text-[11px] text-white/60">
                    {rig.targetScene || 'no scene set'}
                  </div>
                </div>
              </button>
              <button
                onClick={() => setEditing(rig)}
                className="absolute right-2 top-2 rounded-md bg-black/40 p-1.5 text-white/70 opacity-0 transition hover:text-white group-hover:opacity-100"
                title="Edit rig"
              >
                <Pencil size={13} />
              </button>
            </div>
          );
        })}

        <button
          onClick={() => setCreating(true)}
          className="flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-500 text-text-faint transition hover:border-accent/60 hover:text-text"
        >
          <Plus size={20} />
          <span className="text-xs font-medium">Create rig</span>
        </button>
      </div>

      {(creating || editing) && (
        <RigEditorModal
          rig={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void refreshRigs();
          }}
        />
      )}
    </section>
  );
}

/** Convert a #rrggbb hex to an rgba() string with the given alpha. */
function hexA(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(108,123,255,${alpha})`;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
