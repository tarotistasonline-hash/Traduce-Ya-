import {
  doc,
  getDocFromServer,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { isCreatorUser } from '../utils/licenseManager';

export interface VisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
}

const STATS_DOC_PATH = 'stats/global';
const STORAGE_KEY = 'ty_visitor_stats_v1';
const SESSION_TIMESTAMP_KEY = 'ty_last_visit_time_v1';
const VISITOR_COUNTED_KEY = 'ty_visitor_counted_v1';

const DEFAULT_BASELINE: VisitorStats = {
  totalVisits: 39,
  todayVisits: 1,
  uniqueVisitors: 25,
};

function getTodayUtcDate(): string {
  return new Date().toISOString().split('T')[0];
}

function saveStatsToLocalCache(stats: VisitorStats): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  } catch {}
}

export function getCachedVisitorStats(): VisitorStats {
  if (typeof window === 'undefined') {
    return DEFAULT_BASELINE;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.totalVisits === 'number' && parsed.totalVisits >= 1) {
        return {
          totalVisits: parsed.totalVisits,
          todayVisits: Math.max(1, Number(parsed.todayVisits) || 1),
          uniqueVisitors: Math.max(1, Number(parsed.uniqueVisitors) || 1),
        };
      }
    }
  } catch {}
  return DEFAULT_BASELINE;
}

function isPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code = (error as { code?: string })?.code || '';
  return (
    code === 'permission-denied' ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission_denied')
  );
}

function parseDocStats(data: Record<string, unknown> | undefined, today: string): VisitorStats {
  if (!data) return DEFAULT_BASELINE;
  const totalVisits = Math.max(1, Number(data.totalVisits) || DEFAULT_BASELINE.totalVisits);
  const uniqueVisitors = Math.max(1, Number(data.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors);
  const docToday = typeof data.today === 'string' ? data.today : today;
  const todayVisits =
    docToday === today ? Math.max(1, Number(data.todayVisits) || 1) : 1;

  return {
    totalVisits,
    todayVisits,
    uniqueVisitors,
  };
}

export async function fetchAndRecordVisit(): Promise<VisitorStats> {
  const isCreator = isCreatorUser();
  const cached = getCachedVisitorStats();
  const today = getTodayUtcDate();
  const statsRef = doc(db, 'stats', 'global');

  let shouldIncrementSession = !isCreator;

  if (shouldIncrementSession && typeof window !== 'undefined') {
    try {
      const now = Date.now();
      const lastTime = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
      if (lastTime && now - Number(lastTime) < 20000) {
        shouldIncrementSession = false;
      }
      sessionStorage.setItem(SESSION_TIMESTAMP_KEY, String(now));
    } catch {}
  }

  // If creator mode is active or recent refresh, read live Firestore stats without incrementing
  if (!shouldIncrementSession) {
    try {
      const snap = await getDocFromServer(statsRef);
      if (snap.exists()) {
        const liveStats = parseDocStats(snap.data(), today);
        saveStatsToLocalCache(liveStats);
        return liveStats;
      }
      return cached;
    } catch (error) {
      if (isPermissionError(error)) {
        handleFirestoreError(error, OperationType.GET, STATS_DOC_PATH);
      }
      console.warn('Firestore read notice, using local cached stats:', error);
      return cached;
    }
  }

  // Real visitor: atomically increment global Firestore counter
  let isNewUniqueVisitor = false;
  if (typeof window !== 'undefined') {
    try {
      isNewUniqueVisitor = !localStorage.getItem(VISITOR_COUNTED_KEY);
    } catch {}
  }

  try {
    const updatedStats = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(statsRef);

      if (!snap.exists()) {
        const initialDoc = {
          totalVisits: DEFAULT_BASELINE.totalVisits,
          todayVisits: 1,
          uniqueVisitors: DEFAULT_BASELINE.uniqueVisitors,
          today,
          updatedAt: serverTimestamp(),
        };
        transaction.set(statsRef, initialDoc);
        return {
          totalVisits: initialDoc.totalVisits,
          todayVisits: initialDoc.todayVisits,
          uniqueVisitors: initialDoc.uniqueVisitors,
        };
      }

      const data = snap.data();
      const currentTotal = Math.max(1, Number(data.totalVisits) || DEFAULT_BASELINE.totalVisits);
      const currentUnique = Math.max(1, Number(data.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors);
      const currentDay = typeof data.today === 'string' ? data.today : today;
      const currentTodayVisits = Math.max(1, Number(data.todayVisits) || 1);

      const nextTotal = currentTotal + 1;
      const nextTodayVisits = currentDay === today ? currentTodayVisits + 1 : 1;
      const nextUnique = isNewUniqueVisitor ? currentUnique + 1 : currentUnique;

      transaction.update(statsRef, {
        totalVisits: nextTotal,
        todayVisits: nextTodayVisits,
        uniqueVisitors: nextUnique,
        today,
        updatedAt: serverTimestamp(),
      });

      return {
        totalVisits: nextTotal,
        todayVisits: nextTodayVisits,
        uniqueVisitors: nextUnique,
      };
    });

    if (isNewUniqueVisitor && typeof window !== 'undefined') {
      try {
        localStorage.setItem(VISITOR_COUNTED_KEY, '1');
      } catch {}
    }

    saveStatsToLocalCache(updatedStats);
    return updatedStats;
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, STATS_DOC_PATH);
    }
    console.warn('Firestore visitor transaction notice, using local cached stats:', error);
    return cached;
  }
}

export function subscribeVisitorStats(
  onUpdate: (stats: VisitorStats) => void
): () => void {
  const statsRef = doc(db, 'stats', 'global');
  return onSnapshot(
    statsRef,
    (snap) => {
      if (snap.exists()) {
        const liveStats = parseDocStats(snap.data(), getTodayUtcDate());
        saveStatsToLocalCache(liveStats);
        onUpdate(liveStats);
      }
    },
    (error) => {
      if (isPermissionError(error)) {
        handleFirestoreError(error, OperationType.GET, STATS_DOC_PATH);
      }
      console.warn('Firestore snapshot notice:', error);
    }
  );
}
