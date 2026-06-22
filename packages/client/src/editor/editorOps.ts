import type {
  AnimatableProperty,
  EasingKind,
  Keyframe,
  Layer,
  LayerTransform,
  LayerType,
  Overlay,
} from '@streamforge/shared';

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

function prop<T extends number | string>(value: T): AnimatableProperty<T> {
  return { value };
}

function transform(x = 760, y = 470): LayerTransform {
  return {
    x: prop(x),
    y: prop(y),
    width: prop(400),
    height: prop(140),
    rotation: prop(0),
    opacity: prop(1),
    scale: prop(1),
  };
}

/** Full-composition transform — code/JSX layers default to filling the stage. */
function fullTransform(width = 1920, height = 1080): LayerTransform {
  return {
    x: prop(0),
    y: prop(0),
    width: prop(width),
    height: prop(height),
    rotation: prop(0),
    opacity: prop(1),
    scale: prop(1),
  };
}

const CODE_STARTER = `// Body of a React component. React + hooks are in scope, plus
// data vars: ctPlayers, tPlayers, allPlayers, gsi, league, map, round.
const [tick, setTick] = useState(0);
useEffect(() => {
  const id = setInterval(() => setTick((t) => t + 1), 1000);
  return () => clearInterval(id);
}, []);

return (
  <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: 40, bottom: '6%', color: '#fff',
      font: '700 40px Inter, sans-serif' }}>
      CT {map?.team_ct?.score ?? 0} : {map?.team_t?.score ?? 0} T  ·  {tick}s
    </div>
  </div>
);
`;

/** Keys on the transform object that are animatable numeric tracks. */
export const TRANSFORM_KEYS: (keyof LayerTransform)[] = [
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'scale',
  'opacity',
];

export function createLayer(type: LayerType): Layer {
  const base: Layer = {
    id: uid('layer'),
    name: defaultName(type),
    type,
    visible: true,
    locked: false,
    transform: transform(),
  };

  switch (type) {
    case 'text':
      base.text = textDefaults('New Text');
      break;
    case 'gsiText':
      base.text = textDefaults('00');
      base.binding = { path: 'map.team_ct.score', template: '{value}', fallback: '0' };
      break;
    case 'shape':
      base.shape = {
        shape: 'rect',
        fill: '#6c7bff',
        stroke: '#ffffff',
        strokeWidth: 0,
        cornerRadius: 12,
      };
      break;
    case 'image':
      base.image = { src: '', fit: 'contain' };
      break;
    case 'html':
      base.html = {
        html: '<div class="box">CT {{map.team_ct.score || 0}}</div>',
        css: '.box {\n  font: 700 48px Inter, sans-serif;\n  color: #fff;\n}',
      };
      break;
    case 'code':
      base.transform = fullTransform();
      base.code = { code: CODE_STARTER };
      break;
    default:
      break;
  }
  return base;
}

function textDefaults(text: string) {
  return {
    text,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 48,
    fontWeight: 700,
    color: '#ffffff',
    align: 'left' as const,
    letterSpacing: 0,
    lineHeight: 1.1,
  };
}

function defaultName(type: LayerType): string {
  switch (type) {
    case 'gsiText':
      return 'GSI Text';
    case 'shape':
      return 'Shape';
    case 'image':
      return 'Image';
    case 'html':
      return 'HTML';
    case 'code':
      return 'JSX / Code';
    case 'group':
      return 'Group';
    default:
      return 'Text';
  }
}

// ---- Immutable overlay transforms ----------------------------------------

export function replaceLayer(overlay: Overlay, layer: Layer): Overlay {
  return {
    ...overlay,
    layers: overlay.layers.map((l) => (l.id === layer.id ? layer : l)),
  };
}

export function addLayer(overlay: Overlay, layer: Layer): Overlay {
  return { ...overlay, layers: [...overlay.layers, layer] };
}

export function removeLayer(overlay: Overlay, layerId: string): Overlay {
  return { ...overlay, layers: overlay.layers.filter((l) => l.id !== layerId) };
}

export function moveLayer(overlay: Overlay, layerId: string, dir: -1 | 1): Overlay {
  const idx = overlay.layers.findIndex((l) => l.id === layerId);
  if (idx < 0) return overlay;
  const next = idx + dir;
  if (next < 0 || next >= overlay.layers.length) return overlay;
  const layers = [...overlay.layers];
  [layers[idx], layers[next]] = [layers[next], layers[idx]];
  return { ...overlay, layers };
}

/** Set a transform track's static value, preserving keyframes if present. */
export function setTransformValue(
  layer: Layer,
  key: keyof LayerTransform,
  value: number,
): Layer {
  return {
    ...layer,
    transform: {
      ...layer.transform,
      [key]: { ...layer.transform[key], value },
    },
  };
}

/** Insert/replace a keyframe for a transform track at time `ms`. */
export function upsertKeyframe(
  layer: Layer,
  key: keyof LayerTransform,
  ms: number,
  value: number,
  easing: EasingKind = 'easeInOut',
): Layer {
  const track = layer.transform[key];
  const existing = track.keyframes ?? [];
  const others = existing.filter((k) => Math.round(k.time) !== Math.round(ms));
  const kf: Keyframe = { time: ms, value, easing };
  const keyframes = [...others, kf].sort((a, b) => a.time - b.time);
  return {
    ...layer,
    transform: { ...layer.transform, [key]: { ...track, keyframes } },
  };
}

export function removeKeyframe(
  layer: Layer,
  key: keyof LayerTransform,
  time: number,
): Layer {
  const track = layer.transform[key];
  const keyframes = (track.keyframes ?? []).filter(
    (k) => Math.round(k.time) !== Math.round(time),
  );
  return {
    ...layer,
    transform: {
      ...layer.transform,
      [key]: { ...track, keyframes: keyframes.length ? keyframes : undefined },
    },
  };
}
