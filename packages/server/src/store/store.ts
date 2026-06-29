import type {
  Asset,
  Overlay,
  OverlayAssignments,
  Rig,
  Transition,
} from '@streamforge/shared';
import { JsonCollection } from './jsonStore.js';
import { config } from '../config.js';

/** Live slot assignment for one overlay (which player/team/match is in focus). */
export interface AssignmentRecord {
  id: string; // overlayId
  assignments: OverlayAssignments;
}

/** Central persistence layer for user-created production assets. */
export const store = {
  rigs: new JsonCollection<Rig>(config.dataDir, 'rigs'),
  overlays: new JsonCollection<Overlay>(config.dataDir, 'overlays'),
  transitions: new JsonCollection<Transition>(config.dataDir, 'transitions'),
  assets: new JsonCollection<Asset>(config.dataDir, 'assets'),
  assignments: new JsonCollection<AssignmentRecord>(config.dataDir, 'assignments'),
};

/** Flatten the assignment records to the overlayId -> assignments map clients use. */
export function assignmentsMap(): Record<string, OverlayAssignments> {
  const out: Record<string, OverlayAssignments> = {};
  for (const rec of store.assignments.all()) out[rec.id] = rec.assignments;
  return out;
}
