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
  onResult: (currentText: string, isInterim: boolean) => void;
  onFinalText?: (finalText: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  silenceTimeoutMs?: number;
}

export function useSpeechRecognition({
  lang,
  onResult,
  onFinalText,
  onEnd,
  onError,
  silenceTimeoutMs = 1800,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100

  // Callback refs to completely eliminate React stale closures
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;

  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const currentLangRef = useRef(lang);
  currentLangRef.current = lang;

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);

  // Transcript tracking
  const accumulatedTextRef = useRef('');
  const latestTranscriptRef = useRef('');
  const hasDispatchedRef = useRef(false);

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
        const level = Math.min(100, Math.round((average / 128) * 100 * 1.4));
        setAudioLevel(level);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('Audio volume analyser error:', err);
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Safe dispatcher that ensures text is dispatched once per utterance
  const dispatchFinalTranscript = useCallback(() => {
    const textToSubmit = latestTranscriptRef.current.trim();
    if (textToSubmit && !hasDispatchedRef.current) {
      hasDispatchedRef.current = true;
      onFinalTextRef.current?.(textToSubmit);
    }
  }, []);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    stopAudioLevelAnalysis();

    // If there is pending speech that hasn't been submitted, dispatch it now
    dispatchFinalTranscript();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recognition:', e);
      }
    }
    setIsListening(false);
    setInterimText('');
  }, [clearSilenceTimer, dispatchFinalTranscript, stopAudioLevelAnalysis]);

  const startListening = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      onErrorRef.current?.('El reconocimiento por voz no es compatible con este navegador.');
      return;
    }

    // Stop any existing session
    clearSilenceTimer();
    stopAudioLevelAnalysis();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    accumulatedTextRef.current = '';
    latestTranscriptRef.current = '';
    hasDispatchedRef.current = false;
    setInterimText('');

    try {
      const recognition = new SpeechRec();
      const targetLang = currentLangRef.current;
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
        let finalSegment = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalSegment += transcript + ' ';
          } else {
            interim += transcript;
          }
        }

        if (finalSegment.trim()) {
          accumulatedTextRef.current +=
            (accumulatedTextRef.current ? ' ' : '') + finalSegment.trim();
        }

        const combinedText = (
          accumulatedTextRef.current + (interim ? ' ' + interim : '')
        ).trim();

        latestTranscriptRef.current = combinedText;
        setInterimText(combinedText);
        onResultRef.current(combinedText, !finalSegment);

        // Reset silence timer: when speaker stops talking for silenceTimeoutMs, finalize
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          const textToSubmit = latestTranscriptRef.current.trim();
          if (textToSubmit) {
            dispatchFinalTranscript();
            stopListening();
            onEndRef.current?.();
          }
        }, silenceTimeoutMs);
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error !== 'no-speech') {
          onErrorRef.current?.(event.error);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        stopAudioLevelAnalysis();
        clearSilenceTimer();
        dispatchFinalTranscript();
        onEndRef.current?.();
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      onErrorRef.current?.(err.message || 'No se pudo iniciar el micrófono');
      setIsListening(false);
      stopAudioLevelAnalysis();
    }
  }, [
    clearSilenceTimer,
    dispatchFinalTranscript,
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
