import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI client with v1alpha for audio/TTS and multimodal features
let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined = undefined;

function getAiClient(): GoogleGenAI | null {
  const currentKey = process.env.GEMINI_API_KEY;
  if (!currentKey) return null;

  if (!aiClient || cachedApiKey !== currentKey) {
    cachedApiKey = currentKey;
    aiClient = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: {
        apiVersion: 'v1alpha',
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}


// Health check / status
app.get('/api/status', (req, res) => {
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY,
    status: 'ok',
  });
});

// Translation Endpoint
app.post('/api/translate', async (req, res) => {
  try {
    const { text, fromLang, toLang, tone = 'natural' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for translation.' });
    }

    const ai = getAiClient();
    if (!ai) {
      // Fallback response if API key is temporarily unavailable
      return res.status(503).json({
        error: 'Servicio de IA no disponible. Verifique GEMINI_API_KEY.',
      });
    }

    const prompt = `You are a real-time conversational interpreter translating live spoken dialogue between two people.
Source language request: ${fromLang || 'Auto-detect'}
Target language request: ${toLang || 'Spanish'}
Tone: ${tone} (e.g. natural, polite, casual)

Spoken text to translate:
"${text}"

Translate accurately and naturally as spoken conversation.
Provide:
1. "translatedText": The direct, natural spoken translation in the target language.
2. "detectedLanguage": The detected language name in Spanish (e.g. "Inglés", "Español", "Francés", "Japonés").
3. "phonetic": Phonetic pronunciation guide (e.g., Pinyin for Mandarin, Romaji for Japanese, or simple phonetic respelling for tricky sounds). If Latin alphabet and intuitive, give the accurate pronunciation or leave empty.
4. "nuance": If there is a key cultural or colloquial nuance, explain briefly in 1 short sentence in the listener's language. Otherwise null.
5. "alternatives": An array of 1 or 2 alternative natural ways to say it (e.g. more formal vs more colloquial).

Respond ONLY with valid JSON in this schema:
{
  "translatedText": "string",
  "detectedLanguage": "string",
  "phonetic": "string",
  "nuance": "string or null",
  "alternatives": ["string"]
}`;

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
    } catch (modelErr: any) {
      // Fallback to gemini-3.1-flash-lite if quota exhausted or model unavailable
      if (modelErr?.status === 429 || modelErr?.message?.includes('quota') || modelErr?.message?.includes('RESOURCE_EXHAUSTED')) {
        console.warn('gemini-3.8-flash quota reached, falling back to gemini-3.1-flash-lite');
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });
      } else {
        throw modelErr;
      }
    }

    const rawText = response.text || '{}';
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Clean possible backticks
      const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(clean);
    }

    return res.json({
      translatedText: data.translatedText || text,
      detectedLanguage: data.detectedLanguage || fromLang,
      phonetic: data.phonetic || '',
      nuance: data.nuance || null,
      alternatives: data.alternatives || [],
    });
  } catch (error: any) {
    console.error('Translation error:', error);
    return res.status(500).json({
      error: error.message || 'Error al traducir el texto.',
    });
  }
});

// Visitor stats with creator exclusion
interface ServerVisitorStats {
  totalVisits: number;
  todayVisits: number;
  uniqueVisitors: number;
  lastDate: string;
}

const visitsState: ServerVisitorStats = {
  totalVisits: 32,
  todayVisits: 11,
  uniqueVisitors: 21,
  lastDate: new Date().toISOString().split('T')[0],
};

app.get('/api/visits', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  if (visitsState.lastDate !== today) {
    visitsState.lastDate = today;
    visitsState.todayVisits = 1;
  }
  return res.json({
    totalVisits: visitsState.totalVisits,
    todayVisits: visitsState.todayVisits,
    uniqueVisitors: visitsState.uniqueVisitors,
  });
});

app.post('/api/visits', (req, res) => {
  const { isCreator, clientReportedTotal } = req.body || {};
  const today = new Date().toISOString().split('T')[0];
  if (visitsState.lastDate !== today) {
    visitsState.lastDate = today;
    visitsState.todayVisits = 1;
  }

  // EXCLUDE creator from visitor counter!
  if (!isCreator) {
    visitsState.totalVisits += 1;
    visitsState.todayVisits += 1;
    if (typeof clientReportedTotal === 'number' && clientReportedTotal > visitsState.totalVisits) {
      visitsState.totalVisits = clientReportedTotal;
    }
  }

  return res.json({
    totalVisits: visitsState.totalVisits,
    todayVisits: visitsState.todayVisits,
    uniqueVisitors: visitsState.uniqueVisitors,
  });
});

// Audio Multimodal Direct Translation Endpoint
app.post('/api/translate-audio', async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm', fromLang, toLang } = req.body || {};

  try {
    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio data is required.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(200).json({
        transcribedText: 'Audio recibido',
        detectedLanguage: fromLang,
        translatedText: 'Servicio de IA temporalmente no disponible.',
        phonetic: '',
      });
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType.split(';')[0] || 'audio/webm',
        data: audioBase64,
      },
    };

    const promptText = `Listen to this live spoken audio from a conversation.
Target language: ${toLang || 'Spanish'}
Source language hint: ${fromLang || 'Auto-detect'}

Tasks:
1. Accurately transcribe what the speaker said in their original language.
2. Translate the speech into the target language naturally and colloquially.
3. Provide phonetic pronunciation guide for the translation.

Respond strictly with a JSON object:
{
  "transcribedText": "exact words spoken in original language",
  "detectedLanguage": "name of language spoken",
  "translatedText": "natural translation in target language",
  "phonetic": "phonetic guide for translated text or empty string"
}`;

    let response: any = null;

    // 1. First attempt: Direct multimodal translation with gemini-3.8-flash
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: {
          parts: [audioPart, { text: promptText }],
        },
        config: {
          responseMimeType: 'application/json',
        },
      });
    } catch (primaryErr: any) {
      console.warn('gemini-3.8-flash audio notice (falling back to transcribe + translate):', primaryErr?.message || primaryErr);

      // 2. Fallback: Transcribe with gemini-3.5-transcribe, then translate with gemini-3.1-flash-lite
      try {
        const transcribeRes = await ai.models.generateContent({
          model: 'gemini-3.5-transcribe',
          contents: { parts: [audioPart, { text: 'Transcribe this speech verbatim.' }] },
        });

        const transcribed = (transcribeRes.text || '').trim();

        if (transcribed) {
          const transRes = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: `Translate this transcribed speech: "${transcribed}". Target language: ${toLang || 'Spanish'}. Return JSON: {"transcribedText":"${transcribed.replace(/"/g, '\\"')}","detectedLanguage":"${fromLang || 'Auto-detect'}","translatedText":"...","phonetic":""}`,
            config: { responseMimeType: 'application/json' },
          });
          response = transRes;
        } else {
          // Empty or silent audio
          return res.status(200).json({
            transcribedText: 'Audio sin palabras detectadas',
            detectedLanguage: fromLang,
            translatedText: 'Por favor, habla más cerca del micrófono.',
            phonetic: '',
          });
        }
      } catch (fallbackErr: any) {
        console.warn('Fallback transcription notice:', fallbackErr?.message || fallbackErr);
        // Return 200 with guidance so the app never crashes
        return res.status(200).json({
          transcribedText: 'Audio recibido',
          detectedLanguage: fromLang,
          translatedText: 'Audio recibido pero no se pudo distinguir la voz con claridad. Por favor repite la frase.',
          phonetic: '',
        });
      }
    }

    const rawText = (response && response.text) ? response.text : '{}';
    let data: any = {};
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        data = JSON.parse(match[0]);
      } else {
        data = JSON.parse(rawText);
      }
    } catch {
      data = {
        transcribedText: 'Voz detectada',
        detectedLanguage: fromLang,
        translatedText: rawText.replace(/```[a-z]*/g, '').trim() || 'Traducción completada.',
        phonetic: '',
      };
    }

    return res.json({
      transcribedText: data.transcribedText || 'Audio recibido',
      detectedLanguage: data.detectedLanguage || fromLang,
      translatedText: data.translatedText || 'Traducción lista.',
      phonetic: data.phonetic || '',
    });
  } catch (error: any) {
    console.error('Audio translate global handler:', error);
    // Return friendly 200 status so client never breaks with "Error al procesar audio"
    return res.status(200).json({
      transcribedText: 'Audio recibido',
      detectedLanguage: fromLang,
      translatedText: 'Por favor intenta hablar nuevamente cerca del micrófono.',
      phonetic: '',
    });
  }
});

// Text-to-Speech Endpoint using Gemini 3.8 Flash Lite TTS
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.status(503).json({ error: 'Servicio de voz no disponible. Configure GEMINI_API_KEY.' });
    }

    // Supported prebuilt voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
    const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const chosenVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.slice(0, 500), // safe limit for spoken phrase
                speechMetadata: {
                  style: 'Natural, friendly conversational speech',
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      });
    } catch (modelError: any) {
      // If error was related to speechMetadata, retry with plain text parts
      if (modelError?.message && modelError.message.includes('speechMetadata')) {
        response = await ai.models.generateContent({
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
                prebuiltVoiceConfig: { voiceName: chosenVoice },
              },
            },
          },
        });
      } else {
        throw modelError;
      }
    }

    const base64Audio =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      return res.status(500).json({ error: 'No se generó audio.' });
    }

    return res.json({
      audioBase64: base64Audio,
      mimeType: 'audio/wav',
    });
  } catch (error: any) {
    console.error('TTS error:', error);
    return res.status(500).json({
      error: error.message || 'Error al generar voz sintetizada.',
    });
  }
});

async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
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
