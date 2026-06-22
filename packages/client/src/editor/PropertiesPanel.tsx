import { Diamond } from 'lucide-react';
import clsx from 'clsx';
import type { Layer, LayerTransform, OverlaySlot } from '@streamforge/shared';
import { numAt } from '@/overlay/evaluate';
import { setTransformValue, TRANSFORM_KEYS } from './editorOps';
import { MediaPicker } from './MediaPicker';
import { GsiBindingFields } from './GsiBindingFields';

const TRANSFORM_LABELS: Record<keyof LayerTransform, string> = {
  x: 'X',
  y: 'Y',
  width: 'W',
  height: 'H',
  rotation: 'Rotate',
  scale: 'Scale',
  opacity: 'Opacity',
};

export function PropertiesPanel({
  layer,
  time,
  slots,
  onChange,
  onToggleKeyframe,
}: {
  layer: Layer | null;
  time: number;
  slots: OverlaySlot[];
  onChange: (layer: Layer) => void;
  onToggleKeyframe: (key: keyof LayerTransform) => void;
}) {
  if (!layer) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-text-faint">
        Select a layer to edit its properties.
      </div>
    );
  }

  function patch(p: Partial<Layer>) {
    if (layer) onChange({ ...layer, ...p });
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-ink-600 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">
          Properties
        </span>
      </div>

      <div className="space-y-5 p-3">
        <div>
          <label className="label">Layer name</label>
          <input
            className="input"
            value={layer.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>

        <Section title="Transform">
          <div className="grid grid-cols-2 gap-2">
            {TRANSFORM_KEYS.map((key) => {
              const track = layer.transform[key];
              const hasKf = (track.keyframes?.length ?? 0) > 0;
              const animatedHere = track.keyframes?.some(
                (k) => Math.round(k.time) === Math.round(time),
              );
              const value = numAt(track, time);
              const step = key === 'opacity' || key === 'scale' ? 0.05 : 1;
              return (
                <div key={key}>
                  <label className="label flex items-center justify-between">
                    <span>{TRANSFORM_LABELS[key]}</span>
                    <button
                      title="Toggle keyframe at playhead"
                      onClick={() => onToggleKeyframe(key)}
                      className={clsx(
                        'transition',
                        animatedHere
                          ? 'text-accent'
                          : hasKf
                            ? 'text-teal'
                            : 'text-text-faint hover:text-text',
                      )}
                    >
                      <Diamond size={12} fill={animatedHere ? 'currentColor' : 'none'} />
                    </button>
                  </label>
                  <input
                    type="number"
                    step={step}
                    className="input"
                    value={Number(value.toFixed(2))}
                    onChange={(e) =>
                      onChange(setTransformValue(layer, key, Number(e.target.value)))
                    }
                  />
                </div>
              );
            })}
          </div>
        </Section>

        {(layer.type === 'text' || layer.type === 'gsiText') && layer.text && (
          <Section title="Text">
            {layer.type === 'text' && (
              <Field label="Content">
                <textarea
                  className="input min-h-[60px] resize-y"
                  value={layer.text.text}
                  onChange={(e) =>
                    patch({ text: { ...layer.text!, text: e.target.value } })
                  }
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="Font size">
                <input
                  type="number"
                  className="input"
                  value={layer.text.fontSize}
                  onChange={(e) =>
                    patch({ text: { ...layer.text!, fontSize: Number(e.target.value) } })
                  }
                />
              </Field>
              <Field label="Weight">
                <select
                  className="input"
                  value={layer.text.fontWeight}
                  onChange={(e) =>
                    patch({ text: { ...layer.text!, fontWeight: Number(e.target.value) } })
                  }
                >
                  {[300, 400, 500, 600, 700, 800].map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  className="input h-9 p-1"
                  value={layer.text.color}
                  onChange={(e) =>
                    patch({ text: { ...layer.text!, color: e.target.value } })
                  }
                />
              </Field>
              <Field label="Align">
                <select
                  className="input"
                  value={layer.text.align}
                  onChange={(e) =>
                    patch({
                      text: {
                        ...layer.text!,
                        align: e.target.value as 'left' | 'center' | 'right',
                      },
                    })
                  }
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </Field>
            </div>
          </Section>
        )}

        {layer.type === 'gsiText' && layer.binding && (
          <Section title="GSI Binding">
            <GsiBindingFields
              binding={layer.binding}
              slots={slots}
              onChange={(binding) => patch({ binding })}
            />
          </Section>
        )}

        {layer.type === 'shape' && layer.shape && (
          <Section title="Shape">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type">
                <select
                  className="input"
                  value={layer.shape.shape}
                  onChange={(e) =>
                    patch({
                      shape: { ...layer.shape!, shape: e.target.value as 'rect' | 'ellipse' },
                    })
                  }
                >
                  <option value="rect">Rectangle</option>
                  <option value="ellipse">Ellipse</option>
                </select>
              </Field>
              <Field label="Fill">
                <input
                  type="color"
                  className="input h-9 p-1"
                  value={layer.shape.fill}
                  onChange={(e) => patch({ shape: { ...layer.shape!, fill: e.target.value } })}
                />
              </Field>
              <Field label="Corner radius">
                <input
                  type="number"
                  className="input"
                  value={layer.shape.cornerRadius}
                  onChange={(e) =>
                    patch({ shape: { ...layer.shape!, cornerRadius: Number(e.target.value) } })
                  }
                />
              </Field>
              <Field label="Stroke width">
                <input
                  type="number"
                  className="input"
                  value={layer.shape.strokeWidth}
                  onChange={(e) =>
                    patch({ shape: { ...layer.shape!, strokeWidth: Number(e.target.value) } })
                  }
                />
              </Field>
            </div>
          </Section>
        )}

        {layer.type === 'html' && layer.html && (
          <Section title="HTML / CSS">
            <Field label="HTML">
              <textarea
                className="input min-h-[120px] resize-y font-mono text-xs"
                spellCheck={false}
                value={layer.html.html}
                placeholder="<div>…</div>"
                onChange={(e) => patch({ html: { ...layer.html!, html: e.target.value } })}
              />
            </Field>
            <Field label="CSS">
              <textarea
                className="input min-h-[120px] resize-y font-mono text-xs"
                spellCheck={false}
                value={layer.html.css ?? ''}
                placeholder=".box { color: #fff; }"
                onChange={(e) => patch({ html: { ...layer.html!, css: e.target.value } })}
              />
            </Field>
            <div className="space-y-1 text-[11px] text-text-faint">
              <p>Scoped to this layer. Embed live data with tokens, e.g.</p>
              <p className="font-mono text-text-muted">
                {'{{map.team_ct.score}}'} · {'{{players.ct.1.state.health}}'}
              </p>
              {slots.length > 0 ? (
                <p>
                  Slots:{' '}
                  {slots.map((s) => (
                    <code key={s.id} className="font-mono text-text-muted">
                      {`{{${s.id}.gsi.…}}`}{' '}
                    </code>
                  ))}
                </p>
              ) : (
                <p>Add slots to use {'{{<slot>.gsi.…}}'} / {'{{<slot>.fs.…}}'} focus tokens.</p>
              )}
            </div>
          </Section>
        )}

        {layer.type === 'image' && layer.image && (
          <Section title="Image">
            <Field label="Media">
              <MediaPicker
                value={layer.image.src}
                onSelect={(url) => patch({ image: { ...layer.image!, src: url } })}
              />
            </Field>
            <Field label="Source URL">
              <input
                className="input"
                value={layer.image.src}
                placeholder="https://… or /assets/…"
                onChange={(e) => patch({ image: { ...layer.image!, src: e.target.value } })}
              />
            </Field>
            <Field label="Fit">
              <select
                className="input"
                value={layer.image.fit}
                onChange={(e) =>
                  patch({
                    image: {
                      ...layer.image!,
                      fit: e.target.value as 'contain' | 'cover' | 'fill',
                    },
                  })
                }
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
            </Field>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
