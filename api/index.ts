import express from 'express';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const FALLBACK_API_ORIGIN = 'https://traductor-ya-traductor-de-voz-y-conversaci-n.ai.studio';

const app = express();
app.use(express.json({ limit: '25mb' }));

// Normalize Vercel rewrite query param (?__path=translate -> /api/translate)
app.use((req, _res, next) => {
  const rawPath = req.query?.__path;
  if (typeof rawPath === 'string' && rawPath.length > 0) {
    const normalized = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    req.url = `/api${normalized}`;
  } else if (Array.isArray(rawPath) && rawPath.length > 0) {
    req.url = `/api/${rawPath.join('/')}`;
  } else if (req.url === '/api/index' || req.url.startsWith('/api/index?')) {
    req.url = '/api/status';
  }
  next();
});

let aiClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined = undefined;

function getAiClient(): GoogleGenAI | null {
  const currentKey = process.env.GEMINI_API_KEY?.trim();
  if (!currentKey) return null;

  if (!aiClient || cachedApiKey !== currentKey) {
    cachedApiKey = currentKey;
    aiClient = new GoogleGenAI({ apiKey: currentKey });
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

function isUnavailableError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return (
    err?.status === 503 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.toLowerCase().includes('high demand')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function proxyToFallbackOrigin(req: express.Request, res: express.Response) {
  try {
    const targetPath = req.url.startsWith('/api') ? req.url : `/api${req.url}`;
    const targetUrl = `${FALLBACK_API_ORIGIN}${targetPath}`;
    const isGetOrHead = req.method === 'GET' || req.method === 'HEAD';

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: isGetOrHead ? undefined : JSON.stringify(req.body ?? {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (err: any) {
    return res.status(502).json({
      error: err?.message || 'No se pudo conectar con el servidor de traducción.',
    });
  }
}

app.get('/api/status', (_req, res) => {
  return res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY?.trim(),
    mpVerificationEnabled: !!process.env.MERCADOPAGO_ACCESS_TOKEN?.trim(),
    runtime: 'vercel',
    version: 4,
    status: 'ok',
  });
});

app.post('/api/translate', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    return proxyToFallbackOrigin(req, res);
  }

  try {
    const { text, fromLang, toLang, tone = 'natural' } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for translation.' });
    }

    const startedAt = Date.now();
    const prompt = `Real-time spoken interpreter (${tone}). Translate from ${fromLang || 'Auto-detect'} to ${toLang || 'Spanish'}:
"${text}"

Return ONLY compact JSON:
{"translatedText":"natural spoken translation","detectedLanguage":"Spanish name of source language (e.g. Español, Inglés)","phonetic":"phonetic hint if non-Latin else empty string","nuance":null,"alternatives":["1 brief natural alternative"]}`;

    let response;
    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        3800,
        'gemini-3.1-flash-lite translate'
      );
    } catch (primaryErr: any) {
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          4600,
          'gemini-4-hydrogen translate'
        );
      } catch (fallbackErr: any) {
        if (
          (isUnavailableError(fallbackErr) || isUnavailableError(primaryErr)) &&
          Date.now() - startedAt < 5200
        ) {
          await new Promise((r) => setTimeout(r, 250));
          response = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.1-flash-lite',
              contents: prompt,
              config: { responseMimeType: 'application/json', temperature: 0.2 },
            }),
            3500,
            'gemini-3.1-flash-lite retry'
          );
        } else {
          throw fallbackErr;
        }
      }
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
    const status = isQuotaError(error) ? 429 : isUnavailableError(error) ? 503 : 500;
    const message = isQuotaError(error)
      ? 'Se alcanzó temporalmente el límite de solicitudes de traducción. Inténtalo de nuevo en unos segundos.'
      : isUnavailableError(error)
      ? 'El motor de traducción está con alta demanda temporal. Intenta de nuevo en unos segundos.'
      : error?.message || 'Error al traducir el texto.';
    return res.status(status).json({ error: message });
  }
});

app.post('/api/translate-audio', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    return proxyToFallbackOrigin(req, res);
  }

  const { audioBase64, mimeType = 'audio/webm', fromLang, toLang } = req.body || {};

  try {
    if (!audioBase64) {
      return res.status(400).json({ error: 'Audio data is required.' });
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType.split(';')[0] || 'audio/webm',
        data: audioBase64,
      },
    };

    const promptText = `Transcribe and translate spoken audio from ${fromLang || 'Auto-detect'} to ${toLang || 'Spanish'}.
If silent or no clear human speech, return "" for transcribedText and translatedText. Never invent speech.
Return ONLY compact JSON:
{"transcribedText":"exact speech or empty","detectedLanguage":"language in Spanish","translatedText":"natural translation or empty","phonetic":""}`;

    let response: any = null;
    let lastError: any = null;

    try {
      response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: { parts: [audioPart, { text: promptText }] },
          config: { responseMimeType: 'application/json', temperature: 0.2 },
        }),
        4500,
        'gemini-3.1-flash-lite audio'
      );
    } catch (primaryErr: any) {
      lastError = primaryErr;
      try {
        response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: { parts: [audioPart, { text: promptText }] },
            config: {
              responseMimeType: 'application/json',
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          4800,
          'gemini-4-hydrogen audio'
        );
      } catch (fallbackErr: any) {
        lastError = fallbackErr;
      }
    }

    if (!response) {
      const status = isQuotaError(lastError) ? 429 : isUnavailableError(lastError) ? 503 : 500;
      const message = isQuotaError(lastError)
        ? 'Se alcanzó el límite de solicitudes de traducción de audio. Espera un momento o usa el micrófono nuevamente.'
        : isUnavailableError(lastError)
        ? 'El motor de traducción de audio está con alta demanda temporal. Intenta de nuevo en unos segundos.'
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

    return res.json({
      transcribedText: data.transcribedText || 'Audio recibido',
      detectedLanguage: data.detectedLanguage || fromLang,
      translatedText: data.translatedText || data.transcribedText || 'Audio recibido',
      phonetic: data.phonetic || '',
    });
  } catch (error: any) {
    return res.status(500).json({
      error: error?.message || 'Error interno al procesar el audio.',
    });
  }
});

app.post('/api/tts', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    return proxyToFallbackOrigin(req, res);
  }

  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for TTS.' });
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [{ role: 'user', parts: [{ text: text.slice(0, 500) }] }],
        config: { responseModalities: ['AUDIO'] },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return res.json({ audioBase64: base64Audio, mimeType: 'audio/wav' });
      }
    } catch {
      // Fallback silently to browser speech synthesis
    }

    return res.json({ audioBase64: null });
  } catch {
    return res.json({ audioBase64: null });
  }
});

app.post('/api/verify-mercadopago', async (req, res) => {
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();

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

    const recordPendingManualReview = async () => {
      try {
        await fetch(`${FALLBACK_API_ORIGIN}/api/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'payment',
            message: `NÚMERO DE OPERACIÓN MERCADO PAGO: #${cleanId}\n(Confirmación manual pendiente: verificar acreditación y enviar código al comprador).`,
            contact: cleanContact || 'Sin contacto informado',
            timestamp: Date.now(),
          }),
        });
      } catch {
        // Non-blocking best-effort logging to Buzón
      }

      return res.status(202).json({
        ok: true,
        verified: false,
        pendingManualReview: true,
        message: `¡Registramos tu número de operación (#${cleanId})! Para enviarte tu código de activación enseguida, toca el botón abajo para avisarnos a azulbaires@gmail.com.`,
      });
    };

    if (!mpToken) {
      return await recordPendingManualReview();
    }

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
      return await recordPendingManualReview();
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

    return res.json({
      ok: true,
      verified: true,
      message: '¡Pago verificado con Mercado Pago! Tu Pase Ilimitado ha sido activado.',
    });
  } catch {
    return res.status(500).json({
      ok: false,
      error: 'Ocurrió un error al verificar el pago. Intenta nuevamente.',
    });
  }
});

// Forward /api/visits and /api/feedback (or any remaining /api/*) cleanly
app.use('/api', (req, res) => {
  return proxyToFallbackOrigin(req, res);
});

export default app;
