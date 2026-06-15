import type { Rig } from '@streamforge/shared';
import { obsService } from '../obs/obsService.js';
import { store } from '../store/store.js';

export interface ApplyRigResult {
  rigId: string;
  appliedScene: string;
  toggledSources: number;
  warnings: string[];
}

/**
 * Applies a rig as a single atomic-ish production action:
 *   1. select the rig's transition (if mapped to an OBS transition by name)
 *   2. enforce overlay + raw source visibility on the target scene
 *   3. switch the program scene
 *
 * OBS being disconnected is non-fatal: we collect warnings and still report
 * what happened so the control surface can show partial results.
 */
export async function applyRig(rig: Rig): Promise<ApplyRigResult> {
  const warnings: string[] = [];
  let toggledSources = 0;

  if (!obsService.isConnected()) {
    warnings.push('OBS not connected — rig recorded but not pushed to OBS.');
    return {
      rigId: rig.id,
      appliedScene: rig.targetScene,
      toggledSources,
      warnings,
    };
  }

  // 1. Transition selection (best-effort: match by transition name).
  if (rig.transitionId) {
    const transition = store.transitions.get(rig.transitionId);
    if (transition) {
      const obsTransitions = obsService.state().transitions;
      if (obsTransitions.includes(transition.name)) {
        try {
          await obsService.setCurrentTransition(transition.name);
        } catch (err) {
          warnings.push(`Failed to set transition: ${errMsg(err)}`);
        }
      } else {
        warnings.push(
          `Transition "${transition.name}" not found in OBS; using current.`,
        );
      }
    }
  }

  // 2. Enforce source + overlay visibility on the target scene.
  const allStates = [
    ...rig.sources.map((s) => ({ sourceName: s.sourceName, enabled: s.enabled })),
    ...rig.overlays.map((o) => ({ sourceName: o.sourceName, enabled: o.enabled })),
  ];
  for (const s of allStates) {
    try {
      await obsService.setSourceEnabled(rig.targetScene, s.sourceName, s.enabled);
      toggledSources += 1;
    } catch (err) {
      warnings.push(`Source "${s.sourceName}": ${errMsg(err)}`);
    }
  }

  // 3. Switch program scene last so toggles are in place before it's live.
  try {
    await obsService.setProgramScene(rig.targetScene);
  } catch (err) {
    warnings.push(`Failed to switch scene: ${errMsg(err)}`);
  }

  await obsService.refresh().catch(() => undefined);

  return {
    rigId: rig.id,
    appliedScene: rig.targetScene,
    toggledSources,
    warnings,
  };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
