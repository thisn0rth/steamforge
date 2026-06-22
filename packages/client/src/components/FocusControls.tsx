import type {
  GsiPayload,
  LeagueData,
  Overlay,
  OverlayAssignments,
  OverlaySlot,
  SlotAssignment,
} from '@streamforge/shared';
import { orderedPlayers } from '@streamforge/shared';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

/**
 * Assigns concrete players/teams/matches to an overlay's data slots ("focus").
 * Changes are saved + broadcast immediately so every operator and the OBS
 * browser source update live.
 */
const EMPTY_ASSIGNMENTS: OverlayAssignments = {};

export function FocusControls({ overlay }: { overlay: Overlay }) {
  const gsi = useStore((s) => s.gsi);
  const league = useStore((s) => s.league);
  // Select the stored reference (may be undefined); defaulting must happen
  // outside the selector so it doesn't return a fresh object every snapshot
  // read (which would loop re-renders — React #185).
  const assignments = useStore((s) => s.assignments[overlay.id]) ?? EMPTY_ASSIGNMENTS;
  const slots = overlay.slots ?? [];

  if (slots.length === 0) {
    return (
      <p className="text-xs text-text-faint">
        This overlay has no data slots. Add slots in the editor to enable focus selection.
      </p>
    );
  }

  function update(slotId: string, patch: Partial<SlotAssignment>) {
    const next: OverlayAssignments = {
      ...assignments,
      [slotId]: { ...assignments[slotId], ...patch },
    };
    useStore.setState((s) => ({ assignments: { ...s.assignments, [overlay.id]: next } }));
    void api.setAssignments(overlay.id, next).catch(() => undefined);
  }

  return (
    <div className="space-y-3">
      {slots.map((slot) => (
        <SlotRow
          key={slot.id}
          slot={slot}
          gsi={gsi}
          league={league}
          assignment={assignments[slot.id] ?? {}}
          onChange={(patch) => update(slot.id, patch)}
        />
      ))}
    </div>
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
            disabled={!league.connected && leagueDocs(league, slot).length === 0}
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
