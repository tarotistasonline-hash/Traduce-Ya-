import { useState, useEffect, useRef, useCallback } from 'react';

// Declare types for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

interface UseSpeechRecognitionOptions {
  lang: string;
  onResult: (finalText: string, isInterim: boolean) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  silenceTimeoutMs?: number;
}

export function useSpeechRecognition({
  lang,
  onResult,
  onEnd,
  onError,
  silenceTimeoutMs = 1800,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const currentLangRef = useRef(lang);
  const accumulatedTextRef = useRef('');

  currentLangRef.current = lang;

  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setIsSupported(false);
    }
  }, []);

  const stopAudioLevelAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startAudioLevelAnalysis = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        // Normalize 0 to 100 with a slight boost for quiet distant voices
        const level = Math.min(100, Math.round((average / 128) * 100 * 1.4));
        setAudioLevel(level);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Could not access microphone volume analyser:', err);
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    stopAudioLevelAnalysis();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recognition:', e);
      }
    }
    setIsListening(false);
    setInterimText('');
  }, [clearSilenceTimer, stopAudioLevelAnalysis]);

  const startListening = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      onError?.('El reconocimiento por voz no es compatible con este navegador.');
      return;
    }

    // Stop any existing session
    stopListening();
    accumulatedTextRef.current = '';
    setInterimText('');

    try {
      const recognition = new SpeechRec();
      const targetLang = currentLangRef.current;
      // When 'auto', use the device's locale so the engine captures natural phonetics
      const effectiveLang =
        !targetLang || targetLang === 'auto'
          ? (typeof navigator !== 'undefined' && navigator.language) || 'es-ES'
          : targetLang;
      recognition.lang = effectiveLang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        startAudioLevelAnalysis();
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        if (final.trim()) {
          accumulatedTextRef.current += (accumulatedTextRef.current ? ' ' : '') + final.trim();
        }

        setInterimText(interim || accumulatedTextRef.current);
        onResult(accumulatedTextRef.current || interim, !final);

        // Reset silence timer: when speaker stops talking for silenceTimeoutMs, finalize
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          const textToSubmit = (accumulatedTextRef.current || interim).trim();
          if (textToSubmit) {
            stopListening();
            onEnd?.();
          }
        }, silenceTimeoutMs);
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error !== 'no-speech') {
          onError?.(event.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        stopAudioLevelAnalysis();
        clearSilenceTimer();
        onEnd?.();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      onError?.(err.message || 'No se pudo iniciar el micrófono');
      setIsListening(false);
      stopAudioLevelAnalysis();
    }
  }, [
    clearSilenceTimer,
    onError,
    onEnd,
    onResult,
    silenceTimeoutMs,
    startAudioLevelAnalysis,
    stopAudioLevelAnalysis,
    stopListening,
  ]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, [stopListening]);

  return {
    isListening,
    isSupported,
    interimText,
    audioLevel,
    startListening,
    stopListening,
  };
}
