// License and usage quota manager for Traduce Ya

export const DAILY_FREE_LIMIT = 5;

const STORAGE_KEY_PRO = 'traductor_ya_pro_v1';
const STORAGE_KEY_USAGE = 'traductor_ya_daily_usage_v1';
const STORAGE_KEY_PAYMENT_URL = 'traductor_ya_custom_payment_url';

// Accepted activation codes (case-insensitive)
export const VALID_ACTIVATION_CODES = [
  'TRADUCEYA',
  'TRADUCEYA2026',
  'PRO2026',
  'VIP2026',
  'ILIMITADO',
  'PREMIUM',
  'TAROT2026',
];

// Default payment link (user can customize this)
export const DEFAULT_PAYMENT_URL = 'https://link.mercadopago.com.ar/';

export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isProUser(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_PRO) === 'true';
  } catch {
    return false;
  }
}

export function setProUser(status: boolean): void {
  try {
    if (status) {
      localStorage.setItem(STORAGE_KEY_PRO, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY_PRO);
    }
  } catch (e) {
    console.warn('Failed to save pro status:', e);
  }
}

export function getDailyUsage(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USAGE);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const today = getTodayDateString();
    if (parsed.date === today && typeof parsed.count === 'number') {
      return parsed.count;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function incrementDailyUsage(): number {
  try {
    const today = getTodayDateString();
    const current = getDailyUsage();
    const nextCount = current + 1;
    localStorage.setItem(
      STORAGE_KEY_USAGE,
      JSON.stringify({ date: today, count: nextCount })
    );
    return nextCount;
  } catch {
    return 1;
  }
}

export function getRemainingTranslations(): number {
  if (isProUser()) return Infinity;
  const used = getDailyUsage();
  return Math.max(0, DAILY_FREE_LIMIT - used);
}

export function canPerformTranslation(): boolean {
  if (isProUser()) return true;
  return getDailyUsage() < DAILY_FREE_LIMIT;
}

export function activateWithCode(rawCode: string): boolean {
  const clean = rawCode.trim().toUpperCase();
  if (VALID_ACTIVATION_CODES.includes(clean)) {
    setProUser(true);
    return true;
  }
  return false;
}

export function getPaymentUrl(): string {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_PAYMENT_URL);
    return custom && custom.startsWith('http') ? custom : DEFAULT_PAYMENT_URL;
  } catch {
    return DEFAULT_PAYMENT_URL;
  }
}

export function setPaymentUrl(url: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem(STORAGE_KEY_PAYMENT_URL, url.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_PAYMENT_URL);
    }
  } catch (e) {
    console.warn('Failed to save payment URL:', e);
  }
}

/**
 * Check if the user returned from a successful payment redirection
 * e.g., ?unlocked=true, ?premium=true, ?pro=true, ?pago=exitoso, ?status=approved
 */
export function checkUrlAutoUnlock(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const unlockParam =
      params.get('unlocked') === 'true' ||
      params.get('premium') === 'true' ||
      params.get('pro') === 'true' ||
      params.get('pago') === 'exitoso' ||
      params.get('status') === 'approved';

    const codeParam = params.get('code');
    const validCode = codeParam && VALID_ACTIVATION_CODES.includes(codeParam.trim().toUpperCase());

    if (unlockParam || validCode) {
      setProUser(true);

      // Clean the query parameter from URL cleanly without reload
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
      return true;
    }
  } catch (e) {
    console.warn('checkUrlAutoUnlock error:', e);
  }
  return false;
}
