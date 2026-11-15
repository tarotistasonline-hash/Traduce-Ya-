import { isCreatorUser } from '../utils/licenseManager';

export interface VisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
}

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

export async function fetchAndRecordVisit(): Promise<VisitorStats> {
  const isCreator = isCreatorUser();
  const cached = getCachedVisitorStats();
  
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

  let isNewUniqueVisitor = false;
  if (typeof window !== 'undefined') {
    try {
      isNewUniqueVisitor = !localStorage.getItem(VISITOR_COUNTED_KEY);
    } catch {}
  }

  try {
    const res = await fetch('/api/visits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isCreator,
        clientReportedTotal: cached.totalVisits,
        visitorId: isNewUniqueVisitor ? Math.random().toString(36).substring(2, 12) : undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const stats: VisitorStats = {
        totalVisits: Number(data.totalVisits) || cached.totalVisits,
        todayVisits: Number(data.todayVisits) || cached.todayVisits,
        uniqueVisitors: Number(data.uniqueVisitors) || cached.uniqueVisitors,
      };
      if (isNewUniqueVisitor && typeof window !== 'undefined') {
        try {
          localStorage.setItem(VISITOR_COUNTED_KEY, '1');
        } catch {}
      }
      saveStatsToLocalCache(stats);
      return stats;
    }
  } catch (err) {
    console.warn('Visitor fetch/record fallback to cache:', err);
  }

  return cached;
}

export function subscribeVisitorStats(
  onUpdate: (stats: VisitorStats) => void
): () => void {
  // Poll server stats every 30 seconds for live updates
  const interval = setInterval(async () => {
    try {
      const res = await fetch('/api/visits');
      if (res.ok) {
        const data = await res.json();
        const stats: VisitorStats = {
          totalVisits: Number(data.totalVisits) || DEFAULT_BASELINE.totalVisits,
          todayVisits: Number(data.todayVisits) || DEFAULT_BASELINE.todayVisits,
          uniqueVisitors: Number(data.uniqueVisitors) || DEFAULT_BASELINE.uniqueVisitors,
        };
        saveStatsToLocalCache(stats);
        onUpdate(stats);
      }
    } catch {}
  }, 30000);

  return () => {
    clearInterval(interval);
  };
}
