import { getApiEndpoint } from '../utils/apiConfig';

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
    msg.includes('fetch')
  );
}

async function parseJsonSafely(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'El servidor de traducción devolvió una respuesta no válida (verifica si la sesión expiró o si el dominio tiene acceso al backend /api).'
    );
  }
  return res.json();
}

export async function translateText(
  text: string,
  fromLang: string,
  toLang: string,
  tone: string = 'natural'
): Promise<TranslateResponse> {
  const url = getApiEndpoint('/api/translate');
  const requestBody = JSON.stringify({ text, fromLang, toLang, tone });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      const data = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(data?.error || `Error ${res.status} del servidor.`);
      }
      return data;
    } catch (err: any) {
      console.warn(`Translate attempt ${attempt + 1} notice:`, err);
      if (attempt === 0 && isNetworkFetchError(err)) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      if (isNetworkFetchError(err)) {
        throw new Error(
          'No se pudo conectar con el servidor de traducción. Verifica tu conexión de internet o recarga la página.'
        );
      }
      throw err;
    }
  }

  throw new Error('No se pudo conectar con el servidor de traducción.');
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

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      break;
    } catch (fetchErr: any) {
      console.warn(`[translateAudioBlob] Fetch attempt ${attempt + 1} failed:`, fetchErr);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 450));
        continue;
      }
      throw new Error(
        'No se pudo conectar con el servidor de traducción. Verifica tu conexión de red o recarga la página.'
      );
    }
  }

  if (!res) {
    throw new Error('No se recibió respuesta del servidor de traducción.');
  }

  const data = await parseJsonSafely(res);
  if (!res.ok) {
    const errorMsg = data?.error || `Error ${res.status} al procesar audio en servidor`;
    console.error('[translateAudioBlob] Server returned error response:', { status: res.status, errorMsg });
    throw new Error(errorMsg);
  }

  return {
    transcribedText: data.transcribedText || '',
    detectedLanguage: data.detectedLanguage || fromLang,
    translatedText: data.translatedText || '',
    phonetic: data.phonetic || '',
    noSpeech: Boolean(data.noSpeech),
  };
}

export async function generateAiSpeech(
  text: string,
  voiceName: string = 'Kore'
): Promise<string | null> {
  try {
    const url = getApiEndpoint('/api/tts');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceName }),
    });

    if (!res.ok) return null;
    const data = await parseJsonSafely(res);
    return data.audioBase64 || null;
  } catch (err) {
    console.warn('TTS fetch failed:', err);
    return null;
  }
}
