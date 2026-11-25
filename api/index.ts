import express from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
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
  sanitizeFallbackApiPath,
  securityHeadersMiddleware,
  signBiometricBundle,
  signSessionToken,
  StoredWebAuthnCredential,
  validateAudioPayload,
  validateCustomGeminiKey,
  validateTranslateBody,
  verifyBiometricBundle,
  verifyPasscodeScrypt,
  verifySignedCustomerCode,
  verifyWebAuthnAssertion,
  verifyWebAuthnRegistration,
} from './_security';

const FALLBACK_API_ORIGIN = 'https://traductor-ya-traductor-de-voz-y-conversaci-n.ai.studio';

const app = express();
app.disable('x-powered-by');
app.use(securityHeadersMiddleware);
app.use(express.json({ limit: '8mb' }));

// Normalize Vercel rewrite query param (?__path=translate -> /api/translate) safely
app.use((req, res, next) => {
  const rawPath = req.query?.__path;
  if (typeof rawPath === 'string' && rawPath.length > 0) {
    const candidate = rawPath.startsWith('/') ? `/api${rawPath}` : `/api/${rawPath}`;
    const safe = sanitizeFallbackApiPath(candidate);
    if (!safe) {
      return res.status(400).json({ error: 'Ruta de API inválida.' });
    }
    req.url = safe;
  } else if (Array.isArray(rawPath) && rawPath.length > 0) {
    const candidate = `/api/${rawPath.join('/')}`;
    const safe = sanitizeFallbackApiPath(candidate);
    if (!safe) {
      return res.status(400).json({ error: 'Ruta de API inválida.' });
    }
    req.url = safe;
  } else if (req.url === '/api/index' || req.url.startsWith('/api/index?')) {
    req.url = '/api/status';
  }
  next();
});

// Enforce strict same-origin check on state-changing requests and sensitive endpoints
app.use('/api', (req, res, next) => {
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const isSensitiveGet = req.path.startsWith('/admin') || req.path === '/feedback';
  if (isMutation || isSensitiveGet) {
    return sameOriginGuard(req, res, next);
  }
  return next();
});

let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined = undefined;
let claimedAdminHash: string | null = null;
const memoryWebAuthnCreds: StoredWebAuthnCredential[] = [];

function getServerlessWebAuthnCreds(): StoredWebAuthnCredential[] {
  const byId = new Map<string, StoredWebAuthnCredential>();
  for (const c of [...getEnvWebAuthnCredentials(), ...memoryWebAuthnCreds]) {
    if (c?.credentialId) byId.set(c.credentialId, c);
  }
  return Array.from(byId.values());
}

function resolveAiClient(req: express.Request):
  | { ok: true; ai: GoogleGenAI | null; usingCustomKey: boolean }
  | { ok: false; error: string } {
  const rawHeader = typeof req.headers?.['x-gemini-api-key'] === 'string' ? req.headers['x-gemini-api-key'] : '';
  const rawBody = typeof req.body?.userApiKey === 'string' ? req.body.userApiKey : '';
  const providedKey = rawHeader || rawBody;

  const validated = validateCustomGeminiKey(providedKey);
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  if (validated.key) {
    return {
      ok: true,
      ai: new GoogleGenAI({ apiKey: validated.key }),
      usingCustomKey: true,
    };
  }

  const currentKey = process.env.GEMINI_API_KEY?.trim();
  if (!currentKey) {
    return { ok: true, ai: null, usingCustomKey: false };
  }

  if (!aiClient || cachedApiKey !== currentKey) {
    cachedApiKey = currentKey;
    aiClient = new GoogleGenAI({ apiKey: currentKey });
  }
  return { ok: true, ai: aiClient, usingCustomKey: false };
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

async function proxyToFallbackOrigin(req: express.Request, res: express.Response) {
  try {
    const rawPath = req.url.startsWith('/api') ? req.url : `/api${req.url}`;
    const safePath = sanitizeFallbackApiPath(rawPath);
    if (!safePath) {
      return res.status(400).json({ error: 'Ruta solicitada inválida.' });
    }
    if (safePath.startsWith('/api/admin') || safePath === '/api/activate-code') {
      return res.status(404).json({ error: 'Ruta no disponible.' });
    }

    const targetUrl = `${FALLBACK_API_ORIGIN}${safePath}`;
    const isGetOrHead = req.method === 'GET' || req.method === 'HEAD';
    const bodyPayload =
      !isGetOrHead && safePath === '/api/visits'
        ? {
            isCreator: Boolean(req.body?.isCreator),
            visitorId: typeof req.body?.visitorId === 'string' ? req.body.visitorId.slice(0, 40) : '',
          }
        : req.body ?? {};

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: isGetOrHead ? undefined : JSON.stringify(bodyPayload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch {
    return res.status(502).json({
      error: 'No se pudo conectar con el servidor de traducción.',
    });
  }
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!isVerifiedAdminRequest(req)) {
    return res.status(401).json({ error: 'Se requiere sesión verificada de administradora.' });
  }
  return next();
}

app.get('/api/status', (_req, res) => {
  return res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY?.trim(),
    mpVerificationEnabled: !!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim(),
    runtime: 'vercel',
    version: 5,
    status: 'ok',
  });
});

// Admin authentication (6-digit PIN + Biometric WebAuthn) & setup status
app.get('/api/admin/status', (req, res) => {
  const hasEnvPasscode = Boolean(process.env.ADMIN_PASSCODE?.trim());
  const hasClaimedPasscode = Boolean(claimedAdminHash);
  return res.json({
    hasEnvPasscode,
    hasClaimedPasscode,
    needsSetup: !hasEnvPasscode && !hasClaimedPasscode,
    hasBiometricCred: getServerlessWebAuthnCreds().length > 0,
    isAuthenticated: isVerifiedAdminRequest(req),
  });
});

// First-run admin code claim (only active when ADMIN_PASSCODE env var is unset and unclaimed)
app.post('/api/admin/claim', (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('admin-auth', ip, 5, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      error: `Demasiados intentos. Espera ${limit.retryAfterSec} segundos antes de volver a intentar.`,
    });
  }

  if (process.env.ADMIN_PASSCODE?.trim() || claimedAdminHash) {
    return res.status(409).json({ error: 'El código de administradora ya está configurado.' });
  }

  const rawPasscode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (!isValidAdminPasscode(rawPasscode)) {
    return res.status(400).json({ error: 'Ingresa un código de 6 números (o una clave de al menos 6 caracteres).' });
  }

  claimedAdminHash = hashPasscodeScrypt(rawPasscode);
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
  let verified = false;
  if (envPasscode) {
    verified = constantTimeEqual(rawPasscode, envPasscode);
  } else if (claimedAdminHash) {
    verified = verifyPasscodeScrypt(rawPasscode, claimedHashSafe(claimedAdminHash));
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

function claimedHashSafe(v: string): string {
  return v;
}

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

  memoryWebAuthnCreds.unshift(result.credential);
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
  const creds = getServerlessWebAuthnCreds();
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
  const serverCreds = getServerlessWebAuthnCreds();
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

app.post('/api/admin/codes', requireAdmin, (_req, res) => {
  const generated = generateSignedCustomerCode();
  return res.json({
    ok: true,
    code: generated,
    envCodesCount: getEnvCustomerCodes().length,
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
  if (
    (envAdminPass && constantTimeEqual(rawCode, envAdminPass)) ||
    (claimedAdminHash && verifyPasscodeScrypt(rawCode, claimedAdminHash))
  ) {
    const adminToken = signSessionToken('admin', 'owner');
    return res.json({ ok: true, role: 'admin', adminToken });
  }

  const normalizedUpper = rawCode.toUpperCase();
  const envCustomerMatch = getEnvCustomerCodes().some((allowed) =>
    constantTimeEqual(normalizedUpper, allowed)
  );
  const signedMatch = verifySignedCustomerCode(normalizedUpper);

  if (envCustomerMatch || signedMatch) {
    const proToken = signSessionToken('pro', 'customer', 365 * 24 * 60 * 60 * 1000);
    return res.json({ ok: true, role: 'pro', proToken });
  }

  return res.status(401).json({
    ok: false,
    error: 'Código inválido o vencido. Verifica que esté bien escrito o solicita uno nuevo.',
  });
});

app.post('/api/translate', async (req, res) => {
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

  const bodyCheck = validateTranslateBody(req.body);
  if (!bodyCheck.ok) {
    return res.status(400).json({ error: bodyCheck.error });
  }

  const ai = clientRes.ai;
  if (!ai) {
    return proxyToFallbackOrigin(req, res);
  }

  try {
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
          config: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        3800,
        'gemini-3.1-flash-lite translate'
      );
    } catch (primaryErr: any) {
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
          4600,
          'gemini-4-hydrogen translate'
        );
      } catch (fallbackErr: any) {
        if (
          (isUnavailableError(fallbackErr) || isUnavailableError(primaryErr)) &&
          Date.now() - startedAt < 5200
        ) {
          await new Promise((r) => setTimeout(r, 250));
          response = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt,
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
            3500,
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
    const status = isQuotaError(error) ? 429 : isUnavailableError(error) ? 503 : 500;
    const message = isQuotaError(error)
      ? 'Se alcanzó temporalmente el límite de solicitudes de traducción. Inténtalo de nuevo en unos segundos.'
      : isUnavailableError(error)
      ? 'El motor de traducción está con alta demanda temporal. Intenta de nuevo en unos segundos.'
      : 'No se pudo completar la traducción en este momento.';
    return res.status(status).json({ error: message });
  }
});

app.post('/api/translate-audio', async (req, res) => {
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
    return proxyToFallbackOrigin(req, res);
  }

  const fromLang =
    typeof req.body?.fromLang === 'string' && req.body.fromLang.trim()
      ? req.body.fromLang.trim().slice(0, 80)
      : 'Auto-detect';
  const toLang =
    typeof req.body?.toLang === 'string' && req.body.toLang.trim()
      ? req.body.toLang.trim().slice(0, 80)
      : 'Spanish';

  try {
    const audioPart = {
      inlineData: {
        mimeType: audioCheck.mimeType,
        data: audioCheck.base64,
      },
    };

    const promptText = `Transcribe and translate spoken audio from ${fromLang} to ${toLang}.
If silent or no clear human speech, return "" for transcribedText and translatedText. Never invent speech.
Return ONLY compact JSON:
{"transcribedText":"exact speech or empty","detectedLanguage":"language in Spanish","translatedText":"natural translation or empty","phonetic":""}`;

    let response: any = null;
    let lastError: any = null;

    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: { parts: [audioPart, { text: promptText }] },
          config: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        4500,
        'gemini-3.1-flash-lite audio'
      );
    } catch (primaryErr: any) {
      lastError = primaryErr;
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: { parts: [audioPart, { text: promptText }] },
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          4800,
          'gemini-4-hydrogen audio'
        );
      } catch (fallbackErr: any) {
        lastError = fallbackErr;
      }
    }

    if (!response) {
      const status = isQuotaError(lastError) ? 429 : isUnavailableError(lastError) ? 503 : 500;
      const message = isQuotaError(lastError)
        ? 'Se alcanzó el límite de solicitudes de traducción de audio. Espera un momento o usa el micrófono nuevamente.'
        : isUnavailableError(lastError)
        ? 'El motor de traducción de audio está con alta demanda temporal. Intenta de nuevo en unos segundos.'
        : 'No se pudo procesar el audio en el servidor.';
      return res.status(status).json({ error: message });
    }

    const rawText = response.text ? response.text : '{}';
    let data: any = {};
    try {
      const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const match = clean.match(/\{[\s\S]*\}/);
      data = JSON.parse(match ? match[0] : clean);
    } catch {
      data = {
        transcribedText: 'Voz detectada',
        detectedLanguage: fromLang,
        translatedText: rawText.replace(/```[a-z]*/g, '').trim(),
        phonetic: '',
      };
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

    return res.json({
      transcribedText: data.transcribedText || 'Audio recibido',
      detectedLanguage: data.detectedLanguage || fromLang,
      translatedText: data.translatedText || data.transcribedText || 'Audio recibido',
      phonetic: data.phonetic || '',
    });
  } catch {
    return res.status(500).json({
      error: 'Error interno al procesar el audio.',
    });
  }
});

app.post('/api/tts', async (req, res) => {
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

  const ai = clientRes.ai;
  if (!ai) {
    return proxyToFallbackOrigin(req, res);
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [{ role: 'user', parts: [{ text: text.slice(0, 500) }] }],
        config: { responseModalities: ['AUDIO'] },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
      }
    } catch {
      // Fallback silently to browser speech synthesis
    }

    return res.json({ audioBase64: null });
  } catch {
    return res.json({ audioBase64: null });
  }
});

app.post('/api/verify-mercadopago', async (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('verify-mp', ip, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({
      ok: false,
      error: `Demasiados intentos de verificación. Espera ${limit.retryAfterSec} segundos.`,
    });
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

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

    const recordPendingManualReview = async () => {
      try {
        await fetch(`${FALLBACK_API_ORIGIN}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'payment',
            message: `NÚMERO DE OPERACIÓN MERCADO PAGO: #${cleanId}\n(Confirmación manual pendiente: verificar acreditación y enviar código al comprador).`,
            contact: cleanContact || 'Sin contacto informado',
            timestamp: Date.now(),
          }),
        });
      } catch {
        // Non-blocking best-effort logging to Buzón
      }

      return res.status(202).json({
        ok: true,
        verified: false,
        pendingManualReview: true,
        message: `¡Registramos tu número de operación (#${cleanId})! Para enviarte tu código de activación enseguida, toca el botón abajo para avisarnos a azulbaires@gmail.com.`,
      });
    };

    if (!mpToken) {
      return await recordPendingManualReview();
    }

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
      return await recordPendingManualReview();
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

// Protect GET /api/feedback so private messages, contacts & operation numbers require verified admin session
app.get('/api/feedback', requireAdmin, async (req, res) => {
  return proxyToFallbackOrigin(req, res);
});

app.post('/api/feedback', async (req, res) => {
  const ip = getClientIp(req);
  const limit = checkRateLimit('feedback-post', ip, 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return res.status(429).json({ error: `Demasiados mensajes seguidos. Espera ${limit.retryAfterSec} segundos.` });
  }
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 2000) {
    return res.status(400).json({ error: 'El mensaje es obligatorio y debe tener como máximo 2000 caracteres.' });
  }
  return proxyToFallbackOrigin(req, res);
});

// Forward /api/visits cleanly with rate limit
app.use('/api/visits', (req, res, next) => {
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    const limit = checkRateLimit('visits-post', ip, 30, 5 * 60 * 1000);
    if (!limit.allowed) {
      return res.status(429).json({ error: 'Límite de actualización de visitas alcanzado.' });
    }
  }
  return next();
});

app.use('/api', (req, res) => {
  return proxyToFallbackOrigin(req, res);
});

export default app;
