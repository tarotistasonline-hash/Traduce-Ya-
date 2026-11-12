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
    } catch (retryErr) {
      console.warn('Retry also failed:', retryErr);
    }

    throw err;
  }
}

export async function translateAudioBlob(
  audioBlob: Blob,
  fromLang: string,
  toLang: string
): Promise<AudioTranslateResponse> {
  try {
    const audioBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(audioBlob);
    });

    const url = getApiEndpoint('/api/translate-audio');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        mimeType: audioBlob.type || 'audio/webm',
        fromLang,
        toLang,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        transcribedText: data.transcribedText || '',
        detectedLanguage: data.detectedLanguage || fromLang,
        translatedText: data.translatedText || '',
        phonetic: data.phonetic || '',
      };
    }

    const errorData = await res.json().catch(() => ({}));
    console.warn('translateAudioBlob endpoint error:', res.status, errorData);
  } catch (err) {
    console.warn('translateAudioBlob notice:', err);
  }

  // Graceful fallback response so the conversation is not interrupted
  return {
    transcribedText: 'Audio recibido',
    detectedLanguage: fromLang,
    translatedText: 'Audio procesado. Por favor intenta hablar más claro o cerca del micrófono.',
    phonetic: '',
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
