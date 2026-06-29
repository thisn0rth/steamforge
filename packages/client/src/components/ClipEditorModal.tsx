import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  Circle,
  CircleDot,
  Pause,
  Play,
  Plus,
  Rewind,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import type {
  HighlightSettings,
  KillEvent,
  RecordingSession,
} from '@streamforge/shared';
import { buildHighlightPlan } from '@streamforge/shared';
import { api } from '@/lib/api';

interface EditClip {
  id: string;
  inMs: number;
  outMs: number;
  label: string;
  included: boolean;
}

type Drag = { clipId: string; mode: 'in' | 'out' | 'move'; grabMs: number };

const MIN_CLIP_MS = 400;

/**
 * Fast, tablet/POS-style clip editor for one round's recording: scrub the
 * footage, see every kill on the timeline (colored + labeled by team/player),
 * drag in/out markers for as many clips as you like, then export a montage.
 */
export function ClipEditorModal({
  recording,
  kills,
  settings,
  onClose,
}: {
  recording: RecordingSession;
  kills: KillEvent[];
  settings: HighlightSettings;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [durationMs, setDurationMs] = useState(0);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const sortedKills = useMemo(
    () => [...kills].sort((a, b) => (a.recordOffsetMs ?? 0) - (b.recordOffsetMs ?? 0)),
    [kills],
  );

  const [clips, setClips] = useState<EditClip[]>(() =>
    buildHighlightPlan(sortedKills, settings).map((c) => ({
      id: c.id,
      inMs: c.inMs,
      outMs: c.outMs,
      label: c.label,
      included: true,
    })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const previewEndRef = useRef<number | null>(null);

  // Timeline scale: use the real footage duration once known, otherwise a guess
  // from the last kill so markers/clips are usable while metadata loads.
  const maxOffset = sortedKills.reduce(
    (m, k) => Math.max(m, (k.recordOffsetMs ?? 0) + settings.postRollMs),
    0,
  );
  const timelineMs = Math.max(durationMs, maxOffset + 4000, 1000);

  const videoSrc = useMemo(() => api.recordingVideoUrl(recording.id), [recording.id]);

  const seekTo = useCallback((ms: number) => {
    const v = videoRef.current;
    const clamped = Math.max(0, ms);
    if (v) v.currentTime = clamped / 1000;
    setCurrentMs(clamped);
    previewEndRef.current = null;
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, []);

  // Convert a pointer x position to a timeline offset in ms.
  const xToMs = useCallback(
    (clientX: number) => {
      const el = timelineRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(timelineMs, ratio * timelineMs));
    },
    [timelineMs],
  );

  // Drag in/out handles or move a whole clip along the timeline.
  useEffect(() => {
    if (!drag) return;
    const d = drag;
    function onMove(e: PointerEvent) {
      const ms = xToMs(e.clientX);
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== d.clipId) return c;
          if (d.mode === 'in') {
            return { ...c, inMs: Math.min(ms, c.outMs - MIN_CLIP_MS) };
          }
          if (d.mode === 'out') {
            return { ...c, outMs: Math.max(ms, c.inMs + MIN_CLIP_MS) };
          }
          // move: shift both edges, keeping duration, clamped to the timeline.
          const dur = c.outMs - c.inMs;
          let inMs = ms - d.grabMs;
          inMs = Math.max(0, Math.min(inMs, timelineMs - dur));
          return { ...c, inMs, outMs: inMs + dur };
        }),
      );
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, xToMs, timelineMs]);

  // Keyboard shortcuts for POS-style speed.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        seekTo(currentMs - (e.shiftKey ? 5000 : 1000));
      } else if (e.key === 'ArrowRight') {
        seekTo(currentMs + (e.shiftKey ? 5000 : 1000));
      } else if (e.key === 'i' && selectedId) {
        setIn(selectedId);
      } else if (e.key === 'o' && selectedId) {
        setOut(selectedId);
      } else if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMs, selectedId, togglePlay, seekTo, onClose]);

  function patchClip(id: string, patch: Partial<EditClip>) {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function setIn(id: string) {
    setClips((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, inMs: Math.min(currentMs, c.outMs - MIN_CLIP_MS) } : c,
      ),
    );
  }
  function setOut(id: string) {
    setClips((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, outMs: Math.max(currentMs, c.inMs + MIN_CLIP_MS) } : c,
      ),
    );
  }

  function addClip() {
    const inMs = Math.max(0, currentMs - settings.preRollMs);
    const outMs = Math.min(timelineMs, currentMs + settings.postRollMs);
    const id = `manual-${Date.now()}`;
    setClips((prev) =>
      [...prev, { id, inMs, outMs, label: 'Clip', included: true }].sort(
        (a, b) => a.inMs - b.inMs,
      ),
    );
    setSelectedId(id);
  }

  function removeClip(id: string) {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function playClip(c: EditClip) {
    seekTo(c.inMs);
    previewEndRef.current = c.outMs;
    void videoRef.current?.play();
  }

  const includedClips = clips.filter((c) => c.included && c.outMs > c.inMs);

  async function exportMontage() {
    if (includedClips.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.generateMontage(
        recording.id,
        includedClips.map((c) => ({ inMs: c.inMs, outMs: c.outMs })),
        name.trim() || undefined,
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  const nextKill = sortedKills.find((k) => (k.recordOffsetMs ?? 0) > currentMs + 50);
  const prevKill = [...sortedKills]
    .reverse()
    .find((k) => (k.recordOffsetMs ?? 0) < currentMs - 50);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-900/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-600 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Scissors size={16} className="text-accent" />
          Clip editor
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-text-muted">
            {recording.round != null ? `Round ${recording.round}` : recordingLabel(recording)}
          </span>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close (Esc)">
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row">
        {/* Left: preview + transport + timeline */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="relative overflow-hidden rounded-lg bg-black">
            {videoError ? (
              <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-text-faint">
                Couldn't load the recording footage. The file may still be finalizing,
                or ffmpeg may be needed to remux it for preview.
              </div>
            ) : (
              <video
                ref={videoRef}
                src={videoSrc}
                className="aspect-video w-full bg-black"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d)) setDurationMs(Math.round(d * 1000));
                }}
                onTimeUpdate={(e) => {
                  const ms = Math.round(e.currentTarget.currentTime * 1000);
                  setCurrentMs(ms);
                  if (previewEndRef.current != null && ms >= previewEndRef.current) {
                    e.currentTarget.pause();
                    previewEndRef.current = null;
                  }
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setVideoError(true)}
              />
            )}
          </div>

          {/* Transport */}
          <div className="flex items-center justify-center gap-2">
            <TransportBtn
              title="Previous kill"
              disabled={!prevKill}
              onClick={() => prevKill && seekTo(prevKill.recordOffsetMs ?? 0)}
            >
              <SkipBack size={18} />
            </TransportBtn>
            <TransportBtn title="Back 5s" onClick={() => seekTo(currentMs - 5000)}>
              <Rewind size={18} />
            </TransportBtn>
            <button
              onClick={togglePlay}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-ink-900 transition hover:brightness-110"
              title="Play / Pause (Space)"
            >
              {playing ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <TransportBtn title="Forward 5s" onClick={() => seekTo(currentMs + 5000)}>
              <Rewind size={18} className="rotate-180" />
            </TransportBtn>
            <TransportBtn
              title="Next kill"
              disabled={!nextKill}
              onClick={() => nextKill && seekTo(nextKill.recordOffsetMs ?? 0)}
            >
              <SkipForward size={18} />
            </TransportBtn>
            <span className="ml-3 font-mono text-sm tabular-nums text-text-muted">
              {fmt(currentMs)} / {fmt(timelineMs)}
            </span>
          </div>

          {/* Timeline */}
          <div className="select-none">
            {/* Kill labels lane */}
            <div className="relative mb-1 h-6">
              {sortedKills.map((k) => (
                <button
                  key={k.id}
                  onClick={() => seekTo(k.recordOffsetMs ?? 0)}
                  title={`${k.killerName} → ${k.victimName ?? '?'} (${k.weapon ?? ''})`}
                  className={clsx(
                    'absolute top-0 -translate-x-1/2 truncate rounded px-1 text-[10px] font-medium leading-5',
                    teamBg(k.killerTeam),
                  )}
                  style={{ left: `${pct(k.recordOffsetMs ?? 0, timelineMs)}%`, maxWidth: '6rem' }}
                >
                  {k.killerName}
                </button>
              ))}
            </div>

            {/* Track */}
            <div
              ref={timelineRef}
              className="relative h-16 cursor-pointer rounded-md bg-ink-800 ring-1 ring-ink-600"
              onPointerDown={(e) => {
                // Click empty track area to seek (ignore clip/handle drags).
                if (e.target === e.currentTarget) seekTo(xToMs(e.clientX));
              }}
            >
              {/* Clip regions */}
              {clips.map((c) => (
                <div
                  key={c.id}
                  className={clsx(
                    'absolute top-0 h-full rounded',
                    c.included ? 'bg-accent/25' : 'bg-ink-600/40',
                    selectedId === c.id ? 'ring-2 ring-accent' : 'ring-1 ring-accent/40',
                  )}
                  style={{
                    left: `${pct(c.inMs, timelineMs)}%`,
                    width: `${pct(c.outMs - c.inMs, timelineMs)}%`,
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setSelectedId(c.id);
                    setDrag({ clipId: c.id, mode: 'move', grabMs: xToMs(e.clientX) - c.inMs });
                  }}
                >
                  <Handle
                    side="left"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(c.id);
                      setDrag({ clipId: c.id, mode: 'in', grabMs: 0 });
                    }}
                  />
                  <Handle
                    side="right"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedId(c.id);
                      setDrag({ clipId: c.id, mode: 'out', grabMs: 0 });
                    }}
                  />
                </div>
              ))}

              {/* Kill ticks */}
              {sortedKills.map((k) => (
                <div
                  key={k.id}
                  className={clsx('pointer-events-none absolute top-0 h-full w-px', teamTick(k.killerTeam))}
                  style={{ left: `${pct(k.recordOffsetMs ?? 0, timelineMs)}%` }}
                />
              ))}

              {/* Playhead */}
              <div
                className="pointer-events-none absolute top-0 z-10 h-full w-0.5 bg-white"
                style={{ left: `${pct(currentMs, timelineMs)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right: clip list + export */}
        <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Clips ({clips.length})</span>
            <button
              onClick={addClip}
              className="flex items-center gap-1 rounded-md bg-ink-700 px-2.5 py-1.5 text-xs font-medium hover:bg-ink-600"
              title="Add a clip at the playhead"
            >
              <Plus size={14} /> Add at playhead
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {clips.length === 0 ? (
              <p className="rounded-md border border-ink-600 bg-ink-800 px-3 py-6 text-center text-xs text-text-faint">
                No clips yet. Scrub to a moment and tap "Add at playhead".
              </p>
            ) : (
              clips.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={clsx(
                    'cursor-pointer rounded-md border px-3 py-2',
                    selectedId === c.id ? 'border-accent bg-accent/10' : 'border-ink-600 bg-ink-800',
                    !c.included && 'opacity-60',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        patchClip(c.id, { included: !c.included });
                      }}
                      className="shrink-0 text-accent"
                      title={c.included ? 'Omit clip' : 'Include clip'}
                    >
                      {c.included ? <CircleDot size={16} /> : <Circle size={16} />}
                    </button>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-faint">
                      {((c.outMs - c.inMs) / 1000).toFixed(1)}s
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeClip(c.id);
                      }}
                      className="icon-btn shrink-0"
                      title="Delete clip"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-faint">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIn(c.id);
                      }}
                      className="rounded bg-ink-700 px-1.5 py-0.5 hover:bg-ink-600"
                      title="Set in point to playhead (i)"
                    >
                      In {fmt(c.inMs)}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOut(c.id);
                      }}
                      className="rounded bg-ink-700 px-1.5 py-0.5 hover:bg-ink-600"
                      title="Set out point to playhead (o)"
                    >
                      Out {fmt(c.outMs)}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        playClip(c);
                      }}
                      className="ml-auto rounded bg-ink-700 px-1.5 py-0.5 hover:bg-ink-600"
                      title="Preview this clip"
                    >
                      <Play size={11} className="inline" /> Play
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2 border-t border-ink-600 pt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Montage name (optional)"
              className="input w-full py-1.5 text-xs"
            />
            <p className="text-[11px] text-text-faint">
              {includedClips.length} clip{includedClips.length === 1 ? '' : 's'} ·{' '}
              {(settings.transitionMs / 1000).toFixed(1)}s crossfade between clips
            </p>
            {error && <p className="text-xs text-live">{error}</p>}
            <button
              onClick={() => void exportMontage()}
              disabled={includedClips.length === 0 || busy}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
                includedClips.length > 0 && !busy
                  ? 'bg-accent text-ink-900 hover:brightness-110'
                  : 'cursor-not-allowed bg-ink-700 text-text-faint',
              )}
            >
              <Scissors size={16} />
              {busy ? 'Exporting…' : `Export montage (${includedClips.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransportBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'flex h-10 w-10 items-center justify-center rounded-full bg-ink-700 transition hover:bg-ink-600',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {children}
    </button>
  );
}

function Handle({
  side,
  onPointerDown,
}: {
  side: 'left' | 'right';
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={clsx(
        'absolute top-0 z-10 h-full w-2 cursor-ew-resize bg-accent',
        side === 'left' ? 'left-0 rounded-l' : 'right-0 rounded-r',
      )}
    />
  );
}

function pct(ms: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (ms / total) * 100));
}

function fmt(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const t = Math.floor((total % 1000) / 100);
  return `${m}:${String(s).padStart(2, '0')}.${t}`;
}

function teamBg(team: string | null): string {
  if (team === 'CT') return 'bg-sky-500/80 text-white';
  if (team === 'T') return 'bg-amber-500/80 text-ink-900';
  return 'bg-ink-600 text-text';
}

function teamTick(team: string | null): string {
  if (team === 'CT') return 'bg-sky-400';
  if (team === 'T') return 'bg-amber-400';
  return 'bg-text-faint';
}

function recordingLabel(r: RecordingSession): string {
  return new Date(r.startedAt).toLocaleTimeString();
}
