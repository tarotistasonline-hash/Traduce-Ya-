import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  RotateCcw,
  Sliders,
  AudioLines,
  Activity,
  Headphones,
  Info,
  ShieldAlert,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface AudioDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialNoiseFilter?: boolean;
}

interface AudioDeviceOption {
  deviceId: string;
  label: string;
}

interface DiagnosticReport {
  timestamp: number;
  durationSec: number;
  peakDbfs: number;
  avgDbfs: number;
  silencePercent: number;
  clippingCount: number;
  clippingPercent: number;
  status: 'optimal' | 'good' | 'low_volume' | 'clipping' | 'total_silence';
  headline: string;
  details: string;
  recommendations: string[];
  transcript?: string;
  hasAudioBlob: boolean;
}

export const AudioDiagnosticModal: React.FC<AudioDiagnosticModalProps> = ({
  isOpen,
  onClose,
  initialNoiseFilter = true,
}) => {
  // Device and options
  const [availableDevices, setAvailableDevices] = useState<AudioDeviceOption[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('default');
  const [noiseFilterEnabled, setNoiseFilterEnabled] = useState<boolean>(initialNoiseFilter);
  const [activeTrackLabel, setActiveTrackLabel] = useState<string>('');
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  // Real-time audio stream metrics
  const [isLiveMonitoring, setIsLiveMonitoring] = useState(false);
  const [currentDbfs, setCurrentDbfs] = useState<number>(-60);
  const [peakDbfs, setPeakDbfs] = useState<number>(-60);
  const [isCurrentlySilent, setIsCurrentlySilent] = useState(false);
  const [isCurrentlyClipping, setIsCurrentlyClipping] = useState(false);
  const [clippingEventsCount, setClippingEventsCount] = useState(0);
  const [silenceDurationMs, setSilenceDurationMs] = useState(0);

  // 5-second guided test state
  const [isTesting, setIsTesting] = useState(false);
  const [testCountdown, setTestCountdown] = useState<number>(5);
  const [testSpeechTranscript, setTestSpeechTranscript] = useState<string>('');
  const [testReport, setTestReport] = useState<DiagnosticReport | null>(null);

  // Audio playback of recorded sample
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);

  // Active tab inside the diagnostic modal
  const [activeTab, setActiveTab] = useState<'live' | 'test' | 'troubleshoot'>('live');

  // References for Web Audio & canvas
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<any>(null);

  // Tracking metrics during a test run
  const testMetricsRef = useRef<{
    totalSamples: number;
    silentSamples: number;
    clippedSamples: number;
    peakLinear: number;
    sumLinear: number;
    startTime: number;
    clippingEvents: number;
  }>({
    totalSamples: 0,
    silentSamples: 0,
    clippedSamples: 0,
    peakLinear: 0,
    sumLinear: 0,
    startTime: 0,
    clippingEvents: 0,
  });

  // Query microphone permissions if supported
  useEffect(() => {
    if (!isOpen) return;

    if (navigator?.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as any })
        .then((perm) => {
          setPermissionState(perm.state as any);
          perm.onchange = () => {
            setPermissionState(perm.state as any);
          };
        })
        .catch(() => {
          setPermissionState('unknown');
        });
    }

    // List available microphones
    if (navigator?.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const audioInputs = devices
            .filter((d) => d.kind === 'audioinput')
            .map((d, index) => ({
              deviceId: d.deviceId || (index === 0 ? 'default' : `device-${index}`),
              label: d.label || `Micrófono ${index + 1} (${d.deviceId ? d.deviceId.slice(0, 6) : 'Predeterminado'})`,
            }));
          setAvailableDevices(audioInputs);
        })
        .catch((e) => console.warn('Could not enumerate audio devices:', e));
    }
  }, [isOpen]);

  // Clean up streams & audio contexts
  const cleanupStream = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {}
      speechRecRef.current = null;
    }
    setIsLiveMonitoring(false);
    setCurrentDbfs(-60);
    setIsCurrentlyClipping(false);
    setIsCurrentlySilent(false);
  }, []);

  // Initialize and start live stream inspection
  const startLiveInspection = useCallback(async () => {
    cleanupStream();

    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error('La API de captura de micrófono no está disponible en este entorno.');
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDeviceId !== 'default' ? { exact: selectedDeviceId } : undefined,
          echoCancellation: noiseFilterEnabled,
          noiseSuppression: noiseFilterEnabled,
          autoGainControl: noiseFilterEnabled,
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      if (track) {
        setActiveTrackLabel(track.label || 'Micrófono activo');
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API no soportada.');
      }

      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const timeData = new Float32Array(analyser.fftSize);
      let consecutiveSilenceCount = 0;
      let clipDecay = 0;

      setIsLiveMonitoring(true);

      const render = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(timeData);

        // Calculate RMS and Peak
        let sumSquares = 0;
        let peak = 0;
        let isClippedSample = false;

        for (let i = 0; i < timeData.length; i++) {
          const val = timeData[i];
          const absVal = Math.abs(val);
          sumSquares += val * val;
          if (absVal > peak) peak = absVal;

          // Clipping threshold: amplitude >= 0.985 is hard-clipping
          if (absVal >= 0.985) {
            isClippedSample = true;
          }
        }

        const rms = Math.sqrt(sumSquares / timeData.length);
        // dBFS formula: 20 * log10(rms). Absolute silence is -Infinity -> clamped to -60 dBFS
        const dbfs = rms > 0.0001 ? Math.max(-60, Math.min(0, 20 * Math.log10(rms))) : -60;
        const peakDbfsCalc = peak > 0.0001 ? Math.max(-60, Math.min(0, 20 * Math.log10(peak))) : -60;

        setCurrentDbfs(Math.round(dbfs));
        setPeakDbfs((prev) => Math.max(prev, Math.round(peakDbfsCalc)));

        // Silence detection: below -48 dBFS or RMS < 0.008 for consecutive frames
        if (dbfs < -48 || rms < 0.008) {
          consecutiveSilenceCount++;
          if (consecutiveSilenceCount > 30) {
            setIsCurrentlySilent(true);
            setSilenceDurationMs((prev) => prev + 16);
          }
        } else {
          consecutiveSilenceCount = 0;
          setIsCurrentlySilent(false);
        }

        // Clipping detection
        if (isClippedSample || peakDbfsCalc > -0.15) {
          clipDecay = 15; // hold for ~250ms for visual alert
          setIsCurrentlyClipping(true);
          setClippingEventsCount((prev) => prev + 1);

          if (testMetricsRef.current) {
            testMetricsRef.current.clippedSamples++;
            testMetricsRef.current.clippingEvents++;
          }
        } else if (clipDecay > 0) {
          clipDecay--;
        } else {
          setIsCurrentlyClipping(false);
        }

        // Update metrics during 5-second test
        if (testMetricsRef.current.startTime > 0) {
          testMetricsRef.current.totalSamples++;
          testMetricsRef.current.sumLinear += rms;
          if (peak > testMetricsRef.current.peakLinear) {
            testMetricsRef.current.peakLinear = peak;
          }
          if (dbfs < -48 || rms < 0.008) {
            testMetricsRef.current.silentSamples++;
          }
        }

        // Draw Oscilloscope Waveform on Canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const width = canvas.width;
            const height = canvas.height;

            ctx.clearRect(0, 0, width, height);

            // Subtle background grid
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.moveTo(0, height / 4);
            ctx.lineTo(width, height / 4);
            ctx.moveTo(0, (height * 3) / 4);
            ctx.lineTo(width, (height * 3) / 4);
            ctx.stroke();

            // Threshold clipping dashed lines at +/- 98%
            ctx.strokeStyle = '#ef444433';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, 4);
            ctx.lineTo(width, 4);
            ctx.moveTo(0, height - 4);
            ctx.lineTo(width, height - 4);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw wave
            ctx.lineWidth = 2.5;
            if (isClippedSample || clipDecay > 0) {
              ctx.strokeStyle = '#f43f5e'; // Rose/Red on clipping
              ctx.shadowColor = '#f43f5e';
              ctx.shadowBlur = 8;
            } else if (dbfs < -48) {
              ctx.strokeStyle = '#64748b'; // Slate on silence
              ctx.shadowBlur = 0;
            } else {
              ctx.strokeStyle = '#22d3ee'; // Cyan normal
              ctx.shadowColor = '#06b6d4';
              ctx.shadowBlur = 4;
            }

            ctx.beginPath();
            const sliceWidth = width / timeData.length;
            let x = 0;

            for (let i = 0; i < timeData.length; i++) {
              const v = timeData[i];
              // Map from [-1.0, 1.0] to [height, 0]
              const y = ((1 - v) / 2) * height;

              if (i === 0) {
                ctx.moveTo(x, y);
              } else {
                ctx.lineTo(x, y);
              }
              x += sliceWidth;
            }

            ctx.stroke();
            ctx.shadowBlur = 0;
          }
        }

        animFrameRef.current = requestAnimationFrame(render);
      };

      animFrameRef.current = requestAnimationFrame(render);
    } catch (err: any) {
      console.warn('Microphone live stream init failed:', err);
      setIsLiveMonitoring(false);
      setPermissionState('denied');
    }
  }, [cleanupStream, noiseFilterEnabled, selectedDeviceId]);

  // Start / restart live stream when modal opens or device/filters change
  useEffect(() => {
    if (isOpen) {
      startLiveInspection();
    } else {
      cleanupStream();
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
      }
    }
    return () => {
      cleanupStream();
    };
  }, [isOpen, startLiveInspection, cleanupStream]);

  // Switch mic device
  const handleDeviceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDeviceId(e.target.value);
  };

  // Run Guided 5-Second Test
  const handleStart5SecondTest = async () => {
    if (isTesting) return;

    // Reset test metrics
    setTestReport(null);
    setTestSpeechTranscript('');
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
      setRecordedAudioUrl(null);
    }
    recordedChunksRef.current = [];

    // Ensure live stream is ready
    if (!mediaStreamRef.current) {
      await startLiveInspection();
    }

    const stream = mediaStreamRef.current;
    if (!stream) {
      alert('No se pudo acceder al micrófono para iniciar la prueba.');
      return;
    }

    setIsTesting(true);
    setTestCountdown(5);
    setActiveTab('test');

    testMetricsRef.current = {
      totalSamples: 0,
      silentSamples: 0,
      clippedSamples: 0,
      peakLinear: 0,
      sumLinear: 0,
      startTime: Date.now(),
      clippingEvents: 0,
    };

    // Initialize MediaRecorder for playback sample
    try {
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (evt) => {
        if (evt.data && evt.data.size > 0) {
          recordedChunksRef.current.push(evt.data);
        }
      };
      recorder.onstop = () => {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(blob);
          setRecordedAudioUrl(url);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
    } catch (e) {
      console.warn('Test recorder init:', e);
    }

    // Initialize SpeechRecognition concurrently to see if browser STT catches the voice
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = navigator.language || 'es-ES';
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.onresult = (e: any) => {
          let trans = '';
          for (let i = 0; i < e.results.length; i++) {
            trans += e.results[i][0].transcript + ' ';
          }
          setTestSpeechTranscript(trans.trim());
        };
        speechRecRef.current = recognition;
        recognition.start();
      } catch (recErr) {
        console.warn('SpeechRecognition during diagnostic test:', recErr);
      }
    }

    // Run countdown
    let remaining = 5;
    const interval = setInterval(() => {
      remaining -= 1;
      setTestCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        finish5SecondTest();
      }
    }, 1000);
  };

  const finish5SecondTest = () => {
    setIsTesting(false);

    // Stop MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    // Stop SpeechRecognition
    if (speechRecRef.current) {
      try {
        speechRecRef.current.stop();
      } catch {}
    }

    const metrics = testMetricsRef.current;
    metrics.startTime = 0;

    const total = Math.max(1, metrics.totalSamples);
    const silencePercent = Math.round((metrics.silentSamples / total) * 100);
    const clippingPercent = Math.round((metrics.clippedSamples / total) * 100);
    const avgLinear = metrics.sumLinear / total;

    const peakDbfs =
      metrics.peakLinear > 0.0001
        ? Math.round(Math.max(-60, Math.min(0, 20 * Math.log10(metrics.peakLinear))))
        : -60;
    const avgDbfs =
      avgLinear > 0.0001
        ? Math.round(Math.max(-60, Math.min(0, 20 * Math.log10(avgLinear))))
        : -60;

    // Evaluate Quality Status
    let status: DiagnosticReport['status'] = 'good';
    let headline = '';
    let details = '';
    const recommendations: string[] = [];

    if (silencePercent >= 92 || peakDbfs <= -50) {
      status = 'total_silence';
      headline = 'Silencio Total Detectado (Sin Entrada de Audio)';
      details =
        'El sistema no registró señal de audio audible durante los 5 segundos de la prueba. El micrófono está emitiendo una señal plana o nula.';
      recommendations.push(
        'Verifica si tu micrófono o auricular tiene un interruptor de "Mute" físico o en el cable.',
        'Comprueba que el navegador tenga permiso de micrófono activado (icono de candado en la barra de direcciones).',
        'En los ajustes de privacidad del sistema operativo (Android, iOS o Windows/Mac), verifica que el micrófono no esté deshabilitado a nivel global.',
        'Si usas auriculares Bluetooth, asegúrate de que no estén dentro de su estuche o desconectados.'
      );
    } else if (metrics.clippingEvents > 12 || clippingPercent > 6 || peakDbfs >= -0.2) {
      status = 'clipping';
      headline = 'Saturación y Clipping Severo Detectado';
      details = `Se registraron ${metrics.clippingEvents} picos de saturación extrema donde la onda de sonido superó el 98% del límite digital. Esto deforma los fonemas y hace que el traductor entienda palabras equivocadas.`;
      recommendations.push(
        'Aleja el teléfono o micrófono a unos 25 a 50 cm de distancia sobre la mesa.',
        'No hables directamente pegado al orificio del micrófono del teléfono para evitar golpes de aire (pufs).',
        'Si estás usando una PC o tarjeta de sonido externa, reduce la "Ganancia de entrada" (Input Gain) en los ajustes de sonido del sistema a un 70-80%.'
      );
    } else if (peakDbfs < -30 || avgDbfs < -42) {
      status = 'low_volume';
      headline = 'Volumen Demasiado Bajo (Casi Silencio)';
      details = `El volumen máximo alcanzado fue de ${peakDbfs} dBFS, lo cual es muy bajo para distinguir la voz del murmullo ambiental.`;
      recommendations.push(
        'Coloca el dispositivo más cerca del centro de la mesa compartido entre las dos personas.',
        'Aumenta el volumen de entrada del micrófono en la configuración de sonido de tu dispositivo.',
        'Habla con un tono de voz firme y natural, como en una conversación normal de restaurante.'
      );
    } else if (peakDbfs >= -18 && peakDbfs <= -3 && metrics.clippingEvents === 0) {
      status = 'optimal';
      headline = '¡Calidad de Audio Excelente y Óptima!';
      details = `Nivel pico ideal (${peakDbfs} dBFS) con rango dinámico saludable. No hubo saturación y el nivel de silencio fue del ${silencePercent}%.`;
      recommendations.push(
        'La señal es limpia, equilibrada y perfecta para la traducción automática cara a cara.',
        'El filtro acústico y el aislamiento de voz están operando en su punto de máxima fidelidad.'
      );
    } else {
      status = 'good';
      headline = 'Calidad de Audio Aceptable';
      details = `Nivel pico de ${peakDbfs} dBFS con ${metrics.clippingEvents} eventos aislados de saturación. Adecuado para traducción.`;
      recommendations.push(
        'La señal es suficiente para la mayoría de conversaciones cotidianas.',
        'Si notas palabras incorrectas en ambientes ruidosos, mantén el "Filtro de Ruido" activo en Ajustes.'
      );
    }

    setTestReport({
      timestamp: Date.now(),
      durationSec: 5,
      peakDbfs,
      avgDbfs,
      silencePercent,
      clippingCount: metrics.clippingEvents,
      clippingPercent,
      status,
      headline,
      details,
      recommendations,
      transcript: testSpeechTranscript,
      hasAudioBlob: true,
    });
  };

  // Audio recording playback toggle
  const handleTogglePlayback = () => {
    if (!recordedAudioUrl) return;

    if (isPlayingRecording) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
      }
      setIsPlayingRecording(false);
    } else {
      if (!audioElementRef.current) {
        audioElementRef.current = new Audio(recordedAudioUrl);
        audioElementRef.current.onended = () => setIsPlayingRecording(false);
      } else {
        audioElementRef.current.src = recordedAudioUrl;
      }
      audioElementRef.current.play().catch((err) => {
        console.warn('Playback error:', err);
      });
      setIsPlayingRecording(true);
    }
  };

  // Helper for VU Meter color bar
  const getDbfsColor = (db: number) => {
    if (db >= -3) return 'bg-rose-500';
    if (db >= -12) return 'bg-amber-400';
    if (db >= -36) return 'bg-emerald-400';
    return 'bg-slate-600';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="w-full sm:max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-base sm:text-lg">
                  Diagnóstico de Micrófono y Audio
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono border border-cyan-500/30">
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Verifica calidad de señal, silencio, saturación (clipping) y escucha cómo se oye.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              cleanupStream();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
            title="Cerrar diagnóstico"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-3 pt-2 gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('live')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'live'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Medidor y Osciloscopio en Vivo</span>
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'test'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AudioLines className="w-4 h-4" />
            <span>Prueba Guiada de 5s</span>
            {testReport && (
              <span
                className={`w-2 h-2 rounded-full ${
                  testReport.status === 'optimal'
                    ? 'bg-emerald-400'
                    : testReport.status === 'total_silence' || testReport.status === 'clipping'
                    ? 'bg-rose-400'
                    : 'bg-amber-400'
                }`}
              />
            )}
          </button>
          <button
            onClick={() => setActiveTab('troubleshoot')}
            className={`pb-2.5 px-3 border-b-2 transition flex items-center gap-1.5 ${
              activeTab === 'troubleshoot'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Info className="w-4 h-4" />
            <span>Guía de Solución de Problemas</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Hardware & Stream Device Bar */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Mic className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  Dispositivo de Entrada Seleccionado:
                </div>
                {availableDevices.length > 0 ? (
                  <select
                    value={selectedDeviceId}
                    onChange={handleDeviceChange}
                    className="mt-0.5 bg-slate-900 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 text-xs w-full max-w-xs truncate focus:outline-none focus:border-cyan-400"
                  >
                    <option value="default">Predeterminado del Sistema</option>
                    {availableDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-slate-200 font-medium truncate">
                    {activeTrackLabel || 'Micrófono principal del dispositivo'}
                  </div>
                )}
              </div>
            </div>

            {/* Filter Toggle and Reconnect button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setNoiseFilterEnabled(!noiseFilterEnabled)}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition flex items-center gap-1.5 ${
                  noiseFilterEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
                title="Alternar filtro acústico de aislamiento de voz"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Filtro DSP: {noiseFilterEnabled ? 'Activado' : 'Directo'}</span>
              </button>

              <button
                type="button"
                onClick={startLiveInspection}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition"
                title="Reiniciar captura de audio"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* TAB 1: LIVE MONITOR (Medidor VU, Osciloscopio, Detección de Silencio y Clipping) */}
          {activeTab === 'live' && (
            <div className="space-y-4">
              {/* Live Indicators Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Level in dBFS */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-medium">Nivel de Señal (RMS)</div>
                  <div className="text-lg font-black font-mono text-slate-100 flex items-baseline gap-1 mt-0.5">
                    <span>{currentDbfs}</span>
                    <span className="text-[10px] font-normal text-slate-400">dBFS</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Pico: <span className="font-mono text-cyan-300">{peakDbfs} dB</span>
                  </div>
                </div>

                {/* Silence Indicator */}
                <div
                  className={`p-2.5 rounded-xl border transition-all ${
                    isCurrentlySilent
                      ? 'bg-amber-950/40 border-amber-500/60 text-amber-200 shadow-md shadow-amber-500/10'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-medium flex items-center justify-between">
                    <span>Detección de Silencio</span>
                    {isCurrentlySilent ? (
                      <VolumeX className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </div>
                  <div className="text-base font-bold mt-1 flex items-center gap-1.5">
                    {isCurrentlySilent ? (
                      <span className="text-amber-400 flex items-center gap-1 text-sm font-black animate-pulse">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        Silencio Activo
                      </span>
                    ) : (
                      <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Señal detectada
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {isCurrentlySilent ? 'Sin audio registrado' : 'Voz o ambiente presente'}
                  </div>
                </div>

                {/* Clipping Indicator */}
                <div
                  className={`p-2.5 rounded-xl border transition-all ${
                    isCurrentlyClipping
                      ? 'bg-rose-950/60 border-rose-500 text-rose-100 shadow-lg shadow-rose-500/20'
                      : clippingEventsCount > 0
                      ? 'bg-rose-950/20 border-rose-500/30 text-rose-200'
                      : 'bg-slate-950/80 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-[10px] font-medium flex items-center justify-between">
                    <span>Saturación (Clipping)</span>
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        isCurrentlyClipping
                          ? 'bg-rose-500 animate-ping'
                          : clippingEventsCount > 0
                          ? 'bg-rose-500/60'
                          : 'bg-slate-700'
                      }`}
                    />
                  </div>
                  <div className="text-base font-bold mt-1">
                    {isCurrentlyClipping ? (
                      <span className="text-rose-400 text-sm font-black flex items-center gap-1 animate-bounce">
                        ¡SATURANDO!
                      </span>
                    ) : clippingEventsCount > 0 ? (
                      <span className="text-rose-300 text-xs font-semibold">
                        {clippingEventsCount} picos clip
                      </span>
                    ) : (
                      <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Sin distorsión
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {clippingEventsCount > 0
                      ? 'Límite digital excedido'
                      : 'Rango dinámico limpio'}
                  </div>
                </div>

                {/* Mic Health Score */}
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-medium">Estado del Canal</div>
                  <div className="text-sm font-bold mt-1 text-slate-100 flex items-center gap-1">
                    {isLiveMonitoring ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Conectado
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <XCircle className="w-4 h-4" /> Desconectado
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {permissionState === 'granted'
                      ? 'Permiso concedido'
                      : permissionState === 'denied'
                      ? 'Permiso bloqueado'
                      : '48 kHz WebAudio'}
                  </div>
                </div>
              </div>

              {/* Real-time Oscilloscope Canvas */}
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2 text-slate-200">
                    <Activity className="w-4 h-4 text-cyan-400" />
                    <span>Osciloscopio de Onda en Tiempo Real</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-0.5 bg-rose-500" /> Límite Saturación (+/-0.98)
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-0.5 bg-cyan-400" /> Onda de Voz
                    </span>
                  </div>
                </div>

                <div className="relative w-full h-32 bg-slate-900/90 rounded-xl overflow-hidden border border-slate-800">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={128}
                    className="w-full h-full block"
                  />
                  {/* Watermark notice */}
                  <div className="absolute bottom-1 right-2 text-[9px] font-mono text-slate-500 pointer-events-none">
                    WebAudio Analyser 1024 FFT
                  </div>
                </div>

                {/* Precision Horizontal VU Meter */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>-60 dB (Silencio)</span>
                    <span>-36 dB</span>
                    <span className="text-emerald-400 font-semibold">-18 dB (Óptimo)</span>
                    <span className="text-amber-400 font-semibold">-6 dB</span>
                    <span className="text-rose-400 font-semibold">0 dB (Clip)</span>
                  </div>

                  {/* VU Progress Track */}
                  <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800 flex p-0.5">
                    {/* Linear mapping of dBFS (-60 to 0) to 0-100% */}
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${getDbfsColor(
                        currentDbfs
                      )} shadow-sm`}
                      style={{
                        width: `${Math.min(100, Math.max(3, ((currentDbfs + 60) / 60) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Quick Actions & Guidance */}
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-300">
                  <p className="font-semibold text-slate-200">
                    ¿Quieres evaluar el micrófono con una frase real?
                  </p>
                  <p className="text-slate-400 text-[11px]">
                    Realiza una prueba guiada de 5 segundos con grabación y análisis de diagnóstico.
                  </p>
                </div>
                <button
                  onClick={handleStart5SecondTest}
                  disabled={isTesting}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition flex items-center justify-center gap-2 shrink-0"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Iniciar Prueba de 5 Segundos</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GUIDED 5-SECOND TEST & DIAGNOSTIC REPORT */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              {/* Active Test Banner */}
              {isTesting ? (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-500/40 text-center space-y-3 shadow-xl">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/20 border-2 border-cyan-400 text-cyan-300 text-3xl font-black font-mono animate-pulse">
                    {testCountdown}s
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100 text-base">
                      Habla ahora con tu voz natural frente al dispositivo
                    </h4>
                    <p className="text-xs text-cyan-300 mt-1 max-w-md mx-auto">
                      "Hola, probando calidad de audio y micrófono para Traduce Ya."
                    </p>
                  </div>

                  {/* Real-time wave and meter during test */}
                  <div className="pt-2 max-w-sm mx-auto space-y-1.5">
                    <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-75 ${getDbfsColor(
                          currentDbfs
                        )}`}
                        style={{
                          width: `${Math.min(100, Math.max(3, ((currentDbfs + 60) / 60) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>Nivel: {currentDbfs} dB</span>
                      {isCurrentlyClipping ? (
                        <span className="text-rose-400 font-bold animate-pulse">
                          ¡SATURANDO!
                        </span>
                      ) : isCurrentlySilent ? (
                        <span className="text-amber-400">Silencio</span>
                      ) : (
                        <span className="text-emerald-400">Audio Activo</span>
                      )}
                    </div>
                  </div>

                  {testSpeechTranscript && (
                    <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200 text-left">
                      <span className="text-[10px] text-cyan-400 block font-semibold">
                        Transcripción en vivo:
                      </span>
                      "{testSpeechTranscript}"
                    </div>
                  )}
                </div>
              ) : (
                /* Start Button when not testing */
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 mx-auto flex items-center justify-center border border-cyan-500/30">
                    <AudioLines className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto">
                    <h4 className="font-bold text-slate-100 text-sm sm:text-base">
                      Test Integral de Audio de 5 Segundos
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Grabará un fragmento corto mientras hablas normalmente. Evaluará si tu dispositivo
                      capta silencio, si el volumen es óptimo o si sufre de clipping/saturación.
                    </p>
                  </div>
                  <button
                    onClick={handleStart5SecondTest}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Comenzar Prueba Guiada (5 segundos)</span>
                  </button>
                </div>
              )}

              {/* Test Report Card (Rendered after test finishes) */}
              {testReport && (
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3.5 shadow-xl">
                  {/* Status Headline */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                        testReport.status === 'optimal'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : testReport.status === 'good'
                          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
                          : testReport.status === 'low_volume'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      }`}
                    >
                      {testReport.status === 'optimal' ? (
                        <CheckCircle2 className="w-6 h-6" />
                      ) : testReport.status === 'good' ? (
                        <Sparkles className="w-6 h-6" />
                      ) : testReport.status === 'low_volume' ? (
                        <VolumeX className="w-6 h-6" />
                      ) : testReport.status === 'clipping' ? (
                        <AlertTriangle className="w-6 h-6" />
                      ) : (
                        <ShieldAlert className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <h4
                        className={`font-bold text-sm sm:text-base ${
                          testReport.status === 'optimal'
                            ? 'text-emerald-300'
                            : testReport.status === 'good'
                            ? 'text-cyan-300'
                            : testReport.status === 'low_volume'
                            ? 'text-amber-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {testReport.headline}
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                        {testReport.details}
                      </p>
                    </div>
                  </div>

                  {/* Diagnostic Numbers Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Nivel Pico</div>
                      <div className="text-sm font-black font-mono text-slate-100 mt-0.5">
                        {testReport.peakDbfs} dBFS
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {testReport.peakDbfs > -1 ? 'Saturado' : 'Máx alcanzado'}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Promedio RMS</div>
                      <div className="text-sm font-black font-mono text-slate-100 mt-0.5">
                        {testReport.avgDbfs} dBFS
                      </div>
                      <div className="text-[9px] text-slate-500">Volumen continuo</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Silencio</div>
                      <div
                        className={`text-sm font-black font-mono mt-0.5 ${
                          testReport.silencePercent > 80 ? 'text-amber-400' : 'text-slate-100'
                        }`}
                      >
                        {testReport.silencePercent}%
                      </div>
                      <div className="text-[9px] text-slate-500">Tiempo sin voz</div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-950/80 border border-slate-800">
                      <div className="text-[10px] text-slate-400">Picos de Clipping</div>
                      <div
                        className={`text-sm font-black font-mono mt-0.5 ${
                          testReport.clippingCount > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {testReport.clippingCount}
                      </div>
                      <div className="text-[9px] text-slate-500">
                        {testReport.clippingCount > 0 ? 'Distorsión digital' : '0 distorsiones'}
                      </div>
                    </div>
                  </div>

                  {/* Playback Box: Hear what the mic captured! */}
                  {recordedAudioUrl && (
                    <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 text-xs">
                        <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0">
                          <Headphones className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100">
                            Escuchar cómo suena tu micrófono
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Reproduce los 5 segundos grabados para oír si hay eco, zumbido o sonido apagado.
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleTogglePlayback}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shrink-0"
                      >
                        {isPlayingRecording ? (
                          <>
                            <Square className="w-3.5 h-3.5" />
                            <span>Pausar</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Escuchar</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Speech recognition result during test */}
                  {testReport.transcript && (
                    <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs space-y-1">
                      <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Reconocimiento de voz exitoso durante la prueba</span>
                      </div>
                      <p className="text-slate-200 italic">
                        "{testReport.transcript}"
                      </p>
                    </div>
                  )}

                  {/* Actionable Recommendations */}
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                    <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                      <Info className="w-4 h-4" />
                      <span>Recomendaciones para tu configuración:</span>
                    </div>
                    <ul className="space-y-1.5 pl-1 text-slate-300">
                      {testReport.recommendations.map((rec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Repeat Test Button */}
                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={handleStart5SecondTest}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Repetir Prueba de 5s</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TROUBLESHOOTING GUIDE (Por qué no registra audio mi dispositivo) */}
          {activeTab === 'troubleshoot' && (
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="font-bold text-cyan-300 text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-cyan-400" />
                  <span>Causas frecuentes de 'Sin Audio' o 'Micrófono no responde':</span>
                </div>
                <div className="space-y-2.5 text-slate-300">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-bold text-slate-100 block">
                      1. Permisos del navegador bloqueados o en 'Preguntar'
                    </span>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      Si cancelaste por error el permiso cuando la app se abrió, el navegador bloquea la entrada de audio en silencio. Haz clic en el icono del candado o sintonizador a la izquierda de la URL y cambia "Micrófono" a <strong>Permitir</strong>.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-bold text-slate-100 block">
                      2. Silencio Total: Interruptor físico o botón de 'Mute'
                    </span>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      Muchos auriculares, cascos gaming o micrófonos USB cuentan con una palanca física de silencio. Si está en rojo o en 'Mute', el sistema no recibirá ningún dato aunque el navegador tenga permisos.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-bold text-slate-100 block">
                      3. Saturación / Clipping extremo
                    </span>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      Ocurre cuando se sostiene el móvil pegado a la boca o la ganancia es demasiado alta. El sonido 'revienta' las ondas cuadradas digitales, impidiendo que la IA o el reconocedor de voz identifiquen las vocales y consonantes. <strong>Solución:</strong> Coloca el móvil plano sobre la mesa entre 20 y 50 cm de distancia.
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="font-bold text-slate-100 block">
                      4. Auriculares Bluetooth conectados en su estuche
                    </span>
                    <p className="text-slate-400 text-[11px] mt-0.5 leading-relaxed">
                      A veces los auriculares inalámbricos siguen conectados por Bluetooth dentro de su estuche o en el bolso, obligando al sistema a enviar la entrada de audio a unos auriculares que nadie está usando. Desconecta el Bluetooth o selecciona el micrófono integrado en el selector superior.
                    </p>
                  </div>
                </div>
              </div>

              {/* Guía según plataforma */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block">
                  Ajustes del Sistema por Dispositivo:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-cyan-300 block">Android</span>
                    <span className="text-slate-400">
                      Ajustes &gt; Aplicaciones &gt; Chrome (o tu navegador) &gt; Permisos &gt; Micrófono &gt; 'Permitir solo mientras la app está en uso'.
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-cyan-300 block">iPhone / iPad (iOS Safari)</span>
                    <span className="text-slate-400">
                      Ajustes &gt; Safari &gt; Ajustes para sitios web &gt; Micrófono &gt; 'Permitir'.
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-cyan-300 block">Windows 10 / 11</span>
                    <span className="text-slate-400">
                      Configuración &gt; Privacidad y seguridad &gt; Micrófono &gt; Activar 'Permitir que las aplicaciones accedan al micrófono'.
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="font-bold text-cyan-300 block">macOS</span>
                    <span className="text-slate-400">
                      Ajustes del Sistema &gt; Privacidad y Seguridad &gt; Micrófono &gt; Marcar la casilla de tu navegador.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                isLiveMonitoring ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}
            />
            <span className="text-[11px]">
              {isLiveMonitoring ? 'Flujo de audio activo en tiempo real' : 'Monitoreo pausado'}
            </span>
          </div>

          <button
            onClick={() => {
              cleanupStream();
              onClose();
            }}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
          >
            Listo / Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
