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
  try {
    const res = await fetch('/api/translate', {
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
  const buffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const audioBase64 = btoa(binary);

  const res = await fetch('/api/translate-audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: audioBlob.type || 'audio/webm',
      fromLang,
      toLang,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Fallo al procesar audio');
  }

  return await res.json();
}

export async function generateAiSpeech(
  text: string,
  voiceName: string = 'Kore'
): Promise<string | null> {
  try {
    const res = await fetch('/api/tts', {
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
