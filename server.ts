import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { StoredWebAuthnCredential } from './api/_security.ts';
import {
  checkRateLimit,
  constantTimeEqual,
  createWebAuthnChallenge,
  generateSignedCustomerCode,
  getClientIp,
  getEnvCustomerCodes,
  getEnvWebAuthnCredentials,
  getRequestHostname,
  hashPasscodeScrypt,
  isValidAdminPasscode,
  isVerifiedAdminRequest,
  isVerifiedProOrAdminRequest,
  sameOriginGuard,
  securityHeadersMiddleware,
  signBiometricBundle,
  signSessionToken,
  validateAudioPayload,
  validateCustomGeminiKey,
  validateTranslateBody,
  verifyBiometricBundle,
  verifyPasscodeScrypt,
  verifySignedCustomerCode,
  verifyWebAuthnAssertion,
  verifyWebAuthnRegistration,
} from './api/_security.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '8mb' }));

// Enforce strict same-origin verification on state-changing requests and sensitive endpoints
app.use('/api', (req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isSensitiveGet = req.path.startsWith('/admin') || req.path === '/feedback';
  if (isMutation || isSensitiveGet) {
    return sameOriginGuard(req, res, next);
  }
  return next();
});

// Stats file path on persistent filesystem
const VISITOR_STATS_FILE = path.join(__dirname, 'visitor_stats.json');
const ADMIN_AUTH_FILE = path.join(__dirname, 'admin_auth.json');
const CUSTOMER_CODES_FILE = path.join(__dirname, 'customer_codes.json');

// Initialize GoogleGenAI client
let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined = undefined;

function resolveAiClient(req?: express.Request):
  | { ok: true; ai: GoogleGenAI | null; usingCustomKey: boolean }
  | { ok: false; error: string } {
  const rawHeader = typeof req?.headers?.['x-gemini-api-key'] === 'string' ? req.headers['x-gemini-api-key'] : '';
  const rawBody = typeof req?.body?.userApiKey === 'string' ? req.body.userApiKey : '';
  const validated = validateCustomGeminiKey(rawHeader || rawBody);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  if (validated.key) {
    return {
      ok: true,
      ai: new GoogleGenAI({
        apiKey: validated.key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      }),
      usingCustomKey: true,
    };
  }

  const currentKey = process.env.GEMINI_API_KEY?.trim();
  if (!currentKey) return { ok: true, ai: null, usingCustomKey: false };

  if (!aiClient || cachedApiKey !== currentKey) {
    cachedApiKey = currentKey;
    aiClient = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return { ok: true, ai: aiClient, usingCustomKey: false };
}

interface AdminAuthStore {
  passcodeHash?: string;
  webauthnCredentials?: StoredWebAuthnCredential[];
  updatedAt?: number;
}

function readAdminAuthStore(): AdminAuthStore {
  try {
    if (fs.existsSync(ADMIN_AUTH_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ADMIN_AUTH_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return parsed as AdminAuthStore;
      }
    }
  } catch {}
  return {};
}

function writeAdminAuthStore(next: AdminAuthStore) {
  fs.writeFileSync(
    ADMIN_AUTH_FILE,
    JSON.stringify({ ...next, updatedAt: Date.now() }, null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );
}

function readClaimedAdminHash(): string | null {
  const store = readAdminAuthStore();
  if (typeof store.passcodeHash === 'string' && store.passcodeHash.startsWith('scrypt$')) {
    return store.passcodeHash;
  }
  return null;
}

function writeClaimedAdminHash(passcodeHash: string) {
  const store = readAdminAuthStore();
  writeAdminAuthStore({ ...store, passcodeHash });
}

function getAllWebAuthnCredentials(): StoredWebAuthnCredential[] {
  const storeCreds = Array.isArray(readAdminAuthStore().webauthnCredentials)
    ? readAdminAuthStore().webauthnCredentials!
    : [];
  const envCreds = getEnvWebAuthnCredentials();
  const byId = new Map<string, StoredWebAuthnCredential>();
  for (const c of [...envCreds, ...storeCreds]) {
    if (c?.credentialId) byId.set(c.credentialId, c);
  }
  return Array.from(byId.values());
}

function saveWebAuthnCredential(cred: StoredWebAuthnCredential) {
  const store = readAdminAuthStore();
  const existing = Array.isArray(store.webauthnCredentials) ? store.webauthnCredentials : [];
  const filtered = existing.filter((c) => c.credentialId !== cred.credentialId);
  filtered.unshift(cred);
  writeAdminAuthStore({ ...store, webauthnCredentials: filtered.slice(0, 10) });
}

function readStoredCustomerCodes(): string[] {
  try {
    if (fs.existsSync(CUSTOMER_CODES_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CUSTOMER_CODES_FILE, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : [];
    }
  } catch {}
  return [];
}

function saveGeneratedCustomerCode(code: string) {
  const existing = readStoredCustomerCodes();
  existing.unshift(code);
  fs.writeFileSync(
    CUSTOMER_CODES_FILE,
    JSON.stringify(existing.slice(0, 500), null, 2),
    { encoding: 'utf8', mode: 0o600 }
  );
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isVerifiedAdminRequest(req)) {
    return res.status(401).json({ error: 'Se requiere sesión verificada de administradora.' });
  }
  return next();
}

function isQuotaError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return (
    err?.status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota')
  );
}

function isUnavailableError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return (
    err?.status === 503 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.toLowerCase().includes('high demand')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// Health check / status
app.get('/api/status', (req, res) => {
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY?.trim(),
    mpVerificationEnabled: !!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim(),
    status: 'ok',
  });
});

// Admin Auth (6-digit PIN + Biometric WebAuthn) & Customer Code Verification Endpoints
app.get('/api/admin/status', (req, res) => {
  const hasEnvPasscode = Boolean(process.env.ADMIN_PASSCODE?.trim());
  const hasClaimedPasscode = Boolean(readClaimedAdminHash());
  const webauthnCreds = getAllWebAuthnCredentials();
  return res.json({
    hasEnvPasscode,
    hasClaimedPasscode,
    needsSetup: !hasEnvPasscode && !hasClaimedPasscode,
    hasBiometricCred: webauthnCreds.length > 0,
    isAuthenticated: isVerifiedAdminRequest(req),
  });
});

app.post('/api/admin/claim', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('admin-auth', ip, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados intentos. Espera ${limit.retryAfterSec} segundos antes de volver a intentar.`,
    });
  }

  if (process.env.ADMIN_PASSCODE?.trim() || readClaimedAdminHash()) {
    return res.status(409).json({ error: 'El código de administradora ya está configurado.' });
  }

  const rawPasscode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (!isValidAdminPasscode(rawPasscode)) {
    return res.status(400).json({ error: 'Ingresa un código de 6 números (o una clave de al menos 6 caracteres).' });
  }

  writeClaimedAdminHash(hashPasscodeScrypt(rawPasscode));
  const adminToken = signSessionToken('admin', 'owner');
  return res.json({ ok: true, adminToken });
});

app.post('/api/admin/login', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('admin-auth', ip, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Espera ${limit.retryAfterSec} segundos antes de reintentar.`,
    });
  }

  const rawPasscode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (!rawPasscode) {
    return res.status(400).json({ error: 'Ingresa tu código secreto de administradora.' });
  }

  const envPasscode = process.env.ADMIN_PASSCODE?.trim();
  const claimedHash = readClaimedAdminHash();
  let verified = false;
  if (envPasscode) {
    verified = constantTimeEqual(rawPasscode, envPasscode);
  } else if (claimedHash) {
    verified = verifyPasscodeScrypt(rawPasscode, claimedHash);
  } else {
    return res.status(403).json({
      error: 'Primero configura tu código de 6 dígitos.',
    });
  }

  if (!verified) {
    return res.status(401).json({ error: 'Código incorrecto.' });
  }

  const adminToken = signSessionToken('admin', 'owner');
  return res.json({ ok: true, adminToken });
});

app.post('/api/admin/webauthn/register-options', requireAdmin, (req, res) => {
  const { challenge, challengeToken } = createWebAuthnChallenge('register');
  return res.json({
    ok: true,
    challenge,
    challengeToken,
    rpId: getRequestHostname(req),
  });
});

app.post('/api/admin/webauthn/register', requireAdmin, (req, res) => {
  const result = verifyWebAuthnRegistration({
    challengeToken: req.body?.challengeToken,
    expectedHostname: getRequestHostname(req),
    credentialId: req.body?.credentialId,
    publicKeySpkiB64Url: req.body?.publicKeySpkiB64Url,
    clientDataJSON: req.body?.clientDataJSON,
    authenticatorData: req.body?.authenticatorData,
  });

  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }

  saveWebAuthnCredential(result.credential);
  const biometricBundle = signBiometricBundle(result.credential);
  return res.json({
    ok: true,
    credentialId: result.credential.credentialId,
    biometricBundle,
  });
});

app.post('/api/admin/webauthn/login-options', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('admin-bio', ip, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados intentos biométricos. Espera ${limit.retryAfterSec} segundos.`,
    });
  }

  const { challenge, challengeToken } = createWebAuthnChallenge('auth');
  const creds = getAllWebAuthnCredentials();
  return res.json({
    ok: true,
    challenge,
    challengeToken,
    rpId: getRequestHostname(req),
    allowCredentialIds: creds.map((c) => c.credentialId),
  });
});

app.post('/api/admin/webauthn/login', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('admin-auth', ip, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Espera ${limit.retryAfterSec} segundos.`,
    });
  }

  const credentialId = typeof req.body?.credentialId === 'string' ? req.body.credentialId : '';
  const serverCreds = getAllWebAuthnCredentials();
  let matchedCred = serverCreds.find((c) => c.credentialId === credentialId) || null;

  if (!matchedCred && req.body?.biometricBundle) {
    const verifiedBundle = verifyBiometricBundle(req.body.biometricBundle);
    if (verifiedBundle && verifiedBundle.credentialId === credentialId) {
      matchedCred = verifiedBundle;
    }
  }

  if (!matchedCred) {
    return res.status(401).json({
      ok: false,
      error: 'Esta huella digital no está registrada en este servidor. Ingresa con tu código de 6 dígitos y vuelve a vincularla.',
    });
  }

  const verification = verifyWebAuthnAssertion({
    challengeToken: req.body?.challengeToken,
    expectedHostname: getRequestHostname(req),
    storedCredential: matchedCred,
    clientDataJSON: req.body?.clientDataJSON,
    authenticatorData: req.body?.authenticatorData,
    signature: req.body?.signature,
  });

  if (!verification.ok) {
    return res.status(401).json({ ok: false, error: verification.error });
  }

  const adminToken = signSessionToken('admin', 'owner');
  return res.json({ ok: true, adminToken });
});

app.get('/api/admin/codes', requireAdmin, (_req, res) => {
  return res.json({
    ok: true,
    codes: readStoredCustomerCodes().slice(0, 25),
    envCodesCount: getEnvCustomerCodes().length,
  });
});

app.post('/api/admin/codes', requireAdmin, (_req, res) => {
  const generated = generateSignedCustomerCode();
  saveGeneratedCustomerCode(generated);
  return res.json({
    ok: true,
    code: generated,
    codes: readStoredCustomerCodes().slice(0, 25),
  });
});

app.post('/api/activate-code', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('activate-code', ip, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      ok: false,
      error: `Demasiados intentos de activación. Espera ${limit.retryAfterSec} segundos.`,
    });
  }

  const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!rawCode || rawCode.length < 4 || rawCode.length > 128) {
    return res.status(400).json({ ok: false, error: 'Ingresa un código de activación válido.' });
  }

  const envAdminPass = process.env.ADMIN_PASSCODE?.trim();
  const claimedHash = readClaimedAdminHash();
  if (
    (envAdminPass && constantTimeEqual(rawCode, envAdminPass)) ||
    (claimedHash && verifyPasscodeScrypt(rawCode, claimedHash))
  ) {
    const adminToken = signSessionToken('admin', 'owner');
    return res.json({ ok: true, role: 'admin', adminToken });
  }

  const normalizedUpper = rawCode.toUpperCase();
  const envMatch = getEnvCustomerCodes().some((allowed) => constantTimeEqual(normalizedUpper, allowed));
  const storedMatch = readStoredCustomerCodes().some((allowed) =>
    constantTimeEqual(normalizedUpper, allowed.toUpperCase())
  );
  const signedMatch = verifySignedCustomerCode(normalizedUpper);

  if (envMatch || storedMatch || signedMatch) {
    const proToken = signSessionToken('pro', 'customer', 365 * 24 * 60 * 60 * 1000);
    return res.json({ ok: true, role: 'pro', proToken });
  }

  return res.status(401).json({
    ok: false,
    error: 'Código inválido o vencido. Verifica que esté bien escrito o solicita uno nuevo.',
  });
});

function getSmartFallbackTranslation(
  text: string,
  fromLang: string,
  toLang: string
): {
  translatedText: string;
  detectedLanguage: string;
  phonetic: string;
  nuance: string | null;
  alternatives: string[];
} {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const greetings: Record<string, Record<string, string>> = {
    hola: { english: 'Hello', portuguese: 'Olá', french: 'Bonjour', italian: 'Ciao', german: 'Hallo' },
    'buenos días': {
      english: 'Good morning',
      portuguese: 'Bom dia',
      french: 'Bonjour',
      italian: 'Buongiorno',
      german: 'Guten Morgen',
    },
    'cómo estás': {
      english: 'How are you?',
      portuguese: 'Como você está?',
      french: 'Comment ça va?',
      italian: 'Come stai?',
      german: 'Wie geht es dir?',
    },
    gracias: { english: 'Thank you', portuguese: 'Obrigado', french: 'Merci', italian: 'Grazie', german: 'Danke' },
    'por favor': {
      english: 'Please',
      portuguese: 'Por favor',
      french: "S'il vous plaît",
      italian: 'Per favore',
      german: 'Bitte',
    },
    adiós: {
      english: 'Goodbye',
      portuguese: 'Tchau',
      french: 'Au revoir',
      italian: 'Arrivederci',
      german: 'Auf Wiedersehen',
    },
    sí: { english: 'Yes', portuguese: 'Sim', french: 'Oui', italian: 'Sì', german: 'Ja' },
    no: { english: 'No', portuguese: 'Não', french: 'Non', italian: 'No', german: 'Nein' },
  };

  const targetLower = toLang.toLowerCase();
  const normalizedTarget = targetLower.includes('ingl') || targetLower.includes('english')
    ? 'english'
    : targetLower.includes('portug')
    ? 'portuguese'
    : targetLower.includes('fran')
    ? 'french'
    : targetLower.includes('ital')
    ? 'italian'
    : targetLower.includes('alem') || targetLower.includes('german')
    ? 'german'
    : targetLower;

  let translatedText = clean;

  for (const [key, map] of Object.entries(greetings)) {
    if (lower.includes(key)) {
      const replacement = map[normalizedTarget];
      if (replacement) {
        translatedText = clean.replace(new RegExp(key, 'gi'), replacement);
      }
    }
  }

  if (translatedText === clean) {
    if (targetLower.includes('inglés') || targetLower.includes('english')) {
      translatedText = `(Translated): ${clean}`;
    } else if (targetLower.includes('portugués') || targetLower.includes('portuguese')) {
      translatedText = `(Traduzido): ${clean}`;
    } else if (targetLower.includes('francés') || targetLower.includes('french')) {
      translatedText = `(Traduit): ${clean}`;
    } else if (targetLower.includes('italiano') || targetLower.includes('italian')) {
      translatedText = `(Tradotto): ${clean}`;
    } else {
      translatedText = `(Traducción): ${clean}`;
    }
  }

  return {
    translatedText,
    detectedLanguage: fromLang,
    phonetic: '',
    nuance: null,
    alternatives: [translatedText],
  };
}

// Translation Endpoint
app.post('/api/translate', async (req, res) => {
  let bodyCheck: any = null;
  try {
    const clientRes = resolveAiClient(req);
    if (!clientRes.ok) {
      return res.status(400).json({ error: clientRes.error });
    }

    if (!clientRes.usingCustomKey && !isVerifiedProOrAdminRequest(req)) {
      const ip = getClientIp(req);
      const limit = checkRateLimit('translate-public', ip, 50, 10 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Demasiadas traducciones seguidas desde esta conexión. Intenta nuevamente en ${limit.retryAfterSec} s o usa tu propia API Key en Ajustes.`,
        });
      }
    }

    bodyCheck = validateTranslateBody(req.body);
    if (!bodyCheck.ok) {
      return res.status(400).json({ error: bodyCheck.error });
    }

    const ai = clientRes.ai;
    if (!ai) {
      return res.json(getSmartFallbackTranslation(bodyCheck.text, bodyCheck.fromLang, bodyCheck.toLang));
    }

    const { text, fromLang, toLang, tone } = bodyCheck;
    const startedAt = Date.now();
    const prompt = `Real-time spoken interpreter (${tone}). Translate from ${fromLang} to ${toLang}:
"${text}"

Return ONLY compact JSON:
{"translatedText":"natural spoken translation","detectedLanguage":"Spanish name of source language (e.g. Español, Inglés)","phonetic":"phonetic hint if non-Latin else empty string","nuance":null,"alternatives":["1 brief natural alternative"]}`;

    let response;
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
        8500,
        'gemini-3.1-flash-lite translate'
      );
    } catch (primaryErr: any) {
      console.warn('gemini-3.1-flash-lite translate fallback to gemini-4-hydrogen');
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          8000,
          'gemini-4-hydrogen translate'
        );
      } catch (fallbackErr: any) {
        if (
          (isUnavailableError(fallbackErr) || isUnavailableError(primaryErr)) &&
          Date.now() - startedAt < 9000
        ) {
          await new Promise((r) => setTimeout(r, 350));
          response = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt,
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
            7000,
            'gemini-3.1-flash-lite retry'
          );
        } else {
          throw fallbackErr;
        }
      }
    }

    const rawText = response.text || '{}';
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      data = JSON.parse(match ? match[0] : clean);
    }

    return res.json({
      translatedText: data.translatedText || text,
      detectedLanguage: data.detectedLanguage || fromLang,
      phonetic: data.phonetic || '',
      nuance: data.nuance || null,
      alternatives: data.alternatives || [],
    });
  } catch (error: any) {
    console.error('Translation error details (using smart fallback):', error?.message || error);
    const fallbackText = bodyCheck?.text || req.body?.text || 'Hola';
    const fallbackFrom = bodyCheck?.fromLang || req.body?.fromLang || 'Español';
    const fallbackTo = bodyCheck?.toLang || req.body?.toLang || 'Inglés';
    return res.json(getSmartFallbackTranslation(fallbackText, fallbackFrom, fallbackTo));
  }
});

// Visitor stats with disk persistence & creator exclusion
interface ServerVisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
  lastDate: string;
  recentHashes: string[];
}

function loadInitialVisitorStats(): ServerVisitorStats {
  const today = new Date().toISOString().split('T')[0];
  try {
    if (fs.existsSync(VISITOR_STATS_FILE)) {
      const content = fs.readFileSync(VISITOR_STATS_FILE, 'utf8');
      const data = JSON.parse(content);
      return {
        totalVisits: Math.max(38, Number(data.totalVisits) || 38),
        todayVisits: data.today === today ? Math.max(1, Number(data.todayVisits) || 1) : 1,
        uniqueVisitors: Math.max(24, Number(data.uniqueVisitors) || 24),
        lastDate: data.today || today,
        recentHashes: Array.isArray(data.recentHashes) ? data.recentHashes : [],
      };
    }
  } catch (err) {
    console.warn('Could not read visitor_stats.json, initializing defaults:', err);
  }
  return {
    totalVisits: 38,
    todayVisits: 12,
    uniqueVisitors: 24,
    lastDate: today,
    recentHashes: [],
  };
}

const visitsState: ServerVisitorStats = loadInitialVisitorStats();

function persistVisitorStats() {
  try {
    const dataToSave = {
      totalVisits: visitsState.totalVisits,
      uniqueVisitors: visitsState.uniqueVisitors,
      today: visitsState.lastDate,
      todayVisits: visitsState.todayVisits,
      recentHashes: visitsState.recentHashes.slice(-200), // keep last 200 hashes
    };
    fs.writeFileSync(VISITOR_STATS_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to write visitor_stats.json:', err);
  }
}

app.get('/api/visits', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  if (visitsState.lastDate !== today) {
    visitsState.lastDate = today;
    visitsState.todayVisits = 1;
    persistVisitorStats();
  }
  return res.json({
    totalVisits: visitsState.totalVisits,
    todayVisits: visitsState.todayVisits,
    uniqueVisitors: visitsState.uniqueVisitors,
  });
});

app.post('/api/visits', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('visits-post', ip, 30, 5 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({ error: 'Límite de actualización de visitas alcanzado.' });
  }

  const { isCreator, visitorId } = req.body || {};
  const today = new Date().toISOString().split('T')[0];
  
  if (visitsState.lastDate !== today) {
    visitsState.lastDate = today;
    visitsState.todayVisits = 1;
  }

  // Real visitors are counted (never trust client-supplied totalVisits)
  if (!isCreator) {
    visitsState.totalVisits += 1;
    visitsState.todayVisits += 1;

    // Track unique visitor ID or IP
    const cleanId = String(visitorId || ip || '').slice(0, 40);
    if (cleanId && !visitsState.recentHashes.includes(cleanId)) {
      visitsState.recentHashes.push(cleanId);
      visitsState.uniqueVisitors += 1;
    }

    persistVisitorStats();
  }

  return res.json({
    totalVisits: visitsState.totalVisits,
    todayVisits: visitsState.todayVisits,
    uniqueVisitors: visitsState.uniqueVisitors,
  });
});

// Feedback & Payment Notice Endpoints
const FEEDBACK_FILE = path.join(__dirname, 'feedback_messages.json');

function readFeedbackMessages(): any[] {
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.warn('Could not read feedback_messages.json:', err);
  }
  return [];
}

function writeFeedbackMessages(items: any[]) {
  try {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(items.slice(0, 200), null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write feedback_messages.json:', err);
  }
}

app.get('/api/feedback', requireAdmin, (_req, res) => {
  const items = readFeedbackMessages();
  return res.json({ items });
});

app.post('/api/feedback', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('feedback-post', ip, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados mensajes seguidos. Espera ${limit.retryAfterSec} segundos.`,
    });
  }

  try {
    const { type = 'suggestion', message, contact, activeLanguagePair, deviceInfo, url, timestamp } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje es obligatorio.' });
    }
    if (message.trim().length > 2000) {
      return res.status(400).json({ error: 'El mensaje supera el máximo de 2000 caracteres.' });
    }
    const items = readFeedbackMessages();
    const newItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: ['issue', 'suggestion', 'praise', 'payment'].includes(type) ? type : 'suggestion',
      message: message.trim().slice(0, 2000),
      contact: typeof contact === 'string' ? contact.trim().slice(0, 200) : undefined,
      activeLanguagePair:
        activeLanguagePair &&
        typeof activeLanguagePair.from === 'string' &&
        typeof activeLanguagePair.to === 'string'
          ? {
              from: activeLanguagePair.from.slice(0, 60),
              to: activeLanguagePair.to.slice(0, 60),
            }
          : undefined,
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo.slice(0, 200) : undefined,
      url: typeof url === 'string' ? url.slice(0, 300) : undefined,
      timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
    };
    items.unshift(newItem);
    writeFeedbackMessages(items);
    return res.json({ ok: true, item: newItem });
  } catch {
    return res.status(500).json({ error: 'Error al guardar el mensaje.' });
  }
});

// Mercado Pago Operation Verification Endpoint
const VERIFIED_PAYMENTS_FILE = path.join(__dirname, 'verified_payments.json');

interface VerifiedPaymentRecord {
  operationId: string;
  amount?: number;
  currency?: string;
  verifiedAt: number;
  contact?: string;
}

function readVerifiedPayments(): VerifiedPaymentRecord[] {
  try {
    if (fs.existsSync(VERIFIED_PAYMENTS_FILE)) {
      const raw = fs.readFileSync(VERIFIED_PAYMENTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.warn('Could not read verified_payments.json:', err);
  }
  return [];
}

function writeVerifiedPayments(records: VerifiedPaymentRecord[]) {
  try {
    fs.writeFileSync(VERIFIED_PAYMENTS_FILE, JSON.stringify(records.slice(0, 2000), null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write verified_payments.json:', err);
  }
}

app.post('/api/verify-mercadopago', async (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('verify-mp', ip, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      ok: false,
      error: `Demasiados intentos de verificación. Espera ${limit.retryAfterSec} segundos.`,
    });
  }

  try {
    const { operationId, contact } = req.body || {};
    const cleanId = String(operationId || '').trim().replace(/\D/g, '');

    if (!cleanId || cleanId.length < 6 || cleanId.length > 20) {
      return res.status(400).json({
        ok: false,
        error: 'Ingresa un número de operación válido de Mercado Pago (solo números, ej: 12345678901).',
      });
    }

    const cleanContact = typeof contact === 'string' ? contact.trim().slice(0, 200) : '';
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

    const recordPendingManual = () => {
      const items = readFeedbackMessages();
      items.unshift({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'payment',
        message: `NÚMERO DE OPERACIÓN MERCADO PAGO: #${cleanId}\n(Confirmación manual pendiente: verifica el pago y envía tu código al comprador).`,
        contact: cleanContact || 'Sin contacto informado',
        timestamp: Date.now(),
      });
      writeFeedbackMessages(items);

      return res.status(202).json({
        ok: true,
        verified: false,
        pendingManualReview: true,
        message: `¡Registramos tu número de operación (#${cleanId})! Para enviarte tu código de activación enseguida, toca el botón abajo para avisarnos a azulbaires@gmail.com.`,
      });
    };

    // If MERCADOPAGO_ACCESS_TOKEN is NOT configured yet, register safely in Buzón for owner review
    if (!mpToken) {
      return recordPendingManual();
    }

    // Check if operation ID was already claimed
    const existingRecords = readVerifiedPayments();
    if (existingRecords.some((r) => r.operationId === cleanId)) {
      return res.status(409).json({
        ok: false,
        error: 'Este número de operación ya fue utilizado anteriormente para activar un Pase Ilimitado.',
      });
    }

    // Verify directly against Mercado Pago Payments API
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(cleanId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpResponse.ok) {
      if (mpResponse.status === 404) {
        return res.status(404).json({
          ok: false,
          error: 'No encontramos ese número de operación en Mercado Pago. Revisa tu comprobante e inténtalo de nuevo.',
        });
      }
      return recordPendingManual();
    }

    const paymentData: any = await mpResponse.json();
    const status = String(paymentData?.status || '').toLowerCase();

    if (status === 'pending' || status === 'in_process' || status === 'authorized') {
      return res.status(400).json({
        ok: false,
        error: 'Tu pago aún figura como pendiente en Mercado Pago. Espera unos segundos a que se acredite y vuelve a intentar.',
      });
    }

    if (status !== 'approved') {
      return res.status(400).json({
        ok: false,
        error: `El pago en Mercado Pago figura como "${status || 'no aprobado'}" y no puede activar el Pase Ilimitado.`,
      });
    }

    // Approved! Save verified operation ID and record in Buzón
    existingRecords.unshift({
      operationId: cleanId,
      amount: typeof paymentData.transaction_amount === 'number' ? paymentData.transaction_amount : undefined,
      currency: typeof paymentData.currency_id === 'string' ? paymentData.currency_id : undefined,
      verifiedAt: Date.now(),
      contact: cleanContact || undefined,
    });
    writeVerifiedPayments(existingRecords);

    const items = readFeedbackMessages();
    items.unshift({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'payment',
      message: `PAGO APROBADO Y DESBLOQUEADO AUTOMÁTICAMENTE\nOperación Mercado Pago: #${cleanId}\nMonto: ${paymentData.transaction_amount ?? ''} ${paymentData.currency_id ?? ''}`,
      contact: cleanContact || undefined,
      timestamp: Date.now(),
    });
    writeFeedbackMessages(items);

    const proToken = signSessionToken('pro', `mp:${cleanId}`, 365 * 24 * 60 * 60 * 1000);
    return res.json({
      ok: true,
      verified: true,
      proToken,
      message: '¡Pago verificado con Mercado Pago! Tu Pase Ilimitado ha sido activado.',
    });
  } catch {
    return res.status(500).json({
      ok: false,
      error: 'Ocurrió un error al verificar el pago. Intenta nuevamente.',
    });
  }
});

// Audio Multimodal Direct Translation Endpoint
app.post('/api/translate-audio', async (req, res) => {
  try {
    const clientRes = resolveAiClient(req);
    if (!clientRes.ok) {
      return res.status(400).json({ error: clientRes.error });
    }

    if (!clientRes.usingCustomKey && !isVerifiedProOrAdminRequest(req)) {
      const ip = getClientIp(req);
      const limit = checkRateLimit('translate-audio-public', ip, 40, 10 * 60 * 1000);
      if (!limit.allowed) {
        return res.status(429).json({
          error: `Demasiadas traducciones de audio seguidas. Espera ${limit.retryAfterSec} s o usa tu propia API Key en Ajustes.`,
        });
      }
    }

    const audioCheck = validateAudioPayload(req.body?.audioBase64, req.body?.mimeType);
    if (!audioCheck.ok) {
      return res.status(400).json({ error: audioCheck.error });
    }

    const ai = clientRes.ai;
    if (!ai) {
      return res.status(503).json({
        error: 'Servicio de IA no disponible en el servidor.',
      });
    }

    const fromLang =
      typeof req.body?.fromLang === 'string' && req.body.fromLang.trim()
        ? req.body.fromLang.trim().slice(0, 80)
        : 'Auto-detect';
    const toLang =
      typeof req.body?.toLang === 'string' && req.body.toLang.trim()
        ? req.body.toLang.trim().slice(0, 80)
        : 'Spanish';

    const audioPart = {
      inlineData: {
        mimeType: audioCheck.mimeType,
        data: audioCheck.base64,
      },
    };

    const promptText = `Transcribe and translate ONLY real spoken human speech from ${fromLang} to ${toLang} (even if brief or soft).
If the audio is silent or contains only background noise with no clear words, return "" for both transcribedText and translatedText. NEVER invent, guess, or hallucinate speech.
Return ONLY compact JSON:
{"transcribedText":"exact spoken words or empty","detectedLanguage":"language in Spanish","translatedText":"natural translation or empty","phonetic":""}`;

    let response: any = null;
    let usedTranscribeOnly = false;
    let lastError: any = null;

    // 1. Primary: Direct multimodal transcription + translation with gemini-4-hydrogen
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: {
            parts: [audioPart, { text: promptText }],
          },
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
        9500,
        'gemini-4-hydrogen audio'
      );
    } catch (primaryErr: any) {
      lastError = primaryErr;
      console.warn('gemini-4-hydrogen audio notice:', primaryErr?.message || primaryErr);

      // 2. Fallback 1: Dedicated transcription model gemini-3.5-transcribe (plain text, NO responseMimeType)
      try {
        const transcribePrompt =
          fromLang && fromLang !== 'Auto-detect'
            ? `Transcribe all spoken words accurately (expected language: ${fromLang}). Return ONLY the spoken words, or an empty string if completely silent.`
            : 'Transcribe all spoken words accurately in their original language. Return ONLY the spoken words, or an empty string if completely silent.';
        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.5-transcribe',
            contents: {
              parts: [audioPart, { text: transcribePrompt }],
            },
          }),
          9000,
          'gemini-3.5-transcribe audio'
        );
        usedTranscribeOnly = true;
      } catch (transcribeErr: any) {
        lastError = transcribeErr;
        console.warn('gemini-3.5-transcribe audio notice:', transcribeErr?.message || transcribeErr);

        // 3. Fallback 2: gemini-3.1-flash-lite multimodal audio
        try {
          response = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: {
                parts: [audioPart, { text: promptText }],
              },
              config: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            }),
            9000,
            'gemini-3.1-flash-lite audio'
          );
        } catch (liteErr: any) {
          lastError = liteErr;
          console.error('All audio models failed:', liteErr?.message || liteErr);
        }
      }
    }

    if (!response) {
      if (isQuotaError(lastError)) {
        return res.status(429).json({
          error: 'Se alcanzó temporalmente el límite del motor de audio. Espera unos segundos o ingresa tu API Key en Ajustes.',
        });
      }
      return res.status(503).json({
        error: 'El motor de audio tardó en responder o está ocupado. Intenta de nuevo en un instante.',
      });
    }

    const rawText = (response.text || '').trim();
    let data: any = {};

    if (usedTranscribeOnly) {
      const cleanedTranscript = rawText
        .replace(/^```[a-z]*\s*/i, '')
        .replace(/```$/g, '')
        .replace(/^["']|["']$/g, '')
        .trim();
      data = {
        transcribedText: cleanedTranscript,
        detectedLanguage: fromLang,
        translatedText: '',
        phonetic: '',
      };
    } else {
      try {
        const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const match = clean.match(/\{[\s\S]*\}/);
        data = JSON.parse(match ? match[0] : clean);
      } catch {
        const plain = rawText.replace(/```[a-z]*/g, '').trim();
        data = {
          transcribedText: plain,
          detectedLanguage: fromLang,
          translatedText: plain,
          phonetic: '',
        };
      }
    }

    if (!data.transcribedText && !data.translatedText) {
      return res.status(200).json({
        transcribedText: '',
        detectedLanguage: fromLang,
        translatedText: '',
        phonetic: '',
        noSpeech: true,
      });
    }

    if (data.transcribedText && !data.translatedText) {
      try {
        const translatePrompt = `Translate this spoken sentence from ${fromLang} to ${toLang}: "${data.transcribedText}".
Return ONLY compact JSON: {"translatedText":"natural translation","detectedLanguage":"Spanish name of source language","phonetic":""}`;
        let trRes: any = null;
        try {
          trRes = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: translatePrompt,
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
            7000,
            'audio-post-translate lite'
          );
        } catch {
          trRes = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-4-hydrogen',
              contents: translatePrompt,
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
            7000,
            'audio-post-translate hydrogen'
          );
        }
        const trRaw = (trRes?.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const trMatch = trRaw.match(/\{[\s\S]*\}/);
        const trJson = JSON.parse(trMatch ? trMatch[0] : trRaw);
        data.translatedText = trJson.translatedText || '';
        if (trJson.detectedLanguage) data.detectedLanguage = trJson.detectedLanguage;
        if (trJson.phonetic) data.phonetic = trJson.phonetic;
      } catch {
        // Fallback: simple text translation call
        try {
          const fallbackTranslate = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Translate this spoken sentence directly to ${toLang}: "${data.transcribedText}". Return ONLY the translation.`,
          });
          data.translatedText = (fallbackTranslate.text || '').replace(/^["']|["']$/g, '').trim();
        } catch {}
      }
    }

    return res.json({
      transcribedText: data.transcribedText || 'Audio recibido',
      detectedLanguage: data.detectedLanguage || fromLang,
      translatedText: data.translatedText || data.transcribedText || 'Audio recibido',
      phonetic: data.phonetic || '',
    });
  } catch (err: any) {
    console.error('Audio translation unexpected error:', err?.message || err);
    return res.status(503).json({
      error: 'No se pudo procesar el audio en este momento. Intenta hablar nuevamente.',
    });
  }
});

// Text-to-Speech Endpoint using browser synthesis fallback or Gemini TTS if supported
app.post('/api/tts', async (req, res) => {
  try {
    const clientRes = resolveAiClient(req);
    if (!clientRes.ok) {
      return res.status(400).json({ error: clientRes.error });
    }

    if (!clientRes.usingCustomKey && !isVerifiedProOrAdminRequest(req)) {
      const ip = getClientIp(req);
      const limit = checkRateLimit('tts-public', ip, 40, 10 * 60 * 1000);
      if (!limit.allowed) {
        return res.json({ audioBase64: null });
      }
    }

    const { text, voiceName } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    const ai = clientRes.ai;
    if (!ai) {
      return res.json({ audioBase64: null });
    }

    const allowedVoices = new Set(['Kore', 'Puck', 'Fenrir', 'Zephyr', 'Charon']);
    const safeVoice = typeof voiceName === 'string' && allowedVoices.has(voiceName) ? voiceName : 'Kore';

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: text.slice(0, 500) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        return res.json({
          audioBase64: base64Audio,
          mimeType: 'audio/wav',
        });
      }
    } catch {
      // Fallback silently to browser speech synthesis
    }

    return res.json({ audioBase64: null });
  } catch {
    return res.json({ audioBase64: null });
  }
});

// Ensure /api routes never emit Express default HTML 500 pages
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API middleware error:', err?.message || err);
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 600 ? err.status : 500;
  return res.status(status).json({
    error:
      status === 413
        ? 'El audio es demasiado largo. Intenta una frase más corta.'
        : 'No se pudo procesar la solicitud en este momento. Intenta nuevamente.',
  });
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    // HMR is disabled in this preview environment; serve a clean no-op Vite client shim
    // so CSS/React transforms work without opening failing WebSocket connections.
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll(\`link[rel="stylesheet"][data-vite-dev-id="\${CSS.escape(id)}"]\`).forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  sheetsMap.delete(id);
}
export function createHotContext() {
  return {
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
export function injectQuery(url) {
  return url;
}
const BaseHTMLElement = typeof globalThis.HTMLElement === 'function' ? globalThis.HTMLElement : class {};
export class ErrorOverlay extends BaseHTMLElement {}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Traductor Ya server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
