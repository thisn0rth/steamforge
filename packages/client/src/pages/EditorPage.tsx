import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Pause, Play, Save, SkipBack } from 'lucide-react';
import type { Layer, LayerTransform, LayerType, Overlay } from '@streamforge/shared';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';
import { EditorCanvas } from '@/editor/EditorCanvas';
import { LayersPanel } from '@/editor/LayersPanel';
import { PropertiesPanel } from '@/editor/PropertiesPanel';
import { Timeline } from '@/editor/Timeline';
import { numAt } from '@/overlay/evaluate';
import {
  addLayer,
  createLayer,
  moveLayer,
  removeKeyframe,
  removeLayer,
  replaceLayer,
  upsertKeyframe,
} from '@/editor/editorOps';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const gsi = useStore((s) => s.gsi);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const playStartRef = useRef(0);
  const playFromRef = useRef(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    api.overlay(id).then((o) => {
      setOverlay(o);
      setSelectedLayerId(o.layers[0]?.id ?? null);
      loadedRef.current = true;
    });
  }, [id]);

  // Playback loop.
  useEffect(() => {
    if (!playing || !overlay) return;
    playStartRef.current = performance.now();
    playFromRef.current = time;
    let raf = 0;
    const dur = overlay.composition.duration || 1;
    const tick = () => {
      const elapsed = performance.now() - playStartRef.current + playFromRef.current;
      setTime(elapsed % dur);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, overlay?.composition.duration]);

  // Debounced autosave whenever the overlay changes after the initial load.
  useEffect(() => {
    if (!overlay || !loadedRef.current) return;
    setSaveState('saving');
    const handle = setTimeout(() => {
      api
        .updateOverlay(overlay.id, overlay)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('idle'));
    }, 700);
    return () => clearTimeout(handle);
  }, [overlay]);

  const updateLayer = useCallback(
    (layer: Layer) => setOverlay((o) => (o ? replaceLayer(o, layer) : o)),
    [],
  );

  const selectedLayer = overlay?.layers.find((l) => l.id === selectedLayerId) ?? null;

  function handleAdd(type: LayerType) {
    if (!overlay) return;
    const layer = createLayer(type);
    setOverlay(addLayer(overlay, layer));
    setSelectedLayerId(layer.id);
  }

  function handleToggleKeyframe(key: keyof LayerTransform) {
    if (!selectedLayer) return;
    const track = selectedLayer.transform[key];
    const atPlayhead = track.keyframes?.some(
      (k) => Math.round(k.time) === Math.round(time),
    );
    if (atPlayhead) {
      updateLayer(removeKeyframe(selectedLayer, key, time));
    } else {
      updateLayer(upsertKeyframe(selectedLayer, key, time, numAt(track, time)));
    }
  }

  function copyUrl() {
    if (!overlay) return;
    void navigator.clipboard.writeText(`${location.origin}/overlay/${overlay.id}`);
  }

  if (!overlay) {
    return <div className="p-8 text-sm text-text-muted">Loading overlay…</div>;
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-ink-600 bg-ink-850 px-4 py-2.5">
        <Link to="/overlays" className="btn-ghost px-2 py-1.5">
          <ArrowLeft size={15} />
        </Link>
        <input
          className="w-64 rounded-md bg-transparent px-1 text-sm font-semibold outline-none focus:bg-ink-800"
          value={overlay.name}
          onChange={(e) => setOverlay({ ...overlay, name: e.target.value })}
        />
        <div className="flex items-center gap-1">
          <button className="btn-ghost px-2 py-1.5" title="Rewind" onClick={() => setTime(0)}>
            <SkipBack size={15} />
          </button>
          <button
            className="btn-primary px-2.5 py-1.5"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-text-faint">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
          </span>
          <button className="btn-ghost py-1.5" onClick={copyUrl} title="Copy OBS browser-source URL">
            <Copy size={14} /> Source URL
          </button>
          <button
            className="btn-ghost py-1.5"
            onClick={() => {
              setSaveState('saving');
              api.updateOverlay(overlay.id, overlay).then(() => setSaveState('saved'));
            }}
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      {/* Main editor area */}
      <div className="flex min-h-0 flex-1">
        <div className="w-60 shrink-0 border-r border-ink-600 bg-ink-850">
          <LayersPanel
            overlay={overlay}
            selectedLayerId={selectedLayerId}
            onSelect={setSelectedLayerId}
            onAdd={handleAdd}
            onToggleVisible={(l) => updateLayer({ ...l, visible: !l.visible })}
            onToggleLock={(l) => updateLayer({ ...l, locked: !l.locked })}
            onMove={(lid, dir) => setOverlay(moveLayer(overlay, lid, dir))}
            onDelete={(lid) => {
              setOverlay(removeLayer(overlay, lid));
              if (selectedLayerId === lid) setSelectedLayerId(null);
            }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <EditorCanvas
            overlay={overlay}
            time={time}
            gsi={gsi}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onLayerChange={updateLayer}
          />
        </div>

        <div className="w-72 shrink-0 border-l border-ink-600 bg-ink-850">
          <PropertiesPanel
            layer={selectedLayer}
            time={time}
            onChange={updateLayer}
            onToggleKeyframe={handleToggleKeyframe}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="h-48 shrink-0 border-t border-ink-600 bg-ink-850">
        <Timeline
          overlay={overlay}
          time={time}
          onScrub={setTime}
          selectedLayerId={selectedLayerId}
          onSelect={setSelectedLayerId}
        />
      </div>
    </div>
  );
}
