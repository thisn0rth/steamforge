import { create } from 'zustand';
import type {
  GsiPayload,
  GsiStatus,
  ObsState,
  Rig,
} from '@streamforge/shared';
import { api } from '@/lib/api';
import { RealtimeSocket } from '@/lib/socket';

interface AppState {
  socketConnected: boolean;
  gsi: GsiPayload | null;
  gsiStatus: GsiStatus;
  obs: ObsState;
  rigs: Rig[];
  lastActivatedRigId: string | null;

  init: () => void;
  refreshRigs: () => Promise<void>;
  refreshObs: () => Promise<void>;
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
};

let socket: RealtimeSocket | null = null;

export const useStore = create<AppState>((set, get) => ({
  socketConnected: false,
  gsi: null,
  gsiStatus: { connected: false, lastUpdate: null, provider: null },
  obs: emptyObs,
  rigs: [],
  lastActivatedRigId: null,

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
}));
