import { useEffect, useRef, useState } from 'react';
import type {
  GsiPayload,
  LeagueData,
  OutputChannel,
  OutputState,
  Overlay,
  OverlayAssignments,
} from '@streamforge/shared';
import { EMPTY_OUTPUT_STATE } from '@streamforge/shared';
import { api } from '@/lib/api';
import { RealtimeSocket } from '@/lib/socket';
import { OverlayCanvas } from '@/overlay/OverlayCanvas';

/**
 * Chrome-less, channel-based render target. Add ONE Browser Source per scene in
 * OBS pointed at `/live` (program) or `/preview`. The server drives which
 * overlays show on each channel, so the source URL never changes — operators
 * push overlays to preview and TAKE to live.
 */
export function OutputRenderer({ channel }: { channel: OutputChannel }) {
  const [output, setOutput] = useState<OutputState>(EMPTY_OUTPUT_STATE);
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({});
  const [gsi, setGsi] = useState<GsiPayload | null>(null);
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [assignments, setAssignments] = useState<Record<string, OverlayAssignments>>({});
  const [time, setTime] = useState(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    document.body.style.background = 'transparent';

    const socket = new RealtimeSocket((msg) => {
      if (msg.type === 'output') setOutput(msg.output);
      if (msg.type === 'gsi') setGsi(msg.payload);
      if (msg.type === 'league') setLeague(msg.league);
      if (msg.type === 'assignments') setAssignments(msg.assignments);
      if (msg.type === 'overlayUpdated') {
        setOverlays((prev) =>
          prev[msg.overlay.id] ? { ...prev, [msg.overlay.id]: msg.overlay } : prev,
        );
      }
    });
    socket.connect();

    api.output().then(setOutput).catch(() => undefined);
    api.gsiCurrent().then((g) => g && setGsi(g)).catch(() => undefined);
    api.league().then(setLeague).catch(() => undefined);
    api.assignments().then(setAssignments).catch(() => undefined);
    return () => socket.close();
  }, []);

  // Fetch overlay definitions for any ids currently on this channel.
  const ids = output[channel];
  useEffect(() => {
    const missing = ids.filter((id) => !overlays[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => api.overlay(id).catch(() => null))).then((loaded) => {
      if (cancelled) return;
      setOverlays((prev) => {
        const next = { ...prev };
        for (const o of loaded) if (o) next[o.id] = o;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ids, overlays]);

  // Shared timeline clock.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setTime(performance.now() - startRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const active = ids.map((id) => overlays[id]).filter((o): o is Overlay => Boolean(o));

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      {active.map((overlay) => {
        const dur = overlay.composition.duration || 1;
        const scale = Math.min(
          size.w / overlay.composition.width,
          size.h / overlay.composition.height,
        );
        return (
          <div key={overlay.id} style={{ position: 'absolute', inset: 0 }}>
            <OverlayCanvas
              overlay={overlay}
              timeMs={time % dur}
              gsi={gsi}
              league={league}
              assignments={assignments[overlay.id]}
              scale={scale}
            />
          </div>
        );
      })}
    </div>
  );
}
