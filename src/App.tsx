import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  ArrowLeftRight,
  Radio,
  BookOpen,
  Settings,
  Sparkles,
  Volume2,
  VolumeX,
  Smartphone,
  ChevronDown,
  Info,
  Maximize2,
  List,
  SplitSquareVertical,
  HelpCircle,
  Keyboard,
  AlertCircle,
  ExternalLink,
  History,
  Trash2,
  Zap,
  Eye,
  Users,
  MessageSquarePlus,
  Inbox,
  Activity,
  Gift,
} from 'lucide-react';
import { fetchAndRecordVisit, getCachedVisitorStats, subscribeVisitorStats, VisitorStats } from './services/visitorService';

import {
  Language,
  ConversationTurn,
  ViewMode,
  TranslatorSettings,
} from './types/translator';
import {
  DEFAULT_USER_LANG,
  DEFAULT_PARTNER_LANG,
  AUTO_DETECT_LANGUAGE,
  matchLanguageByNameOrIso,
} from './data/languages';
import {
  translateText,
  translateAudioBlob,
} from './services/geminiService';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';

import { FaceToFaceView } from './components/FaceToFaceView';
import { ConversationList } from './components/ConversationList';
import { LanguageSelectorModal } from './components/LanguageSelectorModal';
import { QuickPhrasesModal } from './components/QuickPhrasesModal';
import { SettingsModal } from './components/SettingsModal';
import { FullScreenModal } from './components/FullScreenModal';
import { AudioWaveform } from './components/AudioWaveform';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { InstructionsModal } from './components/InstructionsModal';
import { TextInputModal } from './components/TextInputModal';
import { PaywallModal } from './components/PaywallModal';
import { FeedbackModal } from './components/FeedbackModal';
import { FeedbackViewerModal } from './components/FeedbackViewerModal';
import { AudioDiagnosticModal } from './components/AudioDiagnosticModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  isProUser,
  isAdminAuthenticated,
  getFreeTrialUsage,
  incrementFreeTrialUsage,
  getRemainingTranslations,
  canPerformTranslation,
  verifyUrlReturnUnlock,
  FREE_TRIAL_LIMIT,
} from './utils/licenseManager';
import { sanitizeExternalUrl } from './utils/urlSecurity';

const STORAGE_KEY_TURNS = 'traductor_ya_turns_v1';
const STORAGE_KEY_SETTINGS = 'traductor_ya_settings_v1';

export default function App() {
  // Languages state
  const [userLang, setUserLang] = useState<Language>(DEFAULT_USER_LANG);
  const [partnerLang, setPartnerLang] = useState<Language>(DEFAULT_PARTNER_LANG);
  const [lastDetectedPartnerLang, setLastDetectedPartnerLang] = useState<string | null>(null);
  const [lastDetectedUserLang, setLastDetectedUserLang] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('facetoface');

  // Conversation turns
  const [turns, setTurns] = useState<ConversationTurn[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TURNS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Settings
  const [settings, setSettings] = useState<TranslatorSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      autoSpeak: true,
      voiceSpeed: 1.0,
      useAiVoice: false,
      voiceName: 'Kore',
      continuousListen: false,
      fontSize: 'normal',
      hapticFeedback: true,
      highContrast: false,
      noiseFilter: true,
    };
  });

  // Active speaker currently recording
  const [activeSpeaker, setActiveSpeaker] = useState<'user' | 'partner' | null>(null);
  const [translatingSpeaker, setTranslatingSpeaker] = useState<'user' | 'partner' | null>(null);
  const [interimText, setInterimText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isContinuous, setIsContinuous] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.continuousListen === 'boolean') {
          return parsed.continuousListen;
        }
      }
    } catch {}
    return false;
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [iframeBannerDismissed, setIframeBannerDismissed] = useState(false);
  const isInIframe = (() => {
    try {
      return typeof window !== 'undefined' && window.self !== window.top;
    } catch {
      return true;
    }
  })();

  // Modals state
  const [isUserLangModalOpen, setIsUserLangModalOpen] = useState(false);
  const [isPartnerLangModalOpen, setIsPartnerLangModalOpen] = useState(false);
  const [isQuickPhrasesOpen, setIsQuickPhrasesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isTextInputOpen, setIsTextInputOpen] = useState(false);
  const [textInputSpeaker, setTextInputSpeaker] = useState<'user' | 'partner'>('user');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackViewerOpen, setIsFeedbackViewerOpen] = useState(false);
  const [isAudioDiagnosticOpen, setIsAudioDiagnosticOpen] = useState(false);
  const [statusAlert, setStatusAlert] = useState<{ message: string; type: 'error' | 'info' | 'success' } | null>(null);
  const [fullScreenTurn, setFullScreenTurn] = useState<ConversationTurn | null>(null);

  // Monetization & usage quota state
  const [isPro, setIsPro] = useState<boolean>(() => isProUser());
  const [isAdmin, setIsAdmin] = useState<boolean>(() => isAdminAuthenticated());
  const [remainingQuota, setRemainingQuota] = useState<number>(() => getRemainingTranslations());
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  const syncLicenseState = useCallback(() => {
    setIsAdmin(isAdminAuthenticated());
    setIsPro(isProUser());
    setRemainingQuota(getRemainingTranslations());
  }, []);

  // Verify legitimate server-backed activation code or Mercado Pago return params
  useEffect(() => {
    let active = true;
    verifyUrlReturnUnlock().then((unlocked) => {
      if (!active || !unlocked) return;
      syncLicenseState();
      setStatusAlert({
        message: '🎉 ¡Pase Ilimitado Activado! Gracias por tu verificación.',
        type: 'success',
      });
      setTimeout(() => setStatusAlert(null), 8000);
    });
    return () => {
      active = false;
    };
  }, [syncLicenseState]);

  // Visitor stats state (visitas reales con auto-recuperación)
  const [visitorStats, setVisitorStats] = useState<VisitorStats>(() => getCachedVisitorStats());

  useEffect(() => {
    let active = true;
    fetchAndRecordVisit()
      .then((stats) => {
        if (active) setVisitorStats(stats);
      })
      .catch((err) => console.warn('Visitor stats init notice:', err));

    const unsubscribe = subscribeVisitorStats((liveStats) => {
      if (active) setVisitorStats(liveStats);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Save history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TURNS, JSON.stringify(turns));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [turns]);

  // Save settings
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Settings save failed:', e);
    }
  }, [settings]);

  // Speech Synthesis Hook
  const { isSpeaking, speak, stop: stopSpeaking } = useSpeechSynthesis({
    useAiVoice: settings.useAiVoice,
    voiceName: settings.voiceName,
    defaultRate: settings.voiceSpeed,
  });

  // Current language for recognition depending on who is talking
  const currentListeningLang = activeSpeaker === 'user' ? userLang.code : partnerLang.code;

  const activeSpeakerRef = useRef<'user' | 'partner' | null>(null);
  activeSpeakerRef.current = activeSpeaker;
  const lastActiveSpeakerRef = useRef<'user' | 'partner'>('user');

  const handleProcessSpeechRef = useRef<(text: string, speaker: 'user' | 'partner') => void>(() => {});
  const handleProcessAudioRef = useRef<(blob: Blob, speaker: 'user' | 'partner') => void>(() => {});
  const handleStartListeningRef = useRef<(speaker: 'user' | 'partner') => void>(() => {});
  const continuousTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isContinuousRef = useRef(isContinuous);
  isContinuousRef.current = isContinuous;

  const clearContinuousHandoff = useCallback(() => {
    if (continuousTimerRef.current) {
      clearTimeout(continuousTimerRef.current);
      continuousTimerRef.current = null;
    }
  }, []);

  // Speech Recognition Hook
  const {
    isListening,
    isSupported,
    audioLevel,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    lang: currentListeningLang,
    noiseFilter: settings.noiseFilter !== false,
    onResult: (text) => {
      setInterimText(text);
    },
    onFinalText: (text) => {
      const speaker = activeSpeakerRef.current || lastActiveSpeakerRef.current;
      if (speaker && text.trim()) {
        handleProcessSpeechRef.current(text.trim(), speaker);
      }
    },
    onAudioRecorded: (blob) => {
      const speaker = activeSpeakerRef.current || lastActiveSpeakerRef.current || 'user';
      handleProcessAudioRef.current(blob, speaker);
    },
    onEnd: () => {
      setActiveSpeaker(null);
      setInterimText('');
    },
    onError: (err) => {
      console.warn('Speech rec error:', err);
      setActiveSpeaker(null);
      setInterimText('');
      if (err === 'not-allowed') {
        setStatusAlert({
          message: isInIframe
            ? 'La Vista Previa bloquea el micrófono en móviles. Toca "Abrir en Chrome" abajo para usarlo.'
            : 'Permiso de micrófono bloqueado: toca el candado/ajustes junto a la URL → Micrófono → Permitir.',
          type: 'error',
        });
        setTimeout(() => setStatusAlert(null), 12000);
      } else if (err === 'mic-busy') {
        setStatusAlert({
          message:
            'El micrófono está ocupado por otra app o llamada. Ciérrala e intenta de nuevo.',
          type: 'error',
        });
        setTimeout(() => setStatusAlert(null), 7000);
      } else if (err === 'mic-not-found') {
        setStatusAlert({
          message:
            'No se detectó ningún micrófono conectado en este dispositivo.',
          type: 'error',
        });
        setTimeout(() => setStatusAlert(null), 7000);
      } else if (err) {
        setStatusAlert({
          message: `No se pudo iniciar el micrófono (${err}).`,
          type: 'error',
        });
        setTimeout(() => setStatusAlert(null), 7000);
      }
    },
  });

  const handleStartListening = useCallback(
    async (speaker: 'user' | 'partner') => {
      // Check daily free quota if not pro
      if (!isPro && !canPerformTranslation()) {
        setIsPaywallOpen(true);
        return;
      }

      try {
        clearContinuousHandoff();
        stopSpeaking();
        setActiveSpeaker(speaker);
        activeSpeakerRef.current = speaker;
        lastActiveSpeakerRef.current = speaker;
        const targetLang = speaker === 'user' ? userLang.code : partnerLang.code;
        await startListening(targetLang);
      } catch (err) {
        console.warn('handleStartListening caught error safely:', err);
      }
    },
    [clearContinuousHandoff, isPro, partnerLang.code, startListening, stopSpeaking, userLang.code]
  );
  handleStartListeningRef.current = handleStartListening;

  const handleStopListening = useCallback(() => {
    clearContinuousHandoff();
    setActiveSpeaker(null);
    activeSpeakerRef.current = null;
    stopListening();
  }, [clearContinuousHandoff, stopListening]);

  // Handle final speech text and translate
  const handleProcessSpeech = useCallback(
    async (text: string, speaker: 'user' | 'partner') => {
      const trimmed = text.trim();
      if (!trimmed) {
        setActiveSpeaker(null);
        setInterimText('');
        return;
      }

      // Quota check before translating
      if (!isPro && !canPerformTranslation()) {
        setIsPaywallOpen(true);
        setActiveSpeaker(null);
        setInterimText('');
        return;
      }

      setIsTranslating(true);
      setTranslatingSpeaker(speaker);
      setInterimText('');

      const sourceLanguage = speaker === 'user' ? userLang : partnerLang;
      const targetLanguage = speaker === 'user' ? partnerLang : userLang;

      // Handle auto-detect parameters
      const fromLangParam =
        sourceLanguage.code === 'auto' ? 'Auto-detect' : sourceLanguage.name;

      let toLangParam = targetLanguage.name;
      let targetSpeechLangCode = targetLanguage.code;

      if (targetLanguage.code === 'auto') {
        if (speaker === 'user') {
          // If partner's language was previously detected, translate into it
          if (lastDetectedPartnerLang) {
            toLangParam = lastDetectedPartnerLang;
            const matched = matchLanguageByNameOrIso(lastDetectedPartnerLang);
            targetSpeechLangCode = matched ? matched.code : 'en-US';
          } else {
            toLangParam = 'English';
            targetSpeechLangCode = 'en-US';
          }
        } else {
          // Partner spoke and user is auto: translate into user's language or Spanish
          if (lastDetectedUserLang) {
            toLangParam = lastDetectedUserLang;
            const matched = matchLanguageByNameOrIso(lastDetectedUserLang);
            targetSpeechLangCode = matched ? matched.code : 'es-ES';
          } else {
            toLangParam = 'Español';
            targetSpeechLangCode = 'es-ES';
          }
        }
      }

      try {
        const result = await translateText(
          trimmed,
          fromLangParam,
          toLangParam
        );

        if (result.detectedLanguage) {
          if (speaker === 'partner') {
            setLastDetectedPartnerLang(result.detectedLanguage);
          } else {
            setLastDetectedUserLang(result.detectedLanguage);
          }
        }

        // Ensure final speech code is a valid locale
        let finalSpeechCode = targetSpeechLangCode;
        if (!finalSpeechCode || finalSpeechCode === 'auto') {
          const matched = matchLanguageByNameOrIso(toLangParam);
          finalSpeechCode = matched ? matched.code : 'es-ES';
        }

        const newTurn: ConversationTurn = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          speaker,
          originalText: trimmed,
          translatedText: result.translatedText,
          sourceLang: sourceLanguage.code,
          targetLang: finalSpeechCode,
          detectedLanguage: result.detectedLanguage,
          phonetic: result.phonetic,
          nuance: result.nuance,
          alternatives: result.alternatives,
          timestamp: Date.now(),
        };

        setTurns((prev) => [newTurn, ...prev]);

        // Decrement free trial quota if not pro
        if (!isPro) {
          incrementFreeTrialUsage();
          setRemainingQuota(getRemainingTranslations());
        }

        // Clear translating indicator right away so text appears immediately
        setIsTranslating(false);
        setTranslatingSpeaker(null);

        // Haptic feedback if supported
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate?.([60]);
        }

        // Auto speak translation; in continuous mode wait until speech finishes before switching mic
        if (settings.autoSpeak) {
          const speakPromise = speak(result.translatedText, finalSpeechCode, {
            speed: settings.voiceSpeed,
            preferAi: settings.useAiVoice,
          });
          if (isContinuousRef.current) {
            await speakPromise;
          }
        }

        if (isContinuousRef.current && activeSpeakerRef.current === null) {
          const nextSpeaker = speaker === 'user' ? 'partner' : 'user';
          clearContinuousHandoff();
          continuousTimerRef.current = setTimeout(() => {
            if (isContinuousRef.current && activeSpeakerRef.current === null) {
              handleStartListeningRef.current(nextSpeaker);
            }
          }, settings.autoSpeak ? 450 : 1200);
        }
      } catch (err: any) {
        console.warn('Translation workflow notice:', err);
        setStatusAlert({
          message: err?.message || 'No se pudo completar la traducción en este momento.',
          type: 'error',
        });
        setTimeout(() => setStatusAlert(null), 7000);
      } finally {
        setIsTranslating(false);
        setTranslatingSpeaker(null);
      }
    },
    [clearContinuousHandoff, isPro, partnerLang, settings.autoSpeak, settings.hapticFeedback, settings.useAiVoice, settings.voiceName, settings.voiceSpeed, speak, userLang]
  );
  handleProcessSpeechRef.current = handleProcessSpeech;

  // Audio Multimodal Direct Translation
  const handleProcessAudio = useCallback(
    async (audioBlob: Blob, speaker: 'user' | 'partner') => {
      // Quota check before translating audio
      if (!isPro && !canPerformTranslation()) {
        setIsPaywallOpen(true);
        setIsTranslating(false);
        setTranslatingSpeaker(null);
        setInterimText('');
        return;
      }

      setIsTranslating(true);
      setTranslatingSpeaker(speaker);
      setInterimText('Traduciendo audio...');

      const sourceLanguage = speaker === 'user' ? userLang : partnerLang;
      const targetLanguage = speaker === 'user' ? partnerLang : userLang;

      const fromLangParam =
        sourceLanguage.code === 'auto' ? 'Auto-detect' : sourceLanguage.name;
      const toLangParam =
        targetLanguage.code === 'auto'
          ? speaker === 'user'
            ? 'English'
            : 'Español'
          : targetLanguage.name;

      console.log('[App:handleProcessAudio] Received audio chunk:', {
        blobSize: audioBlob?.size,
        blobType: audioBlob?.type,
        speaker,
      });

      if (!audioBlob || audioBlob.size < 250) {
        console.warn('[App:handleProcessAudio] Audio blob too small or empty (<250 bytes).');
        setStatusAlert({
          message: 'No se detectó audio audible. Habla un poco más fuerte o acércate al micrófono.',
          type: 'info',
        });
        setTimeout(() => setStatusAlert(null), 5000);
        setIsTranslating(false);
        setTranslatingSpeaker(null);
        setInterimText('');
        return;
      }

      try {
        const result = await translateAudioBlob(audioBlob, fromLangParam, toLangParam);

        let finalTranslatedText = result.translatedText;
        const finalTranscribedText = result.transcribedText;

        // If transcribed text exists but translatedText was empty, translate it via text fallback
        if (!finalTranslatedText && finalTranscribedText) {
          try {
            const fallbackRes = await translateText(finalTranscribedText, fromLangParam, toLangParam);
            finalTranslatedText = fallbackRes.translatedText;
          } catch (e) {
            console.warn('Fallback translateText failed:', e);
            finalTranslatedText = finalTranscribedText;
          }
        }

        if (result.noSpeech || (!finalTranslatedText && !finalTranscribedText)) {
          setStatusAlert({
            message: 'No se detectó voz con claridad. Habla más cerca del micrófono o usa "Diagnóstico Mic".',
            type: 'error',
          });
          setTimeout(() => setStatusAlert(null), 6000);
          return;
        }

        if (result.detectedLanguage) {
          if (speaker === 'partner') {
            setLastDetectedPartnerLang(result.detectedLanguage);
          } else {
            setLastDetectedUserLang(result.detectedLanguage);
          }
        }

        let targetSpeechCode = targetLanguage.code;
        if (!targetSpeechCode || targetSpeechCode === 'auto') {
          const matched = matchLanguageByNameOrIso(toLangParam);
          targetSpeechCode = matched ? matched.code : 'es-ES';
        }

        const newTurn: ConversationTurn = {
          id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          speaker,
          originalText: finalTranscribedText || 'Audio recibido',
          translatedText: finalTranslatedText || 'Audio recibido',
          sourceLang: sourceLanguage.code,
          targetLang: targetSpeechCode,
          detectedLanguage: result.detectedLanguage,
          phonetic: result.phonetic,
          timestamp: Date.now(),
        };

        setTurns((prev) => [newTurn, ...prev]);

        // Decrement free trial quota if not pro
        if (!isPro) {
          incrementFreeTrialUsage();
          setRemainingQuota(getRemainingTranslations());
        }

        setIsTranslating(false);
        setTranslatingSpeaker(null);
        setInterimText('');

        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate?.([60]);
        }

        // Auto speak translation; in continuous mode wait until speech finishes before switching mic
        if (settings.autoSpeak && finalTranslatedText) {
          const speakPromise = speak(finalTranslatedText, targetSpeechCode, {
            speed: settings.voiceSpeed,
            preferAi: settings.useAiVoice,
          });
          if (isContinuousRef.current) {
            await speakPromise;
          }
        }

        if (isContinuousRef.current && activeSpeakerRef.current === null) {
          const nextSpeaker = speaker === 'user' ? 'partner' : 'user';
          clearContinuousHandoff();
          continuousTimerRef.current = setTimeout(() => {
            if (isContinuousRef.current && activeSpeakerRef.current === null) {
              handleStartListeningRef.current(nextSpeaker);
            }
          }, settings.autoSpeak ? 450 : 1200);
        }
      } catch (err: any) {
        console.warn('[App:handleProcessAudio] Audio translation notice:', err);
        const rawMsg = String(err?.message || '');
        const isFetchIssue =
          rawMsg.includes('Failed to fetch') ||
          rawMsg.includes('Load failed') ||
          rawMsg.includes('NetworkError') ||
          rawMsg.includes('conectar con el servidor') ||
          rawMsg.includes('interrumpió la conexión');
        const errorText = isFetchIssue
          ? 'No se pudo conectar con el servidor de traducción. Verifica tu conexión de red o reintenta.'
          : rawMsg || 'Error al traducir el audio. Intenta nuevamente o verifica tu micrófono.';
        setStatusAlert({
          message: errorText,
          type: 'error',
        });
        setTimeout(() => setStatusAlert(null), 7000);
      } finally {
        setIsTranslating(false);
        setTranslatingSpeaker(null);
        setInterimText('');
      }
    },
    [clearContinuousHandoff, isPro, partnerLang, settings.autoSpeak, settings.hapticFeedback, settings.useAiVoice, settings.voiceSpeed, speak, userLang]
  );
  handleProcessAudioRef.current = handleProcessAudio;

  // Language Swap
  const handleSwapLanguages = () => {
    setUserLang(partnerLang);
    setPartnerLang(userLang);
  };

  // Quick phrase selected
  const handleSelectQuickPhrase = (phrase: string) => {
    handleProcessSpeech(phrase, 'user');
  };

  // Toggle & Remember Modo Mesa Manos Libres
  const handleToggleContinuous = useCallback(
    (targetState?: boolean) => {
      setIsContinuous((prev) => {
        const nextVal = typeof targetState === 'boolean' ? targetState : !prev;

        // Persist in settings so the app always remembers this preference
        setSettings((current) => {
          const updated = { ...current, continuousListen: nextVal };
          try {
            localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        if (nextVal) {
          setStatusAlert({
            message: '🎙️ Modo Mesa Manos Libres ACTIVADO: Coloca el móvil sobre la mesa. La app alternará turnos automáticamente.',
            type: 'success',
          });
          setTimeout(() => setStatusAlert(null), 6000);

          if (settings.hapticFeedback && 'vibrate' in navigator) {
            navigator.vibrate?.([40, 60, 40]);
          }

          // If nobody is speaking, start listening automatically after a brief beat
          if (!activeSpeaker && !isTranslating) {
            setTimeout(() => {
              handleStartListeningRef.current('user');
            }, 600);
          }
        } else {
          setStatusAlert({
            message: 'Modo Mesa Manos Libres pausado (control manual por botones activado).',
            type: 'info',
          });
          setTimeout(() => setStatusAlert(null), 3500);
        }

        return nextVal;
      });
    },
    [activeSpeaker, isTranslating, settings.hapticFeedback]
  );

  // Clear conversation history
  const handleClearHistory = useCallback(() => {
    if (turns.length === 0) {
      setStatusAlert({
        message: 'El historial ya está vacío.',
        type: 'success',
      });
      setTimeout(() => setStatusAlert(null), 2500);
      return;
    }
    setTurns([]);
    try {
      localStorage.removeItem(STORAGE_KEY_TURNS);
    } catch {}
    if ('vibrate' in navigator) {
      navigator.vibrate?.([40]);
    }
    setStatusAlert({
      message: 'Historial de conversación limpiado con éxito.',
      type: 'success',
    });
    setTimeout(() => setStatusAlert(null), 3000);
  }, [turns.length]);

  const latestTurn = turns.length > 0 ? turns[0] : null;

  return (
    <div className={`flex flex-col h-[100dvh] max-h-[100dvh] h-full w-full max-w-full overflow-hidden font-sans transition-colors duration-200 ${
      settings.highContrast
        ? 'bg-black text-white high-contrast-mode'
        : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Top Header */}
      <header className="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 z-30 shrink-0">
        {/* Primary Row: Always fits cleanly on mobile and desktop without clipping */}
        <div className="px-3 sm:px-5 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {/* Logo TY con iridiscencia */}
            <div className="relative group cursor-pointer shrink-0" title="Traduce Ya">
              <div className="absolute -inset-1 rounded-2xl iridescent-bg blur-[6px] opacity-75 group-hover:opacity-100 transition duration-700 animate-pulse" />
              <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl iridescent-bg iridescent-shimmer-container flex items-center justify-center text-slate-950 shadow-lg font-black text-sm sm:text-base tracking-wider border border-white/40 select-none">
                <span className="relative z-10 font-black text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]">
                  TY
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="font-black text-sm sm:text-lg tracking-tight iridescent-text flex items-center gap-1.5 drop-shadow-sm truncate">
                <span>Traduce Ya</span>
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping shrink-0" />
              </h1>
              <p className="text-[10px] text-slate-400 hidden sm:block font-medium truncate">
                Voz en vivo cara a cara y manos libres
              </p>
            </div>
          </div>

          {/* Primary Right Controls: Mode Switcher + Ajustes (Always Visible) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center bg-slate-950/80 p-0.5 sm:p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('facetoface')}
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition ${
                  viewMode === 'facetoface'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Modo Cara a Cara en Mesa"
              >
                <SplitSquareVertical className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Cara a Cara</span>
                <span className="sm:hidden">Mesa</span>
              </button>
              <button
                onClick={() => setViewMode('chat')}
                title="Modo Bidireccional"
                className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition ${
                  viewMode === 'chat'
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Bidireccional</span>
                <span className="sm:hidden">Chat</span>
              </button>
            </div>

            {/* Always-Visible Install + Ajustes Buttons */}
            <PWAInstallButton variant="header" />

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-slate-100 text-xs font-bold transition shadow-sm active:scale-95"
              title="Abrir menú de Ajustes y Diagnóstico de Micrófono"
            >
              <Settings className="w-4 h-4 text-cyan-400" />
              <span>Ajustes</span>
            </button>
          </div>
        </div>

        {/* Secondary Utility Strip: Horizontally scrollable on small screens so no tool is ever hidden */}
        <div className="px-3 sm:px-5 pb-2 flex items-center gap-1.5 overflow-x-auto border-t border-slate-800/60 pt-1.5">
          {/* Quick Toggle for Modo Mesa / Manos Libres */}
          <button
            onClick={() => handleToggleContinuous()}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition shrink-0 active:scale-95 ${
              isContinuous
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                : 'bg-emerald-950/40 hover:bg-emerald-900/40 border-emerald-500/40 text-emerald-300 shadow-sm'
            }`}
            title="Activar o desactivar Modo Mesa / Manos Libres"
          >
            <Radio className={`w-3.5 h-3.5 ${isContinuous ? 'text-emerald-400 animate-pulse' : 'text-emerald-400'}`} />
            <span>{isContinuous ? 'Modo Mesa / Manos Libres: ON' : 'Activar Modo Mesa / Manos Libres'}</span>
          </button>

          {/* Quick 1-Tap Audio Diagnostic */}
          <button
            onClick={() => {
              handleStopListening();
              setIsAudioDiagnosticOpen(true);
            }}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold flex items-center gap-1.5 transition shrink-0 active:scale-95"
            title="Probar calidad de audio, silencio y clipping del micrófono"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Diagnóstico Mic</span>
          </button>

          <button
            onClick={() => setIsQuickPhrasesOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition shrink-0"
            title="Frases Rápidas"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Frases</span>
          </button>

          <button
            onClick={() => setViewMode('chat')}
            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition shrink-0 ${
              viewMode === 'chat'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-slate-800/80 hover:bg-slate-700/80 border-slate-700/50 text-slate-300 hover:text-white'
            }`}
            title="Ver Historial de conversación"
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span>Historial</span>
            {turns.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] leading-none rounded-full bg-cyan-500 text-slate-950 font-bold">
                {turns.length}
              </span>
            )}
          </button>

          <button
            onClick={handleClearHistory}
            className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-[11px] font-semibold flex items-center gap-1 transition shrink-0 active:scale-95"
            title="Limpiar y vaciar historial de conversación"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Limpiar</span>
          </button>

          <button
            onClick={() => setIsInstructionsOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition shrink-0"
            title="Instrucciones y Guía de Uso"
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>Guía</span>
          </button>

          <button
            onClick={() => setIsFeedbackOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition shrink-0"
            title="Buzón de sugerencias y reportes"
          >
            <MessageSquarePlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Buzón</span>
          </button>

          {/* Monetización: Pase Ilimitado o Cupo Restante */}
          {isPro ? (
            <button
              onClick={() => {
                setStatusAlert({
                  message: '✨ Tu Pase Ilimitado está activo permanentemente.',
                  type: 'success',
                });
                setTimeout(() => setStatusAlert(null), 4000);
              }}
              className="px-2.5 py-1 rounded-lg iridescent-soft-bg border border-amber-400/50 text-amber-200 text-[11px] font-bold flex items-center gap-1 shadow-sm shrink-0"
              title="Pase Ilimitado Activado"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>PRO</span>
            </button>
          ) : (
            <button
              onClick={() => setIsPaywallOpen(true)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition shrink-0 shadow-sm ${
                remainingQuota > 0
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-500/50 text-emerald-300'
                  : 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50 text-amber-300'
              }`}
              title={
                remainingQuota > 0
                  ? `Tienes ${remainingQuota} de ${FREE_TRIAL_LIMIT} frases gratuitas de prueba. Clic para ver detalles.`
                  : `Completaste tus ${FREE_TRIAL_LIMIT} frases gratis de prueba. Clic para activar Pase Ilimitado.`
              }
            >
              {remainingQuota > 0 ? (
                <>
                  <Gift className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  <span>{remainingQuota} de {FREE_TRIAL_LIMIT} frases gratis</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>0 de {FREE_TRIAL_LIMIT} frases gratis</span>
                </>
              )}
            </button>
          )}

          {/* Contador de Visitas Reales */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1 transition shrink-0"
            title="Ver estadísticas de visitas"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-mono text-cyan-300 font-bold">{visitorStats.totalVisits.toLocaleString()}</span>
            {isAdmin && (
              <span className="text-[10px] text-amber-400 font-semibold">👑</span>
            )}
          </button>

          <a
            href={typeof window !== 'undefined' ? sanitizeExternalUrl(window.location.href, '#') : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 hover:text-white text-[11px] font-medium flex items-center gap-1 transition shrink-0"
            title="Abrir app en pestaña independiente"
          >
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
            <span>Nueva pestaña</span>
          </a>
        </div>
      </header>

      {/* Offline Status Indicator */}
      <OfflineIndicator />

      {/* Embedded Preview Iframe Notice for Mobile Mic Access */}
      {isInIframe && !iframeBannerDismissed && (
        <div className="bg-cyan-950/90 border-b border-cyan-500/40 px-3 py-1.5 text-xs text-cyan-100 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-[11px] leading-snug">
              Vista previa integrada: si el micrófono no responde en el celular, ábrela directo en el navegador.
            </span>
            <a
              href={typeof window !== 'undefined' ? sanitizeExternalUrl(window.location.href, '#') : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-0.5 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shrink-0 transition"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Abrir en Chrome</span>
            </a>
          </div>
          <button
            onClick={() => setIframeBannerDismissed(true)}
            className="text-[10px] text-cyan-300 hover:text-white px-1 py-0.5 shrink-0"
            title="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Alert toast notification */}
      {statusAlert && (
        <div
          className={`px-3 py-2 text-xs flex items-start justify-between gap-2 z-40 border-b animate-fade-in shrink-0 ${
            statusAlert.type === 'error'
              ? 'bg-rose-950/95 text-rose-100 border-rose-500/40'
              : 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
          }`}
        >
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" />
              <span className="leading-snug">{statusAlert.message}</span>
            </div>
            {statusAlert.type === 'error' && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <a
                  href={typeof window !== 'undefined' ? sanitizeExternalUrl(window.location.href, '#') : '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition"
                >
                  Abrir en Chrome / pestaña nueva
                </a>
                <button
                  onClick={() => {
                    setStatusAlert(null);
                    handleStopListening();
                    setIsAudioDiagnosticOpen(true);
                  }}
                  className="text-[11px] underline font-semibold text-cyan-300 hover:text-white"
                >
                  Diagnosticar Audio
                </button>
                <button
                  onClick={() => {
                    setStatusAlert(null);
                    setIsFeedbackOpen(true);
                  }}
                  className="text-[11px] underline font-semibold text-rose-300 hover:text-white"
                >
                  Avisar en Buzón
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setStatusAlert(null)}
            className="text-[11px] uppercase font-mono px-1.5 py-0.5 hover:opacity-80 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2 Consultas Gratuitas Clarification Banner */}
      {!isPro && (
        <div className="bg-gradient-to-r from-emerald-950/90 via-slate-900 to-cyan-950/90 border-b border-emerald-500/30 px-3 py-1.5 text-xs text-slate-200 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <span className="p-0.5 rounded-md bg-emerald-500/20 text-emerald-300 shrink-0">
              <Gift className="w-3.5 h-3.5 text-emerald-400" />
            </span>
            <span className="truncate text-[11px] sm:text-xs">
              <strong className="text-emerald-300 font-bold">{FREE_TRIAL_LIMIT} frases gratis de prueba:</strong> Pruébalo sin costo.{' '}
              <span className="text-slate-300 hidden md:inline">¡No cobramos por cada frase!</span>
              <button
                onClick={() => setIsPaywallOpen(true)}
                className="underline text-cyan-300 hover:text-white ml-1.5 font-semibold inline"
              >
                ¿Cómo funciona?
              </button>
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 ml-2">
            {remainingQuota} / {FREE_TRIAL_LIMIT} disponibles
          </span>
        </div>
      )}

      {/* Proximity / Table Guidance Banner */}
      {!bannerDismissed && (
        <div className="bg-gradient-to-r from-cyan-950/70 via-slate-900 to-emerald-950/70 border-b border-cyan-500/20 px-3 py-1 text-xs text-slate-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate text-[11px] sm:text-xs">
              <strong className="text-cyan-300">Modo Mesa:</strong> Apoya el móvil o acércalo.
              <button
                onClick={() => setIsInstructionsOpen(true)}
                className="underline text-cyan-300 hover:text-cyan-200 ml-1 font-semibold inline"
              >
                Ver guía
              </button>
            </span>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-[10px] text-slate-400 hover:text-slate-200 ml-2 uppercase font-mono shrink-0 px-1 py-0.5"
            title="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      {/* Language Bar in Chat Mode */}
      {viewMode === 'chat' && (
        <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 flex items-center justify-between shrink-0">
          {/* User Lang */}
          <button
            onClick={() => setIsUserLangModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700/60 transition"
          >
            <span className="text-xl">{userLang.flag}</span>
            <div className="text-left">
              <div className="text-xs text-emerald-400 font-semibold leading-tight flex items-center gap-1">
                <span>Tú</span>
                {userLang.code === 'auto' && lastDetectedUserLang && (
                  <span className="text-[10px] text-emerald-300 font-normal">
                    ({lastDetectedUserLang})
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-200 font-medium">{userLang.name}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>

          {/* Swap Button */}
          <button
            onClick={handleSwapLanguages}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 transition hover:rotate-180 duration-300"
            title="Intercambiar idiomas"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>

          {/* Partner Lang */}
          <button
            onClick={() => setIsPartnerLangModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700/60 transition"
          >
            <span className="text-xl">{partnerLang.flag}</span>
            <div className="text-left">
              <div className="text-xs text-cyan-400 font-semibold leading-tight flex items-center gap-1">
                <span>Interlocutor</span>
                {partnerLang.code === 'auto' && lastDetectedPartnerLang && (
                  <span className="text-[10px] text-cyan-300 font-normal">
                    ({lastDetectedPartnerLang})
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-200 font-medium">{partnerLang.name}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-1" />
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
        {viewMode === 'facetoface' ? (
          <FaceToFaceView
            userLang={userLang}
            partnerLang={partnerLang}
            latestTurn={latestTurn}
            isListeningUser={activeSpeaker === 'user'}
            isListeningPartner={activeSpeaker === 'partner'}
            isContinuous={isContinuous}
            userAudioLevel={activeSpeaker === 'user' ? audioLevel : 0}
            partnerAudioLevel={activeSpeaker === 'partner' ? audioLevel : 0}
            interimText={interimText}
            isTranslating={isTranslating}
            translatingSpeaker={translatingSpeaker}
            isSpeaking={isSpeaking}
            onStartUserSpeech={() => handleStartListening('user')}
            onStopUserSpeech={handleStopListening}
            onStartPartnerSpeech={() => handleStartListening('partner')}
            onStopPartnerSpeech={handleStopListening}
            onToggleContinuous={() => handleToggleContinuous()}
            onSpeakText={(text, langCode, cachedAudio) =>
              speak(text, langCode, {
                speed: settings.voiceSpeed,
                preferAi: settings.useAiVoice,
                cachedAudioBase64: cachedAudio,
              })
            }
            onOpenUserLangModal={() => setIsUserLangModalOpen(true)}
            onOpenPartnerLangModal={() => setIsPartnerLangModalOpen(true)}
            onOpenFullScreen={(turn) => setFullScreenTurn(turn)}
            onOpenTextInput={(speaker) => {
              setTextInputSpeaker(speaker);
              setIsTextInputOpen(true);
            }}
            isPro={isPro}
            remainingQuota={remainingQuota}
          />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden">
            <ConversationList
              turns={turns}
              userLang={userLang}
              partnerLang={partnerLang}
              isTranslating={isTranslating}
              activeSpeaker={activeSpeaker}
              interimText={interimText}
              onSpeakText={(text, langCode, cachedAudio, speed) =>
                speak(text, langCode, {
                  speed: speed ?? settings.voiceSpeed,
                  preferAi: settings.useAiVoice,
                  cachedAudioBase64: cachedAudio,
                })
              }
              onOpenFullScreen={(turn) => setFullScreenTurn(turn)}
              onClearHistory={handleClearHistory}
              fontSize={settings.fontSize}
              isPro={isPro}
            />

            {/* Bottom floating control bar in chat mode */}
            <div className="bg-slate-900/90 backdrop-blur-md border-t border-slate-800 p-2 sm:p-3 flex items-center justify-around z-20 shrink-0">
              {/* User Mic Button */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() =>
                    activeSpeaker === 'user' ? handleStopListening() : handleStartListening('user')
                  }
                  className={`relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all duration-200 shadow-xl ${
                    activeSpeaker === 'user'
                      ? 'bg-rose-500 text-white scale-105 shadow-rose-500/50'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                  }`}
                >
                  {activeSpeaker === 'user' && (
                    <span className="absolute inset-0 rounded-full bg-rose-400/30 radar-ping" />
                  )}
                  {activeSpeaker === 'user' ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
                <span className="text-[11px] font-semibold text-emerald-400 mt-1 flex items-center gap-1">
                  <span>{userLang.flag}</span> Hablas Tú
                </span>
              </div>

              {/* Center Continuous / Proximity Mode */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() => handleToggleContinuous()}
                  className={`p-3 rounded-full border transition ${
                    isContinuous
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                  title="Manos Libres / Modo Mesa"
                >
                  <Radio className={`w-5 h-5 ${isContinuous ? 'animate-pulse text-emerald-400' : ''}`} />
                </button>
                <span className="text-[10px] text-slate-400 mt-1">
                  {isContinuous ? 'Manos Libres ON' : 'Manos Libres'}
                </span>
              </div>

              {/* Partner Mic Button */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() =>
                    activeSpeaker === 'partner' ? handleStopListening() : handleStartListening('partner')
                  }
                  className={`relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all duration-200 shadow-xl ${
                    activeSpeaker === 'partner'
                      ? 'bg-rose-500 text-white scale-105 shadow-rose-500/50'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/30'
                  }`}
                >
                  {activeSpeaker === 'partner' && (
                    <span className="absolute inset-0 rounded-full bg-rose-400/30 radar-ping" />
                  )}
                  {activeSpeaker === 'partner' ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
                <span className="text-[11px] font-semibold text-cyan-400 mt-1 flex items-center gap-1">
                  <span>{partnerLang.flag}</span> Interlocutor
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      <LanguageSelectorModal
        isOpen={isUserLangModalOpen}
        onClose={() => setIsUserLangModalOpen(false)}
        selectedLanguage={userLang}
        onSelect={(lang) => setUserLang(lang)}
        title="Selecciona tu idioma"
      />

      <LanguageSelectorModal
        isOpen={isPartnerLangModalOpen}
        onClose={() => setIsPartnerLangModalOpen(false)}
        selectedLanguage={partnerLang}
        onSelect={(lang) => setPartnerLang(lang)}
        title="Idioma de tu interlocutor"
      />

      <QuickPhrasesModal
        isOpen={isQuickPhrasesOpen}
        onClose={() => setIsQuickPhrasesOpen(false)}
        onSelectPhrase={handleSelectQuickPhrase}
        partnerLang={partnerLang}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => {
          setSettings((prev) => {
            const updated = { ...prev, ...newSettings };
            try {
              localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
            } catch {}
            return updated;
          });
          if (typeof newSettings.continuousListen === 'boolean') {
            setIsContinuous(newSettings.continuousListen);
          }
        }}
        onClearHistory={() => setTurns([])}
        historyCount={turns.length}
        onOpenInstructions={() => setIsInstructionsOpen(true)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
        onOpenFeedbackViewer={() => setIsFeedbackViewerOpen(true)}
        onOpenAudioDiagnostic={() => setIsAudioDiagnosticOpen(true)}
        onOpenPaywall={() => setIsPaywallOpen(true)}
        onAdminStatusChange={syncLicenseState}
        onProStatusChange={syncLicenseState}
        isPro={isPro}
        remainingQuota={remainingQuota}
        visitorStats={visitorStats}
      />

      <ErrorBoundary
        fallbackTitle="Diagnóstico de Micrófono"
        onReset={() => setIsAudioDiagnosticOpen(false)}
      >
        <AudioDiagnosticModal
          isOpen={isAudioDiagnosticOpen}
          onClose={() => setIsAudioDiagnosticOpen(false)}
          initialNoiseFilter={settings.noiseFilter !== false}
        />
      </ErrorBoundary>

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        activeLanguagePair={{ from: userLang.name, to: partnerLang.name }}
      />

      <FeedbackViewerModal
        isOpen={isFeedbackViewerOpen}
        onClose={() => setIsFeedbackViewerOpen(false)}
      />

      <InstructionsModal
        isOpen={isInstructionsOpen}
        onClose={() => setIsInstructionsOpen(false)}
        userLangCode={userLang.code}
        onSpeakSample={(text, lang) => speak(text, lang)}
      />

      <FullScreenModal
        isOpen={!!fullScreenTurn}
        onClose={() => setFullScreenTurn(null)}
        turn={fullScreenTurn}
        onSpeak={(text, langCode, cachedAudio) =>
          speak(text, langCode, {
            speed: settings.voiceSpeed,
            preferAi: settings.useAiVoice,
            cachedAudioBase64: cachedAudio,
          })
        }
      />

      <TextInputModal
        isOpen={isTextInputOpen}
        onClose={() => setIsTextInputOpen(false)}
        userLang={userLang}
        partnerLang={partnerLang}
        defaultSpeaker={textInputSpeaker}
        onSubmitText={(text, speaker) => {
          handleProcessSpeech(text, speaker);
        }}
      />

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        onActivated={() => {
          syncLicenseState();
          setStatusAlert({
            message: '🎉 ¡Pase Ilimitado Activado con éxito!',
            type: 'success',
          });
          setTimeout(() => setStatusAlert(null), 6000);
        }}
        usedToday={getFreeTrialUsage()}
      />
    </div>
  );
}
