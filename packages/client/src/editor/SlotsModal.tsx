import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { OverlaySlot, SlotKind } from '@streamforge/shared';
import { Modal } from '@/components/Modal';

const KINDS: { value: SlotKind; label: string }[] = [
  { value: 'player', label: 'Player' },
  { value: 'team', label: 'Team' },
  { value: 'match', label: 'Match' },
];

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'slot'
  );
}

/**
 * Manage an overlay's data slots ("focus" roles). Bindings reference these
 * slots; the concrete player/team/match is chosen at use-time.
 */
export function SlotsModal({
  open,
  slots,
  onClose,
  onChange,
}: {
  open: boolean;
  slots: OverlaySlot[];
  onClose: () => void;
  onChange: (slots: OverlaySlot[]) => void;
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<SlotKind>('player');

  function add() {
    const trimmed = label.trim();
    if (!trimmed) return;
    let id = slugify(trimmed);
    const existing = new Set(slots.map((s) => s.id));
    let n = 2;
    while (existing.has(id)) id = `${slugify(trimmed)}_${n++}`;
    onChange([...slots, { id, label: trimmed, kind }]);
    setLabel('');
  }

  return (
    <Modal open={open} title="Data slots (focus roles)" onClose={onClose}>
      <p className="mb-3 text-xs text-text-muted">
        Declare roles like “Focus player” or “Team A”. Bind layers to a slot, then pick the
        concrete player/team/match when the overlay is used.
      </p>

      <div className="space-y-1.5">
        {slots.length === 0 && (
          <p className="rounded-lg border border-dashed border-ink-600 px-3 py-4 text-center text-xs text-text-faint">
            No slots yet. Add one below.
          </p>
        )}
        {slots.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-850 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{s.label}</div>
              <div className="font-mono text-[11px] text-text-faint">
                {s.id} · {s.kind}
              </div>
            </div>
            <button
              className="text-text-faint hover:text-live"
              title="Remove slot"
              onClick={() => onChange(slots.filter((x) => x.id !== s.id))}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="label">New slot</label>
          <input
            className="input"
            value={label}
            placeholder="Focus player"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </div>
        <div className="w-28">
          <label className="label">Kind</label>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as SlotKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary h-9" onClick={add}>
          <Plus size={14} /> Add
        </button>
      </div>
    </Modal>
  );
}
