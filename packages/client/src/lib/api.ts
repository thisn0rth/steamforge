import type {
  GsiPayload,
  GsiStatus,
  ObsState,
  Overlay,
  Rig,
  Transition,
} from '@streamforge/shared';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.error ?? detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // GSI
  gsiStatus: () => http<GsiStatus>('/api/gsi/status'),
  gsiCurrent: () => http<GsiPayload | null>('/api/gsi/current'),
  gsiConfigUrl: (host?: string) =>
    `/api/gsi/config${host ? `?host=${encodeURIComponent(host)}` : ''}`,

  // OBS
  obsState: () => http<ObsState>('/api/obs/state'),
  obsConnect: (url?: string, password?: string) =>
    http<ObsState>('/api/obs/connect', {
      method: 'POST',
      body: JSON.stringify({ url, password }),
    }),
  obsDisconnect: () => http<ObsState>('/api/obs/disconnect', { method: 'POST' }),
  obsRefresh: () => http<ObsState>('/api/obs/refresh', { method: 'POST' }),
  obsSetScene: (sceneName: string, preview = false) =>
    http<ObsState>('/api/obs/scene', {
      method: 'POST',
      body: JSON.stringify({ sceneName, preview }),
    }),
  obsSetSource: (sceneName: string, sourceName: string, enabled: boolean) =>
    http<ObsState>('/api/obs/source', {
      method: 'POST',
      body: JSON.stringify({ sceneName, sourceName, enabled }),
    }),

  // Rigs
  rigs: () => http<Rig[]>('/api/rigs'),
  createRig: (rig: Partial<Rig>) =>
    http<Rig>('/api/rigs', { method: 'POST', body: JSON.stringify(rig) }),
  updateRig: (id: string, rig: Partial<Rig>) =>
    http<Rig>(`/api/rigs/${id}`, { method: 'PUT', body: JSON.stringify(rig) }),
  deleteRig: (id: string) => http<void>(`/api/rigs/${id}`, { method: 'DELETE' }),
  activateRig: (id: string) =>
    http<{ rigId: string; appliedScene: string; toggledSources: number; warnings: string[] }>(
      `/api/rigs/${id}/activate`,
      { method: 'POST' },
    ),

  // Overlays
  overlays: () => http<Overlay[]>('/api/overlays'),
  overlay: (id: string) => http<Overlay>(`/api/overlays/${id}`),
  createOverlay: (name: string) =>
    http<Overlay>('/api/overlays', { method: 'POST', body: JSON.stringify({ name }) }),
  updateOverlay: (id: string, overlay: Partial<Overlay>) =>
    http<Overlay>(`/api/overlays/${id}`, { method: 'PUT', body: JSON.stringify(overlay) }),
  deleteOverlay: (id: string) => http<void>(`/api/overlays/${id}`, { method: 'DELETE' }),

  // Transitions
  transitions: () => http<Transition[]>('/api/transitions'),
  createTransition: (t: Partial<Transition>) =>
    http<Transition>('/api/transitions', { method: 'POST', body: JSON.stringify(t) }),
  updateTransition: (id: string, t: Partial<Transition>) =>
    http<Transition>(`/api/transitions/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTransition: (id: string) =>
    http<void>(`/api/transitions/${id}`, { method: 'DELETE' }),
};
