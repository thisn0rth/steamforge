import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type {
  GsiPayload,
  Layer,
  LeagueData,
  Overlay,
  OverlayAssignments,
  ResolveContext,
} from '@streamforge/shared';
import { resolveBindingText, resolveTemplate } from '@streamforge/shared';
import { numAt, strAt } from './evaluate';

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
  league = null,
  assignments,
  scale = 1,
  selectedLayerId,
  onSelectLayer,
}: {
  overlay: Overlay;
  timeMs: number;
  gsi: GsiPayload | null;
  league?: LeagueData | null;
  assignments?: OverlayAssignments;
  scale?: number;
  selectedLayerId?: string | null;
  onSelectLayer?: (id: string) => void;
}) {
  const { composition } = overlay;
  const ctx: ResolveContext = {
    gsi,
    league,
    slots: overlay.slots,
    assignments: assignments ?? overlay.defaultAssignments,
  };
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
              ctx={ctx}
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
  ctx,
  selected,
  onSelect,
}: {
  layer: Layer;
  timeMs: number;
  ctx: ResolveContext;
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
      <LayerContent layer={layer} timeMs={timeMs} ctx={ctx} width={w} height={h} />
    </div>
  );
}

function LayerContent({
  layer,
  timeMs,
  ctx,
  width,
  height,
}: {
  layer: Layer;
  timeMs: number;
  ctx: ResolveContext;
  width: number;
  height: number;
}) {
  if (layer.type === 'text' || layer.type === 'gsiText') {
    const props = layer.text;
    if (!props) return null;
    const content =
      layer.type === 'gsiText' && layer.binding
        ? resolveBindingText(layer.binding, ctx)
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

  if (layer.type === 'html' && layer.html) {
    return <HtmlLayer html={layer.html.html} css={layer.html.css} ctx={ctx} />;
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

/**
 * Renders custom HTML/CSS inside a Shadow DOM so pasted styles are scoped to
 * this layer (no leaking/colliding), while `{{ }}` data tokens in the markup
 * and CSS resolve live from GSI/Firestore. Updating in place (vs. an iframe
 * reload) keeps bound values flicker-free as data changes. Non-interactive so
 * the editor can still select the layer underneath.
 */
function HtmlLayer({
  html,
  css,
  ctx,
}: {
  html: string;
  css?: string;
  ctx: ResolveContext;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);
  const resolvedHtml = resolveTemplate(html, ctx);
  const resolvedCss = css ? resolveTemplate(css, ctx) : '';

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!shadowRef.current) {
      shadowRef.current = host.attachShadow({ mode: 'open' });
    }
    shadowRef.current.innerHTML = `<style>:host{display:block;width:100%;height:100%;overflow:hidden}${resolvedCss}</style>${resolvedHtml}`;
  }, [resolvedHtml, resolvedCss]);

  return (
    <div
      ref={hostRef}
      style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
