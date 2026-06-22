import fs from 'node:fs';
import type { OutputChannel, OutputState } from '@streamforge/shared';
import { EMPTY_OUTPUT_STATE } from '@streamforge/shared';
import { dataPath } from '../config.js';

/**
 * Persists the live output state: which overlays are on the program (live) and
 * preview channels. A single `/live` and `/preview` render page reads this, so
 * OBS only needs one browser source per channel.
 */
class OutputStore {
  private readonly file = dataPath('output.json');
  private state: OutputState = { ...EMPTY_OUTPUT_STATE };

  constructor() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) as Partial<OutputState>;
      this.state = {
        program: Array.isArray(raw.program) ? raw.program : [],
        preview: Array.isArray(raw.preview) ? raw.preview : [],
      };
    } catch {
      this.state = { ...EMPTY_OUTPUT_STATE };
    }
  }

  get(): OutputState {
    return { program: [...this.state.program], preview: [...this.state.preview] };
  }

  private persist(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  private set(next: OutputState): OutputState {
    this.state = {
      program: [...new Set(next.program)],
      preview: [...new Set(next.preview)],
    };
    this.persist();
    return this.get();
  }

  replace(next: Partial<OutputState>): OutputState {
    return this.set({
      program: next.program ?? this.state.program,
      preview: next.preview ?? this.state.preview,
    });
  }

  /** Add an overlay to a channel (top of the stack). */
  add(channel: OutputChannel, overlayId: string): OutputState {
    const list = this.state[channel].filter((id) => id !== overlayId);
    list.push(overlayId);
    return this.set({ ...this.state, [channel]: list });
  }

  remove(channel: OutputChannel, overlayId: string): OutputState {
    return this.set({
      ...this.state,
      [channel]: this.state[channel].filter((id) => id !== overlayId),
    });
  }

  /** Toggle an overlay's presence on a channel. */
  toggle(channel: OutputChannel, overlayId: string): OutputState {
    return this.state[channel].includes(overlayId)
      ? this.remove(channel, overlayId)
      : this.add(channel, overlayId);
  }

  clear(channel: OutputChannel | 'all'): OutputState {
    if (channel === 'all') return this.set({ program: [], preview: [] });
    return this.set({ ...this.state, [channel]: [] });
  }

  /** Push the preview stack to the live/program output. */
  take(): OutputState {
    return this.set({ program: [...this.state.preview], preview: this.state.preview });
  }

  /** Drop any references to an overlay that no longer exists. */
  prune(validIds: Set<string>): OutputState {
    return this.set({
      program: this.state.program.filter((id) => validIds.has(id)),
      preview: this.state.preview.filter((id) => validIds.has(id)),
    });
  }
}

export const outputStore = new OutputStore();
