import { PageHeader } from '@/components/PageHeader';
import { SceneSwitcher } from '@/components/SceneSwitcher';
import { RigGrid } from '@/components/RigGrid';
import { ActivityFeed } from '@/components/ActivityFeed';
import { BroadcastStatusBar } from '@/components/BroadcastStatusBar';
import { BroadcastMonitors } from '@/components/BroadcastMonitors';
import { ProgramSources } from '@/components/ProgramSources';
import { ReplayPanel } from '@/components/ReplayPanel';

export function ControlSurface() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Broadcast Control"
        subtitle="Live program + preview, one-tap rigs and scenes."
      />
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-5 p-8">
          <BroadcastStatusBar />
          <BroadcastMonitors />

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <RigGrid />
              <SceneSwitcher />
            </div>
            <div className="space-y-5">
              <ProgramSources />
              <ReplayPanel />
              <ActivityFeed className="rounded-xl border border-ink-600 bg-ink-800 p-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
