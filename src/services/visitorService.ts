import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { getAnalyticsOptOut, isAdminAuthenticated } from '../utils/licenseManager';

export interface VisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
}

const STORAGE_KEY = 'ty_visitor_stats_v1';
const SESSION_TIMESTAMP_KEY = 'ty_last_visit_time_v1';
const VISITOR_COUNTED_KEY = 'ty_visitor_counted_v1';
const STATS_COLLECTION = 'stats';
const STATS_DOC_ID = 'visitors';
const STATS_PATH = `${STATS_COLLECTION}/${STATS_DOC_ID}`;

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

function isPermissionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as { code?: string } | null)?.code || '';
  return (
    code === 'permission-denied' ||
    msg.toLowerCase().includes('permission') ||
    msg.toLowerCase().includes('insufficient')
  );
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
          todayVisits: Math.max(0, Number(parsed.todayVisits) || 0),
          uniqueVisitors: Math.max(1, Number(parsed.uniqueVisitors) || 1),
        };
      }
    }
  } catch {}
  return DEFAULT_BASELINE;
}

export async function fetchAndRecordVisit(): Promise<VisitorStats> {
  const isCreator = isAdminAuthenticated() || getAnalyticsOptOut();
  const cached = getCachedVisitorStats();
  const today = getTodayUtcDate();

  let shouldIncrementSession = !isCreator;
  if (shouldIncrementSession && typeof window !== 'undefined') {
    try {
      const now = Date.now();
      const lastTime = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
      if (lastTime && now - Number(lastTime) < 30000) {
        shouldIncrementSession = false;
      }
      sessionStorage.setItem(SESSION_TIMESTAMP_KEY, String(now));
    } catch {}
  }

  let isNewUniqueVisitor = false;
  if (shouldIncrementSession && typeof window !== 'undefined') {
    try {
      isNewUniqueVisitor = !localStorage.getItem(VISITOR_COUNTED_KEY);
    } catch {}
  }

  const statsRef = doc(db, STATS_COLLECTION, STATS_DOC_ID);

  try {
    if (!shouldIncrementSession) {
      const snap = await getDoc(statsRef);
      if (snap.exists()) {
        const data = snap.data();
        const stats: VisitorStats = {
          totalVisits: Math.max(DEFAULT_BASELINE.totalVisits, Number(data.totalVisits) || DEFAULT_BASELINE.totalVisits),
          todayVisits: data.lastDate === today ? Math.max(0, Number(data.todayVisits) || 0) : 0,
          uniqueVisitors: Math.max(DEFAULT_BASELINE.uniqueVisitors, Number(data.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors),
        };
        saveStatsToLocalCache(stats);
        return stats;
      }
      // If creator opens before document exists, seed baseline cleanly once
      const seeded = await runTransaction(db, async (tx) => {
        const current = await tx.get(statsRef);
        if (current.exists()) {
          const d = current.data();
          return {
            totalVisits: Math.max(DEFAULT_BASELINE.totalVisits, Number(d.totalVisits) || DEFAULT_BASELINE.totalVisits),
            todayVisits: d.lastDate === today ? Math.max(0, Number(d.todayVisits) || 0) : 0,
            uniqueVisitors: Math.max(DEFAULT_BASELINE.uniqueVisitors, Number(d.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors),
          };
        }
        tx.set(statsRef, {
          totalVisits: DEFAULT_BASELINE.totalVisits,
          todayVisits: 1,
          uniqueVisitors: DEFAULT_BASELINE.uniqueVisitors,
          lastDate: today,
          updatedAt: serverTimestamp(),
        });
        return {
          totalVisits: DEFAULT_BASELINE.totalVisits,
          todayVisits: 1,
          uniqueVisitors: DEFAULT_BASELINE.uniqueVisitors,
        };
      });
      saveStatsToLocalCache(seeded);
      return seeded;
    }

    const updated = await runTransaction(db, async (tx) => {
      const snap = await tx.get(statsRef);
      if (!snap.exists()) {
        const initialTotal = DEFAULT_BASELINE.totalVisits + 1;
        const initialUnique = isNewUniqueVisitor
          ? DEFAULT_BASELINE.uniqueVisitors + 1
          : DEFAULT_BASELINE.uniqueVisitors;
        tx.set(statsRef, {
          totalVisits: initialTotal,
          todayVisits: 1,
          uniqueVisitors: initialUnique,
          lastDate: today,
          updatedAt: serverTimestamp(),
        });
        return {
          totalVisits: initialTotal,
          todayVisits: 1,
          uniqueVisitors: initialUnique,
        };
      }

      const data = snap.data();
      const prevTotal = Math.max(DEFAULT_BASELINE.totalVisits, Number(data.totalVisits) || DEFAULT_BASELINE.totalVisits);
      const prevUnique = Math.max(DEFAULT_BASELINE.uniqueVisitors, Number(data.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors);
      const prevDate = typeof data.lastDate === 'string' ? data.lastDate : '';
      const prevToday = Math.max(0, Number(data.todayVisits) || 0);

      const nextTotal = prevTotal + 1;
      const nextToday = prevDate === today ? prevToday + 1 : 1;
      const nextUnique = isNewUniqueVisitor ? prevUnique + 1 : prevUnique;

      tx.update(statsRef, {
        totalVisits: nextTotal,
        todayVisits: nextToday,
        uniqueVisitors: nextUnique,
        lastDate: today,
        updatedAt: serverTimestamp(),
      });

      return {
        totalVisits: nextTotal,
        todayVisits: nextToday,
        uniqueVisitors: nextUnique,
      };
    });

    if (isNewUniqueVisitor && typeof window !== 'undefined') {
      try {
        localStorage.setItem(VISITOR_COUNTED_KEY, '1');
      } catch {}
    }

    saveStatsToLocalCache(updated);
    return updated;
  } catch (error) {
    if (isPermissionError(error)) {
      handleFirestoreError(error, OperationType.WRITE, STATS_PATH);
    }
    console.warn('Firestore visitor stats fallback to cache:', error);
    return cached;
  }
}

export function subscribeVisitorStats(
  onUpdate: (stats: VisitorStats) => void
): () => void {
  const statsRef = doc(db, STATS_COLLECTION, STATS_DOC_ID);
  return onSnapshot(
    statsRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const today = getTodayUtcDate();
      const stats: VisitorStats = {
        totalVisits: Math.max(
          DEFAULT_BASELINE.totalVisits,
          Number(data.totalVisits) || DEFAULT_BASELINE.totalVisits
        ),
        todayVisits: data.lastDate === today ? Math.max(0, Number(data.todayVisits) || 0) : 0,
        uniqueVisitors: Math.max(
          DEFAULT_BASELINE.uniqueVisitors,
          Number(data.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors
        ),
      };
      saveStatsToLocalCache(stats);
      onUpdate(stats);
    },
    (error) => {
      if (isPermissionError(error)) {
        handleFirestoreError(error, OperationType.GET, STATS_PATH);
      }
      console.warn('Visitor live snapshot notice:', error);
    }
  );
}
