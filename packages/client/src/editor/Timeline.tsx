import { useRef } from 'react';
import clsx from 'clsx';
import type { Layer, Overlay } from '@streamforge/shared';

/**
 * A lightweight timeline: a time ruler with a draggable playhead plus one row
 * per layer showing keyframe markers aggregated across its transform tracks.
 */
export function Timeline({
  overlay,
  time,
  onScrub,
  selectedLayerId,
  onSelect,
}: {
  overlay: Overlay;
  time: number;
  onScrub: (ms: number) => void;
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = overlay.composition.duration || 1;
  const draggingRef = useRef(false);

  function posToTime(clientX: number): number {
    const el = trackRef.current;
    if (!el) return time;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duration);
  }

  const seconds = Math.ceil(duration / 1000);
  const ticks = Array.from({ length: seconds + 1 }, (_, i) => i);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-600 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">
          Timeline
        </span>
        <span className="font-mono text-xs text-text-muted">
          {(time / 1000).toFixed(2)}s / {(duration / 1000).toFixed(2)}s
        </span>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {/* Ruler */}
        <div
          ref={trackRef}
          className="relative h-7 cursor-ew-resize select-none border-b border-ink-600 bg-ink-850"
          onPointerDown={(e) => {
            draggingRef.current = true;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            onScrub(posToTime(e.clientX));
          }}
          onPointerMove={(e) => draggingRef.current && onScrub(posToTime(e.clientX))}
          onPointerUp={() => (draggingRef.current = false)}
        >
          {ticks.map((s) => (
            <div
              key={s}
              className="absolute top-0 h-full border-l border-ink-600/70 pl-1 text-[10px] text-text-faint"
              style={{ left: `${((s * 1000) / duration) * 100}%` }}
            >
              {s}s
            </div>
          ))}
          <Playhead duration={duration} time={time} />
        </div>

        {/* Layer rows */}
        <div className="relative overflow-y-auto" style={{ maxHeight: 'calc(100% - 28px)' }}>
          {[...overlay.layers].reverse().map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              duration={duration}
              selected={layer.id === selectedLayerId}
              onSelect={() => onSelect(layer.id)}
            />
          ))}
          <div className="pointer-events-none absolute inset-0">
            <Playhead duration={duration} time={time} faded />
          </div>
        </div>
      </div>
    </div>
  );
}

function Playhead({
  duration,
  time,
  faded,
}: {
  duration: number;
  time: number;
  faded?: boolean;
}) {
  return (
    <div
      className={clsx(
        'absolute top-0 z-10 h-full w-px',
        faded ? 'bg-accent/40' : 'bg-accent',
      )}
      style={{ left: `${(time / duration) * 100}%` }}
    >
      {!faded && (
        <div className="absolute -left-1.5 -top-0.5 h-3 w-3 rotate-45 rounded-sm bg-accent" />
      )}
    </div>
  );
}

function LayerRow({
  layer,
  duration,
  selected,
  onSelect,
}: {
  layer: Layer;
  duration: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const keyframes = Object.values(layer.transform).flatMap((track) => track.keyframes ?? []);
  return (
    <div
      onMouseDown={onSelect}
      className={clsx(
        'relative flex h-8 items-center border-b border-ink-600/50 pl-3 text-xs',
        selected ? 'bg-accent/10' : 'hover:bg-ink-700/40',
      )}
    >
      <span className="z-10 w-28 shrink-0 truncate pr-2 text-text-muted">{layer.name}</span>
      <div className="relative h-full flex-1">
        {keyframes.map((kf, i) => (
          <div
            key={i}
            className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px] bg-teal"
            style={{ left: `${(kf.time / duration) * 100}%` }}
            title={`${(kf.time / 1000).toFixed(2)}s`}
          />
        ))}
      </div>
    </div>
  );
}
