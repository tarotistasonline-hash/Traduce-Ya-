export interface VisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
}

const SESSION_KEY = 'traductor_ya_session_logged_v1';

export async function fetchAndRecordVisit(): Promise<VisitorStats> {
  const isNewSession = typeof window !== 'undefined' && !sessionStorage.getItem(SESSION_KEY);

  try {
    const res = await fetch('/api/visits', {
      method: isNewSession ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: isNewSession ? JSON.stringify({ isNewSession: true }) : undefined,
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch visits: ${res.status}`);
    }

    const data: VisitorStats = await res.json();

    if (isNewSession && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(SESSION_KEY, 'true');
      } catch {}
    }

    return data;
  } catch (error) {
    console.warn('Visitor counter notice:', error);
    return {
      totalVisits: 1,
      todayVisits: 1,
      uniqueVisitors: 1,
    };
  }
}
