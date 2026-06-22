import type {
  Asset,
  GsiPayload,
  GsiStatus,
  LeagueData,
  ObsState,
  OutputChannel,
  OutputState,
  Overlay,
  OverlayAssignments,
  Replay,
  ReplaySettings,
  Rig,
  SessionUser,
  Transition,
} from '@streamforge/shared';
import { getColor, getName, getToken } from './auth';

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Identify loopback/host requests so actions are attributed correctly.
    'X-SF-Name': getName() || 'Host',
    'X-SF-Color': getColor(),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    ...init,
    headers,
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
  // Auth
  authConfig: () => http<{ authRequired: boolean }>('/api/auth/config'),
  login: (password: string, name: string, color: string) =>
    http<{ token: string; user: SessionUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password, name, color }),
    }),
  me: () => http<{ user: SessionUser }>('/api/auth/me'),
  logout: () => http<void>('/api/auth/logout', { method: 'POST' }),

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
  obsSetOverlaySource: (patch: { name?: string; autoSwitch?: boolean }) =>
    http<ObsState>('/api/obs/overlay-source', {
      method: 'POST',
      body: JSON.stringify(patch),
    }),
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
  obsTransition: (transitionName?: string, trigger = false) =>
    http<ObsState>('/api/obs/transition', {
      method: 'POST',
      body: JSON.stringify({ transitionName, trigger }),
    }),
  obsToggleStream: () => http<ObsState>('/api/obs/stream', { method: 'POST' }),
  obsToggleRecord: () => http<ObsState>('/api/obs/record', { method: 'POST' }),

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

  // Assets (overlay media library)
  assets: () => http<Asset[]>('/api/assets'),
  uploadAsset: async (file: File): Promise<Asset> => {
    const token = getToken();
    const form = new FormData();
    form.append('file', file);
    // No explicit Content-Type: the browser sets the multipart boundary.
    const headers: Record<string, string> = {
      'X-SF-Name': getName() || 'Host',
      'X-SF-Color': getColor(),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch('/api/assets', { method: 'POST', headers, body: form });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).error ?? detail;
      } catch {
        // ignore
      }
      throw new Error(`${res.status}: ${detail}`);
    }
    return (await res.json()) as Asset;
  },
  deleteAsset: (id: string) => http<void>(`/api/assets/${id}`, { method: 'DELETE' }),

  // League data (Firestore mirror) + overlay slot assignments
  league: () => http<LeagueData>('/api/league'),
  refreshLeague: () => http<LeagueData>('/api/league/refresh', { method: 'POST' }),
  assignments: () => http<Record<string, OverlayAssignments>>('/api/assignments'),
  setAssignments: (overlayId: string, assignments: OverlayAssignments) =>
    http<{ ok: true }>(`/api/overlays/${overlayId}/assignments`, {
      method: 'PUT',
      body: JSON.stringify({ assignments }),
    }),

  // Live output (single /live + /preview render endpoints)
  output: () => http<OutputState>('/api/output'),
  pushOutput: (
    channel: OutputChannel,
    overlayId: string,
    assignments: OverlayAssignments = {},
  ) =>
    http<OutputState>(`/api/output/${channel}/${overlayId}`, {
      method: 'POST',
      body: JSON.stringify({ assignments }),
    }),
  removeOutput: (channel: OutputChannel, overlayId: string) =>
    http<OutputState>(`/api/output/${channel}/${overlayId}`, { method: 'DELETE' }),
  takeOutput: () => http<OutputState>('/api/output/take', { method: 'POST' }),
  clearOutput: (channel: OutputChannel | 'all' = 'all') =>
    http<OutputState>(`/api/output/clear?channel=${channel}`, { method: 'POST' }),

  // Replays
  replays: () => http<{ replays: Replay[]; settings: ReplaySettings }>('/api/replays'),
  saveReplay: () => http<{ ok: true }>('/api/replays/save', { method: 'POST' }),
  startReplayBuffer: () =>
    http<{ ok: true }>('/api/replays/buffer/start', { method: 'POST' }),
  updateReplaySettings: (settings: Partial<ReplaySettings>) =>
    http<ReplaySettings>('/api/replays/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  loadReplay: (id: string) =>
    http<Replay>(`/api/replays/${id}/load`, { method: 'POST' }),
  deleteReplay: (id: string) =>
    http<void>(`/api/replays/${id}`, { method: 'DELETE' }),

  // Transitions
  transitions: () => http<Transition[]>('/api/transitions'),
  createTransition: (t: Partial<Transition>) =>
    http<Transition>('/api/transitions', { method: 'POST', body: JSON.stringify(t) }),
  updateTransition: (id: string, t: Partial<Transition>) =>
    http<Transition>(`/api/transitions/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTransition: (id: string) =>
    http<void>(`/api/transitions/${id}`, { method: 'DELETE' }),
};
