import type { OverlayAssignments, Rig } from '@streamforge/shared';
import { obsService } from '../obs/obsService.js';
import { outputStore } from '../output/outputStore.js';
import { wsHub } from '../realtime/wsHub.js';
import { store } from '../store/store.js';

export interface ApplyRigResult {
  rigId: string;
  appliedScene: string;
  toggledSources: number;
  warnings: string[];
}

/**
 * Applies a rig as a single staging action. A rig is just a saved (scene +
 * overlay list); applying it stages everything to PREVIEW — it never goes live
 * on its own. Pressing TAKE is the only way to commit Preview to Live.
 *   1. select the rig's transition (if mapped to an OBS transition by name)
 *   2. enforce raw source visibility on the target scene
 *   3. stage the rig's overlays to the PREVIEW output (single "Overlay" source)
 *   4. stage the target scene to Preview
 *
 * `assignments` carries the per-overlay focus chosen at stage time (the data
 * binding popup); overlays without a binding fall back to an empty assignment.
 *
 * OBS being disconnected is non-fatal: we still stage the overlay output so the
 * Preview render reflects the rig, and collect warnings for the OBS-only bits.
 */
export async function applyRig(
  rig: Rig,
  assignments: Record<string, OverlayAssignments> = {},
): Promise<ApplyRigResult> {
  const warnings: string[] = [];
  let toggledSources = 0;

  // Stage overlays to Preview regardless of OBS — this is app-controlled state.
  if (rig.overlays.length > 0) {
    const items = rig.overlays
      .filter((o) => o.enabled)
      .map((o) => ({ overlayId: o.overlayId, assignments: assignments[o.overlayId] ?? {} }));
    const state = outputStore.setChannel('preview', items);
    wsHub.broadcast({ type: 'output', output: state });
    void obsService.setOverlayChannel('preview');
  }

  if (!obsService.isConnected()) {
    warnings.push('OBS not connected — overlays staged; scene not changed in OBS.');
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

  // 2. Enforce raw OBS source visibility on the target scene.
  for (const s of rig.sources) {
    try {
      await obsService.setSourceEnabled(rig.targetScene, s.sourceName, s.enabled);
      toggledSources += 1;
    } catch (err) {
      warnings.push(`Source "${s.sourceName}": ${errMsg(err)}`);
    }
  }

  // 3. Stage the target scene to Preview (TAKE commits it to Program later).
  if (rig.targetScene) {
    try {
      await obsService.setPreviewScene(rig.targetScene);
    } catch (err) {
      warnings.push(`Failed to stage scene: ${errMsg(err)}`);
    }
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
