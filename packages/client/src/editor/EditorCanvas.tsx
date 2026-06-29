import { useEffect, useRef, useState } from 'react';
import type { GsiPayload, Layer, Overlay } from '@streamforge/shared';
import { numAt } from '@/overlay/evaluate';
import { OverlayCanvas } from '@/overlay/OverlayCanvas';
import { setTransformValue } from './editorOps';

/**
 * The editor viewport: a fit-to-width composition with marching-ants selection
 * and pointer-drag repositioning of the selected layer.
 */
export function EditorCanvas({
  overlay,
  time,
  gsi,
  selectedLayerId,
  onSelectLayer,
  onLayerChange,
}: {
  overlay: Overlay;
  time: number;
  gsi: GsiPayload | null;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onLayerChange: (layer: Layer) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const dragRef = useRef<{
    layer: Layer;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 48;
      const sx = (el.clientWidth - pad) / overlay.composition.width;
      const sy = (el.clientHeight - pad) / overlay.composition.height;
      setScale(Math.max(0.05, Math.min(sx, sy)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [overlay.composition.width, overlay.composition.height]);

  function onPointerDownLayer(id: string, e: React.PointerEvent) {
    const layer = overlay.layers.find((l) => l.id === id);
    if (!layer || layer.locked) return;
    onSelectLayer(id);
    dragRef.current = {
      layer,
      startX: e.clientX,
      startY: e.clientY,
      originX: numAt(layer.transform.x, time),
      originY: numAt(layer.transform.y, time),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    let next = setTransformValue(drag.layer, 'x', Math.round(drag.originX + dx));
    next = setTransformValue(next, 'y', Math.round(drag.originY + dy));
    onLayerChange(next);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      ref={wrapRef}
      className="relative flex h-full items-center justify-center overflow-hidden bg-ink-900 bg-[length:24px_24px] bg-grid-faint"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onSelectLayer(null);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div
        className="relative shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_80px_-30px_rgba(0,0,0,0.9)]"
        style={{
          width: overlay.composition.width * scale,
          height: overlay.composition.height * scale,
          background:
            'repeating-conic-gradient(#0b0c10 0% 25%, #101218 0% 50%) 50% / 28px 28px',
        }}
      >
        <OverlayCanvas
          overlay={overlay}
          timeMs={time}
          gsi={gsi}
          scale={scale}
          selectedLayerId={selectedLayerId}
          onSelectLayer={(id) => onSelectLayer(id)}
        />
        {/* Transparent drag handles sized to each layer (so locked layers ignore). */}
        <div className="pointer-events-none absolute inset-0">
          {overlay.layers
            .filter((l) => l.visible && !l.locked)
            .map((l) => {
              const x = numAt(l.transform.x, time) * scale;
              const y = numAt(l.transform.y, time) * scale;
              const w = numAt(l.transform.width, time) * scale;
              const h = numAt(l.transform.height, time) * scale;
              return (
                <div
                  key={l.id}
                  className="pointer-events-auto absolute"
                  style={{ left: x, top: y, width: w, height: h, cursor: 'move' }}
                  onPointerDown={(e) => onPointerDownLayer(l.id, e)}
                />
              );
            })}
        </div>
      </div>

      <div className="absolute bottom-3 right-3 chip">
        {Math.round(scale * 100)}% · {overlay.composition.width}×{overlay.composition.height}
      </div>
    </div>
  );
}
