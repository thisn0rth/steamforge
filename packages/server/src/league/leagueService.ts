import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { App, ServiceAccount } from 'firebase-admin/app';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { LeagueCollection, LeagueData, LeagueDoc } from '@streamforge/shared';
import { EMPTY_LEAGUE_DATA } from '@streamforge/shared';
import { config } from '../config.js';

const LABEL_FIELDS = ['name', 'nickname', 'displayName', 'title', 'tag'];

/**
 * Mirrors the Firestore `players`/`teams`/`matches` collections into memory so
 * overlays can bind to league fields. Disabled (and silently inert) when no
 * service-account credentials are configured, so the app runs fine without
 * Firebase.
 */
class LeagueService extends EventEmitter {
  private db: Firestore | null = null;
  private app: App | null = null;
  private data: LeagueData = { ...EMPTY_LEAGUE_DATA };
  private timer: NodeJS.Timeout | null = null;

  init(): void {
    const creds = this.loadServiceAccount();
    if (!creds) {
      this.data = {
        ...EMPTY_LEAGUE_DATA,
        status: 'Firestore not configured (set FIRESTORE_SERVICE_ACCOUNT)',
      };
      return;
    }
    try {
      // The raw Google service-account JSON uses snake_case keys, which
      // cert() reads at runtime; cast to satisfy the camelCase typings.
      this.app = initializeApp(
        {
          credential: cert(creds as unknown as ServiceAccount),
          projectId: config.firestore.projectId || creds.project_id,
        },
        'streamforge-league',
      );
      this.db = getFirestore(this.app);
      void this.refresh();
      if (config.firestore.refreshMs > 0) {
        this.timer = setInterval(() => void this.refresh(), config.firestore.refreshMs);
        this.timer.unref();
      }
    } catch (err) {
      this.data = {
        ...EMPTY_LEAGUE_DATA,
        status: `Firestore init failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  snapshot(): LeagueData {
    return this.data;
  }

  /** Re-read all configured collections. */
  async refresh(): Promise<LeagueData> {
    if (!this.db) return this.data;
    try {
      const [players, teams, matches] = await Promise.all([
        this.readCollection(config.firestore.collections.players),
        this.readCollection(config.firestore.collections.teams),
        this.readCollection(config.firestore.collections.matches),
      ]);
      this.data = {
        connected: true,
        status: 'Connected',
        updatedAt: Date.now(),
        players,
        teams,
        matches,
        fields: {
          players: fieldNames(players),
          teams: fieldNames(teams),
          matches: fieldNames(matches),
        },
      };
    } catch (err) {
      this.data = {
        ...this.data,
        connected: false,
        status: `Firestore read failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    this.emit('league', this.data);
    return this.data;
  }

  private async readCollection(name: string): Promise<LeagueDoc[]> {
    if (!this.db) return [];
    const snap = await this.db.collection(name).get();
    return snap.docs.map((doc) => {
      const fields = doc.data() as Record<string, unknown>;
      return { id: doc.id, label: docLabel(doc.id, fields), fields };
    });
  }

  private loadServiceAccount(): { project_id?: string; [k: string]: unknown } | null {
    const { serviceAccountJson, serviceAccountPath } = config.firestore;
    try {
      if (serviceAccountJson.trim()) {
        return JSON.parse(serviceAccountJson);
      }
      if (serviceAccountPath.trim() && fs.existsSync(serviceAccountPath)) {
        return JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      }
    } catch {
      // fall through — treated as not configured / invalid
    }
    return null;
  }
}

function docLabel(id: string, fields: Record<string, unknown>): string {
  for (const key of LABEL_FIELDS) {
    const v = fields[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return id;
}

function fieldNames(docs: LeagueDoc[]): string[] {
  const set = new Set<string>();
  for (const d of docs) for (const k of Object.keys(d.fields)) set.add(k);
  return [...set].sort();
}

export const leagueService = new LeagueService();
export type { LeagueCollection };
