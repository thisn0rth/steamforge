import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutGrid,
  Layers,
  Scissors,
  Sparkles,
  Settings,
  Radio,
  Cable,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '@/store/useStore';
import { PresenceBar } from '@/components/PresenceBar';

const NAV = [
  { to: '/', label: 'Control', icon: LayoutGrid, end: true },
  { to: '/overlays', label: 'Overlays', icon: Layers, end: false },
  { to: '/highlights', label: 'Highlights', icon: Scissors, end: false },
  { to: '/transitions', label: 'Transitions', icon: Sparkles, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
];

export function AppLayout() {
  const init = useStore((s) => s.init);
  const socketConnected = useStore((s) => s.socketConnected);
  const gsiStatus = useStore((s) => s.gsiStatus);
  const obs = useStore((s) => s.obs);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex h-screen overflow-hidden bg-ink-900 text-text">
      <aside className="flex w-60 shrink-0 flex-col border-r border-ink-600 bg-ink-850">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="pulse-ring flex h-8 w-8 items-center justify-center rounded-lg bg-live text-white shadow-onair">
            <Radio size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-extrabold tracking-tight">StreamForge</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-text-faint">
              esports control
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-ink-700 text-text shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]'
                    : 'text-text-muted hover:bg-ink-700/60 hover:text-text',
                )
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-600 pt-2">
          <PresenceBar />
        </div>

        <div className="space-y-2 border-t border-ink-600 p-3 text-xs">
          <StatusRow
            icon={<Activity size={14} />}
            label="CS2 GSI"
            ok={gsiStatus.connected}
            detail={gsiStatus.connected ? gsiStatus.provider ?? 'live' : 'waiting'}
          />
          <StatusRow
            icon={<Cable size={14} />}
            label="OBS"
            ok={obs.connected}
            detail={obs.connected ? obs.currentProgramScene ?? 'connected' : 'offline'}
          />
          <StatusRow
            icon={<Radio size={14} />}
            label="Server"
            ok={socketConnected}
            detail={socketConnected ? 'connected' : 'reconnecting'}
          />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  ok,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5">
      <span className="flex items-center gap-2 text-text-muted">
        {icon}
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={clsx(
            'h-1.5 w-1.5 rounded-full',
            ok ? 'bg-teal shadow-[0_0_8px] shadow-teal' : 'bg-text-faint',
          )}
        />
        <span className="max-w-[88px] truncate text-text-faint">{detail}</span>
      </span>
    </div>
  );
}
