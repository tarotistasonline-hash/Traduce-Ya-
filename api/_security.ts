import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';

export const ADMIN_EMAIL = 'tarotistasonline@gmail.com';

export function getFirebaseWebApiKey(): string {
  const envKey = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (envKey) return envKey;
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
    path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'firebase-applet-config.json'),
  ];
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (typeof parsed?.apiKey === 'string' && parsed.apiKey.trim()) {
          return parsed.apiKey.trim();
        }
      }
    } catch {
      // Ignore unreadable candidate path
    }
  }
  return '';
}

// In-memory runtime fallback secret when ADMIN_SESSION_SECRET / LICENSE_SECRET is unset
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSigningSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.LICENSE_SECRET?.trim() ||
    EPHEMERAL_SECRET
  );
}

export function constantTimeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function hashPasscodeScrypt(passcode: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPasscodeScrypt(passcode: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  try {
    const derivedBuf = crypto.scryptSync(passcode, salt, 64);
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

export interface SignedTokenPayload {
  role: 'admin' | 'pro';
  sub: string;
  exp: number;
}

export function signSessionToken(
  role: 'admin' | 'pro',
  sub: string,
  ttlMs: number = 12 * 60 * 60 * 1000
): string {
  const payload: SignedTokenPayload = {
    role,
    sub,
    exp: Date.now() + ttlMs,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifySessionToken(
  rawToken: string | undefined | null,
  expectedRole?: 'admin' | 'pro'
): SignedTokenPayload | null {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const clean = rawToken.trim();
  const dotIdx = clean.indexOf('.');
  if (dotIdx <= 0 || dotIdx === clean.length - 1) return null;

  const payloadB64 = clean.slice(0, dotIdx);
  const sigB64 = clean.slice(dotIdx + 1);
  if (!payloadB64 || !sigB64 || sigB64.includes('.')) return null;

  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(payloadB64)
      .digest('base64url');

    const sigBuf = Buffer.from(sigB64, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as SignedTokenPayload;
    if (
      !parsed ||
      (parsed.role !== 'admin' && parsed.role !== 'pro') ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    if (expectedRole && parsed.role !== expectedRole) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: express.Request): string | null {
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token || null;
  }
  return null;
}

export function isVerifiedAdminRequest(req: express.Request): boolean {
  const token = extractBearerToken(req);
  return verifySessionToken(token, 'admin') !== null;
}

export function isVerifiedProOrAdminRequest(req: express.Request): boolean {
  const bearer = extractBearerToken(req);
  if (verifySessionToken(bearer) !== null) return true;
  const proHeader = req.headers?.['x-pro-token'];
  if (typeof proHeader === 'string' && verifySessionToken(proHeader) !== null) {
    return true;
  }
  return false;
}

export function generateSignedCustomerCode(): string {
  const nonce = crypto.randomBytes(4).toString('hex').toUpperCase();
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`TY1-${nonce}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `TY1-${nonce}-${sig}`;
}

export function verifySignedCustomerCode(rawCode: string): boolean {
  const clean = rawCode.trim().toUpperCase();
  const match = /^TY1-([0-9A-F]{8})-([0-9A-F]{8})$/.exec(clean);
  if (!match) return false;
  const [, nonce, providedSig] = match;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`TY1-${nonce}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return constantTimeEqual(providedSig, expectedSig);
}

export function getEnvCustomerCodes(): string[] {
  const raw = process.env.CUSTOMER_ACTIVATION_CODES || '';
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length >= 4);
}

export async function verifyFirebaseAdminIdToken(
  idToken: string,
  firebaseWebApiKey: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!idToken || typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 4096) {
    return { ok: false, error: 'Token de sesión inválido.' };
  }
  if (!firebaseWebApiKey) {
    return { ok: false, error: 'Configuración de autenticación no disponible.' };
  }

  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseWebApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) {
      return { ok: false, error: 'La sesión de Google no es válida o expiró.' };
    }
    const data: any = await resp.json();
    const user = Array.isArray(data?.users) ? data.users[0] : null;
    const email = String(user?.email || '').trim().toLowerCase();
    const emailVerified = Boolean(user?.emailVerified);

    if (!email || !emailVerified || email !== ADMIN_EMAIL) {
      return {
        ok: false,
        error: `Acceso restringido únicamente a la cuenta verificada ${ADMIN_EMAIL}.`,
      };
    }

    return { ok: true, email };
  } catch {
    return { ok: false, error: 'No se pudo verificar la cuenta de Google en este momento.' };
  }
}

export function securityHeadersMiddleware(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  res.removeHeader?.('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), microphone=(self)');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
}

export function sameOriginGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const originHeader = req.headers.origin;
  if (!originHeader || typeof originHeader !== 'string') {
    return next();
  }

  try {
    const originUrl = new URL(originHeader);
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') {
      return res.status(403).json({ error: 'Origen no permitido.' });
    }
    const rawHost =
      (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
      req.headers.host ||
      '';
    const expectedHost = rawHost.split(',')[0].trim().toLowerCase();
    if (expectedHost && originUrl.host.toLowerCase() !== expectedHost) {
      return res.status(403).json({ error: 'Solicitud bloqueada por origen cruzado no autorizado.' });
    }
    return next();
  } catch {
    return res.status(403).json({ error: 'Encabezado Origin inválido.' });
  }
}

const rateLimitStore = new Map<string, number[]>();

export function getClientIp(req: express.Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim().slice(0, 64);
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

export function checkRateLimit(
  bucket: string,
  ip: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const key = `${bucket}:${ip}`;

  if (rateLimitStore.size > 5000) {
    // Prune stale entries cleanly to avoid unbounded memory growth
    for (const [entryKey, timestamps] of rateLimitStore.entries()) {
      const recent = timestamps.filter((t) => now - t < windowMs);
      if (recent.length === 0) {
        rateLimitStore.delete(entryKey);
      } else {
        rateLimitStore.set(entryKey, recent);
      }
    }
  }

  const existing = (rateLimitStore.get(key) || []).filter((t) => now - t < windowMs);
  if (existing.length >= maxRequests) {
    const oldest = existing[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    rateLimitStore.set(key, existing);
    return { allowed: false, retryAfterSec };
  }

  existing.push(now);
  rateLimitStore.set(key, existing);
  return { allowed: true, retryAfterSec: 0 };
}

export function validateCustomGeminiKey(
  rawKey: unknown
): { ok: true; key: string } | { ok: false; error: string } {
  if (rawKey === undefined || rawKey === null || rawKey === '') {
    return { ok: true, key: '' };
  }
  if (typeof rawKey !== 'string') {
    return { ok: false, error: 'Formato inválido de API Key.' };
  }
  const clean = rawKey.trim();
  if (!clean) return { ok: true, key: '' };
  if (!/^AIza[0-9A-Za-z_-]{20,100}$/.test(clean)) {
    return { ok: false, error: 'La API Key de Gemini ingresada no tiene un formato válido (debe comenzar con AIza...).' };
  }
  return { ok: true, key: clean };
}

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/aac',
  'audio/x-m4a',
  'audio/flac',
]);

export function validateAudioPayload(
  audioBase64: unknown,
  mimeType: unknown
): { ok: true; base64: string; mimeType: string } | { ok: false; error: string } {
  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
    return { ok: false, error: 'Audio data is required.' };
  }
  const cleanBase64 = audioBase64.trim();
  if (cleanBase64.length > 7_000_000) {
    return { ok: false, error: 'El audio supera el tamaño máximo permitido.' };
  }
  if (!/^[A-Za-z0-9+/=\s]+$/.test(cleanBase64)) {
    return { ok: false, error: 'Formato de audio inválido.' };
  }
  const baseMime = String(mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
  const safeMime = ALLOWED_AUDIO_MIME_TYPES.has(baseMime) ? baseMime : 'audio/webm';
  return { ok: true, base64: cleanBase64, mimeType: safeMime };
}

const ALLOWED_TONES = new Set(['natural', 'formal', 'casual']);

export function validateTranslateBody(body: any):
  | { ok: true; text: string; fromLang: string; toLang: string; tone: string }
  | { ok: false; error: string } {
  const rawText = body?.text;
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, error: 'El texto a traducir es obligatorio.' };
  }
  if (rawText.length > 3000) {
    return { ok: false, error: 'El texto supera el límite de 3000 caracteres por solicitud.' };
  }
  const fromLang =
    typeof body?.fromLang === 'string' && body.fromLang.trim()
      ? body.fromLang.trim().slice(0, 80)
      : 'Auto-detect';
  const toLang =
    typeof body?.toLang === 'string' && body.toLang.trim()
      ? body.toLang.trim().slice(0, 80)
      : 'Spanish';
  const rawTone = typeof body?.tone === 'string' ? body.tone.trim().toLowerCase() : 'natural';
  const tone = ALLOWED_TONES.has(rawTone) ? rawTone : 'natural';

  return { ok: true, text: rawText, fromLang, toLang, tone };
}

export function sanitizeFallbackApiPath(rawUrl: string): string | null {
  const pathOnly = rawUrl.split('?')[0];
  if (
    !pathOnly.startsWith('/api/') ||
    pathOnly.includes('..') ||
    pathOnly.includes('//') ||
    pathOnly.includes('\\') ||
    pathOnly.includes('://')
  ) {
    return null;
  }
  if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(pathOnly)) {
    return null;
  }
  return pathOnly;
}
