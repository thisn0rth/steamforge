import type { Overlay, Rig, Transition } from '@streamforge/shared';
import { JsonCollection } from './jsonStore.js';
import { config } from '../config.js';

/** Central persistence layer for user-created production assets. */
export const store = {
  rigs: new JsonCollection<Rig>(config.dataDir, 'rigs'),
  overlays: new JsonCollection<Overlay>(config.dataDir, 'overlays'),
  transitions: new JsonCollection<Transition>(config.dataDir, 'transitions'),
};
