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
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (
      text: string,
      langCode: string = 'en-US',
      options?: {
        speed?: number;
        preferAi?: boolean;
        cachedAudioBase64?: string;
      }
    ) => {
      if (!text || !text.trim()) return;

      stop();
      setIsSpeaking(true);

      const targetSpeed = options?.speed ?? defaultRate;
      const shouldUseAi = options?.preferAi ?? useAiVoice;

      // 1. If we already have precomputed AI WAV audio base64 or request AI TTS
      if (options?.cachedAudioBase64) {
        try {
          const audio = new Audio(`data:audio/wav;base64,${options.cachedAudioBase64}`);
          audio.playbackRate = targetSpeed;
          audioPlayerRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => {
            console.warn('Audio playback error, fallback to browser synthesis');
            fallbackBrowserSpeak(text, langCode, targetSpeed);
          };
          await audio.play();
          return;
        } catch (e) {
          console.warn('Cached audio playback failed:', e);
        }
      }

      if (shouldUseAi) {
        try {
          const aiAudioBase64 = await generateAiSpeech(text, voiceName);
          if (aiAudioBase64) {
            const audio = new Audio(`data:audio/wav;base64,${aiAudioBase64}`);
            audio.playbackRate = targetSpeed;
            audioPlayerRef.current = audio;
            audio.onended = () => setIsSpeaking(false);
            audio.onerror = () => {
              fallbackBrowserSpeak(text, langCode, targetSpeed);
            };
            await audio.play();
            return;
          }
        } catch (err) {
          console.warn('AI voice generation fallback to browser:', err);
        }
      }

      // 2. Browser native SpeechSynthesis
      fallbackBrowserSpeak(text, langCode, targetSpeed);
    },
    [defaultRate, stop, useAiVoice, voiceName, voices]
  );

  const fallbackBrowserSpeak = (text: string, langCode: string, rate: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = Math.max(0.7, Math.min(1.5, rate));
      utterance.lang = langCode;

      // Find the best voice for this language
      const langPrefix = langCode.split('-')[0].toLowerCase();
      const matchVoice =
        voices.find((v) => v.lang.toLowerCase() === langCode.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(langPrefix));

      if (matchVoice) {
        utterance.voice = matchVoice;
      }

      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
        console.warn('Utterance error:', e);
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Browser TTS failed:', err);
      setIsSpeaking(false);
    }
  };

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
