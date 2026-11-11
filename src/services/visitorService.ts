import { getApiEndpoint } from '../utils/apiConfig';

export interface VisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
}

const STORAGE_KEY = 'ty_visitor_stats_v1';
const SESSION_TIMESTAMP_KEY = 'ty_last_visit_time_v1';

export function getCachedVisitorStats(): VisitorStats {
  if (typeof window === 'undefined') {
    return { totalVisits: 28, todayVisits: 8, uniqueVisitors: 19 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.totalVisits === 'number' && parsed.totalVisits >= 1) {
        return parsed;
      }
    }
  } catch {}
  return { totalVisits: 28, todayVisits: 8, uniqueVisitors: 19 };
}

export async function fetchAndRecordVisit(): Promise<VisitorStats> {
  const cached = getCachedVisitorStats();
  const now = Date.now();
  let shouldIncrementSession = true;

  if (typeof window !== 'undefined') {
    try {
      const lastTime = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
      // If refreshed within 20 seconds, don't spam duplicate count in the exact same second
      if (lastTime && now - Number(lastTime) < 20000) {
        shouldIncrementSession = false;
      }
      sessionStorage.setItem(SESSION_TIMESTAMP_KEY, String(now));
    } catch {}
  }

  try {
    const endpointUrl = getApiEndpoint('/api/visits');
    const res = await fetch(endpointUrl, {
      method: shouldIncrementSession ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: shouldIncrementSession
        ? JSON.stringify({ clientReportedTotal: cached.totalVisits })
        : undefined,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch visits: ${res.status}`);
    }

    const data: VisitorStats = await res.json();

    // Ensure we never decrease count
    const safeData: VisitorStats = {
      totalVisits: Math.max(cached.totalVisits, data.totalVisits || 0),
      todayVisits: Math.max(1, data.todayVisits || 1),
      uniqueVisitors: Math.max(cached.uniqueVisitors, data.uniqueVisitors || 0),
    };

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(safeData));
      } catch {}
    }

    return safeData;
  } catch (error) {
    console.warn('Visitor counter network notice, using local cached stats:', error);
    // If network fails (e.g. offline/proxy), gracefully increment local count
    const fallbackData: VisitorStats = {
      totalVisits: cached.totalVisits + (shouldIncrementSession ? 1 : 0),
      todayVisits: cached.todayVisits + (shouldIncrementSession ? 1 : 0),
      uniqueVisitors: cached.uniqueVisitors,
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackData));
      } catch {}
    }
    return fallbackData;
  }
}
