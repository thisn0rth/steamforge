import fs from 'node:fs';
import type {
  OutputChannel,
  OutputItem,
  OutputState,
  OverlayAssignments,
} from '@streamforge/shared';
import { EMPTY_OUTPUT_STATE } from '@streamforge/shared';
import { dataPath } from '../config.js';

/**
 * Persists the live output state: which overlays are on the program (live) and
 * preview channels, plus the focus assignments chosen for each push. A single
 * `/live` and `/preview` render page reads this, so OBS only needs one browser
 * source per channel.
 */
class OutputStore {
  private readonly file = dataPath('output.json');
  private state: OutputState = { ...EMPTY_OUTPUT_STATE };

  constructor() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<OutputState>;
      this.state = {
        program: normalize(raw.program),
        preview: normalize(raw.preview),
      };
    } catch {
      this.state = { ...EMPTY_OUTPUT_STATE };
    }
  }

  get(): OutputState {
    return {
      program: this.state.program.map((i) => ({ ...i })),
      preview: this.state.preview.map((i) => ({ ...i })),
    };
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  private commit(): OutputState {
    this.persist();
    return this.get();
  }

  /** Add an overlay to a channel (top of the stack) with its focus assignments. */
  add(channel: OutputChannel, overlayId: string, assignments: OverlayAssignments): OutputState {
    const list = this.state[channel].filter((i) => i.overlayId !== overlayId);
    list.push({ overlayId, assignments });
    this.state[channel] = list;
    return this.commit();
  }

  remove(channel: OutputChannel, overlayId: string): OutputState {
    this.state[channel] = this.state[channel].filter((i) => i.overlayId !== overlayId);
    return this.commit();
  }

  clear(channel: OutputChannel | 'all'): OutputState {
    if (channel === 'all') {
      this.state = { program: [], preview: [] };
    } else {
      this.state[channel] = [];
    }
    return this.commit();
  }

  /** Push the preview stack (with its assignments) to the live/program output. */
  take(): OutputState {
    this.state.program = this.state.preview.map((i) => ({ ...i }));
    return this.commit();
  }

  /** Drop any references to overlays that no longer exist. */
  prune(validIds: Set<string>): OutputState {
    this.state.program = this.state.program.filter((i) => validIds.has(i.overlayId));
    this.state.preview = this.state.preview.filter((i) => validIds.has(i.overlayId));
    return this.commit();
  }
}

function normalize(list: unknown): OutputItem[] {
  if (!Array.isArray(list)) return [];
  const out: OutputItem[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      out.push({ overlayId: entry, assignments: {} });
    } else if (entry && typeof entry === 'object' && 'overlayId' in entry) {
      const item = entry as { overlayId: unknown; assignments?: unknown };
      if (typeof item.overlayId === 'string') {
        out.push({
          overlayId: item.overlayId,
          assignments: (item.assignments as OverlayAssignments) ?? {},
        });
      }
    }
  }
  // De-dupe by overlayId, keeping the last occurrence.
  const seen = new Set<string>();
  return out
    .reverse()
    .filter((i) => (seen.has(i.overlayId) ? false : (seen.add(i.overlayId), true)))
    .reverse();
}

export const outputStore = new OutputStore();
