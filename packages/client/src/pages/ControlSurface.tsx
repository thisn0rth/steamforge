import { PageHeader } from '@/components/PageHeader';
import { GsiPanel } from '@/components/GsiPanel';
import { SceneSwitcher } from '@/components/SceneSwitcher';
import { RigGrid } from '@/components/RigGrid';
import { ActivityFeed } from '@/components/ActivityFeed';

export function ControlSurface() {
  return (
    <div>
      <PageHeader
        title="Control Surface"
        subtitle="Switch rigs, scenes, and watch live CS2 match state."
      />
      <div className="space-y-5 p-8">
        <RigGrid />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <GsiPanel />
          <SceneSwitcher />
        </div>
        <ActivityFeed className="rounded-xl border border-ink-600 bg-ink-850 p-5" />
      </div>
    </div>
  );
}
