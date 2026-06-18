import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import type { GsiBinding, GsiRefEntry, OverlaySlot, SlotKind } from '@streamforge/shared';
import {
  PLAYER_FIELDS,
  STATIC_GSI_ENTRIES,
  playerRefEntries,
  resolveGsiValue,
} from '@streamforge/shared';
import { useStore } from '@/store/useStore';

const TEAM_GSI_FIELDS: { suffix: string; label: string }[] = [
  { suffix: 'name', label: 'Team name' },
  { suffix: 'score', label: 'Score' },
  { suffix: 'consecutive_round_losses', label: 'Loss bonus streak' },
  { suffix: 'timeouts_remaining', label: 'Timeouts left' },
];

const FS_COLLECTION: Record<SlotKind, 'players' | 'teams' | 'matches'> = {
  player: 'players',
  team: 'teams',
  match: 'matches',
};

/** Editor for a GSI / slot data binding with a searchable, live-valued reference. */
export function GsiBindingFields({
  binding,
  slots,
  onChange,
}: {
  binding: GsiBinding;
  slots: OverlaySlot[];
  onChange: (binding: GsiBinding) => void;
}) {
  const gsi = useStore((s) => s.gsi);
  const league = useStore((s) => s.league);
  const [query, setQuery] = useState('');

  const activeSlot = binding.slotId ? slots.find((s) => s.id === binding.slotId) : undefined;

  // Field entries depend on the chosen source (direct GSI vs a slot).
  const entries = useMemo<GsiRefEntry[]>(() => {
    if (!binding.slotId) {
      return [
        ...STATIC_GSI_ENTRIES,
        ...playerRefEntries(gsi, 'ct'),
        ...playerRefEntries(gsi, 't'),
      ];
    }
    if (!activeSlot) return [];
    const out: GsiRefEntry[] = [];
    if (activeSlot.kind === 'player') {
      for (const f of PLAYER_FIELDS) {
        out.push({ path: `gsi.${f.suffix}`, label: f.label, group: 'Live (GSI)' });
      }
    } else if (activeSlot.kind === 'team') {
      for (const f of TEAM_GSI_FIELDS) {
        out.push({ path: `gsi.${f.suffix}`, label: f.label, group: 'Live (GSI)' });
      }
    }
    for (const field of league.fields[FS_COLLECTION[activeSlot.kind]]) {
      out.push({ path: `fs.${field}`, label: field, group: 'League (Firestore)' });
    }
    return out;
  }, [binding.slotId, activeSlot, gsi, league]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? entries.filter(
          (e) => e.label.toLowerCase().includes(q) || e.path.toLowerCase().includes(q),
        )
      : entries;
    const groups = new Map<string, GsiRefEntry[]>();
    for (const e of list) {
      const arr = groups.get(e.group) ?? [];
      arr.push(e);
      groups.set(e.group, arr);
    }
    return [...groups.entries()];
  }, [entries, query]);

  function selectSource(value: string) {
    if (value === 'gsi') {
      onChange({ ...binding, slotId: undefined, path: '' });
    } else {
      const slot = slots.find((s) => s.id === value);
      const defaultPath = slot?.kind === 'match' ? '' : 'gsi.name';
      onChange({ ...binding, slotId: value, path: defaultPath });
    }
  }

  // Live preview only resolves for direct GSI (slots resolve at use-time).
  const directPreview = binding.slotId ? null : resolveGsiValue(gsi, binding.path);

  return (
    <div className="space-y-2">
      <div>
        <label className="label">Source</label>
        <select
          className="input"
          value={binding.slotId ?? 'gsi'}
          onChange={(e) => selectSource(e.target.value)}
        >
          <option value="gsi">Direct GSI (global)</option>
          {slots.map((s) => (
            <option key={s.id} value={s.id}>
              Slot · {s.label} ({s.kind})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">{binding.slotId ? 'Field' : 'Data path'}</label>
        <input
          className="input font-mono text-xs"
          value={binding.path}
          placeholder={binding.slotId ? 'gsi.state.health or fs.avgKills' : 'map.team_ct.score'}
          onChange={(e) => onChange({ ...binding, path: e.target.value })}
        />
      </div>

      <div className="rounded-lg border border-ink-600 bg-ink-850">
        <div className="relative border-b border-ink-600 px-2 py-1.5">
          <Search
            size={12}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={binding.slotId ? 'Search fields…' : 'Search GSI fields, players…'}
            className="input w-full py-1 pl-6 pr-2 text-xs"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-text-faint">
              {binding.slotId && activeSlot?.kind !== 'match' && league.fields.players.length === 0
                ? 'No fields. Connect Firestore for league fields.'
                : 'No fields match.'}
            </p>
          ) : (
            filtered.map(([group, items]) => (
              <div key={group} className="mb-1">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-text-faint">
                  {group}
                </p>
                {items.map((e) => {
                  const val = binding.slotId ? null : resolveGsiValue(gsi, e.path);
                  const active = binding.path === e.path;
                  return (
                    <button
                      key={e.path}
                      onClick={() => onChange({ ...binding, path: e.path })}
                      className={clsx(
                        'flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition',
                        active ? 'bg-accent/15 text-accent-soft' : 'hover:bg-ink-700',
                      )}
                    >
                      <span className="truncate">{e.label}</span>
                      {val != null && val !== '' && (
                        <span className="shrink-0 font-mono text-[11px] text-text-faint">
                          {String(val).slice(0, 16)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Template</label>
          <input
            className="input"
            value={binding.template ?? ''}
            placeholder="{value}"
            onChange={(e) => onChange({ ...binding, template: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Fallback</label>
          <input
            className="input"
            value={binding.fallback ?? ''}
            onChange={(e) => onChange({ ...binding, fallback: e.target.value })}
          />
        </div>
      </div>

      {binding.slotId ? (
        <p className="text-[11px] text-text-faint">
          Resolved from the entity assigned to <span className="text-text-muted">{activeSlot?.label ?? binding.slotId}</span> when the overlay is used.
        </p>
      ) : (
        <p className="text-[11px] text-text-faint">
          Preview:{' '}
          <span className="font-mono text-text-muted">
            {directPreview == null || directPreview === ''
              ? binding.fallback || '—'
              : String(directPreview)}
          </span>
        </p>
      )}
    </div>
  );
}
