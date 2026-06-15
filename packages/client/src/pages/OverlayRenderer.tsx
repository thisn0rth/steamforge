import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GsiPayload, Overlay } from '@streamforge/shared';
import { api } from '@/lib/api';
import { RealtimeSocket } from '@/lib/socket';
import { OverlayCanvas } from '@/overlay/OverlayCanvas';

/**
 * Chrome-less overlay render target. Add `http://<host>/overlay/<id>` as a
 * Browser Source in OBS. It plays the composition on a loop and live-updates
 * any GSI-bound layers from the server socket.
 */
export function OverlayRenderer() {
  const { id } = useParams<{ id: string }>();
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gsi, setGsi] = useState<GsiPayload | null>(null);
  const [time, setTime] = useState(0);
  const [scale, setScale] = useState(1);
  const startRef = useRef<number>(performance.now());

  useEffect(() => {
    document.body.style.background = 'transparent';
    if (!id) return;
    api.overlay(id).then(setOverlay).catch((e) => setError(String(e)));

    const socket = new RealtimeSocket((msg) => {
      if (msg.type === 'gsi') setGsi(msg.payload);
      if (msg.type === 'overlayUpdated' && msg.overlay.id === id) setOverlay(msg.overlay);
    });
    socket.connect();
    api.gsiCurrent().then((g) => g && setGsi(g)).catch(() => undefined);
    return () => socket.close();
  }, [id]);

  // Loop the composition timeline.
  useEffect(() => {
    if (!overlay) return;
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      setTime(overlay.composition.duration ? elapsed % overlay.composition.duration : elapsed);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [overlay]);

  // Fit composition to the window (OBS sizes the browser source).
  useEffect(() => {
    if (!overlay) return;
    const fit = () => {
      const sx = window.innerWidth / overlay.composition.width;
      const sy = window.innerHeight / overlay.composition.height;
      setScale(Math.min(sx, sy));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [overlay]);

  if (error) {
    return <div style={{ color: '#fff', fontFamily: 'monospace', padding: 16 }}>{error}</div>;
  }
  if (!overlay) return null;

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
      }}
    >
      <OverlayCanvas overlay={overlay} timeMs={time} gsi={gsi} scale={scale} />
    </div>
  );
}
