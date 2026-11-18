import { useState, useEffect, useRef, useCallback } from 'react';
import { generateAiSpeech } from '../services/geminiService';

interface UseSpeechSynthesisOptions {
  useAiVoice?: boolean;
  voiceName?: string;
  defaultRate?: number;
}

export function useSpeechSynthesis({
  useAiVoice = false,
  voiceName = 'Kore',
  defaultRate = 1.0,
}: UseSpeechSynthesisOptions = {}) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const speakGenerationRef = useRef(0);
  const browserSpeakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingResolveRef = useRef<(() => void) | null>(null);

  const settlePendingSpeak = useCallback(() => {
    if (pendingResolveRef.current) {
      const resolve = pendingResolveRef.current;
      pendingResolveRef.current = null;
      resolve();
    }
  }, []);

  // Load available browser voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list && list.length > 0) {
        setVoices(list);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const stop = useCallback(() => {
    speakGenerationRef.current += 1;
    if (browserSpeakTimerRef.current) {
      clearTimeout(browserSpeakTimerRef.current);
      browserSpeakTimerRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onerror = null;
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    activeUtteranceRef.current = null;
    setIsSpeaking(false);
    settlePendingSpeak();
  }, [settlePendingSpeak]);

  const fallbackBrowserSpeak = useCallback(
    (text: string, langCode: string, rate: number, generation: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
          setIsSpeaking(false);
          resolve();
          return;
        }

        const finish = () => {
          if (pendingResolveRef.current === finish) {
            pendingResolveRef.current = null;
          }
          activeUtteranceRef.current = null;
          setIsSpeaking(false);
          resolve();
        };

        pendingResolveRef.current = finish;

        const startUtterance = () => {
          if (speakGenerationRef.current !== generation) {
            finish();
            return;
          }

          try {
            const utterance = new SpeechSynthesisUtterance(text);
            // Retain reference so Chromium GC cannot drop the utterance mid-sentence
            activeUtteranceRef.current = utterance;
            utterance.rate = Math.max(0.7, Math.min(1.5, rate));
            utterance.lang = langCode;

            const currentVoices =
              voices.length > 0 ? voices : window.speechSynthesis.getVoices() || [];
            const langPrefix = langCode.split('-')[0].toLowerCase();
            const matchVoice =
              currentVoices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase()) ||
              currentVoices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));

            if (matchVoice) {
              utterance.voice = matchVoice;
            }

            // Safety cap in case a mobile WebView fails to emit onend
            const maxWaitMs = Math.min(25000, Math.max(4000, text.length * 140));
            const safetyTimer = setTimeout(() => {
              finish();
            }, maxWaitMs);

            utterance.onend = () => {
              clearTimeout(safetyTimer);
              finish();
            };
            utterance.onerror = (e) => {
              clearTimeout(safetyTimer);
              console.warn('Utterance error:', e);
              finish();
            };

            window.speechSynthesis.speak(utterance);
          } catch (err) {
            console.warn('Browser TTS failed:', err);
            finish();
          }
        };

        // On Android Chrome, calling speak() in the exact same tick after cancel() aborts the utterance
        const wasBusy = window.speechSynthesis.speaking || window.speechSynthesis.pending;
        if (wasBusy) {
          window.speechSynthesis.cancel();
          browserSpeakTimerRef.current = setTimeout(startUtterance, 70);
        } else {
          startUtterance();
        }
      });
    },
    [voices]
  );

  const playAudioDataUrl = useCallback(
    (base64Audio: string, targetSpeed: number, generation: number): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        try {
          const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
          audio.playbackRate = targetSpeed;
          audioPlayerRef.current = audio;

          const cleanup = (ok: boolean) => {
            if (audioPlayerRef.current === audio) {
              audioPlayerRef.current = null;
            }
            if (ok) {
              setIsSpeaking(false);
            }
            resolve(ok);
          };

          audio.onended = () => cleanup(true);
          audio.onerror = () => cleanup(false);

          if (speakGenerationRef.current !== generation) {
            cleanup(false);
            return;
          }

          audio.play().catch(() => cleanup(false));
        } catch {
          resolve(false);
        }
      });
    },
    []
  );

  const speak = useCallback(
    async (
      text: string,
      langCode: string = 'en-US',
      options?: {
        speed?: number;
        preferAi?: boolean;
        cachedAudioBase64?: string;
      }
    ): Promise<void> => {
      if (!text || !text.trim()) return;

      stop();
      const generation = speakGenerationRef.current;
      setIsSpeaking(true);

      const targetSpeed = options?.speed ?? defaultRate;
      const shouldUseAi = options?.preferAi ?? useAiVoice;

      // 1. Precomputed AI WAV audio base64
      if (options?.cachedAudioBase64) {
        const played = await playAudioDataUrl(options.cachedAudioBase64, targetSpeed, generation);
        if (played || speakGenerationRef.current !== generation) return;
      }

      // 2. On-demand AI voice if enabled
      if (shouldUseAi) {
        try {
          const aiAudioBase64 = await generateAiSpeech(text, voiceName);
          if (speakGenerationRef.current !== generation) return;
          if (aiAudioBase64) {
            const played = await playAudioDataUrl(aiAudioBase64, targetSpeed, generation);
            if (played || speakGenerationRef.current !== generation) return;
          }
        } catch (err) {
          console.warn('AI voice generation fallback to browser:', err);
        }
      }

      if (speakGenerationRef.current !== generation) return;

      // 3. Browser native SpeechSynthesis
      await fallbackBrowserSpeak(text, langCode, targetSpeed, generation);
    },
    [defaultRate, fallbackBrowserSpeak, playAudioDataUrl, stop, useAiVoice, voiceName]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isSpeaking,
    speak,
    stop,
    availableVoicesCount: voices.length,
  };
}
