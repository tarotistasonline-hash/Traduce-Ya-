import express from 'express';
import http from 'http';
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

// Initialize GoogleGenAI client
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: 'v1beta',
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const aiTts = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: 'v1alpha',
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Health check / status
app.get('/api/status', (req, res) => {
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY,
    status: 'ok',
  });
});

// Google Search Console verification endpoint
app.get('/googlee814d7c05b3fbac6.html', (req, res) => {
  res.type('text/html').send('google-site-verification: googlee814d7c05b3fbac6.html');
});

// Digital Asset Links endpoint for Google Play verification
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.type('application/json').send(JSON.stringify([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "app.run.europe_west1.traductor_ya_traductor_de_voz_y_conversaci_n_633978869738.twa",
        sha256_cert_fingerprints: [
          "1A:85:DA:BC:7C:3B:BA:0B:DF:16:97:3A:92:F0:E6:13:27:6B:0F:E9:D3:FB:DB:78:C3:0B:45:EF:6F:2B:20:3C"
        ]
      }
    }
  ], null, 2));
});


// Translation Endpoint
app.post('/api/translate', async (req, res) => {
  try {
    const { text, fromLang, toLang, tone = 'natural' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for translation.' });
    }

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
Language Detection rules:
- If Source language request is 'Auto-detect', 'auto', or 'Detectar idioma', analyze the words, vocabulary, and grammar of the input text to identify the spoken language (e.g. "Inglés", "Francés", "Alemán", "Italiano", "Portugués", "Japonés", "Chino", "Ruso", "Árabe", "Coreano", "Español", etc.) and return that language name in Spanish in "detectedLanguage".
- If the detected source language happens to be the same as the target language, translate into the counterpart language (e.g. if source is Spanish and target was requested as Spanish, translate into English).

Provide:
1. "translatedText": The direct, natural spoken translation in the target language.
2. "detectedLanguage": The detected language name in Spanish (e.g. "Inglés", "Francés", "Alemán", "Español", etc.).
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

    const candidateModels = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
    ];

    let response: any = null;
    let lastError: any = null;

    for (const model of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });
          if (response && response.text) {
            break;
          }
        } catch (err: any) {
          console.warn(`[Translate] Model ${model} (attempt ${attempt + 1}) error:`, err?.status || err?.message || err);
          lastError = err;
          // If 503, brief pause before retry or next model
          if (attempt === 0 && (String(err?.message).includes('503') || err?.status === 503)) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }
      if (response && response.text) {
        break;
      }
    }

    if (!response || !response.text) {
      console.error('[Translate] All models failed. Last error:', lastError);
      throw lastError || new Error('No se pudo traducir con los modelos disponibles.');
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

// Audio Multimodal Direct Translation Endpoint
app.post('/api/translate-audio', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', fromLang, toLang } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio data is required.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'Servicio de IA no disponible.' });
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

    const audioModels = [
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3.8-flash',
    ];

    let response: any = null;
    let lastError: any = null;

    for (const model of audioModels) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: [audioPart, { text: promptText }],
          config: {
            responseMimeType: 'application/json',
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('No se pudo procesar el audio.');
    }

    const rawText = response.text || '{}';
    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      data = JSON.parse(clean);
    }

    return res.json({
      transcribedText: data.transcribedText || '',
      detectedLanguage: data.detectedLanguage || fromLang,
      translatedText: data.translatedText || '',
      phonetic: data.phonetic || '',
    });
  } catch (error: any) {
    console.error('Audio translate error:', error);
    return res.status(500).json({
      error: error.message || 'Error al procesar el audio.',
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

    const ttsClient = aiTts || ai;
    if (!ttsClient) {
      return res.status(503).json({ error: 'Servicio de voz no disponible.' });
    }

    // Supported prebuilt voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
    const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const chosenVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

    const response = await ttsClient.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: text.slice(0, 500),
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

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
  const httpServer = http.createServer(app);

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Traductor Ya server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
