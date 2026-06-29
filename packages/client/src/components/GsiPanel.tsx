import { Activity, Bomb, Crosshair, Timer } from 'lucide-react';
import clsx from 'clsx';
import { useStore } from '@/store/useStore';
import type { GsiPlayer } from '@streamforge/shared';

export function GsiPanel() {
  const gsi = useStore((s) => s.gsi);
  const status = useStore((s) => s.gsiStatus);

  const map = gsi?.map;
  const round = gsi?.round;
  const bomb = gsi?.bomb;
  const players = gsi?.allplayers
    ? Object.values(gsi.allplayers)
    : gsi?.player
      ? [gsi.player]
      : [];

  return (
    <section className="panel flex flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-600 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Activity size={16} className="text-accent" />
          Live Match (CS2 GSI)
        </div>
        <span
          className={clsx(
            'chip',
            status.connected ? 'border-teal/40 text-teal' : 'text-text-faint',
          )}
        >
          <span
            className={clsx(
              'h-1.5 w-1.5 rounded-full',
              status.connected ? 'bg-teal' : 'bg-text-faint',
            )}
          />
          {status.connected ? 'receiving' : 'no signal'}
        </span>
      </header>

      {!gsi ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <Crosshair size={28} className="text-text-faint" />
          <p className="text-sm text-text-muted">No game data yet.</p>
          <p className="max-w-xs text-xs text-text-faint">
            Install the GSI config from <span className="text-accent">Settings</span> and launch
            Counter-Strike 2 to see live match state here.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-4 p-4">
          {map && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-2xl font-bold tabular-nums text-accent-soft">
                  {map.team_ct.score}
                </span>
                <span className="text-text-faint">:</span>
                <span className="font-mono text-2xl font-bold tabular-nums text-live">
                  {map.team_t.score}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{map.name}</div>
                <div className="text-xs text-text-faint">
                  Round {map.round + 1} · {map.phase}
                  {round?.phase ? ` · ${round.phase}` : ''}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {gsi.phase_countdowns && (
              <span className="chip">
                <Timer size={12} /> {gsi.phase_countdowns.phase}:{' '}
                {Number(gsi.phase_countdowns.phase_ends_in).toFixed(0)}s
              </span>
            )}
            {bomb && (
              <span
                className={clsx(
                  'chip',
                  bomb.state === 'planted' && 'border-live/50 text-live',
                )}
              >
                <Bomb size={12} /> bomb: {bomb.state}
                {bomb.countdown ? ` (${Number(bomb.countdown).toFixed(1)}s)` : ''}
              </span>
            )}
          </div>

          {players.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-ink-600">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-750 text-xs uppercase tracking-wide text-text-faint">
                  <tr>
                    <th className="px-3 py-2 font-medium">Player</th>
                    <th className="px-2 py-2 text-center font-medium">HP</th>
                    <th className="px-2 py-2 text-center font-medium">K</th>
                    <th className="px-2 py-2 text-center font-medium">A</th>
                    <th className="px-2 py-2 text-center font-medium">D</th>
                    <th className="px-3 py-2 text-right font-medium">$</th>
                  </tr>
                </thead>
                <tbody>
                  {players.slice(0, 10).map((p, i) => (
                    <PlayerRow key={p.steamid ?? p.name ?? i} player={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PlayerRow({ player }: { player: GsiPlayer }) {
  const hp = player.state?.health ?? 0;
  const stats = player.match_stats;
  return (
    <tr className="border-t border-ink-600/60">
      <td className="px-3 py-2">
        <span
          className={clsx(
            'mr-2 inline-block h-2 w-2 rounded-full align-middle',
            player.team === 'CT' ? 'bg-accent' : player.team === 'T' ? 'bg-live' : 'bg-text-faint',
          )}
        />
        {player.name}
      </td>
      <td className="px-2 py-2 text-center font-mono tabular-nums">
        <span className={clsx(hp <= 0 && 'text-text-faint', hp > 0 && hp <= 30 && 'text-live')}>
          {hp}
        </span>
      </td>
      <td className="px-2 py-2 text-center font-mono tabular-nums">{stats?.kills ?? 0}</td>
      <td className="px-2 py-2 text-center font-mono tabular-nums">{stats?.assists ?? 0}</td>
      <td className="px-2 py-2 text-center font-mono tabular-nums">{stats?.deaths ?? 0}</td>
      <td className="px-3 py-2 text-right font-mono tabular-nums text-teal">
        {player.state?.money ?? 0}
      </td>
    </tr>
  );
}
