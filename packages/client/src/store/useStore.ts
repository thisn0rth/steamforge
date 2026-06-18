import { create } from 'zustand';
import type {
  ActivityEvent,
  GsiPayload,
  GsiStatus,
  ObsState,
  Rig,
  SessionUser,
} from '@streamforge/shared';
import { api } from '@/lib/api';
import { RealtimeSocket } from '@/lib/socket';
import { setSession } from '@/lib/auth';

const ACTIVITY_CAP = 80;

interface AppState {
  socketConnected: boolean;
  gsi: GsiPayload | null;
  gsiStatus: GsiStatus;
  obs: ObsState;
  rigs: Rig[];
  lastActivatedRigId: string | null;
  me: SessionUser | null;
  presence: SessionUser[];
  activity: ActivityEvent[];

  init: () => void;
  refreshRigs: () => Promise<void>;
  refreshObs: () => Promise<void>;
  setIdentity: (name: string, color: string) => void;
}

const emptyObs: ObsState = {
  connected: false,
  error: null,
  currentProgramScene: null,
  currentPreviewScene: null,
  studioModeEnabled: false,
  scenes: [],
  transitions: [],
  currentTransition: null,
  streaming: { active: false, durationMs: 0, kbitsPerSec: 0, skippedFrames: 0, totalFrames: 0, congestion: 0 },
  recording: { active: false, paused: false, durationMs: 0 },
  stats: null,
};

let socket: RealtimeSocket | null = null;

export const useStore = create<AppState>((set, get) => ({
  socketConnected: false,
  gsi: null,
  gsiStatus: { connected: false, lastUpdate: null, provider: null },
  obs: emptyObs,
  rigs: [],
  lastActivatedRigId: null,
  me: null,
  presence: [],
  activity: [],

  init: () => {
    if (socket) return;
    socket = new RealtimeSocket(
      (msg) => {
        switch (msg.type) {
          case 'gsi':
            set({ gsi: msg.payload });
            break;
          case 'gsiStatus':
            set({ gsiStatus: msg.status });
            break;
          case 'obsState':
            set({ obs: msg.state });
            break;
          case 'rigsUpdated':
            set({ rigs: msg.rigs });
            break;
          case 'rigActivated':
            set({ lastActivatedRigId: msg.rigId });
            break;
          case 'hello':
            if (msg.you) set({ me: msg.you });
            break;
          case 'presence':
            set({ presence: msg.users });
            break;
          case 'activity':
            set((s) => ({
              activity: [...s.activity, msg.event].slice(-ACTIVITY_CAP),
            }));
            break;
          case 'activityLog':
            set({ activity: msg.events.slice(-ACTIVITY_CAP) });
            break;
          default:
            break;
        }
      },
      (connected) => set({ socketConnected: connected }),
    );
    socket.connect();

    // Seed initial state via REST (covers data not pushed yet).
    void get().refreshRigs();
    void get().refreshObs();
    api.gsiStatus().then((s) => set({ gsiStatus: s })).catch(() => undefined);
    api.gsiCurrent().then((g) => g && set({ gsi: g })).catch(() => undefined);
  },

  refreshRigs: async () => {
    try {
      set({ rigs: await api.rigs() });
    } catch {
      // server may not be reachable yet
    }
  },

  refreshObs: async () => {
    try {
      set({ obs: await api.obsState() });
    } catch {
      // ignore
    }
  },

  setIdentity: (name, color) => {
    setSession({ name, color });
    socket?.identify();
    set((s) => (s.me ? { me: { ...s.me, name, color } } : {}));
  },
}));
