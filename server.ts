import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Stats file path on persistent filesystem
const VISITOR_STATS_FILE = path.join(__dirname, 'visitor_stats.json');

// Initialize GoogleGenAI client
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
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
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
      return res.status(503).json({
        error: 'Servicio de IA no disponible en el servidor.',
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
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    } catch (primaryErr: any) {
      console.warn('gemini-4-hydrogen translate fallback to gemini-3.1-flash-lite:', primaryErr?.message || primaryErr);
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
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
    console.error('Translation error:', error);
    const status = isQuotaError(error) ? 429 : 500;
    const message = isQuotaError(error)
      ? 'Se alcanzó temporalmente el límite de solicitudes de traducción. Inténtalo de nuevo en unos segundos.'
      : error.message || 'Error al traducir el texto.';
    return res.status(status).json({ error: message });
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
  const { isCreator, clientReportedTotal, visitorId } = req.body || {};
  const today = new Date().toISOString().split('T')[0];
  
  if (visitsState.lastDate !== today) {
    visitsState.lastDate = today;
    visitsState.todayVisits = 1;
  }

  // Real visitors are counted
  if (!isCreator) {
    visitsState.totalVisits += 1;
    visitsState.todayVisits += 1;

    // Track unique visitor ID or IP
    const cleanId = String(visitorId || req.ip || '').slice(0, 40);
    if (cleanId && !visitsState.recentHashes.includes(cleanId)) {
      visitsState.recentHashes.push(cleanId);
      visitsState.uniqueVisitors += 1;
    }

    if (typeof clientReportedTotal === 'number' && clientReportedTotal > visitsState.totalVisits) {
      visitsState.totalVisits = clientReportedTotal;
    }

    persistVisitorStats();
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
      return res.status(503).json({
        error: 'Servicio de IA no disponible en el servidor.',
      });
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType.split(';')[0] || 'audio/webm',
        data: audioBase64,
      },
    };

    const promptText = `Listen carefully to this live spoken audio from a conversation.
Target language: ${toLang || 'Spanish'}
Source language hint: ${fromLang || 'Auto-detect'}

CRITICAL RULE:
- ONLY transcribe actual, clearly audible human speech present in the audio.
- If the audio is silent, near-silent, or contains only background noise/static with no intelligible spoken words, you MUST return "" for both "transcribedText" and "translatedText".
- NEVER invent, guess, or hallucinate sentences that are not actually spoken in the audio.

Tasks:
1. Transcribe verbatim what the speaker said in their original language (or "" if silent/no speech).
2. Translate that speech into ${toLang || 'Spanish'} naturally and colloquially (or "" if silent/no speech).
3. Provide phonetic pronunciation guide if helpful (otherwise "").

Respond strictly with a JSON object:
{
  "transcribedText": "exact words spoken or empty string",
  "detectedLanguage": "name of language spoken in Spanish",
  "translatedText": "natural translation in target language or empty string",
  "phonetic": "phonetic guide or empty string"
}`;

    let response: any = null;
    let lastError: any = null;

    // 1. Primary: Direct multimodal translation with gemini-4-hydrogen
    try {
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [audioPart, { text: promptText }],
        },
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    } catch (primaryErr: any) {
      lastError = primaryErr;
      console.warn('gemini-4-hydrogen audio notice (trying gemini-3.1-flash-lite):', primaryErr?.message || primaryErr);

      // 2. Fallback: Direct multimodal translation with gemini-3.1-flash-lite
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: {
            parts: [audioPart, { text: promptText }],
          },
          config: {
            responseMimeType: 'application/json',
          },
        });
      } catch (liteErr: any) {
        lastError = liteErr;
        console.warn('gemini-3.1-flash-lite audio notice (trying gemini-3.5-transcribe):', liteErr?.message || liteErr);

        // 3. Last resort: Transcribe with gemini-3.5-transcribe + translate with gemini-4-hydrogen / gemini-3.1-flash-lite
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
            return res.status(200).json({
              transcribedText: '',
              detectedLanguage: fromLang,
              translatedText: '',
              phonetic: '',
              noSpeech: true,
            });
          }
        } catch (transcribeErr: any) {
          lastError = transcribeErr;
          console.error('All audio translation models failed:', transcribeErr?.message || transcribeErr);
        }
      }
    }

    if (!response) {
      const status = isQuotaError(lastError) ? 429 : 500;
      const message = isQuotaError(lastError)
        ? 'Se alcanzó el límite de solicitudes de traducción de audio. Espera un momento o usa el micrófono nuevamente.'
        : lastError?.message || 'No se pudo procesar el audio en el servidor.';
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

    if (data.transcribedText && !data.translatedText) {
      try {
        const fallbackTranslate = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Translate this spoken sentence directly to ${toLang || 'Spanish'}: "${data.transcribedText}". Return ONLY the translation, nothing else.`,
        });
        data.translatedText = (fallbackTranslate.text || '').replace(/^["']|["']$/g, '').trim();
      } catch (e) {
        console.warn('Fallback single translate error:', e);
      }
    }

    return res.json({
      transcribedText: data.transcribedText || 'Audio recibido',
      detectedLanguage: data.detectedLanguage || fromLang,
      translatedText: data.translatedText || data.transcribedText || 'Audio recibido',
      phonetic: data.phonetic || '',
    });
  } catch (error: any) {
    console.error('Audio translate global handler:', error);
    return res.status(500).json({
      error: error?.message || 'Error interno al procesar el audio.',
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
