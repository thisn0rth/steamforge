/**
 * Unified data-binding resolution shared by the renderer and the editor
 * preview. Handles direct GSI paths, the virtual player namespace, and
 * slot-relative bindings that pull from the slot's assigned GSI entity and/or
 * Firestore league document.
 */
import type { GsiBinding, OverlayAssignments, OverlaySlot, SlotKind } from './overlay.js';
import type { GsiPayload } from './gsi.js';
import type { LeagueCollection, LeagueData } from './league.js';
import { readPath, resolveGsiValue } from './gsiref.js';

export interface ResolveContext {
  gsi: GsiPayload | null;
  league?: LeagueData | null;
  slots?: OverlaySlot[];
  assignments?: OverlayAssignments;
}

const KIND_COLLECTION: Record<SlotKind, LeagueCollection> = {
  player: 'players',
  team: 'teams',
  match: 'matches',
};

/** Resolve a binding to its raw value given live data + slot assignments. */
export function resolveDataValue(binding: GsiBinding, ctx: ResolveContext): unknown {
  if (!binding.slotId) return resolveGsiValue(ctx.gsi, binding.path);

  const slot = ctx.slots?.find((s) => s.id === binding.slotId);
  const assignment = ctx.assignments?.[binding.slotId];
  if (!slot || !assignment) return undefined;

  if (binding.path.startsWith('gsi.')) {
    const rest = binding.path.slice(4);
    if (!assignment.gsiRef) return undefined;
    if (slot.kind === 'player') {
      return resolveGsiValue(ctx.gsi, `${assignment.gsiRef}.${rest}`);
    }
    if (slot.kind === 'team') {
      const team =
        assignment.gsiRef === 'ct' ? 'team_ct' : assignment.gsiRef === 't' ? 'team_t' : null;
      return team ? resolveGsiValue(ctx.gsi, `map.${team}.${rest}`) : undefined;
    }
    return undefined;
  }

  if (binding.path.startsWith('fs.')) {
    const rest = binding.path.slice(3);
    const coll = KIND_COLLECTION[slot.kind];
    if (!assignment.fsId || !ctx.league) return undefined;
    const doc = ctx.league[coll].find((d) => d.id === assignment.fsId);
    return doc ? readPath(doc.fields, rest) : undefined;
  }

  return undefined;
}

/** Resolve a binding to display text, applying template + fallback. */
export function resolveBindingText(binding: GsiBinding, ctx: ResolveContext): string {
  const raw = resolveDataValue(binding, ctx);
  if (raw == null || raw === '') return binding.fallback ?? '';
  const value = String(raw);
  return binding.template ? binding.template.replace('{value}', value) : value;
}
