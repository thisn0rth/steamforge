import type { AnimatableProperty, EasingKind, Keyframe } from '@streamforge/shared';

const EASING: Record<EasingKind, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  hold: () => 0,
};

/** Evaluate a possibly-keyframed numeric property at time `ms`. */
export function numAt(prop: AnimatableProperty<number>, ms: number): number {
  const kfs = prop.keyframes;
  if (!kfs || kfs.length === 0) return prop.value;
  return interpolate(kfs, ms, prop.value) as number;
}

/** Evaluate a possibly-keyframed string property at time `ms`. */
export function strAt(prop: AnimatableProperty<string>, ms: number): string {
  const kfs = prop.keyframes;
  if (!kfs || kfs.length === 0) return prop.value;
  return interpolate(kfs, ms, prop.value) as string;
}

function interpolate(
  kfs: Keyframe[],
  ms: number,
  fallback: number | string,
): number | string {
  const sorted = [...kfs].sort((a, b) => a.time - b.time);
  if (ms <= sorted[0].time) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (ms >= last.time) return last.value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (ms >= a.time && ms <= b.time) {
      // Only numeric keyframes are interpolated; strings/holds snap.
      if (a.easing === 'hold' || typeof a.value !== 'number' || typeof b.value !== 'number') {
        return a.value;
      }
      const span = b.time - a.time || 1;
      const t = (ms - a.time) / span;
      const eased = EASING[a.easing](t);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return fallback;
}
