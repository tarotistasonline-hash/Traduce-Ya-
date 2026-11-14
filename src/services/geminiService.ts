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

export async function translateText(
  text: string,
  fromLang: string,
  toLang: string,
  tone: string = 'natural'
): Promise<TranslateResponse> {
  const url = getApiEndpoint('/api/translate');
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fromLang, toLang, tone }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `Error ${res.status}`);
    }

    return await res.json();
  } catch (err: any) {
    console.warn('Translate failed, trying one retry:', err);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const retryRes = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fromLang, toLang, tone }),
      });
      if (retryRes.ok) {
        return await retryRes.json();
      }
      const retryErr = await retryRes.json().catch(() => ({}));
      if (retryErr?.error) {
        throw new Error(retryErr.error);
      }
    } catch (retryErr: any) {
      console.warn('Retry also failed:', retryErr);
      throw retryErr;
    }

    throw err;
  }
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

  const primaryUrl = getApiEndpoint('/api/translate-audio');
  const payload = {
    audioBase64,
    mimeType: audioBlob.type || 'audio/webm',
    fromLang,
    toLang,
  };

  let res: Response | null = null;

  try {
    console.log('[translateAudioBlob] Sending audio to server:', {
      url: primaryUrl,
      blobSize: audioBlob.size,
      mimeType: audioBlob.type,
      fromLang,
      toLang,
    });
    res = await fetch(primaryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (primaryFetchErr: any) {
    console.warn('[translateAudioBlob] Primary fetch failed, attempting relative fallback (/api/translate-audio):', primaryFetchErr);
    try {
      await new Promise((r) => setTimeout(r, 400));
      res = await fetch('/api/translate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (fallbackErr: any) {
      console.error('[translateAudioBlob] Both endpoints failed to fetch:', fallbackErr);
      throw new Error('No se pudo conectar con el servidor de traducción. Verifica tu conexión de red o reintenta.');
    }
  }

  if (!res || !res.ok) {
    const errorData = await res?.json().catch(() => ({}));
    const errorMsg = errorData?.error || `Error ${res?.status || 500} al procesar audio en servidor`;
    console.error('[translateAudioBlob] Server returned error response:', { status: res?.status, errorMsg });
    throw new Error(errorMsg);
  }

  let data: any = {};
  try {
    data = await res.json();
    console.log('[translateAudioBlob] Received response from server:', {
      hasTranscript: Boolean(data.transcribedText),
      hasTranslation: Boolean(data.translatedText),
      noSpeech: Boolean(data.noSpeech),
      detectedLanguage: data.detectedLanguage,
    });
  } catch (jsonErr) {
    console.error('[translateAudioBlob] Failed to parse JSON response:', jsonErr);
    throw new Error('Respuesta inválida del servidor de traducción.');
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
    const data = await res.json();
    return data.audioBase64 || null;
  } catch (err) {
    console.warn('TTS fetch failed:', err);
    return null;
  }
}
