import type { CSSProperties } from 'react';
import type { GsiPayload, Layer, Overlay } from '@streamforge/shared';
import { numAt, resolveBinding, strAt } from './evaluate';

/**
 * Renders an overlay composition at native resolution and time `timeMs`.
 * Callers control sizing by passing a `scale` (the composition is rendered at
 * full pixel size, then CSS-scaled). Used in the editor, list previews, and the
 * OBS browser-source renderer.
 */
export function OverlayCanvas({
  overlay,
  timeMs,
  gsi,
  scale = 1,
  selectedLayerId,
  onSelectLayer,
}: {
  overlay: Overlay;
  timeMs: number;
  gsi: GsiPayload | null;
  scale?: number;
  selectedLayerId?: string | null;
  onSelectLayer?: (id: string) => void;
}) {
  const { composition } = overlay;
  return (
    <div
      style={{
        width: composition.width * scale,
        height: composition.height * scale,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: composition.width,
          height: composition.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
          background:
            composition.background === 'transparent' ? 'transparent' : composition.background,
        }}
      >
        {overlay.layers
          .filter((l) => l.visible)
          .map((layer) => (
            <LayerView
              key={layer.id}
              layer={layer}
              timeMs={timeMs}
              gsi={gsi}
              selected={selectedLayerId === layer.id}
              onSelect={onSelectLayer}
            />
          ))}
      </div>
    </div>
  );
}

function LayerView({
  layer,
  timeMs,
  gsi,
  selected,
  onSelect,
}: {
  layer: Layer;
  timeMs: number;
  gsi: GsiPayload | null;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const t = layer.transform;
  const x = numAt(t.x, timeMs);
  const y = numAt(t.y, timeMs);
  const w = numAt(t.width, timeMs);
  const h = numAt(t.height, timeMs);
  const rotation = numAt(t.rotation, timeMs);
  const opacity = numAt(t.opacity, timeMs);
  const sc = numAt(t.scale, timeMs);

  const base: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width: w,
    height: h,
    opacity,
    transform: `rotate(${rotation}deg) scale(${sc})`,
    transformOrigin: 'center',
    outline: selected ? '2px solid #6c7bff' : undefined,
    cursor: onSelect ? 'pointer' : undefined,
  };

  return (
    <div
      style={base}
      onMouseDown={onSelect ? () => onSelect(layer.id) : undefined}
    >
      <LayerContent layer={layer} timeMs={timeMs} gsi={gsi} width={w} height={h} />
    </div>
  );
}

function LayerContent({
  layer,
  timeMs,
  gsi,
  width,
  height,
}: {
  layer: Layer;
  timeMs: number;
  gsi: GsiPayload | null;
  width: number;
  height: number;
}) {
  if (layer.type === 'text' || layer.type === 'gsiText') {
    const props = layer.text;
    if (!props) return null;
    const content =
      layer.type === 'gsiText' && layer.binding
        ? resolveBinding(layer.binding, gsi)
        : strAt({ value: props.text }, timeMs);
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            props.align === 'center' ? 'center' : props.align === 'right' ? 'flex-end' : 'flex-start',
          fontFamily: props.fontFamily,
          fontSize: props.fontSize,
          fontWeight: props.fontWeight,
          color: props.color,
          letterSpacing: props.letterSpacing,
          lineHeight: props.lineHeight,
          textAlign: props.align,
          whiteSpace: 'pre-wrap',
        }}
      >
        {content}
      </div>
    );
  }

  if (layer.type === 'image' && layer.image) {
    return (
      <img
        src={layer.image.src}
        alt={layer.name}
        style={{ width: '100%', height: '100%', objectFit: layer.image.fit }}
        draggable={false}
      />
    );
  }

  if (layer.type === 'shape' && layer.shape) {
    const s = layer.shape;
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: s.fill,
          border: s.strokeWidth ? `${s.strokeWidth}px solid ${s.stroke}` : undefined,
          borderRadius: s.shape === 'ellipse' ? '50%' : s.cornerRadius,
        }}
      />
    );
  }

  // group / unknown — render nothing visible (children are top-level layers).
  void width;
  void height;
  return null;
}
