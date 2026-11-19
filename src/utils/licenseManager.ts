// License and usage quota manager for Traduce Ya

export const FREE_TRIAL_LIMIT = 15;
export const DAILY_FREE_LIMIT = FREE_TRIAL_LIMIT;

const STORAGE_KEY_PRO = 'traductor_ya_pro_v1';
const STORAGE_KEY_CREATOR = 'traductor_ya_creator_mode_v1';
const STORAGE_KEY_TRIAL_USAGE = 'traductor_ya_trial_usage_v1';
const LEGACY_STORAGE_KEY_USAGE = 'traductor_ya_daily_usage_v1';
const STORAGE_KEY_PAYMENT_URL = 'traductor_ya_custom_payment_url';
const STORAGE_KEY_PAYMENT_CONFIG = 'traductor_ya_payment_config_v1';

// Private customer unlock codes (give one to the buyer after confirming payment)
export const PRIVATE_CUSTOMER_CODES = [
  'TYPRO-8472',
  'TYVIP-5910',
  'TYPAS-3309',
  'TYARG-7124',
  'TYUSD-4481',
  'TRADUCEYA2026',
  'TRADUCEYA2027',
];

export const CREATOR_CODES = [
  'CREADOR',
  'CREADOR2026',
  'TAROTISTASONLINE',
  'TAROTISTAS',
  'ADMIN',
  'DEV',
];

// Accepted activation codes (case-insensitive)
export const VALID_ACTIVATION_CODES = [
  ...PRIVATE_CUSTOMER_CODES,
  ...CREATOR_CODES,
];

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

// Default payment link
export const DEFAULT_PAYMENT_URL = 'https://mpago.la/224fBsf';

export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isCreatorUser(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (localStorage.getItem(STORAGE_KEY_CREATOR) === 'true') {
      return true;
    }

    const params = new URLSearchParams(window.location.search);
    if (
      params.get('creator') === 'true' ||
      params.get('creador') === 'true' ||
      params.get('admin') === 'true'
    ) {
      localStorage.setItem(STORAGE_KEY_CREATOR, 'true');
      return true;
    }
  } catch {}
  return false;
}

export function setCreatorUser(status: boolean): void {
  try {
    if (status) {
      localStorage.setItem(STORAGE_KEY_CREATOR, 'true');
      localStorage.setItem(STORAGE_KEY_PRO, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEY_CREATOR);
    }
  } catch (e) {
    console.warn('Failed to save creator status:', e);
  }
}

export function isProUser(): boolean {
  if (isCreatorUser()) return true;
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

export function activateWithCode(rawCode: string): boolean {
  const clean = rawCode.trim().toUpperCase();
  if (VALID_ACTIVATION_CODES.includes(clean)) {
    if (CREATOR_CODES.includes(clean)) {
      setCreatorUser(true);
    } else {
      setProUser(true);
    }
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

export function getPaymentConfig(): PaymentConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PAYMENT_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const savedPaypal = typeof parsed.paypalAccount === 'string' && parsed.paypalAccount !== 'tarotistasonline@gmail.com'
        ? parsed.paypalAccount
        : DEFAULT_PAYMENT_CONFIG.paypalAccount;
      const savedContactEmail =
        typeof parsed.contactEmail === 'string' &&
        parsed.contactEmail.trim() &&
        parsed.contactEmail !== 'tarotistasonline@gmail.com'
          ? parsed.contactEmail
          : DEFAULT_PAYMENT_CONFIG.contactEmail;
      return {
        usdPriceLabel: parsed.usdPriceLabel || DEFAULT_PAYMENT_CONFIG.usdPriceLabel,
        arsPriceLabel: parsed.arsPriceLabel || DEFAULT_PAYMENT_CONFIG.arsPriceLabel,
        paypalAccount: savedPaypal,
        arsTarget: parsed.arsTarget || DEFAULT_PAYMENT_CONFIG.arsTarget,
        whatsappOrContact: parsed.whatsappOrContact ?? DEFAULT_PAYMENT_CONFIG.whatsappOrContact,
        contactEmail: savedContactEmail,
      };
    }
  } catch {}
  return DEFAULT_PAYMENT_CONFIG;
}

export function savePaymentConfig(config: Partial<PaymentConfig>): PaymentConfig {
  const next = { ...getPaymentConfig(), ...config };
  try {
    localStorage.setItem(STORAGE_KEY_PAYMENT_CONFIG, JSON.stringify(next));
  } catch (e) {
    console.warn('Failed to save payment config:', e);
  }
  return next;
}

/**
 * Check if the user returned from a successful payment redirection
 * e.g., ?unlocked=true, ?premium=true, ?pro=true, ?pago=exitoso, ?status=approved, ?code=TYPRO-8472
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

      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
      return true;
    }
  } catch (e) {
    console.warn('checkUrlAutoUnlock error:', e);
  }
  return false;
}
