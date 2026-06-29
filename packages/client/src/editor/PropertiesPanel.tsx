import { useRef, useState } from 'react';
import { Diamond, ImagePlus, Maximize2, X } from 'lucide-react';
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
  const [htmlEditorOpen, setHtmlEditorOpen] = useState(false);
  const [codeEditorOpen, setCodeEditorOpen] = useState(false);

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
          <Section
            title="HTML / CSS"
            action={
              <button
                className="flex items-center gap-1 text-[11px] text-text-faint hover:text-text"
                onClick={() => setHtmlEditorOpen(true)}
                title="Open fullscreen editor"
              >
                <Maximize2 size={12} /> Expand
              </button>
            }
          >
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

        {layer.type === 'html' && layer.html && htmlEditorOpen && (
          <HtmlCssEditor
            html={layer.html.html}
            css={layer.html.css ?? ''}
            slots={slots}
            onChangeHtml={(html) => patch({ html: { ...layer.html!, html } })}
            onChangeCss={(css) => patch({ html: { ...layer.html!, css } })}
            onClose={() => setHtmlEditorOpen(false)}
          />
        )}

        {layer.type === 'code' && layer.code && (
          <Section
            title="JSX / Code"
            action={
              <button
                className="flex items-center gap-1 text-[11px] text-text-faint hover:text-text"
                onClick={() => setCodeEditorOpen(true)}
                title="Open fullscreen editor"
              >
                <Maximize2 size={12} /> Expand
              </button>
            }
          >
            <Field label="Component body (returns JSX)">
              <textarea
                className="input min-h-[160px] resize-y font-mono text-xs"
                spellCheck={false}
                value={layer.code.code}
                onChange={(e) => patch({ code: { ...layer.code!, code: e.target.value } })}
              />
            </Field>
            <p className="text-[11px] text-text-faint">
              React + hooks in scope; data vars: <code className="font-mono">ctPlayers</code>,{' '}
              <code className="font-mono">tPlayers</code>, <code className="font-mono">gsi</code>,{' '}
              <code className="font-mono">league</code>, <code className="font-mono">map</code>. Fills
              the composition (position: fixed / 100vw work).
            </p>
          </Section>
        )}

        {layer.type === 'code' && layer.code && codeEditorOpen && (
          <CodeEditor
            code={layer.code.code}
            onChange={(code) => patch({ code: { ...layer.code!, code } })}
            onClose={() => setCodeEditorOpen(false)}
          />
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

/**
 * Fullscreen editor for a JSX/code layer: one large pane plus a cheat sheet of
 * the data variables available to the component.
 */
function CodeEditor({
  code,
  onChange,
  onClose,
}: {
  code: string;
  onChange: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="panel m-4 flex flex-1 flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
          <h2 className="text-base font-semibold">JSX / Code editor</h2>
          <button className="text-text-faint hover:text-text" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <textarea
          className="flex-1 resize-none bg-ink-900 px-5 py-4 font-mono text-xs text-text outline-none"
          spellCheck={false}
          value={code}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-600 px-5 py-2 text-[11px] text-text-faint">
          <span>In scope:</span>
          <code className="font-mono text-text-muted">React + hooks</code>
          <code className="font-mono text-text-muted">ctPlayers / tPlayers / allPlayers</code>
          <code className="font-mono text-text-muted">gsi</code>
          <code className="font-mono text-text-muted">league</code>
          <code className="font-mono text-text-muted">map</code>
          <code className="font-mono text-text-muted">round</code>
          <code className="font-mono text-text-muted">assignments</code>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
          {title}
        </h3>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Fullscreen HTML/CSS editor for an `html` layer: large side-by-side HTML and
 * CSS panes, an image inserter (upload / pick from the media library inserts an
 * <img> at the cursor), and the data-token cheat sheet.
 */
function HtmlCssEditor({
  html,
  css,
  slots,
  onChangeHtml,
  onChangeCss,
  onClose,
}: {
  html: string;
  css: string;
  slots: OverlaySlot[];
  onChangeHtml: (html: string) => void;
  onChangeCss: (css: string) => void;
  onClose: () => void;
}) {
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const [showImages, setShowImages] = useState(false);

  function insertImage(url: string) {
    const snippet = `<img src="${url}" />`;
    const el = htmlRef.current;
    if (!el) {
      onChangeHtml(html + snippet);
      return;
    }
    const start = el.selectionStart ?? html.length;
    const end = el.selectionEnd ?? html.length;
    const next = html.slice(0, start) + snippet + html.slice(end);
    onChangeHtml(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="panel m-4 flex flex-1 flex-col overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
          <h2 className="text-base font-semibold">HTML / CSS editor</h2>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost text-xs"
              onClick={() => setShowImages((v) => !v)}
            >
              <ImagePlus size={14} /> Insert image
            </button>
            <button className="text-text-faint hover:text-text" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {showImages && (
          <div className="border-b border-ink-600 bg-ink-850 px-5 py-3">
            <MediaPicker value="" onSelect={(url) => insertImage(url)} />
            <p className="mt-1 text-[11px] text-text-faint">
              Selecting an image inserts an &lt;img&gt; at the cursor. You can also reference any
              asset by its /assets/… URL.
            </p>
          </div>
        )}

        <div className="grid flex-1 grid-cols-2 gap-px overflow-hidden bg-ink-600">
          <div className="flex flex-col bg-ink-900">
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
              HTML
            </div>
            <textarea
              ref={htmlRef}
              className="flex-1 resize-none bg-transparent px-4 pb-4 font-mono text-xs text-text outline-none"
              spellCheck={false}
              value={html}
              placeholder="<div>…</div>"
              onChange={(e) => onChangeHtml(e.target.value)}
            />
          </div>
          <div className="flex flex-col bg-ink-900">
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-accent-soft">
              CSS
            </div>
            <textarea
              className="flex-1 resize-none bg-transparent px-4 pb-4 font-mono text-xs text-text outline-none"
              spellCheck={false}
              value={css}
              placeholder=".box { color: #fff; }"
              onChange={(e) => onChangeCss(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-600 px-5 py-2 text-[11px] text-text-faint">
          <span>Live tokens:</span>
          <code className="font-mono text-text-muted">{'{{map.team_ct.score}}'}</code>
          <code className="font-mono text-text-muted">{'{{players.ct.1.state.health}}'}</code>
          {slots.map((s) => (
            <code key={s.id} className="font-mono text-text-muted">{`{{${s.id}.gsi.…}}`}</code>
          ))}
        </div>
      </div>
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
