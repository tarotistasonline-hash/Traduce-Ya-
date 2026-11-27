import { getApiEndpoint } from '../utils/apiConfig';
import { getAdminToken, getProToken, getUserApiKey } from '../utils/licenseManager';

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const userKey = getUserApiKey();
  if (userKey) {
    headers['x-gemini-api-key'] = userKey;
  }
  const adminToken = getAdminToken();
  if (adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  } else {
    const proToken = getProToken();
    if (proToken) {
      headers['x-pro-token'] = proToken;
    }
  }
  return headers;
}

export interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: string;
  phonetic?: string;
  nuance?: string | null;
  alternatives?: string[];
  audioBase64?: string;
}

export interface AudioTranslateResponse {
  transcribedText: string;
  detectedLanguage?: string;
  translatedText: string;
  phonetic?: string;
  noSpeech?: boolean;
}

function isNetworkFetchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err || '');
  return (
    msg.includes('Failed to fetch') ||
    msg.includes('Load failed') ||
    msg.includes('NetworkError') ||
    msg.includes('AbortError') ||
    msg.includes('aborted') ||
    msg.includes('fetch')
  );
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseResponseSafely(res: Response): Promise<any> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch (readErr: any) {
    if (isNetworkFetchError(readErr)) {
      throw new Error('Se interrumpió la conexión al recibir la respuesta. Intenta de nuevo.');
    }
    throw new Error('No se pudo leer la respuesta del servidor.');
  }

  // If response has HTTP error status (4xx / 5xx)
  if (!res.ok) {
    let parsedError: string | null = null;
    try {
      const errObj = JSON.parse(rawText);
      if (typeof errObj?.error === 'string' && errObj.error.trim()) {
        parsedError = errObj.error.trim();
      }
    } catch {}

    if (parsedError) {
      throw new Error(parsedError);
    }
    if (res.status === 429) {
      throw new Error(
        'Se alcanzó temporalmente el límite de solicitudes de traducción. Espera unos segundos e inténtalo de nuevo.'
      );
    }
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(
        'El motor de traducción está con alta demanda temporal. Intenta de nuevo en unos segundos.'
      );
    }
    if (res.status === 404) {
      throw new Error('El servicio de traducción no está disponible en esta ruta. Recarga la página.');
    }
    throw new Error(`Error ${res.status} al procesar la traducción. Intenta nuevamente.`);
  }

  // Response is OK (200)
  try {
    return JSON.parse(rawText);
  } catch {
    const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    throw new Error('La respuesta del servidor no tiene el formato esperado. Por favor reintenta.');
  }
}

export async function translateText(
  text: string,
  fromLang: string,
  toLang: string,
  tone: string = 'natural'
): Promise<TranslateResponse> {
  const url = getApiEndpoint('/api/translate');
  const requestBody = JSON.stringify({ text, fromLang, toLang, tone });
  let lastError: any = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: requestBody,
        },
        18000
      );

      return await parseResponseSafely(res);
    } catch (err: any) {
      lastError = err;
      console.warn(`Translate attempt ${attempt + 1} notice:`, err);
      if (err?.name === 'AbortError') {
        throw new Error(
          'La traducción tardó demasiado en responder. Intenta nuevamente con una frase más corta.'
        );
      }
      if (attempt === 0) {
        // Automatic brief backoff retry on transient glitch
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
    }
  }

  throw lastError || new Error('No se pudo conectar con el servidor de traducción.');
}

export async function translateAudioBlob(
  audioBlob: Blob,
  fromLang: string,
  toLang: string
): Promise<AudioTranslateResponse> {
  if (!audioBlob || audioBlob.size < 250) {
    console.warn('[translateAudioBlob] Audio blob is too small (<250 bytes), likely empty recording:', audioBlob?.size);
    return {
      transcribedText: '',
      detectedLanguage: fromLang,
      translatedText: '',
      phonetic: '',
      noSpeech: true,
    };
  }

  let audioBase64 = '';
  try {
    audioBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const dataUrl = (reader.result as string) || '';
          const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          if (!base64 || base64.trim() === '') {
            reject(new Error('Audio base64 payload is empty after reading Blob'));
          } else {
            resolve(base64);
          }
        } catch (parseErr) {
          reject(parseErr);
        }
      };
      reader.onerror = () => reject(new Error('FileReader error while reading audio blob'));
      reader.readAsDataURL(audioBlob);
    });
  } catch (readerErr: any) {
    console.error('[translateAudioBlob] Error converting blob to base64:', readerErr);
    throw new Error('No se pudo procesar el archivo de audio local.');
  }

  const url = getApiEndpoint('/api/translate-audio');
  const payload = JSON.stringify({
    audioBase64,
    mimeType: audioBlob.type || 'audio/webm',
    fromLang,
    toLang,
  });

  let lastError: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: payload,
        },
        22000
      );

      const data = await parseResponseSafely(res);
      return {
        transcribedText: data.transcribedText || '',
        detectedLanguage: data.detectedLanguage || fromLang,
        translatedText: data.translatedText || '',
        phonetic: data.phonetic || '',
        noSpeech: Boolean(data.noSpeech),
      };
    } catch (fetchErr: any) {
      lastError = fetchErr;
      console.warn(`[translateAudioBlob] Attempt ${attempt + 1} notice:`, fetchErr);
      if (fetchErr?.name === 'AbortError') {
        throw new Error(
          'El análisis de audio tardó demasiado en responder. Intenta hablar más cerca o una frase más breve.'
        );
      }
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
    }
  }

  throw lastError || new Error('No se pudo conectar con el servidor de traducción.');
}

export async function generateAiSpeech(
  text: string,
  voiceName: string = 'Kore'
): Promise<string | null> {
  try {
    const url = getApiEndpoint('/api/tts');
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ text, voiceName }),
      },
      6000
    );

    if (!res.ok) return null;
    const data = await parseResponseSafely(res);
    return data.audioBase64 || null;
  } catch (err) {
    console.warn('TTS fetch failed:', err);
    return null;
  }
}
