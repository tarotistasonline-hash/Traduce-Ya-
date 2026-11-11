// Automatic API Base Resolution
// Allows custom domains (like traduce-ya.online) to communicate seamlessly with the AI backend

export const CLOUD_RUN_BACKEND_URL = 'https://ais-pre-fn5tz4dobb6so5ytrfrpwr-172786148761.us-east1.run.app';

export function getApiEndpoint(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') {
    return cleanPath;
  }

  const hostname = window.location.hostname;
  // If hosted on a custom domain (e.g. traduce-ya.online, Vercel, custom DNS)
  if (hostname !== 'localhost' && !hostname.endsWith('.run.app') && !hostname.includes('127.0.0.1')) {
    return `${CLOUD_RUN_BACKEND_URL}${cleanPath}`;
  }

  return cleanPath;
}
