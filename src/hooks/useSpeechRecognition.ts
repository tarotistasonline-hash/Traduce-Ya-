import { useState, useEffect, useRef, useCallback } from 'react';

// Declare types for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    webkitAudioContext?: typeof AudioContext;
  }
}

// Check whether any audio track in a MediaStream is active, enabled, and unmuted
export function isAudioTrackActive(stream: MediaStream | null): boolean {
  if (!stream) return false;
  const tracks = stream.getAudioTracks();
  if (tracks.length === 0) return false;
  return tracks.some((t) => t.readyState === 'live' && t.enabled && !t.muted);
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
  silenceTimeoutMs = 1050,
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
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filterNodesRef = useRef<BiquadFilterNode[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const vadSilenceTimerRef = useRef<any>(null);
  const cleanupFallbackTimerRef = useRef<any>(null);
  const hasSpokenAudioRef = useRef(false);
  const listeningStartedAtRef = useRef(0);
  const isStoppingRef = useRef(false);

  // Transcript tracking
  const accumulatedTextRef = useRef('');
  const latestTranscriptRef = useRef('');
  const hasDispatchedRef = useRef(false);
  const hasSpeechApiResultsRef = useRef(false);

  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    setIsSupported(!!(SpeechRec || hasMedia));

    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
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
    if (cleanupFallbackTimerRef.current) {
      clearTimeout(cleanupFallbackTimerRef.current);
      cleanupFallbackTimerRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    try {
      sourceNodeRef.current?.disconnect();
    } catch {}
    sourceNodeRef.current = null;

    filterNodesRef.current.forEach((n) => {
      try {
        n.disconnect();
      } catch {}
    });
    filterNodesRef.current = [];

    try {
      analyserRef.current?.disconnect();
    } catch {}
    analyserRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend().catch(() => {});
    }
    setAudioLevel(0);
  }, []);

  const stopRecorderSafely = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return false;
    }
    try {
      if (recorder.state === 'recording' && typeof recorder.requestData === 'function') {
        recorder.requestData();
      }
    } catch {}
    try {
      recorder.stop();
      return true;
    } catch {
      return false;
    }
  }, []);

  // Dispatch final transcript or flush recorded audio blob
  const finishUtterance = useCallback(() => {
    if (hasDispatchedRef.current) return;

    const textToSubmit = latestTranscriptRef.current.trim();
    if (textToSubmit) {
      hasDispatchedRef.current = true;
      onFinalTextRef.current?.(textToSubmit);
      return;
    }

    stopRecorderSafely();
  }, [stopRecorderSafely]);

  const stopListening = useCallback(() => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    clearSilenceTimer();
    finishUtterance();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn('Error stopping recognition:', e);
      }
      recognitionRef.current = null;
    }

    const recorderStopping = stopRecorderSafely();
    if (recorderStopping) {
      // Wait for recorder.onstop to flush final audio chunks before stopping hardware tracks
      if (cleanupFallbackTimerRef.current) {
        clearTimeout(cleanupFallbackTimerRef.current);
      }
      cleanupFallbackTimerRef.current = setTimeout(() => {
        cleanupAudioStream();
      }, 900);
    } else {
      cleanupAudioStream();
    }

    setIsListening(false);
    setInterimText('');
  }, [clearSilenceTimer, cleanupAudioStream, finishUtterance, stopRecorderSafely]);

  const startListening = useCallback(async (overrideLang?: string) => {
    // Synchronously reset state
    isStoppingRef.current = false;
    clearSilenceTimer();
    cleanupAudioStream();

    accumulatedTextRef.current = '';
    latestTranscriptRef.current = '';
    hasDispatchedRef.current = false;
    hasSpeechApiResultsRef.current = false;
    hasSpokenAudioRef.current = false;
    listeningStartedAtRef.current = Date.now();
    audioChunksRef.current = [];
    setInterimText('');

    let stream: MediaStream | null = null;

    try {
      // Check mediaDevices support safely
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('El micrófono no está disponible en este navegador o visor.');
      }

      // 1. Acquire microphone stream with acoustic noise suppression
      const audioConstraints: MediaTrackConstraints = noiseFilter
        ? {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
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

      const recordStream: MediaStream = stream;

      // 2. Setup Audio Visualizer & Time-Domain RMS Voice Activity Detection
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          let audioCtx = audioContextRef.current;
          if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new AudioCtx();
            audioContextRef.current = audioCtx;
          }
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume().catch(() => {});
          }

          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.35;
          analyserRef.current = analyser;

          const source = audioCtx.createMediaStreamSource(stream);
          sourceNodeRef.current = source;

          if (noiseFilter) {
            const hpFilter = audioCtx.createBiquadFilter();
            hpFilter.type = 'highpass';
            hpFilter.frequency.value = 85;
            hpFilter.Q.value = 0.7;

            const lpFilter = audioCtx.createBiquadFilter();
            lpFilter.type = 'lowpass';
            lpFilter.frequency.value = 7500;
            lpFilter.Q.value = 0.7;

            const voiceFilter = audioCtx.createBiquadFilter();
            voiceFilter.type = 'peaking';
            voiceFilter.frequency.value = 2500;
            voiceFilter.gain.value = 3.5;
            voiceFilter.Q.value = 1.0;

            filterNodesRef.current = [hpFilter, lpFilter, voiceFilter];

            source.connect(hpFilter);
            hpFilter.connect(voiceFilter);
            voiceFilter.connect(lpFilter);
            lpFilter.connect(analyser);
          } else {
            filterNodesRef.current = [];
            source.connect(analyser);
          }

          const timeData = new Uint8Array(analyser.fftSize);

          const updateLevel = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteTimeDomainData(timeData);

            let sumSq = 0;
            for (let i = 0; i < timeData.length; i++) {
              const norm = (timeData[i] - 128) / 128;
              sumSq += norm * norm;
            }
            const rms = Math.sqrt(sumSq / timeData.length);
            const level = Math.min(100, Math.round(rms * 420));
            setAudioLevel(level);

            const elapsedMs = Date.now() - listeningStartedAtRef.current;
            const speechThreshold = 8;
            const silenceFloor = 4;

            if (level >= speechThreshold) {
              hasSpokenAudioRef.current = true;
              if (vadSilenceTimerRef.current) {
                clearTimeout(vadSilenceTimerRef.current);
                vadSilenceTimerRef.current = null;
              }
            } else if (hasSpokenAudioRef.current && elapsedMs > 1200 && level < silenceFloor) {
              if (!vadSilenceTimerRef.current && !hasSpeechApiResultsRef.current) {
                vadSilenceTimerRef.current = setTimeout(() => {
                  if (!hasDispatchedRef.current && !isStoppingRef.current) {
                    stopListening();
                    onEndRef.current?.();
                  }
                }, 1400);
              }
            }

            animationFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        }
      } catch (e) {
        console.warn('Audio level analyser init:', e);
      }

      // 3. Setup MediaRecorder for reliable multimodal audio capture
      try {
        let mimeType = '';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
            mimeType = 'audio/ogg';
          }

          const recorder = new MediaRecorder(recordStream, mimeType ? { mimeType } : undefined);
          const resolvedMime = recorder.mimeType || mimeType || 'audio/webm';

          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              audioChunksRef.current.push(e.data);
            }
          };

          recorder.onstop = () => {
            if (mediaRecorderRef.current === recorder) {
              mediaRecorderRef.current = null;
            }
            const chunks = audioChunksRef.current.slice();
            if (!hasDispatchedRef.current && chunks.length > 0) {
              const audioBlob = new Blob(chunks, { type: resolvedMime });
              if (audioBlob.size > 250) {
                hasDispatchedRef.current = true;
                onAudioRecordedRef.current?.(audioBlob);
              } else {
                console.warn('[useSpeechRecognition] Audio blob too small (<250 bytes), skipped dispatch.');
              }
            }
            cleanupAudioStream();
          };

          mediaRecorderRef.current = recorder;
          recorder.start(400);
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
          console.warn('SpeechRecognition error (MediaRecorder audio remains active):', event.error);
        };

        recognition.onend = () => {
          const recorderActive =
            mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording';
          if (!hasSpeechApiResultsRef.current && recorderActive && !hasDispatchedRef.current && !isStoppingRef.current) {
            return;
          }

          if (!hasDispatchedRef.current && !isStoppingRef.current) {
            stopListening();
            onEndRef.current?.();
          } else {
            setIsListening(false);
            onEndRef.current?.();
          }
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
      const errName = err?.name || '';
      const errMsg = String(err?.message || '').toLowerCase();
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        errMsg.includes('permission denied') ||
        errMsg.includes('not allowed')
      ) {
        onErrorRef.current?.('not-allowed');
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        onErrorRef.current?.('mic-busy');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        onErrorRef.current?.('mic-not-found');
      } else {
        onErrorRef.current?.(err?.message || 'No se pudo acceder al micrófono');
      }
      setIsListening(false);
      cleanupAudioStream();
    }
  }, [
    cleanupAudioStream,
    clearSilenceTimer,
    finishUtterance,
    noiseFilter,
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
    isAudioTrackActive: () => isAudioTrackActive(mediaStreamRef.current),
  };
}
