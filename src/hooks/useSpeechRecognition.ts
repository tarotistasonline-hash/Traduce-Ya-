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
  onAudioRecorded?: (audioBlob: Blob) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  silenceTimeoutMs?: number;
  noiseFilter?: boolean;
}

export function useSpeechRecognition({
  lang,
  onResult,
  onFinalText,
  onAudioRecorded,
  onEnd,
  onError,
  silenceTimeoutMs = 950,
  noiseFilter = true,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100

  // Callback refs to avoid stale closures
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;

  const onAudioRecordedRef = useRef(onAudioRecorded);
  onAudioRecordedRef.current = onAudioRecorded;

  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const currentLangRef = useRef(lang);
  currentLangRef.current = lang;

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const vadSilenceTimerRef = useRef<any>(null);
  const hasSpokenAudioRef = useRef(false);

  // Transcript tracking
  const accumulatedTextRef = useRef('');
  const latestTranscriptRef = useRef('');
  const hasDispatchedRef = useRef(false);
  const hasSpeechApiResultsRef = useRef(false);

  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    setIsSupported(!!(SpeechRec || hasMedia));
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (vadSilenceTimerRef.current) {
      clearTimeout(vadSilenceTimerRef.current);
      vadSilenceTimerRef.current = null;
    }
  }, []);

  const cleanupAudioStream = useCallback(() => {
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

  // Dispatch final transcript or audio blob
  const finishUtterance = useCallback(() => {
    if (hasDispatchedRef.current) return;

    const textToSubmit = latestTranscriptRef.current.trim();
    if (textToSubmit) {
      hasDispatchedRef.current = true;
      onFinalTextRef.current?.(textToSubmit);
      return;
    }

    // If SpeechRecognition didn't produce text, check if we recorded audio
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const stopListening = useCallback(() => {
    clearSilenceTimer();

    // Trigger completion if not already dispatched
    finishUtterance();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recognition:', e);
      }
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    cleanupAudioStream();
    setIsListening(false);
    setInterimText('');
  }, [clearSilenceTimer, cleanupAudioStream, finishUtterance]);

  const startListening = useCallback(async (overrideLang?: string) => {
    // Synchronously reset state
    clearSilenceTimer();
    cleanupAudioStream();

    accumulatedTextRef.current = '';
    latestTranscriptRef.current = '';
    hasDispatchedRef.current = false;
    hasSpeechApiResultsRef.current = false;
    hasSpokenAudioRef.current = false;
    audioChunksRef.current = [];
    setInterimText('');

    let stream: MediaStream | null = null;

    try {
      // Check mediaDevices support safely
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('El micrófono no está disponible en este navegador o visor.');
      }

      // 1. Acquire microphone stream with advanced acoustic noise suppression
      const audioConstraints: MediaTrackConstraints = noiseFilter
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            // Advanced acoustic noise suppression hints for Chromium / WebKit
            ...({
              googEchoCancellation: true,
              googAutoGainControl: true,
              googNoiseSuppression: true,
              googHighpassFilter: true,
              googTypingNoiseDetection: true,
            } as any),
          }
        : {
            echoCancellation: false,
            noiseSuppression: false,
          };

      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      mediaStreamRef.current = stream;

      let recordStream: MediaStream = stream;

      // 2. Setup Audio Visualizer & DSP Voice Isolation Chain
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
          }
          audioContextRef.current = audioCtx;

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.5;
          analyserRef.current = analyser;

          const source = audioCtx.createMediaStreamSource(stream);

          if (noiseFilter) {
            // High-pass filter (85Hz): eliminates low-frequency table thumps, engine rumble, AC vibrations
            const hpFilter = audioCtx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 85;
            hpFilter.Q.value = 0.7;

            // Low-pass filter (7500Hz): cuts off high-frequency cutlery clatter, glass clinks, hiss
            const lpFilter = audioCtx.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 7500;
            lpFilter.Q.value = 0.7;

            // Voice presence peaking filter (2500Hz): clarifies human vocal tract frequencies
            const voiceFilter = audioCtx.createBiquadFilter();
            voiceFilter.type = 'peaking';
            voiceFilter.frequency.value = 2500;
            voiceFilter.gain.value = 3.5;
            voiceFilter.Q.value = 1.0;

            // Chain: source -> HP -> Voice Peaking -> LP -> Analyser
            source.connect(hpFilter);
            hpFilter.connect(voiceFilter);
            voiceFilter.connect(lpFilter);
            lpFilter.connect(analyser);

            // Connect isolated audio into MediaStreamDestination for clean MediaRecorder capture
            const dest = audioCtx.createMediaStreamDestination();
            lpFilter.connect(dest);
            if (dest.stream && dest.stream.getAudioTracks().length > 0) {
              recordStream = dest.stream;
            }
          } else {
            source.connect(analyser);
          }

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
            const level = Math.min(100, Math.round((average / 128) * 100 * 1.5));
            setAudioLevel(level);

            // Noise-gated voice activity detection:
            // In noisy rooms, low background murmur (<14) is ignored.
            const speechThreshold = noiseFilter ? 14 : 10;
            const silenceFloor = noiseFilter ? 10 : 8;

            if (level > speechThreshold) {
              hasSpokenAudioRef.current = true;
              if (vadSilenceTimerRef.current) {
                clearTimeout(vadSilenceTimerRef.current);
                vadSilenceTimerRef.current = null;
              }
            } else if (hasSpokenAudioRef.current && level < silenceFloor) {
              if (!vadSilenceTimerRef.current && !hasSpeechApiResultsRef.current) {
                vadSilenceTimerRef.current = setTimeout(() => {
                  if (!hasDispatchedRef.current) {
                    finishUtterance();
                    stopListening();
                    onEndRef.current?.();
                  }
                }, 1200);
              }
            }

            animationFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      } catch (e) {
        console.warn('Audio level analyser init:', e);
      }

      // 3. Setup MediaRecorder for direct multimodal audio fallback using isolated voice stream
      try {
        let mimeType = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
          }

          const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          recorder.onstop = () => {
            if (!hasDispatchedRef.current && audioChunksRef.current.length > 0) {
              const audioBlob = new Blob(audioChunksRef.current, {
                type: mimeType || 'audio/webm',
              });
              if (audioBlob.size > 500) {
                hasDispatchedRef.current = true;
                onAudioRecordedRef.current?.(audioBlob);
              }
            }
          };

          mediaRecorderRef.current = recorder;
          recorder.start(150); // collect in chunks
        }
      } catch (err) {
        console.warn('MediaRecorder init:', err);
      }

      setIsListening(true);

      // 4. Try Web Speech API (SpeechRecognition)
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRec) {
        const recognition = new SpeechRec();
        const targetLang = overrideLang || currentLangRef.current;
        const effectiveLang =
          !targetLang || targetLang === 'auto'
            ? (typeof navigator !== 'undefined' && navigator.language) || 'es-ES'
            : targetLang;

        recognition.lang = effectiveLang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

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

          if (combinedText) {
            hasSpeechApiResultsRef.current = true;
            latestTranscriptRef.current = combinedText;
            setInterimText(combinedText);
            onResultRef.current(combinedText, !finalSegment);

            // Reset silence timer: when speaker stops talking, finalize
            clearSilenceTimer();
            silenceTimerRef.current = setTimeout(() => {
              finishUtterance();
              stopListening();
              onEndRef.current?.();
            }, silenceTimeoutMs);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition error (will fallback to audio recording):', event.error);
        };

        recognition.onend = () => {
          if (!hasDispatchedRef.current) {
            finishUtterance();
          }
          cleanupAudioStream();
          setIsListening(false);
          onEndRef.current?.();
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch (recErr) {
          console.warn('SpeechRecognition start notice:', recErr);
        }
      }
    } catch (err: any) {
      console.warn('Audio capture notice:', err);
      onErrorRef.current?.(err?.message || 'No se pudo acceder al micrófono');
      setIsListening(false);
      cleanupAudioStream();
    }
  }, [
    cleanupAudioStream,
    clearSilenceTimer,
    finishUtterance,
    silenceTimeoutMs,
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
