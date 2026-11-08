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
} from 'lucide-react';

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
import { translateText, generateAiSpeech } from './services/geminiService';
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
    };
  });

  // Active speaker currently recording
  const [activeSpeaker, setActiveSpeaker] = useState<'user' | 'partner' | null>(null);
  const [interimText, setInterimText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [isContinuous, setIsContinuous] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Modals state
  const [isUserLangModalOpen, setIsUserLangModalOpen] = useState(false);
  const [isPartnerLangModalOpen, setIsPartnerLangModalOpen] = useState(false);
  const [isQuickPhrasesOpen, setIsQuickPhrasesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [fullScreenTurn, setFullScreenTurn] = useState<ConversationTurn | null>(null);

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

  // Handle final speech text and translate
  const handleProcessSpeech = useCallback(
    async (text: string, speaker: 'user' | 'partner') => {
      const trimmed = text.trim();
      if (!trimmed) {
        setActiveSpeaker(null);
        setInterimText('');
        return;
      }

      setIsTranslating(true);
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

        let cachedAudio: string | undefined = undefined;
        if (settings.useAiVoice) {
          try {
            const aiAudio = await generateAiSpeech(result.translatedText, settings.voiceName);
            if (aiAudio) cachedAudio = aiAudio;
          } catch (e) {
            console.warn('AI voice generation fallback to browser TTS:', e);
          }
        }

        // Ensure final speech code is a valid locale
        let finalSpeechCode = targetSpeechLangCode;
        if (!finalSpeechCode || finalSpeechCode === 'auto') {
          const matched = matchLanguageByNameOrIso(toLangParam);
          finalSpeechCode = matched ? matched.code : 'es-ES';
        }

        const newTurn: ConversationTurn = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          speaker,
          originalText: trimmed,
          translatedText: result.translatedText,
          sourceLang: sourceLanguage.code,
          targetLang: finalSpeechCode,
          detectedLanguage: result.detectedLanguage,
          phonetic: result.phonetic,
          nuance: result.nuance,
          alternatives: result.alternatives,
          audioBase64: cachedAudio,
          timestamp: Date.now(),
        };

        setTurns((prev) => [newTurn, ...prev]);

        // Auto speak translation
        if (settings.autoSpeak) {
          speak(result.translatedText, finalSpeechCode, {
            speed: settings.voiceSpeed,
            preferAi: settings.useAiVoice,
            cachedAudioBase64: cachedAudio,
          });
        }

        // Haptic feedback if supported
        if (settings.hapticFeedback && 'vibrate' in navigator) {
          navigator.vibrate?.([60]);
        }

        // If continuous mode is on, toggle listener to other speaker after a brief pause
        if (isContinuous) {
          const nextSpeaker = speaker === 'user' ? 'partner' : 'user';
          setTimeout(() => {
            setActiveSpeaker(nextSpeaker);
          }, 3000);
        }
      } catch (err) {
        console.error('Translation workflow error:', err);
      } finally {
        setIsTranslating(false);
      }
    },
    [isContinuous, partnerLang, settings.autoSpeak, settings.hapticFeedback, settings.useAiVoice, settings.voiceName, settings.voiceSpeed, speak, userLang]
  );

  // Speech Recognition Hook
  const {
    isListening,
    isSupported,
    audioLevel,
    startListening,
    stopListening,
  } = useSpeechRecognition({
    lang: currentListeningLang,
    onResult: (text, isInterim) => {
      setInterimText(text);
      if (!isInterim) {
        if (activeSpeaker) {
          handleProcessSpeech(text, activeSpeaker);
        }
      }
    },
    onEnd: () => {
      // If we had text captured in interim, finalize it
      if (interimText.trim() && activeSpeaker) {
        handleProcessSpeech(interimText, activeSpeaker);
      }
      setActiveSpeaker(null);
    },
    onError: (err) => {
      console.warn('Speech rec error:', err);
      setActiveSpeaker(null);
    },
  });

  // Watch activeSpeaker change to trigger/stop listening
  useEffect(() => {
    if (activeSpeaker) {
      stopSpeaking();
      startListening();
    } else {
      stopListening();
    }
  }, [activeSpeaker, startListening, stopListening, stopSpeaking]);

  // Language Swap
  const handleSwapLanguages = () => {
    setUserLang(partnerLang);
    setPartnerLang(userLang);
  };

  // Quick phrase selected
  const handleSelectQuickPhrase = (phrase: string) => {
    handleProcessSpeech(phrase, 'user');
  };

  const latestTurn = turns.length > 0 ? turns[0] : null;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      {/* Top Header */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-3 sm:px-5 py-2.5 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-emerald-400 flex items-center justify-center text-slate-950 shadow-md shadow-cyan-500/20 font-extrabold text-base">
            TY
          </div>
          <div>
            <h1 className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-cyan-300 via-emerald-300 to-white bg-clip-text text-transparent">
              Traductor Ya
            </h1>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              Voz en vivo cara a cara y manos libres
            </p>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('facetoface')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'facetoface'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <SplitSquareVertical className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cara a Cara</span>
            <span className="sm:hidden">Mesa</span>
          </button>
          <button
            onClick={() => setViewMode('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              viewMode === 'chat'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Historial</span>
            <span className="sm:hidden">Chat</span>
          </button>
        </div>

        {/* Right utility buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          <PWAInstallButton variant="header" />

          <button
            onClick={() => setIsQuickPhrasesOpen(true)}
            className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            title="Frases Rápidas"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">Frases</span>
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 text-slate-300 hover:text-white transition"
            title="Ajustes"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Offline Status Indicator */}
      <OfflineIndicator />

      {/* Proximity / Table Guidance Banner */}
      {!bannerDismissed && (
        <div className="bg-gradient-to-r from-cyan-950/70 via-slate-900 to-emerald-950/70 border-b border-cyan-500/20 px-3 py-1.5 text-xs text-slate-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap">
            <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>
              <strong>Consejo:</strong> Apoya el móvil en la mesa entre ambos o acerca el micrófono a la persona que habla para oírla nítidamente.
            </span>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-[10px] text-slate-400 hover:text-slate-200 ml-2 uppercase font-mono shrink-0"
          >
            Entendido ✕
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
      <main className="flex-1 overflow-hidden relative flex flex-col">
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
            isSpeaking={isSpeaking}
            onStartUserSpeech={() => setActiveSpeaker('user')}
            onStopUserSpeech={() => setActiveSpeaker(null)}
            onStartPartnerSpeech={() => setActiveSpeaker('partner')}
            onStopPartnerSpeech={() => setActiveSpeaker(null)}
            onToggleContinuous={() => setIsContinuous((prev) => !prev)}
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
          />
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
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
              fontSize={settings.fontSize}
            />

            {/* Bottom floating control bar in chat mode */}
            <div className="bg-slate-900/90 backdrop-blur-md border-t border-slate-800 p-3 sm:p-4 flex items-center justify-around z-20">
              {/* User Mic Button */}
              <div className="flex flex-col items-center">
                <button
                  onClick={() =>
                    setActiveSpeaker((prev) => (prev === 'user' ? null : 'user'))
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
                  onClick={() => setIsContinuous((prev) => !prev)}
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
                    setActiveSpeaker((prev) => (prev === 'partner' ? null : 'partner'))
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
        onUpdateSettings={(newSettings) =>
          setSettings((prev) => ({ ...prev, ...newSettings }))
        }
        onClearHistory={() => setTurns([])}
        historyCount={turns.length}
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
    </div>
  );
}
