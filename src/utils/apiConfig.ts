// Automatic API Base Resolution
// Uses same-origin /api/* paths to avoid cross-origin cookie/redirect blocks (Failed to fetch)

export function getApiEndpoint(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
