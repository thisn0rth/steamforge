import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Circle,
  CircleDot,
  Crosshair,
  Film,
  RotateCcw,
  Scissors,
  Target,
  Wand2,
  X,
} from 'lucide-react';
import type {
  HighlightClip,
  HighlightSettings,
  KillEvent,
  RecordingSession,
} from '@streamforge/shared';
import { buildHighlightPlan } from '@streamforge/shared';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';

interface ClipOverride {
  inMs?: number;
  outMs?: number;
  included?: boolean;
}

export function HighlightsPage() {
  const highlights = useStore((s) => s.highlights);
  const obs = useStore((s) => s.obs);
  const gsiStatus = useStore((s) => s.gsiStatus);
  const { kills, recordings, settings, rendering, ffmpegAvailable } = highlights;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ClipOverride>>({});
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Default to the newest recording once data arrives.
  useEffect(() => {
    if (selectedId && recordings.some((r) => r.id === selectedId)) return;
    setSelectedId(recordings[0]?.id ?? null);
  }, [recordings, selectedId]);

  const selected = recordings.find((r) => r.id === selectedId) ?? null;

  const recordingKills = useMemo(
    () =>
      selectedId
        ? kills
            .filter((k) => k.recordingId === selectedId)
            .sort((a, b) => (a.recordOffsetMs ?? 0) - (b.recordOffsetMs ?? 0))
        : [],
    [kills, selectedId],
  );

  const plan = useMemo(
    () => buildHighlightPlan(recordingKills, settings),
    [recordingKills, settings],
  );

  // Reset edits when the selected recording changes.
  useEffect(() => {
    setOverrides({});
    setName('');
    setError(null);
  }, [selectedId]);

  const merged: HighlightClip[] = plan.map((c) => ({
    ...c,
    ...(overrides[c.id] ?? {}),
  }));
  const includedClips = merged.filter((c) => c.included);

  function patchClip(id: string, patch: ClipOverride) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], ...patch } }));
  }

  async function generate() {
    if (!selectedId || includedClips.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.generateMontage(
        selectedId,
        includedClips.map((c) => ({ inMs: c.inMs, outMs: c.outMs })),
        name.trim() || undefined,
      );
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\d+:\s*/, '') : 'Render failed');
    } finally {
      setBusy(false);
    }
  }

  // Footage is renderable if the recording is still active (we'll split it to
  // finalize), or it already has at least one finalized file/segment.
  const hasFootage =
    !!selected &&
    (selected.active ||
      !!selected.filePath ||
      selected.segments.some((s) => s.filePath && s.endOffsetMs != null));

  const canGenerate =
    !!selected &&
    hasFootage &&
    ffmpegAvailable &&
    includedClips.length > 0 &&
    !rendering &&
    !busy;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Highlights"
        subtitle="Auto-tracked kills, auto-clipped into montages you can fine-tune."
      />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-5 p-8">
          <StatusStrip
            gsiConnected={gsiStatus.connected}
            recording={obs.recording.active}
            ffmpegAvailable={ffmpegAvailable}
          />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <KillFeed kills={kills} />
            <div className="space-y-5">
              <SettingsCard settings={settings} />
              <MontageCard
                recordings={recordings}
                selectedId={selectedId}
                onSelect={setSelectedId}
                selected={selected}
                clips={merged}
                killCount={recordingKills.length}
                onPatchClip={patchClip}
                onResetEdits={() => setOverrides({})}
                name={name}
                onName={setName}
                onGenerate={() => void generate()}
                canGenerate={canGenerate}
                rendering={rendering || busy}
                ffmpegAvailable={ffmpegAvailable}
                error={error}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusStrip({
  gsiConnected,
  recording,
  ffmpegAvailable,
}: {
  gsiConnected: boolean;
  recording: boolean;
  ffmpegAvailable: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Stat
        ok={gsiConnected}
        icon={<Target size={15} />}
        label="Kill tracking"
        detail={gsiConnected ? 'GSI live — capturing kills' : 'waiting for CS2 GSI'}
      />
      <Stat
        ok={recording}
        icon={<CircleDot size={15} />}
        label="OBS recording"
        detail={recording ? 'recording — footage captured' : 'not recording'}
        warnWhenOff
      />
      <Stat
        ok={ffmpegAvailable}
        icon={<Scissors size={15} />}
        label="ffmpeg"
        detail={ffmpegAvailable ? 'ready to render' : 'not installed on host'}
      />
    </div>
  );
}

function Stat({
  ok,
  icon,
  label,
  detail,
  warnWhenOff,
}: {
  ok: boolean;
  icon: React.ReactNode;
  label: string;
  detail: string;
  warnWhenOff?: boolean;
}) {
  return (
    <div className="panel flex items-center gap-3 px-4 py-3">
      <span
        className={clsx(
          'flex h-8 w-8 items-center justify-center rounded-lg',
          ok ? 'bg-preview/15 text-preview' : warnWhenOff ? 'bg-live/15 text-live' : 'bg-ink-700 text-text-faint',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-text-faint">{detail}</div>
      </div>
    </div>
  );
}

function KillFeed({ kills }: { kills: KillEvent[] }) {
  const ordered = [...kills].sort((a, b) => b.ts - a.ts);
  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Crosshair size={16} className="text-accent" />
          Kill feed
          <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-text-muted">
            {kills.length}
          </span>
        </div>
        {kills.length > 0 && (
          <button
            onClick={() => void api.clearKills().catch(() => undefined)}
            className="text-xs text-text-faint hover:text-live"
          >
            Clear all
          </button>
        )}
      </header>
      {ordered.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-text-faint">
          No kills tracked yet. Kills appear here automatically while CS2 GSI is live.
        </p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-ink-700 overflow-y-auto">
          {ordered.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-10 shrink-0 text-xs text-text-faint">R{k.round}</span>
              <span className={clsx('shrink-0 font-medium', teamColor(k.killerTeam))}>
                {k.killerName}
              </span>
              <span className="shrink-0 text-xs text-text-faint">
                {k.headshot ? '⊙' : '✕'} {k.weapon ?? ''}
              </span>
              {k.victimName && (
                <span className={clsx('truncate text-xs', teamColor(k.victimTeam))}>
                  {k.victimName}
                </span>
              )}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-text-faint">
                {k.recordOffsetMs != null ? clock(k.recordOffsetMs) : '—'}
              </span>
              <button
                onClick={() => void api.removeKill(k.id).catch(() => undefined)}
                className="icon-btn shrink-0"
                title="Remove kill (false positive)"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsCard({ settings }: { settings: HighlightSettings }) {
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Wand2 size={16} className="text-accent" />
        Auto-clip settings
      </div>
      <div className="grid grid-cols-3 gap-3">
        <NumField
          label="Pre-roll (s)"
          value={settings.preRollMs / 1000}
          onCommit={(v) => void api.updateHighlightSettings({ preRollMs: v * 1000 })}
        />
        <NumField
          label="Post-roll (s)"
          value={settings.postRollMs / 1000}
          onCommit={(v) => void api.updateHighlightSettings({ postRollMs: v * 1000 })}
        />
        <NumField
          label="Merge gap (s)"
          value={settings.mergeGapMs / 1000}
          onCommit={(v) => void api.updateHighlightSettings({ mergeGapMs: v * 1000 })}
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={settings.autoSaveReplayOnKill}
          onChange={(e) =>
            void api.updateHighlightSettings({ autoSaveReplayOnKill: e.target.checked })
          }
        />
        Also save an OBS replay-buffer clip on every kill (instant in-broadcast replays)
      </label>
    </section>
  );
}

function MontageCard({
  recordings,
  selectedId,
  onSelect,
  selected,
  clips,
  killCount,
  onPatchClip,
  onResetEdits,
  name,
  onName,
  onGenerate,
  canGenerate,
  rendering,
  ffmpegAvailable,
  error,
}: {
  recordings: RecordingSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  selected: RecordingSession | null;
  clips: HighlightClip[];
  killCount: number;
  onPatchClip: (id: string, patch: ClipOverride) => void;
  onResetEdits: () => void;
  name: string;
  onName: (v: string) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  rendering: boolean;
  ffmpegAvailable: boolean;
  error: string | null;
}) {
  const included = clips.filter((c) => c.included).length;
  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Film size={16} className="text-accent" />
          Auto montage
        </div>
        {clips.length > 0 && (
          <button onClick={onResetEdits} className="flex items-center gap-1 text-xs text-text-faint hover:text-text">
            <RotateCcw size={12} /> Reset edits
          </button>
        )}
      </header>

      <div className="space-y-3 p-4">
        {recordings.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-faint">
            No recordings yet. Start recording in OBS and kills will be timestamped against it.
          </p>
        ) : (
          <>
            <select
              value={selectedId ?? ''}
              onChange={(e) => onSelect(e.target.value)}
              className="input w-full py-1.5 text-xs"
            >
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>
                  {recordingLabel(r)}
                </option>
              ))}
            </select>

            {selected?.active && (
              <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs text-text-muted">
                Recording in progress — no need to stop it. Generating will split the OBS file to
                grab the footage so far (recording keeps running). Needs OBS 30+.
              </p>
            )}
            {!ffmpegAvailable && <FfmpegMissing />}

            <div className="flex items-center justify-between text-xs text-text-faint">
              <span>
                {killCount} kill{killCount === 1 ? '' : 's'} · {clips.length} clip
                {clips.length === 1 ? '' : 's'} · {included} selected
              </span>
            </div>

            {clips.length === 0 ? (
              <p className="py-4 text-center text-xs text-text-faint">
                No clippable kills in this recording yet.
              </p>
            ) : (
              <ul className="max-h-[20rem] space-y-1.5 overflow-y-auto">
                {clips.map((c) => (
                  <li
                    key={c.id}
                    className={clsx(
                      'rounded-md border px-3 py-2',
                      c.included ? 'border-ink-600 bg-ink-750' : 'border-ink-700 bg-ink-800 opacity-60',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onPatchClip(c.id, { included: !c.included })}
                        className="shrink-0 text-accent"
                        title={c.included ? 'Omit clip' : 'Include clip'}
                      >
                        {c.included ? <CircleDot size={16} /> : <Circle size={16} />}
                      </button>
                      <span className="min-w-0 flex-1 truncate text-sm">{c.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-text-faint">
                        {clock(c.inMs)}–{clock(c.outMs)} ({((c.outMs - c.inMs) / 1000).toFixed(1)}s)
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-text-faint">
                      <label className="flex items-center gap-1">
                        in
                        <input
                          type="number"
                          step={0.5}
                          value={(c.inMs / 1000).toFixed(1)}
                          onChange={(e) =>
                            onPatchClip(c.id, { inMs: Math.max(0, Number(e.target.value) * 1000) })
                          }
                          className="input w-20 py-0.5 text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-1">
                        out
                        <input
                          type="number"
                          step={0.5}
                          value={(c.outMs / 1000).toFixed(1)}
                          onChange={(e) =>
                            onPatchClip(c.id, { outMs: Math.max(0, Number(e.target.value) * 1000) })
                          }
                          className="input w-20 py-0.5 text-xs"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Montage name (optional)"
              className="input w-full py-1.5 text-xs"
            />
            {error && <p className="text-xs text-live">{error}</p>}
            <button
              onClick={onGenerate}
              disabled={!canGenerate}
              className={clsx(
                'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
                canGenerate
                  ? 'bg-accent text-ink-900 hover:brightness-110'
                  : 'cursor-not-allowed bg-ink-700 text-text-faint',
              )}
            >
              <Scissors size={16} />
              {rendering ? 'Rendering…' : `Generate montage (${included})`}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

function FfmpegMissing() {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function recheck() {
    setChecking(true);
    setNote(null);
    try {
      const { ffmpegAvailable } = await api.recheckFfmpeg();
      if (!ffmpegAvailable) {
        setNote('Still not found — open a NEW terminal, confirm `ffmpeg -version`, then restart the server.');
      }
    } catch {
      setNote('Re-check failed.');
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="space-y-2 rounded-md border border-live/40 bg-live/10 px-3 py-2 text-xs text-live">
      <p>
        ffmpeg isn't detected on the host. Install it (<code>winget install Gyan.FFmpeg</code> on
        Windows, <code>apt install ffmpeg</code> on Linux), then re-check. If you just installed it,
        open a <strong>new</strong> terminal first so PATH refreshes.
      </p>
      <button
        onClick={() => void recheck()}
        disabled={checking}
        className="btn-ghost px-2 py-1 text-xs"
      >
        {checking ? 'Checking…' : 'Re-check ffmpeg'}
      </button>
      {note && <p className="text-text-faint">{note}</p>}
    </div>
  );
}

function NumField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => setLocal(String(value)), [value]);
  return (
    <label className="block text-xs text-text-muted">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        step={0.5}
        min={0}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (Number.isFinite(n)) onCommit(Math.max(0, n));
        }}
        className="input w-full py-1 text-xs"
      />
    </label>
  );
}

function teamColor(team: string | null): string {
  if (team === 'CT') return 'text-sky-400';
  if (team === 'T') return 'text-amber-400';
  return 'text-text';
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function recordingLabel(r: RecordingSession): string {
  const start = new Date(r.startedAt).toLocaleTimeString();
  const dur = r.endedAt ? `${Math.round((r.endedAt - r.startedAt) / 1000)}s` : 'live';
  return `${start} · ${dur}${r.active ? ' · recording' : ''}`;
}
