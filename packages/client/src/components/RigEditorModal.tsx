import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Overlay, Rig, RigSourceState, Transition } from '@streamforge/shared';
import { Modal } from '@/components/Modal';
import { api } from '@/lib/api';
import { useStore } from '@/store/useStore';

const COLOR_PRESETS = [
  '#6c7bff',
  '#39d3c3',
  '#ff4d6d',
  '#ffb020',
  '#a06cff',
  '#3aa0ff',
  '#43d17a',
  '#ff7849',
];

export function RigEditorModal({
  rig,
  onClose,
  onSaved,
}: {
  rig: Rig | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const obs = useStore((s) => s.obs);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(rig?.name ?? 'New Rig');
  const [color, setColor] = useState(rig?.color ?? COLOR_PRESETS[0]);
  const [targetScene, setTargetScene] = useState(rig?.targetScene ?? '');
  const [transitionId, setTransitionId] = useState<string | null>(rig?.transitionId ?? null);
  const [sources, setSources] = useState<RigSourceState[]>(rig?.sources ?? []);
  const [overlayIds, setOverlayIds] = useState<string[]>(
    rig?.overlays.map((o) => o.overlayId) ?? [],
  );

  useEffect(() => {
    api.overlays().then(setOverlays).catch(() => undefined);
    api.transitions().then(setTransitions).catch(() => undefined);
  }, []);

  const sceneItems = useMemo(
    () => obs.scenes.find((s) => s.name === targetScene)?.items ?? [],
    [obs.scenes, targetScene],
  );

  function toggleSource(sourceName: string, enabled: boolean) {
    setSources((prev) => {
      const others = prev.filter((s) => s.sourceName !== sourceName);
      return [...others, { sourceName, enabled }];
    });
  }

  function sourceEnabled(sourceName: string, fallback: boolean): boolean {
    return sources.find((s) => s.sourceName === sourceName)?.enabled ?? fallback;
  }

  async function save() {
    setSaving(true);
    const payload: Partial<Rig> = {
      name,
      color,
      targetScene,
      transitionId,
      sources,
      overlays: overlayIds.map((overlayId) => ({
        overlayId,
        sourceName: overlays.find((o) => o.id === overlayId)?.name ?? overlayId,
        enabled: true,
      })),
    };
    try {
      if (rig) {
        await api.updateRig(rig.id, payload);
      } else {
        await api.createRig(payload);
      }
      onSaved();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err instanceof Error ? err.message : 'Failed to save rig');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!rig) return;
    // eslint-disable-next-line no-alert
    if (!confirm(`Delete rig "${rig.name}"?`)) return;
    await api.deleteRig(rig.id);
    onSaved();
  }

  return (
    <Modal
      open
      wide
      title={rig ? 'Edit rig' : 'New rig'}
      onClose={onClose}
      footer={
        <>
          {rig && (
            <button className="btn-danger mr-auto" onClick={() => void remove()}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save rig'}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Color</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-md border border-ink-500 transition hover:scale-110"
                style={{
                  backgroundColor: c,
                  outline: color === c ? '2px solid white' : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded bg-transparent"
            />
          </div>
        </div>

        <div>
          <label className="label">Target scene</label>
          {obs.scenes.length > 0 ? (
            <select
              className="input"
              value={targetScene}
              onChange={(e) => setTargetScene(e.target.value)}
            >
              <option value="">— select scene —</option>
              {obs.scenes.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              placeholder="Scene name (OBS offline)"
              value={targetScene}
              onChange={(e) => setTargetScene(e.target.value)}
            />
          )}
        </div>

        <div>
          <label className="label">Transition</label>
          <select
            className="input"
            value={transitionId ?? ''}
            onChange={(e) => setTransitionId(e.target.value || null)}
          >
            <option value="">— OBS default —</option>
            {transitions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.kind})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label className="label">Overlays in this rig</label>
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-ink-600 bg-ink-850 p-2">
          {overlays.length === 0 && (
            <p className="px-1 py-2 text-xs text-text-faint">
              No overlays yet — create them in the Overlays tab.
            </p>
          )}
          {overlays.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-700"
            >
              <input
                type="checkbox"
                checked={overlayIds.includes(o.id)}
                onChange={(e) =>
                  setOverlayIds((prev) =>
                    e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id),
                  )
                }
              />
              {o.name}
            </label>
          ))}
        </div>
      </div>

      {targetScene && sceneItems.length > 0 && (
        <div className="mt-5">
          <label className="label">Source visibility on “{targetScene}”</label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-ink-600 bg-ink-850 p-2">
            {sceneItems.map((item) => (
              <label
                key={item.sceneItemId}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-700"
              >
                <input
                  type="checkbox"
                  checked={sourceEnabled(item.sourceName, item.enabled)}
                  onChange={(e) => toggleSource(item.sourceName, e.target.checked)}
                />
                {item.sourceName}
              </label>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
