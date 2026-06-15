import { useEffect, useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Transition, TransitionKind } from '@streamforge/shared';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';

const KINDS: TransitionKind[] = ['cut', 'fade', 'slide', 'swipe', 'stinger', 'custom'];

export function TransitionsPage() {
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [editing, setEditing] = useState<Transition | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setTransitions(await api.transitions());
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Transitions"
        subtitle="Reusable transitions you can attach to rigs and scene switches."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New transition
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 p-8 sm:grid-cols-2 lg:grid-cols-3">
        {transitions.map((t) => (
          <button
            key={t.id}
            onClick={() => setEditing(t)}
            className="panel flex items-center gap-3 p-4 text-left transition hover:border-accent/50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-xs text-text-faint">
                {t.kind} · {t.duration}ms
                {t.direction ? ` · ${t.direction}` : ''}
              </div>
            </div>
          </button>
        ))}
        {transitions.length === 0 && (
          <p className="text-sm text-text-faint">No transitions yet.</p>
        )}
      </div>

      {(creating || editing) && (
        <TransitionModal
          transition={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function TransitionModal({
  transition,
  onClose,
  onSaved,
}: {
  transition: Transition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(transition?.name ?? 'New Transition');
  const [kind, setKind] = useState<TransitionKind>(transition?.kind ?? 'fade');
  const [duration, setDuration] = useState(transition?.duration ?? 300);
  const [direction, setDirection] = useState(transition?.direction ?? 'left');
  const [stingerSource, setStingerSource] = useState(transition?.stingerSource ?? '');

  async function save() {
    const payload = { name, kind, duration, direction, stingerSource };
    if (transition) await api.updateTransition(transition.id, payload);
    else await api.createTransition(payload);
    onSaved();
  }

  async function remove() {
    if (!transition) return;
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete "${transition.name}"?`)) return;
    await api.deleteTransition(transition.id);
    onSaved();
  }

  return (
    <Modal
      open
      title={transition ? 'Edit transition' : 'New transition'}
      onClose={onClose}
      footer={
        <>
          {transition && (
            <button className="btn-danger mr-auto" onClick={() => void remove()}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Kind</label>
            <select
              className="input"
              value={kind}
              onChange={(e) => setKind(e.target.value as TransitionKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Duration (ms)</label>
            <input
              type="number"
              className="input"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </div>
        </div>
        {(kind === 'slide' || kind === 'swipe') && (
          <div>
            <label className="label">Direction</label>
            <select
              className="input"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'left' | 'right' | 'up' | 'down')}
            >
              {['left', 'right', 'up', 'down'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'stinger' && (
          <div>
            <label className="label">Stinger source (media path or overlay id)</label>
            <input
              className="input"
              value={stingerSource}
              onChange={(e) => setStingerSource(e.target.value)}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
