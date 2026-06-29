import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Trash2, Upload } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';

/**
 * Image media library + picker used by image layers. Uploads (PNG/JPG/GIF/WebP
 * and SVG vector VFX) are stored on the server and shared to all operators.
 */
export function MediaPicker({
  value,
  onSelect,
}: {
  value: string;
  onSelect: (url: string) => void;
}) {
  const assets = useStore((s) => s.assets);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let last = '';
      for (const file of Array.from(files)) {
        const asset = await api.uploadAsset(file);
        last = asset.url;
      }
      await useStore.getState().refreshAssets();
      if (last) onSelect(last);
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/avif"
        multiple
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-ghost flex-1 text-xs"
        >
          <Upload size={14} />
          {busy ? 'Uploading…' : 'Upload image'}
        </button>
      </div>
      {error && <p className="text-[11px] text-live">{error}</p>}

      {assets.length > 0 && (
        <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto rounded-lg border border-ink-600 bg-ink-850 p-1.5">
          {assets.map((a) => (
            <div key={a.id} className="group relative">
              <button
                onClick={() => onSelect(a.url)}
                title={a.name}
                className={clsx(
                  'flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border bg-ink-900',
                  value === a.url ? 'border-accent' : 'border-ink-600 hover:border-ink-500',
                )}
              >
                <img src={a.url} alt={a.name} className="max-h-full max-w-full object-contain" />
              </button>
              <button
                onClick={async () => {
                  await api.deleteAsset(a.id).catch(() => undefined);
                  await useStore.getState().refreshAssets();
                }}
                title="Delete asset"
                className="absolute right-0.5 top-0.5 hidden h-5 w-5 items-center justify-center rounded bg-black/60 text-text-faint hover:text-live group-hover:flex"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
