import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Code2,
  Image as ImageIcon,
  Lock,
  Plus,
  Square,
  Trash2,
  Type,
  Unlock,
  Variable,
} from 'lucide-react';
import clsx from 'clsx';
import type { Layer, LayerType, Overlay } from '@streamforge/shared';

const LAYER_ICON: Record<LayerType, typeof Type> = {
  text: Type,
  gsiText: Variable,
  shape: Square,
  image: ImageIcon,
  html: Code2,
  group: Square,
};

const ADD_MENU: { type: LayerType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'gsiText', label: 'GSI-bound Text' },
  { type: 'shape', label: 'Shape' },
  { type: 'image', label: 'Image' },
  { type: 'html', label: 'HTML / CSS' },
];

export function LayersPanel({
  overlay,
  selectedLayerId,
  onSelect,
  onAdd,
  onToggleVisible,
  onToggleLock,
  onMove,
  onDelete,
}: {
  overlay: Overlay;
  selectedLayerId: string | null;
  onSelect: (id: string) => void;
  onAdd: (type: LayerType) => void;
  onToggleVisible: (layer: Layer) => void;
  onToggleLock: (layer: Layer) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Topmost (last drawn) first.
  const ordered = [...overlay.layers].reverse();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-ink-600 px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">
          Layers
        </span>
        <div className="relative">
          <button className="btn-ghost px-2 py-1" onClick={() => setMenuOpen((v) => !v)}>
            <Plus size={14} /> Add
          </button>
          {menuOpen && (
            <div
              className="panel absolute right-0 z-20 mt-1 w-44 overflow-hidden p-1"
              onMouseLeave={() => setMenuOpen(false)}
            >
              {ADD_MENU.map((m) => {
                const Icon = LAYER_ICON[m.type];
                return (
                  <button
                    key={m.type}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink-700"
                    onClick={() => {
                      onAdd(m.type);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon size={14} className="text-accent" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {ordered.map((layer) => {
          const Icon = LAYER_ICON[layer.type];
          const selected = layer.id === selectedLayerId;
          return (
            <div
              key={layer.id}
              onMouseDown={() => onSelect(layer.id)}
              className={clsx(
                'group mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition',
                selected
                  ? 'bg-accent/15 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25)]'
                  : 'hover:bg-ink-700/60',
              )}
            >
              <Icon size={15} className={selected ? 'text-accent-soft' : 'text-text-muted'} />
              <span className="flex-1 truncate">{layer.name}</span>
              <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <IconBtn title="Up" onClick={() => onMove(layer.id, 1)}>
                  <ChevronUp size={14} />
                </IconBtn>
                <IconBtn title="Down" onClick={() => onMove(layer.id, -1)}>
                  <ChevronDown size={14} />
                </IconBtn>
                <IconBtn title="Delete" danger onClick={() => onDelete(layer.id)}>
                  <Trash2 size={13} />
                </IconBtn>
              </div>
              <IconBtn
                title={layer.locked ? 'Unlock' : 'Lock'}
                onClick={() => onToggleLock(layer)}
              >
                {layer.locked ? <Lock size={13} /> : <Unlock size={13} className="opacity-40" />}
              </IconBtn>
              <IconBtn
                title={layer.visible ? 'Hide' : 'Show'}
                onClick={() => onToggleVisible(layer)}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} className="opacity-40" />}
              </IconBtn>
            </div>
          );
        })}
        {overlay.layers.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-text-faint">
            No layers yet. Use “Add”.
          </p>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={clsx(
        'rounded p-1 text-text-faint transition hover:bg-ink-600',
        danger ? 'hover:text-live' : 'hover:text-text',
      )}
    >
      {children}
    </button>
  );
}
