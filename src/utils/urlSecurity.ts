// URL and email sanitization helpers to prevent unsafe href schemes (javascript:, data:, etc.)

export function sanitizeExternalUrl(rawUrl: string | undefined | null, fallback: string = '#'): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Allow relative safe paths starting with a single slash
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      return trimmed;
    }
  }
  return fallback;
}

export function isValidHttpUrl(rawUrl: string | undefined | null): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeEmail(rawEmail: string | undefined | null, fallback: string = 'azulbaires@gmail.com'): string {
  const trimmed = String(rawEmail || '').trim();
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function isValidGeminiApiKeyFormat(rawKey: string | undefined | null): boolean {
  const trimmed = String(rawKey || '').trim();
  return /^AIza[0-9A-Za-z_-]{20,100}$/.test(trimmed);
}
