import crypto from 'crypto';
import type express from 'express';

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

export function isValidAdminPasscode(rawPasscode: string): boolean {
  const clean = rawPasscode.trim();
  // Supports 6-digit numeric PIN (e.g., 482910) or longer custom passcodes (up to 128 chars)
  return /^\d{6}$/.test(clean) || (clean.length >= 6 && clean.length <= 128);
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

// ============================================================
// WebAuthn / Biometric Passkey Verification (ES256 / P-256)
// ============================================================

export interface StoredWebAuthnCredential {
  credentialId: string;
  publicKeySpkiB64Url: string;
  rpId: string;
  createdAt: number;
}
export const StoredWebAuthnCredential = {};

export function getRequestHostname(req: express.Request): string {
  const rawHost =
    (typeof req.headers['x-forwarded-host'] === 'string' && req.headers['x-forwarded-host']) ||
    req.headers.host ||
    'localhost';
  const firstHost = rawHost.split(',')[0].trim().toLowerCase();
  return firstHost.replace(/:\d+$/, '') || 'localhost';
}

export function createWebAuthnChallenge(purpose: 'register' | 'auth'): {
  challenge: string;
  challengeToken: string;
} {
  const challenge = crypto.randomBytes(32).toString('base64url');
  const payload = {
    purpose,
    challenge,
    exp: Date.now() + 5 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`webauthn:${payloadB64}`)
    .digest('base64url');
  return { challenge, challengeToken: `${payloadB64}.${sigB64}` };
}

export function verifyWebAuthnChallenge(
  challengeToken: unknown,
  expectedPurpose: 'register' | 'auth'
): string | null {
  if (typeof challengeToken !== 'string' || !challengeToken.includes('.')) return null;
  const [payloadB64, sigB64] = challengeToken.split('.');
  if (!payloadB64 || !sigB64) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(`webauthn:${payloadB64}`)
      .digest('base64url');
    if (!constantTimeEqual(sigB64, expectedSig)) return null;
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (
      !parsed ||
      parsed.purpose !== expectedPurpose ||
      typeof parsed.challenge !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return parsed.challenge;
  } catch {
    return null;
  }
}

export function signBiometricBundle(cred: StoredWebAuthnCredential): string {
  const payloadB64 = Buffer.from(JSON.stringify(cred), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`bio:${payloadB64}`)
    .digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

export function verifyBiometricBundle(bundle: unknown): StoredWebAuthnCredential | null {
  if (typeof bundle !== 'string' || !bundle.includes('.')) return null;
  const [payloadB64, sigB64] = bundle.split('.');
  if (!payloadB64 || !sigB64) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', getSigningSecret())
      .update(`bio:${payloadB64}`)
      .digest('base64url');
    if (!constantTimeEqual(sigB64, expectedSig)) return null;
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as StoredWebAuthnCredential;
    if (
      !parsed ||
      typeof parsed.credentialId !== 'string' ||
      typeof parsed.publicKeySpkiB64Url !== 'string' ||
      typeof parsed.rpId !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getEnvWebAuthnCredentials(): StoredWebAuthnCredential[] {
  const raw = process.env.ADMIN_WEBAUTHN_CRED?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(
      (item): item is StoredWebAuthnCredential =>
        Boolean(
          item &&
            typeof item.credentialId === 'string' &&
            typeof item.publicKeySpkiB64Url === 'string' &&
            typeof item.rpId === 'string'
        )
    );
  } catch {
    return [];
  }
}

export function verifyWebAuthnRegistration(params: {
  challengeToken: unknown;
  expectedHostname: string;
  credentialId: unknown;
  publicKeySpkiB64Url: unknown;
  clientDataJSON: unknown;
  authenticatorData: unknown;
}): { ok: true; credential: StoredWebAuthnCredential } | { ok: false; error: string } {
  const expectedChallenge = verifyWebAuthnChallenge(params.challengeToken, 'register');
  if (!expectedChallenge) {
    return { ok: false, error: 'La solicitud biométrica expiró. Intenta nuevamente.' };
  }

  if (
    typeof params.credentialId !== 'string' ||
    typeof params.publicKeySpkiB64Url !== 'string' ||
    typeof params.clientDataJSON !== 'string' ||
    typeof params.authenticatorData !== 'string'
  ) {
    return { ok: false, error: 'Datos biométricos incompletos.' };
  }

  try {
    const clientData = JSON.parse(
      Buffer.from(params.clientDataJSON, 'base64url').toString('utf8')
    );
    if (clientData?.type !== 'webauthn.create') {
      return { ok: false, error: 'Tipo de registro biométrico inválido.' };
    }
    if (!constantTimeEqual(String(clientData?.challenge || ''), expectedChallenge)) {
      return { ok: false, error: 'Desafío biométrico no coincide.' };
    }
    const originHost = new URL(String(clientData?.origin || '')).hostname.toLowerCase();
    if (originHost !== params.expectedHostname) {
      return { ok: false, error: 'Origen biométrico no coincide con este dominio.' };
    }

    const authData = Buffer.from(params.authenticatorData, 'base64url');
    if (authData.length < 37) {
      return { ok: false, error: 'Datos del autenticador inválidos.' };
    }

    const rpIdHash = authData.subarray(0, 32);
    const expectedRpIdHash = crypto.createHash('sha256').update(params.expectedHostname).digest();
    if (!crypto.timingSafeEqual(rpIdHash, expectedRpIdHash)) {
      return { ok: false, error: 'El identificador de dominio de la huella no coincide.' };
    }

    const flags = authData[32];
    const userPresent = (flags & 0x01) !== 0;
    if (!userPresent) {
      return { ok: false, error: 'No se confirmó presencia de usuario en el sensor.' };
    }

    const keyObj = crypto.createPublicKey({
      key: Buffer.from(params.publicKeySpkiB64Url, 'base64url'),
      format: 'der',
      type: 'spki',
    });
    if (keyObj.asymmetricKeyType !== 'ec') {
      return { ok: false, error: 'Solo se admiten llaves biométricas ECDSA (P-256).' };
    }

    return {
      ok: true,
      credential: {
        credentialId: params.credentialId,
        publicKeySpkiB64Url: params.publicKeySpkiB64Url,
        rpId: params.expectedHostname,
        createdAt: Date.now(),
      },
    };
  } catch {
    return { ok: false, error: 'No se pudo validar la credencial biométrica.' };
  }
}

export function verifyWebAuthnAssertion(params: {
  challengeToken: unknown;
  expectedHostname: string;
  storedCredential: StoredWebAuthnCredential;
  clientDataJSON: unknown;
  authenticatorData: unknown;
  signature: unknown;
}): { ok: true } | { ok: false; error: string } {
  const expectedChallenge = verifyWebAuthnChallenge(params.challengeToken, 'auth');
  if (!expectedChallenge) {
    return { ok: false, error: 'La sesión de huella expiró. Vuelve a tocar el botón.' };
  }

  if (
    typeof params.clientDataJSON !== 'string' ||
    typeof params.authenticatorData !== 'string' ||
    typeof params.signature !== 'string'
  ) {
    return { ok: false, error: 'Firma biométrica incompleta.' };
  }

  try {
    const clientDataBuf = Buffer.from(params.clientDataJSON, 'base64url');
    const clientData = JSON.parse(clientDataBuf.toString('utf8'));
    if (clientData?.type !== 'webauthn.get') {
      return { ok: false, error: 'Operación biométrica inválida.' };
    }
    if (!constantTimeEqual(String(clientData?.challenge || ''), expectedChallenge)) {
      return { ok: false, error: 'El desafío de seguridad no coincide.' };
    }

    const originHost = new URL(String(clientData?.origin || '')).hostname.toLowerCase();
    if (
      originHost !== params.expectedHostname ||
      originHost !== params.storedCredential.rpId.toLowerCase()
    ) {
      return { ok: false, error: 'Esta huella corresponde a otro dominio.' };
    }

    const authData = Buffer.from(params.authenticatorData, 'base64url');
    if (authData.length < 37) {
      return { ok: false, error: 'Datos de autenticación inválidos.' };
    }

    const rpIdHash = authData.subarray(0, 32);
    const expectedRpIdHash = crypto
      .createHash('sha256')
      .update(params.storedCredential.rpId.toLowerCase())
      .digest();
    if (!crypto.timingSafeEqual(rpIdHash, expectedRpIdHash)) {
      return { ok: false, error: 'El dominio de la huella no coincide.' };
    }

    const flags = authData[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;
    if (!userPresent || !userVerified) {
      return { ok: false, error: 'Se requiere verificación biométrica del dispositivo.' };
    }

    const clientDataHash = crypto.createHash('sha256').update(clientDataBuf).digest();
    const signedPayload = Buffer.concat([authData, clientDataHash]);
    const signatureBuf = Buffer.from(params.signature, 'base64url');
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(params.storedCredential.publicKeySpkiB64Url, 'base64url'),
      format: 'der',
      type: 'spki',
    });

    const isValid = crypto.verify('sha256', signedPayload, publicKey, signatureBuf);
    if (!isValid) {
      return { ok: false, error: 'Huella digital no reconocida.' };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo verificar la huella digital.' };
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
