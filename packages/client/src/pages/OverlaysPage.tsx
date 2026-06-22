import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, Copy, Crosshair, Eye, Pencil, Plus, Radio, Trash2, X } from 'lucide-react';
import type { Overlay } from '@streamforge/shared';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { FocusControls } from '@/components/FocusControls';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { OverlayCanvas } from '@/overlay/OverlayCanvas';

export function OverlaysPage() {
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [creating, setCreating] = useState(false);
  const [focusOverlay, setFocusOverlay] = useState<Overlay | null>(null);

  async function load() {
    setOverlays(await api.overlays());
  }
  useEffect(() => {
    void load();
  }, []);

  async function create() {
    setCreating(true);
    try {
      const name = `Overlay ${overlays.length + 1}`;
      await api.createOverlay(name);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function remove(o: Overlay) {
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete overlay "${o.name}"?`)) return;
    await api.deleteOverlay(o.id);
    await load();
  }

  function copyUrl(o: Overlay) {
    const url = `${location.origin}/overlay/${o.id}`;
    void navigator.clipboard.writeText(url);
  }

  return (
    <div>
      <PageHeader
        title="Overlays"
        subtitle="Design broadcast graphics. Push to Preview, then TAKE to Live."
        actions={
          <button className="btn-primary" disabled={creating} onClick={() => void create()}>
            <Plus size={16} /> New overlay
          </button>
        }
      />

      <OutputBar overlays={overlays} />

      <div className="grid grid-cols-1 gap-5 p-8 sm:grid-cols-2 xl:grid-cols-3">
        {overlays.map((o) => (
          <div key={o.id} className="panel overflow-hidden">
            <div className="relative flex aspect-video items-center justify-center bg-[length:20px_20px] bg-grid-faint bg-ink-900">
              <PreviewThumb overlay={o} />
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{o.name}</div>
                <div className="text-xs text-text-faint">
                  {o.composition.width}×{o.composition.height} · {o.layers.length} layers
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <OutputToggles overlayId={o.id} />
                {o.slots && o.slots.length > 0 && (
                  <button
                    className="rounded-md p-2 text-text-faint hover:bg-ink-700 hover:text-accent"
                    title="Set focus (assign players/teams to slots)"
                    onClick={() => setFocusOverlay(o)}
                  >
                    <Crosshair size={15} />
                  </button>
                )}
                <button
                  className="rounded-md p-2 text-text-faint hover:bg-ink-700 hover:text-text"
                  title="Copy browser-source URL"
                  onClick={() => copyUrl(o)}
                >
                  <Copy size={15} />
                </button>
                <Link
                  to={`/editor/${o.id}`}
                  className="rounded-md p-2 text-text-faint hover:bg-ink-700 hover:text-text"
                  title="Edit"
                >
                  <Pencil size={15} />
                </Link>
                <button
                  className="rounded-md p-2 text-text-faint hover:bg-ink-700 hover:text-live"
                  title="Delete"
                  onClick={() => void remove(o)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={() => void create()}
          className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-500 text-text-faint transition hover:border-accent/60 hover:text-text"
        >
          <Plus size={22} />
          <span className="text-sm font-medium">Create overlay</span>
        </button>
      </div>

      <Modal
        open={focusOverlay != null}
        title={focusOverlay ? `Focus · ${focusOverlay.name}` : 'Focus'}
        onClose={() => setFocusOverlay(null)}
      >
        {focusOverlay && <FocusControls overlay={focusOverlay} />}
      </Modal>
    </div>
  );
}

function OutputToggles({ overlayId }: { overlayId: string }) {
  const output = useStore((s) => s.output);
  const onPreview = output.preview.includes(overlayId);
  const onProgram = output.program.includes(overlayId);
  return (
    <>
      <button
        className={`rounded-md p-2 transition hover:bg-ink-700 ${
          onPreview ? 'text-teal' : 'text-text-faint hover:text-teal'
        }`}
        title={onPreview ? 'On Preview — click to remove' : 'Push to Preview'}
        onClick={() =>
          void (onPreview
            ? api.removeOutput('preview', overlayId)
            : api.pushOutput('preview', overlayId))}
      >
        <Eye size={15} />
      </button>
      <button
        className={`rounded-md p-2 transition hover:bg-ink-700 ${
          onProgram ? 'text-live' : 'text-text-faint hover:text-live'
        }`}
        title={onProgram ? 'On Live — click to remove' : 'Push to Live'}
        onClick={() =>
          void (onProgram
            ? api.removeOutput('program', overlayId)
            : api.pushOutput('program', overlayId))}
      >
        <Radio size={15} />
      </button>
    </>
  );
}

function OutputBar({ overlays }: { overlays: Overlay[] }) {
  const output = useStore((s) => s.output);
  const nameOf = (id: string) => overlays.find((o) => o.id === id)?.name ?? id;

  function copy(path: string) {
    void navigator.clipboard.writeText(`${location.origin}${path}`);
  }

  return (
    <div className="mx-8 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 bg-ink-850 px-4 py-3">
      <Channel
        label="Preview"
        color="text-teal"
        ids={output.preview}
        nameOf={nameOf}
        onRemove={(id) => void api.removeOutput('preview', id)}
      />
      <button
        className="btn-primary shrink-0"
        title="Push Preview to Live"
        disabled={output.preview.length === 0}
        onClick={() => void api.takeOutput()}
      >
        <ArrowRightLeft size={15} /> TAKE
      </button>
      <Channel
        label="Live"
        color="text-live"
        ids={output.program}
        nameOf={nameOf}
        onRemove={(id) => void api.removeOutput('program', id)}
      />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button className="btn-ghost" title="Copy /live source URL" onClick={() => copy('/live')}>
          <Copy size={13} /> /live
        </button>
        <button className="btn-ghost" title="Copy /preview source URL" onClick={() => copy('/preview')}>
          <Copy size={13} /> /preview
        </button>
        <button
          className="btn-ghost"
          title="Clear all output"
          onClick={() => void api.clearOutput('all')}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function Channel({
  label,
  color,
  ids,
  nameOf,
  onRemove,
}: {
  label: string;
  color: string;
  ids: string[];
  nameOf: (id: string) => string;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {ids.length === 0 ? (
          <span className="text-xs text-text-faint">empty</span>
        ) : (
          ids.map((id) => (
            <span
              key={id}
              className="flex items-center gap-1 rounded-md bg-ink-700 px-2 py-0.5 text-xs"
            >
              {nameOf(id)}
              <button
                className="text-text-faint hover:text-text"
                onClick={() => onRemove(id)}
              >
                <X size={11} />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewThumb({ overlay }: { overlay: Overlay }) {
  // Fit the composition into a ~320px-wide thumbnail.
  const scale = 320 / overlay.composition.width;
  return (
    <div style={{ transform: `scale(1)`, pointerEvents: 'none' }}>
      <OverlayCanvas overlay={overlay} timeMs={0} gsi={null} scale={scale} />
    </div>
  );
}
