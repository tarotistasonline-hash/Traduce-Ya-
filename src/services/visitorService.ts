import { getApiEndpoint } from '../utils/apiConfig';
import { isCreatorUser } from '../utils/licenseManager';

export interface VisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
}

const STORAGE_KEY = 'ty_visitor_stats_v1';
const SESSION_TIMESTAMP_KEY = 'ty_last_visit_time_v1';
const VISITOR_ID_KEY = 'ty_visitor_uuid_v1';

function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = localStorage.getItem(VISITOR_ID_KEY);
    if (!id) {
      id = 'v_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem(VISITOR_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

export function getCachedVisitorStats(): VisitorStats {
  if (typeof window === 'undefined') {
    return { totalVisits: 38, todayVisits: 12, uniqueVisitors: 24 };
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
  return { totalVisits: 38, todayVisits: 12, uniqueVisitors: 24 };
}

export async function fetchAndRecordVisit(): Promise<VisitorStats> {
  const isCreator = isCreatorUser();
  const cached = getCachedVisitorStats();

  // If user is creator, don't record to avoid skewing stats during testing
  if (isCreator) {
    return cached;
  }

  const now = Date.now();
  let shouldIncrementSession = true;
  const visitorId = getOrCreateVisitorId();

  if (typeof window !== 'undefined') {
    try {
      const lastTime = sessionStorage.getItem(SESSION_TIMESTAMP_KEY);
      // Avoid duplicate hits from fast reloads within 20s
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
        ? JSON.stringify({ clientReportedTotal: cached.totalVisits, isCreator, visitorId })
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
