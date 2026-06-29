import type {
  AnimatableProperty,
  Layer,
  LayerTransform,
  Overlay,
} from '@streamforge/shared';

function prop<T extends number | string>(value: T): AnimatableProperty<T> {
  return { value };
}

export function defaultTransform(
  overrides: Partial<Record<keyof LayerTransform, number>> = {},
): LayerTransform {
  return {
    x: prop(overrides.x ?? 0),
    y: prop(overrides.y ?? 0),
    width: prop(overrides.width ?? 400),
    height: prop(overrides.height ?? 120),
    rotation: prop(overrides.rotation ?? 0),
    opacity: prop(overrides.opacity ?? 1),
    scale: prop(overrides.scale ?? 1),
  };
}

/** A new overlay seeded with one example title layer so it's not empty. */
export function createBlankOverlay(id: string, name: string): Overlay {
  const now = Date.now();
  const titleLayer: Layer = {
    id: 'layer-title',
    name: 'Title',
    type: 'text',
    visible: true,
    locked: false,
    transform: defaultTransform({ x: 80, y: 80, width: 720, height: 140 }),
    text: {
      text: name,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: 64,
      fontWeight: 700,
      color: '#ffffff',
      align: 'left',
      letterSpacing: 0,
      lineHeight: 1.1,
    },
  };

  return {
    id,
    name,
    description: '',
    composition: {
      width: 1920,
      height: 1080,
      duration: 5000,
      fps: 60,
      background: 'transparent',
    },
    layers: [titleLayer],
    createdAt: now,
    updatedAt: now,
  };
}
