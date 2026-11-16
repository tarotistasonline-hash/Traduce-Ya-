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
    mpVerificationEnabled: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
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
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });
    } catch (primaryErr: any) {
      console.warn('gemini-3.1-flash-lite translate fallback to gemini-4-hydrogen:', primaryErr?.message || primaryErr);
      response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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

// Feedback & Payment Notice Endpoints
const FEEDBACK_FILE = path.join(__dirname, 'feedback_messages.json');

function readFeedbackMessages(): any[] {
  try {
    if (fs.existsSync(FEEDBACK_FILE)) {
      const raw = fs.readFileSync(FEEDBACK_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.warn('Could not read feedback_messages.json:', err);
  }
  return [];
}

function writeFeedbackMessages(items: any[]) {
  try {
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(items.slice(0, 200), null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write feedback_messages.json:', err);
  }
}

app.get('/api/feedback', (req, res) => {
  const items = readFeedbackMessages();
  return res.json({ items });
});

app.post('/api/feedback', (req, res) => {
  try {
    const { type = 'suggestion', message, contact, activeLanguagePair, deviceInfo, url, timestamp } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'El mensaje es obligatorio.' });
    }
    const items = readFeedbackMessages();
    const newItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: ['issue', 'suggestion', 'praise', 'payment'].includes(type) ? type : 'suggestion',
      message: message.trim().slice(0, 2000),
      contact: typeof contact === 'string' ? contact.trim().slice(0, 200) : undefined,
      activeLanguagePair,
      deviceInfo: typeof deviceInfo === 'string' ? deviceInfo.slice(0, 200) : undefined,
      url: typeof url === 'string' ? url.slice(0, 300) : undefined,
      timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
    };
    items.unshift(newItem);
    writeFeedbackMessages(items);
    return res.json({ ok: true, item: newItem });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Error al guardar el mensaje.' });
  }
});

// Mercado Pago Operation Verification Endpoint
const VERIFIED_PAYMENTS_FILE = path.join(__dirname, 'verified_payments.json');

interface VerifiedPaymentRecord {
  operationId: string;
  amount?: number;
  currency?: string;
  verifiedAt: number;
  contact?: string;
}

function readVerifiedPayments(): VerifiedPaymentRecord[] {
  try {
    if (fs.existsSync(VERIFIED_PAYMENTS_FILE)) {
      const raw = fs.readFileSync(VERIFIED_PAYMENTS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.warn('Could not read verified_payments.json:', err);
  }
  return [];
}

function writeVerifiedPayments(records: VerifiedPaymentRecord[]) {
  try {
    fs.writeFileSync(VERIFIED_PAYMENTS_FILE, JSON.stringify(records.slice(0, 2000), null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write verified_payments.json:', err);
  }
}

app.post('/api/verify-mercadopago', async (req, res) => {
  try {
    const { operationId, contact } = req.body || {};
    const cleanId = String(operationId || '').trim().replace(/\D/g, '');

    if (!cleanId || cleanId.length < 6 || cleanId.length > 20) {
      return res.status(400).json({
        ok: false,
        error: 'Ingresa un número de operación válido de Mercado Pago (solo números, ej: 12345678901).',
      });
    }

    const cleanContact = typeof contact === 'string' ? contact.trim().slice(0, 200) : '';
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

    // If MERCADOPAGO_ACCESS_TOKEN is NOT configured yet, register safely in Buzón for owner review
    if (!mpToken) {
      const items = readFeedbackMessages();
      items.unshift({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: 'payment',
        message: `NÚMERO DE OPERACIÓN MERCADO PAGO: ${cleanId}\n(Verificación automática pendiente: configura MERCADOPAGO_ACCESS_TOKEN en el servidor o envía un código al comprador).`,
        contact: cleanContact || 'Sin contacto informado',
        timestamp: Date.now(),
      });
      writeFeedbackMessages(items);

      return res.status(202).json({
        ok: true,
        verified: false,
        pendingManualReview: true,
        message: `¡Recibimos tu número de operación (#${cleanId})! En breve confirmaremos el comprobante y te enviaremos tu acceso.`,
      });
    }

    // Check if operation ID was already claimed
    const existingRecords = readVerifiedPayments();
    if (existingRecords.some((r) => r.operationId === cleanId)) {
      return res.status(409).json({
        ok: false,
        error: 'Este número de operación ya fue utilizado anteriormente para activar un Pase Ilimitado.',
      });
    }

    // Verify directly against Mercado Pago Payments API
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(cleanId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!mpResponse.ok) {
      if (mpResponse.status === 404) {
        return res.status(404).json({
          ok: false,
          error: 'No encontramos ese número de operación en Mercado Pago. Revisa tu comprobante e inténtalo de nuevo.',
        });
      }
      return res.status(502).json({
        ok: false,
        error: 'No se pudo consultar Mercado Pago en este momento. Intenta nuevamente en unos segundos.',
      });
    }

    const paymentData: any = await mpResponse.json();
    const status = String(paymentData?.status || '').toLowerCase();

    if (status === 'pending' || status === 'in_process' || status === 'authorized') {
      return res.status(400).json({
        ok: false,
        error: 'Tu pago aún figura como pendiente en Mercado Pago. Espera unos segundos a que se acredite y vuelve a intentar.',
      });
    }

    if (status !== 'approved') {
      return res.status(400).json({
        ok: false,
        error: `El pago en Mercado Pago figura como "${status || 'no aprobado'}" y no puede activar el Pase Ilimitado.`,
      });
    }

    // Approved! Save verified operation ID and record in Buzón
    existingRecords.unshift({
      operationId: cleanId,
      amount: typeof paymentData.transaction_amount === 'number' ? paymentData.transaction_amount : undefined,
      currency: typeof paymentData.currency_id === 'string' ? paymentData.currency_id : undefined,
      verifiedAt: Date.now(),
      contact: cleanContact || undefined,
    });
    writeVerifiedPayments(existingRecords);

    const items = readFeedbackMessages();
    items.unshift({
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type: 'payment',
      message: `PAGO APROBADO Y DESBLOQUEADO AUTOMÁTICAMENTE\nOperación Mercado Pago: #${cleanId}\nMonto: ${paymentData.transaction_amount ?? ''} ${paymentData.currency_id ?? ''}`,
      contact: cleanContact || undefined,
      timestamp: Date.now(),
    });
    writeFeedbackMessages(items);

    return res.json({
      ok: true,
      verified: true,
      message: '¡Pago verificado con Mercado Pago! Tu Pase Ilimitado ha sido activado.',
    });
  } catch (err: any) {
    console.error('Mercado Pago verify error:', err);
    return res.status(500).json({
      ok: false,
      error: 'Ocurrió un error al verificar el pago. Intenta nuevamente.',
    });
  }
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

    // 1. Primary: Direct multimodal translation with gemini-3.1-flash-lite
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
    } catch (primaryErr: any) {
      lastError = primaryErr;
      console.warn('gemini-3.1-flash-lite audio notice (trying gemini-4-hydrogen):', primaryErr?.message || primaryErr);

      // 2. Fallback: Direct multimodal translation with gemini-4-hydrogen (low thinking for fast audio response)
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
      } catch (fallbackErr: any) {
        lastError = fallbackErr;
        console.error('Audio translation models failed:', fallbackErr?.message || fallbackErr);
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

// Text-to-Speech Endpoint using browser synthesis fallback or Gemini TTS if supported
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    const ai = getAiClient();
    if (!ai) {
      return res.json({ audioBase64: null });
    }

    const allowedVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];
    const chosenVoice = allowedVoices.includes(voiceName) ? voiceName : 'Kore';

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: text.slice(0, 500) }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (base64Audio) {
        return res.json({
          audioBase64: base64Audio,
          mimeType: 'audio/wav',
        });
      }
    } catch {
      // Fallback silently to browser speech synthesis
    }

    return res.json({ audioBase64: null });
  } catch {
    return res.json({ audioBase64: null });
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
        ws: false,
      },
      appType: 'spa',
    });

    // HMR is disabled in this preview environment; serve a clean no-op Vite client shim
    // so CSS/React transforms work without opening failing WebSocket connections.
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(`
const sheetsMap = new Map();
const linkSheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
  document.querySelectorAll('link[rel="stylesheet"][data-vite-dev-id]').forEach((el) => {
    linkSheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
let lastInsertedStyle;
export function updateStyle(id, content) {
  if (linkSheetsMap.has(id)) return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    if (!lastInsertedStyle) {
      document.head.appendChild(style);
      setTimeout(() => { lastInsertedStyle = undefined; }, 0);
    } else {
      lastInsertedStyle.insertAdjacentElement('afterend', style);
    }
    lastInsertedStyle = style;
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  if (linkSheetsMap.has(id)) {
    document.querySelectorAll(\`link[rel="stylesheet"][data-vite-dev-id="\${CSS.escape(id)}"]\`).forEach((el) => el.remove());
    linkSheetsMap.delete(id);
  }
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
  }
  sheetsMap.delete(id);
}
export function createHotContext() {
  return {
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
export function injectQuery(url) {
  return url;
}
const BaseHTMLElement = typeof globalThis.HTMLElement === 'function' ? globalThis.HTMLElement : class {};
export class ErrorOverlay extends BaseHTMLElement {}
`);
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
