import { useStore } from '@/store/useStore';
import type { SessionUser } from '@streamforge/shared';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stacked avatars of everyone currently connected to the production. */
export function PresenceBar() {
  const presence = useStore((s) => s.presence);
  const me = useStore((s) => s.me);

  if (presence.length === 0) return null;

  return (
    <div className="px-3 pb-2">
      <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-faint">
        Online · {presence.length}
      </div>
      <div className="space-y-0.5">
        {presence.map((u) => (
          <PresenceRow key={u.id} user={u} isMe={me?.id === u.id} />
        ))}
      </div>
    </div>
  );
}

function PresenceRow({ user, isMe }: { user: SessionUser; isMe: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ background: user.color }}
      >
        {initials(user.name)}
      </span>
      <span className="truncate text-text-muted">
        {user.name}
        {isMe && <span className="text-text-faint"> (you)</span>}
      </span>
      {user.host && (
        <span className="ml-auto rounded bg-ink-700 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-text-faint">
          host
        </span>
      )}
    </div>
  );
}
