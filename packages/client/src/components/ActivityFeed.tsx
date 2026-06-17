import { useStore } from '@/store/useStore';
import type { ActivityEvent } from '@streamforge/shared';

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

/** Live, auditable log of who did what across the production. */
export function ActivityFeed({ className }: { className?: string }) {
  const activity = useStore((s) => s.activity);
  const recent = [...activity].reverse();

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Activity</h2>
        <span className="text-xs text-text-faint">live</span>
      </div>
      {recent.length === 0 ? (
        <p className="text-xs text-text-faint">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {recent.map((e) => (
            <ActivityRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  return (
    <li className="flex items-start gap-2.5 text-xs">
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ background: event.userColor }}
      />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-text">{event.userName}</span>{' '}
        <span className="text-text-muted">{event.message}</span>
      </div>
      <span className="shrink-0 text-text-faint">{timeAgo(event.ts)}</span>
    </li>
  );
}
