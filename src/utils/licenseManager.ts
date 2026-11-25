// License, admin session, and usage quota manager for Traduce Ya
import { getApiEndpoint } from './apiConfig';
import {
  isValidGeminiApiKeyFormat,
  isValidHttpUrl,
  sanitizeEmail,
} from './urlSecurity';

export const FREE_TRIAL_LIMIT = 15;
export const DAILY_FREE_LIMIT = FREE_TRIAL_LIMIT;

const STORAGE_KEY_PRO = 'traductor_ya_pro_v1';
const STORAGE_KEY_PRO_TOKEN = 'traductor_ya_pro_token_v1';
const STORAGE_KEY_ANALYTICS_OPTOUT = 'traductor_ya_analytics_optout_v1';
const STORAGE_KEY_TRIAL_USAGE = 'traductor_ya_trial_usage_v1';
const LEGACY_STORAGE_KEY_USAGE = 'traductor_ya_daily_usage_v1';
const STORAGE_KEY_PAYMENT_URL = 'traductor_ya_custom_payment_url';
const STORAGE_KEY_PAYMENT_CONFIG = 'traductor_ya_payment_config_v1';
const STORAGE_KEY_USER_API_KEY = 'traductor_ya_user_api_key_v1';

// Admin session token lives strictly in JS memory (never persisted in localStorage)
let inMemoryAdminToken = '';
let inMemoryProToken = '';

export interface PaymentConfig {
  usdPriceLabel: string;
  arsPriceLabel: string;
  paypalAccount: string; // Email or https://paypal.me/... link
  arsTarget: string; // Alias, CVU or https://mpago.la/... link
  whatsappOrContact: string;
  contactEmail: string;
}

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  usdPriceLabel: '$5 USD',
  arsPriceLabel: 'o equivalente en tu moneda (Mercado Pago)',
  paypalAccount: '', // Oculto por ahora hasta que la dueña decida habilitar PayPal
  arsTarget: 'https://mpago.la/224fBsf',
  whatsappOrContact: '',
  contactEmail: 'azulbaires@gmail.com',
};

export const DEFAULT_PAYMENT_URL = 'https://mpago.la/224fBsf';

export interface AdminStatusResponse {
  hasEnvPasscode: boolean;
  hasClaimedPasscode: boolean;
  needsSetup: boolean;
  firebaseAdminEmail: string;
  isAuthenticated: boolean;
}

export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function getAdminToken(): string {
  return inMemoryAdminToken;
}

export function isAdminAuthenticated(): boolean {
  return Boolean(inMemoryAdminToken);
}

export function setAdminSessionToken(token: string): void {
  inMemoryAdminToken = typeof token === 'string' ? token.trim() : '';
}

export function clearAdminSession(): void {
  inMemoryAdminToken = '';
}

export function isCreatorUser(): boolean {
  return isAdminAuthenticated();
}

export function getAnalyticsOptOut(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY_ANALYTICS_OPTOUT) === 'true';
  } catch {
    return false;
  }
}

export function setAnalyticsOptOut(status: boolean): void {
  try {
    if (status) {
      localStorage.setItem(STORAGE_KEY_ANALYTICS_OPTOUT, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY_ANALYTICS_OPTOUT);
    }
  } catch (e) {
    console.warn('Failed to save analytics opt-out:', e);
  }
}

export function getProToken(): string {
  if (inMemoryProToken) return inMemoryProToken;
  if (typeof window === 'undefined') return '';
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PRO_TOKEN)?.trim() || '';
    if (saved) inMemoryProToken = saved;
    return saved;
  } catch {
    return '';
  }
}

export function setProSessionToken(token: string): void {
  const clean = typeof token === 'string' ? token.trim() : '';
  inMemoryProToken = clean;
  try {
    if (clean) {
      localStorage.setItem(STORAGE_KEY_PRO_TOKEN, clean);
      localStorage.setItem(STORAGE_KEY_PRO, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY_PRO_TOKEN);
      localStorage.removeItem(STORAGE_KEY_PRO);
    }
  } catch (e) {
    console.warn('Failed to save pro session token:', e);
  }
}

export function getUserApiKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = localStorage.getItem(STORAGE_KEY_USER_API_KEY)?.trim() || '';
    return isValidGeminiApiKeyFormat(saved) ? saved : '';
  } catch {
    return '';
  }
}

export function setUserApiKey(key: string): { ok: boolean; error?: string } {
  try {
    const clean = key.trim();
    if (!clean) {
      localStorage.removeItem(STORAGE_KEY_USER_API_KEY);
      return { ok: true };
    }
    if (!isValidGeminiApiKeyFormat(clean)) {
      return {
        ok: false,
        error: 'Formato inválido: la clave gratuita de Gemini debe comenzar con "AIza..." y no contener espacios.',
      };
    }
    localStorage.setItem(STORAGE_KEY_USER_API_KEY, clean);
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo guardar la clave en este navegador.' };
  }
}

export function isProUser(): boolean {
  if (isAdminAuthenticated()) return true;
  if (getUserApiKey()) return true;
  if (getProToken()) return true;
  try {
    return localStorage.getItem(STORAGE_KEY_PRO) === 'true';
  } catch {
    return false;
  }
}

export function getFreeTrialUsage(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIAL_USAGE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.count === 'number' && parsed.count >= 0) {
        return parsed.count;
      }
    }

    // Migrate legacy daily counter so visitors who already used free phrases keep their usage
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY_USAGE);
    if (legacyRaw) {
      const legacyParsed = JSON.parse(legacyRaw);
      if (typeof legacyParsed?.count === 'number' && legacyParsed.count > 0) {
        localStorage.setItem(
          STORAGE_KEY_TRIAL_USAGE,
          JSON.stringify({ count: legacyParsed.count })
        );
        return legacyParsed.count;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export function incrementFreeTrialUsage(): number {
  try {
    const current = getFreeTrialUsage();
    const nextCount = current + 1;
    localStorage.setItem(
      STORAGE_KEY_TRIAL_USAGE,
      JSON.stringify({ count: nextCount })
    );
    return nextCount;
  } catch {
    return 1;
  }
}

export const getDailyUsage = getFreeTrialUsage;
export const incrementDailyUsage = incrementFreeTrialUsage;

export function getRemainingTranslations(): number {
  if (isProUser()) return Infinity;
  const used = getFreeTrialUsage();
  return Math.max(0, FREE_TRIAL_LIMIT - used);
}

export function canPerformTranslation(): boolean {
  if (isProUser()) return true;
  return getFreeTrialUsage() < FREE_TRIAL_LIMIT;
}

export async function fetchAdminStatus(): Promise<AdminStatusResponse> {
  const headers: Record<string, string> = {};
  if (inMemoryAdminToken) {
    headers.Authorization = `Bearer ${inMemoryAdminToken}`;
  }
  const res = await fetch(getApiEndpoint('/api/admin/status'), { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      hasEnvPasscode: false,
      hasClaimedPasscode: false,
      needsSetup: false,
      firebaseAdminEmail: 'tarotistasonline@gmail.com',
      isAuthenticated: isAdminAuthenticated(),
    };
  }
  if (!data.isAuthenticated && inMemoryAdminToken) {
    inMemoryAdminToken = '';
  }
  return {
    hasEnvPasscode: Boolean(data.hasEnvPasscode),
    hasClaimedPasscode: Boolean(data.hasClaimedPasscode),
    needsSetup: Boolean(data.needsSetup),
    firebaseAdminEmail: String(data.firebaseAdminEmail || 'tarotistasonline@gmail.com'),
    isAuthenticated: Boolean(data.isAuthenticated),
  };
}

export async function claimAdminPasscode(
  passcode: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(getApiEndpoint('/api/admin/claim'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: passcode.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && typeof data.adminToken === 'string') {
      setAdminSessionToken(data.adminToken);
      return { ok: true };
    }
    return { ok: false, error: data.error || 'No se pudo configurar la contraseña.' };
  } catch {
    return { ok: false, error: 'Error de conexión con el servidor.' };
  }
}

export async function loginAdminWithPasscode(
  passcode: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(getApiEndpoint('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: passcode.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && typeof data.adminToken === 'string') {
      setAdminSessionToken(data.adminToken);
      return { ok: true };
    }
    return { ok: false, error: data.error || 'Contraseña incorrecta.' };
  } catch {
    return { ok: false, error: 'Error de conexión con el servidor.' };
  }
}

export async function loginAdminWithFirebase(
  idToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(getApiEndpoint('/api/admin/firebase-login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && typeof data.adminToken === 'string') {
      setAdminSessionToken(data.adminToken);
      return { ok: true };
    }
    return { ok: false, error: data.error || 'No se pudo validar tu cuenta de Google.' };
  } catch {
    return { ok: false, error: 'Error de conexión al verificar la cuenta de Google.' };
  }
}

export async function activateLicenseCode(
  rawCode: string
): Promise<{ ok: boolean; role?: 'admin' | 'pro'; error?: string }> {
  const clean = rawCode.trim();
  if (!clean) {
    return { ok: false, error: 'Por favor ingresa tu código de activación.' };
  }
  try {
    const res = await fetch(getApiEndpoint('/api/activate-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      if (data.role === 'admin' && typeof data.adminToken === 'string') {
        setAdminSessionToken(data.adminToken);
        return { ok: true, role: 'admin' };
      }
      if (typeof data.proToken === 'string') {
        setProSessionToken(data.proToken);
        return { ok: true, role: 'pro' };
      }
    }
    return {
      ok: false,
      error: data.error || 'Código inválido o vencido. Verifica que esté bien escrito.',
    };
  } catch {
    return {
      ok: false,
      error: 'No se pudo validar el código con el servidor en este momento.',
    };
  }
}

export async function fetchCustomerCodes(): Promise<{
  ok: boolean;
  codes?: string[];
  error?: string;
}> {
  if (!inMemoryAdminToken) {
    return { ok: false, error: 'Requiere sesión de administradora.' };
  }
  try {
    const res = await fetch(getApiEndpoint('/api/admin/codes'), {
      headers: { Authorization: `Bearer ${inMemoryAdminToken}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      return { ok: true, codes: Array.isArray(data.codes) ? data.codes : [] };
    }
    return { ok: false, error: data.error || 'No se pudieron cargar los códigos.' };
  } catch {
    return { ok: false, error: 'Error de conexión.' };
  }
}

export async function generateCustomerCode(): Promise<{
  ok: boolean;
  code?: string;
  codes?: string[];
  error?: string;
}> {
  if (!inMemoryAdminToken) {
    return { ok: false, error: 'Requiere sesión de administradora.' };
  }
  try {
    const res = await fetch(getApiEndpoint('/api/admin/codes'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inMemoryAdminToken}`,
      },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && typeof data.code === 'string') {
      return {
        ok: true,
        code: data.code,
        codes: Array.isArray(data.codes) ? data.codes : undefined,
      };
    }
    return { ok: false, error: data.error || 'No se pudo generar el código.' };
  } catch {
    return { ok: false, error: 'Error de conexión.' };
  }
}

export function getPaymentUrl(): string {
  try {
    const custom = localStorage.getItem(STORAGE_KEY_PAYMENT_URL);
    return custom && isValidHttpUrl(custom) ? custom.trim() : DEFAULT_PAYMENT_URL;
  } catch {
    return DEFAULT_PAYMENT_URL;
  }
}

export function setPaymentUrl(url: string): void {
  try {
    const trimmed = url.trim();
    if (trimmed && isValidHttpUrl(trimmed)) {
      localStorage.setItem(STORAGE_KEY_PAYMENT_URL, trimmed);
    } else if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY_PAYMENT_URL);
    }
  } catch (e) {
    console.warn('Failed to save payment URL:', e);
  }
}

export function getPaymentConfig(): PaymentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENT_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawPaypal = typeof parsed.paypalAccount === 'string' ? parsed.paypalAccount.trim() : '';
      const savedPaypal =
        rawPaypal && rawPaypal !== 'tarotistasonline@gmail.com'
          ? rawPaypal.startsWith('http') || /^paypal\./i.test(rawPaypal)
            ? isValidHttpUrl(rawPaypal)
              ? rawPaypal
              : ''
            : sanitizeEmail(rawPaypal, '')
          : DEFAULT_PAYMENT_CONFIG.paypalAccount;

      const rawArs = typeof parsed.arsTarget === 'string' ? parsed.arsTarget.trim() : '';
      const savedArs = rawArs
        ? rawArs.toLowerCase().includes(':') && !isValidHttpUrl(rawArs)
          ? DEFAULT_PAYMENT_CONFIG.arsTarget
          : rawArs
        : DEFAULT_PAYMENT_CONFIG.arsTarget;

      const rawContactEmail =
        typeof parsed.contactEmail === 'string' ? parsed.contactEmail.trim() : '';
      const savedContactEmail =
        rawContactEmail && rawContactEmail !== 'tarotistasonline@gmail.com'
          ? sanitizeEmail(rawContactEmail, DEFAULT_PAYMENT_CONFIG.contactEmail)
          : DEFAULT_PAYMENT_CONFIG.contactEmail;

      return {
        usdPriceLabel:
          typeof parsed.usdPriceLabel === 'string' && parsed.usdPriceLabel.trim()
            ? parsed.usdPriceLabel.trim()
            : DEFAULT_PAYMENT_CONFIG.usdPriceLabel,
        arsPriceLabel:
          typeof parsed.arsPriceLabel === 'string' && parsed.arsPriceLabel.trim()
            ? parsed.arsPriceLabel.trim()
            : DEFAULT_PAYMENT_CONFIG.arsPriceLabel,
        paypalAccount: savedPaypal,
        arsTarget: savedArs,
        whatsappOrContact:
          typeof parsed.whatsappOrContact === 'string'
            ? parsed.whatsappOrContact
            : DEFAULT_PAYMENT_CONFIG.whatsappOrContact,
        contactEmail: savedContactEmail,
      };
    }
  } catch {}
  return DEFAULT_PAYMENT_CONFIG;
}

export function savePaymentConfig(config: Partial<PaymentConfig>): PaymentConfig {
  const merged = { ...getPaymentConfig(), ...config };
  const rawArs = typeof merged.arsTarget === 'string' ? merged.arsTarget.trim() : '';
  const safeArs = rawArs
    ? rawArs.toLowerCase().includes(':') && !isValidHttpUrl(rawArs)
      ? DEFAULT_PAYMENT_CONFIG.arsTarget
      : rawArs
    : DEFAULT_PAYMENT_CONFIG.arsTarget;

  const rawPaypal = typeof merged.paypalAccount === 'string' ? merged.paypalAccount.trim() : '';
  const safePaypal = !rawPaypal
    ? ''
    : rawPaypal.toLowerCase().includes(':')
    ? isValidHttpUrl(rawPaypal)
      ? rawPaypal
      : ''
    : sanitizeEmail(rawPaypal, '');

  const sanitizedNext: PaymentConfig = {
    usdPriceLabel: merged.usdPriceLabel || DEFAULT_PAYMENT_CONFIG.usdPriceLabel,
    arsPriceLabel: merged.arsPriceLabel || DEFAULT_PAYMENT_CONFIG.arsPriceLabel,
    arsTarget: safeArs,
    paypalAccount: safePaypal,
    whatsappOrContact: merged.whatsappOrContact || '',
    contactEmail: sanitizeEmail(merged.contactEmail, DEFAULT_PAYMENT_CONFIG.contactEmail),
  };

  try {
    localStorage.setItem(STORAGE_KEY_PAYMENT_CONFIG, JSON.stringify(sanitizedNext));
  } catch (e) {
    console.warn('Failed to save payment config:', e);
  }
  return sanitizedNext;
}

/**
 * Verifies legitimate Mercado Pago return parameters (payment_id/collection_id)
 * or explicit activation codes (?code=...) strictly against the backend server.
 */
export async function verifyUrlReturnUnlock(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code')?.trim();
    const mpOperationId = (params.get('payment_id') || params.get('collection_id') || '')
      .trim()
      .replace(/\D/g, '');

    const hasLegacyCheatParams =
      params.has('unlocked') ||
      params.has('premium') ||
      params.has('pro') ||
      params.has('pago') ||
      params.has('status') ||
      params.has('creator') ||
      params.has('creador') ||
      params.has('admin');

    if (codeParam || mpOperationId || hasLegacyCheatParams) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    if (codeParam) {
      const res = await activateLicenseCode(codeParam);
      return res.ok;
    }

    if (mpOperationId && mpOperationId.length >= 6) {
      const resp = await fetch(getApiEndpoint('/api/verify-mercadopago'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: mpOperationId }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.verified && typeof data.proToken === 'string') {
        setProSessionToken(data.proToken);
        return true;
      }
    }
  } catch (e) {
    console.warn('verifyUrlReturnUnlock notice:', e);
  }
  return false;
}
