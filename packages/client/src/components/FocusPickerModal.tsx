import { useState } from 'react';
import type {
  GsiPayload,
  LeagueData,
  Overlay,
  OverlayAssignments,
  OverlaySlot,
  SlotAssignment,
} from '@streamforge/shared';
import { orderedPlayers } from '@streamforge/shared';
import { Modal } from '@/components/Modal';
import { useStore } from '@/store/useStore';

/**
 * Asks the operator to assign concrete players/teams/matches to an overlay's
 * data slots at the moment it's pushed to a channel. Focus is per-push, not
 * stored on the overlay — every push can target a different focus.
 */
export function FocusPickerModal({
  overlay,
  channel,
  onConfirm,
  onClose,
}: {
  overlay: Overlay | null;
  channel: 'program' | 'preview';
  onConfirm: (assignments: OverlayAssignments) => void;
  onClose: () => void;
}) {
  const gsi = useStore((s) => s.gsi);
  const league = useStore((s) => s.league);
  const [assignments, setAssignments] = useState<OverlayAssignments>({});

  // Reset the picked focus whenever a new overlay/channel is opened.
  const key = overlay ? `${overlay.id}:${channel}` : '';
  const [lastKey, setLastKey] = useState('');
  if (key !== lastKey) {
    setLastKey(key);
    setAssignments(overlay?.defaultAssignments ?? {});
  }

  if (!overlay) return null;
  const slots = overlay.slots ?? [];

  function update(slotId: string, patch: Partial<SlotAssignment>) {
    setAssignments((prev) => ({ ...prev, [slotId]: { ...prev[slotId], ...patch } }));
  }

  const verb = channel === 'program' ? 'Live' : 'Preview';

  return (
    <Modal
      open={overlay != null}
      title={`Push to ${verb} · ${overlay.name}`}
      onClose={onClose}
    >
      <div className="space-y-3">
        {slots.length === 0 ? (
          <p className="text-xs text-text-faint">This overlay has no data slots.</p>
        ) : (
          slots.map((slot) => (
            <SlotRow
              key={slot.id}
              slot={slot}
              gsi={gsi}
              league={league}
              assignment={assignments[slot.id] ?? {}}
              onChange={(patch) => update(slot.id, patch)}
            />
          ))
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => onConfirm(assignments)}>
            Push to {verb}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SlotRow({
  slot,
  gsi,
  league,
  assignment,
  onChange,
}: {
  slot: OverlaySlot;
  gsi: GsiPayload | null;
  league: LeagueData;
  assignment: SlotAssignment;
  onChange: (patch: Partial<SlotAssignment>) => void;
}) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-850 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">{slot.label}</span>
        <span className="font-mono text-[11px] text-text-faint">{slot.kind}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(slot.kind === 'player' || slot.kind === 'team') && (
          <div>
            <label className="label">Live (GSI)</label>
            <select
              className="input"
              value={assignment.gsiRef ?? ''}
              onChange={(e) => onChange({ gsiRef: e.target.value || undefined })}
            >
              <option value="">— none —</option>
              {slot.kind === 'player'
                ? playerOptions(gsi).map((o) => (
                    <option key={o.ref} value={o.ref}>
                      {o.label}
                    </option>
                  ))
                : [
                    { ref: 'ct', label: 'CT team' },
                    { ref: 't', label: 'T team' },
                  ].map((o) => (
                    <option key={o.ref} value={o.ref}>
                      {o.label}
                    </option>
                  ))}
            </select>
          </div>
        )}
        <div className={slot.kind === 'match' ? 'col-span-2' : ''}>
          <label className="label">League (Firestore)</label>
          <select
            className="input"
            value={assignment.fsId ?? ''}
            onChange={(e) => onChange({ fsId: e.target.value || undefined })}
            disabled={leagueDocs(league, slot).length === 0}
          >
            <option value="">— none —</option>
            {leagueDocs(league, slot).map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function playerOptions(gsi: GsiPayload | null): { ref: string; label: string }[] {
  const out: { ref: string; label: string }[] = [];
  for (const team of ['ct', 't'] as const) {
    const players = orderedPlayers(gsi, team);
    for (let i = 1; i <= 5; i++) {
      const who = players[i - 1]?.name;
      out.push({
        ref: `players.${team}.${i}`,
        label: `${team.toUpperCase()} ${i}${who ? ` · ${who}` : ''}`,
      });
    }
  }
  return out;
}

function leagueDocs(league: LeagueData, slot: OverlaySlot) {
  if (slot.kind === 'player') return league.players;
  if (slot.kind === 'team') return league.teams;
  return league.matches;
}
