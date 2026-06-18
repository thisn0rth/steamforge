import { useState } from 'react';
import clsx from 'clsx';
import { Radio, Circle, Square, Cpu, Gauge, Wifi, WifiOff, Activity } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { api } from '@/lib/api';
import { formatBitrate, formatDuration, droppedPercent } from '@/lib/format';

/**
 * The always-on broadcast health bar: connection, stream/record state with
 * live timers, encoder stats, and one-click stream/record toggles.
 */
export function BroadcastStatusBar() {
  const obs = useStore((s) => s.obs);
  const [busy, setBusy] = useState<'stream' | 'record' | null>(null);

  const stream = obs.streaming;
  const record = obs.recording;
  const stats = obs.stats;
  const dropped = droppedPercent(stream.skippedFrames, stream.totalFrames);

  async function toggleStream() {
    setBusy('stream');
    try {
      await api.obsToggleStream();
    } catch {
      // surfaced via OBS state
    } finally {
      setBusy(null);
    }
  }

  async function toggleRecord() {
    setBusy('record');
    try {
      await api.obsToggleRecord();
    } catch {
      // surfaced via OBS state
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 shadow-panel">
      {/* Connection */}
      <div
        className={clsx(
          'flex items-center gap-2 text-sm font-semibold',
          obs.connected ? 'text-text' : 'text-text-faint',
        )}
      >
        {obs.connected ? (
          <Wifi size={16} className="text-preview" />
        ) : (
          <WifiOff size={16} className="text-text-faint" />
        )}
        OBS {obs.connected ? 'connected' : 'offline'}
      </div>

      <Divider />

      {/* Stream */}
      <Metric
        icon={<Radio size={14} />}
        active={stream.active}
        activeColor="live"
        label={stream.active ? 'ON AIR' : 'STREAM'}
      >
        {stream.active ? (
          <span className="flex items-center gap-2 font-mono text-sm tabular-nums">
            <span className="text-live">{formatDuration(stream.durationMs)}</span>
            <span className="text-text-muted">{formatBitrate(stream.kbitsPerSec)}</span>
            <span className={clsx(dropped > 1 ? 'text-live' : 'text-text-faint')}>
              {dropped.toFixed(1)}% dropped
            </span>
          </span>
        ) : (
          <span className="text-sm text-text-faint">idle</span>
        )}
      </Metric>

      <Divider />

      {/* Record */}
      <Metric
        icon={<Circle size={12} fill="currentColor" />}
        active={record.active}
        activeColor="preview"
        label="REC"
      >
        <span className="font-mono text-sm tabular-nums text-text-muted">
          {record.active ? formatDuration(record.durationMs) : 'idle'}
        </span>
      </Metric>

      <Divider />

      {/* Encoder stats */}
      <div className="flex items-center gap-4 text-sm text-text-muted">
        <span className="flex items-center gap-1.5" title="Active frames per second">
          <Gauge size={14} className="text-text-faint" />
          <span className="font-mono tabular-nums">{stats ? stats.activeFps.toFixed(0) : '—'}</span>
          <span className="text-text-faint">fps</span>
        </span>
        <span className="flex items-center gap-1.5" title="CPU usage">
          <Cpu size={14} className="text-text-faint" />
          <span className="font-mono tabular-nums">
            {stats ? stats.cpuUsage.toFixed(1) : '—'}
          </span>
          <span className="text-text-faint">% cpu</span>
        </span>
        <span className="flex items-center gap-1.5" title="Average frame render time">
          <Activity size={14} className="text-text-faint" />
          <span className="font-mono tabular-nums">
            {stats ? stats.averageFrameRenderMs.toFixed(1) : '—'}
          </span>
          <span className="text-text-faint">ms</span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => void toggleStream()}
          disabled={!obs.connected || busy !== null}
          className={clsx(
            'btn px-3 py-1.5',
            stream.active
              ? 'btn-danger'
              : 'bg-live text-white hover:bg-live/85 disabled:opacity-50',
          )}
        >
          {stream.active ? <Square size={14} /> : <Radio size={14} />}
          {stream.active ? 'Stop stream' : 'Go live'}
        </button>
        <button
          onClick={() => void toggleRecord()}
          disabled={!obs.connected || busy !== null}
          className="btn-ghost px-3 py-1.5"
        >
          {record.active ? <Square size={14} /> : <Circle size={12} fill="currentColor" />}
          {record.active ? 'Stop rec' : 'Record'}
        </button>
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  active,
  activeColor,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeColor: 'live' | 'preview';
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={clsx(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wide',
          active
            ? activeColor === 'live'
              ? 'bg-live/15 text-live'
              : 'bg-preview/15 text-preview'
            : 'bg-ink-750 text-text-faint',
        )}
      >
        {active && (
          <span
            className={clsx(
              'h-1.5 w-1.5 animate-pulse rounded-full',
              activeColor === 'live' ? 'bg-live' : 'bg-preview',
            )}
          />
        )}
        {icon}
        {label}
      </span>
      {children}
    </div>
  );
}

function Divider() {
  return <span className="hidden h-6 w-px bg-ink-600 sm:block" />;
}
