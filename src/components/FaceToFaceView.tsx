import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  RotateCw,
  Sparkles,
  Maximize2,
  Copy,
  Check,
  Radio,
  HelpCircle,
} from 'lucide-react';
import { Language, ConversationTurn } from '../types/translator';
import { AudioWaveform } from './AudioWaveform';

interface FaceToFaceViewProps {
  userLang: Language;
  partnerLang: Language;
  latestTurn: ConversationTurn | null;
  isListeningUser: boolean;
  isListeningPartner: boolean;
  isContinuous: boolean;
  userAudioLevel: number;
  partnerAudioLevel: number;
  interimText: string;
  isTranslating: boolean;
  isSpeaking: boolean;
  onStartUserSpeech: () => void;
  onStopUserSpeech: () => void;
  onStartPartnerSpeech: () => void;
  onStopPartnerSpeech: () => void;
  onToggleContinuous: () => void;
  onSpeakText: (text: string, langCode: string, cachedAudio?: string) => void;
  onOpenUserLangModal: () => void;
  onOpenPartnerLangModal: () => void;
  onOpenFullScreen: (turn: ConversationTurn) => void;
}

export const FaceToFaceView: React.FC<FaceToFaceViewProps> = ({
  userLang,
  partnerLang,
  latestTurn,
  isListeningUser,
  isListeningPartner,
  isContinuous,
  userAudioLevel,
  partnerAudioLevel,
  interimText,
  isTranslating,
  isSpeaking,
  onStartUserSpeech,
  onStopUserSpeech,
  onStartPartnerSpeech,
  onStopPartnerSpeech,
  onToggleContinuous,
  onSpeakText,
  onOpenUserLangModal,
  onOpenPartnerLangModal,
  onOpenFullScreen,
}) => {
  const [partnerFlipped, setPartnerFlipped] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Determine what each side sees
  // If user spoke most recently:
  // - Partner sees the translation in partnerLang!
  // - User sees what they said + translation
  // If partner spoke most recently:
  // - User sees the translation in userLang!
  // - Partner sees what they said
  const partnerMessage = latestTurn
    ? latestTurn.speaker === 'user'
      ? latestTurn.translatedText
      : latestTurn.originalText
    : '';

  const partnerSubtext = latestTurn
    ? latestTurn.speaker === 'user'
      ? latestTurn.phonetic || latestTurn.originalText
      : latestTurn.translatedText
    : '';

  const userMessage = latestTurn
    ? latestTurn.speaker === 'partner'
      ? latestTurn.translatedText
      : latestTurn.originalText
    : '';

  const userSubtext = latestTurn
    ? latestTurn.speaker === 'partner'
      ? latestTurn.originalText
      : latestTurn.translatedText
    : '';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Half: Partner (Inverted 180° by default for face-to-face table mode) */}
      <div
        className={`flex-1 relative flex flex-col justify-between p-4 sm:p-6 transition-all duration-300 border-b-2 border-slate-800/80 ${
          partnerFlipped ? 'rotate-partner' : ''
        } ${
          isListeningPartner
            ? 'bg-gradient-to-b from-cyan-950/40 to-slate-900 border-cyan-500/30'
            : 'bg-slate-900/60'
        }`}
      >
        {/* Partner Header */}
        <div className="flex items-center justify-between z-10">
          <button
            onClick={onOpenPartnerLangModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 text-slate-100 transition shadow-sm"
          >
            <span className="text-xl">{partnerLang.flag}</span>
            <span className="font-semibold text-sm">{partnerLang.name}</span>
            <span className="text-xs text-cyan-400 font-mono">
              {partnerLang.iso.toUpperCase()}
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPartnerFlipped((prev) => !prev)}
              title={partnerFlipped ? 'Modo lado a lado' : 'Invertir para mesa'}
              className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            {latestTurn && (
              <button
                onClick={() => onOpenFullScreen(latestTurn)}
                title="Ver en pantalla completa"
                className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Partner Center Content */}
        <div className="my-auto py-2 text-center flex flex-col items-center justify-center min-h-[120px]">
          {isListeningPartner ? (
            <div className="space-y-3 animate-fade-in w-full max-w-md">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-medium border border-cyan-500/30">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                Escuchando a tu interlocutor...
              </div>
              <AudioWaveform
                isActive={true}
                audioLevel={partnerAudioLevel}
                color="blue"
                size="lg"
              />
              <p className="text-xl sm:text-2xl font-medium text-slate-200 italic line-clamp-3">
                "{interimText || 'Habla ahora...'}"
              </p>
            </div>
          ) : isTranslating && latestTurn?.speaker === 'user' ? (
            <div className="space-y-2 animate-pulse">
              <div className="flex items-center justify-center gap-2 text-cyan-400 text-sm">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Traduciendo al {partnerLang.name}...</span>
              </div>
              <div className="h-6 w-48 bg-slate-800/80 rounded-md mx-auto" />
            </div>
          ) : partnerMessage ? (
            <div className="space-y-2 max-w-lg w-full animate-fade-in">
              {latestTurn?.detectedLanguage && latestTurn.speaker === 'partner' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-500/20 border border-cyan-400/40 rounded-full text-xs text-cyan-200 font-semibold shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                  <span>Idioma detectado: {latestTurn.detectedLanguage}</span>
                </div>
              )}

              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-50 tracking-tight leading-snug break-words">
                {partnerMessage}
              </div>

              {partnerSubtext && (
                <div className="text-sm sm:text-base text-cyan-300/80 font-mono italic">
                  {partnerSubtext}
                </div>
              )}

              {latestTurn?.nuance && latestTurn.speaker === 'user' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-300 mt-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{latestTurn.nuance}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() =>
                    onSpeakText(
                      partnerMessage,
                      partnerLang.code,
                      latestTurn?.speaker === 'user' ? latestTurn?.audioBase64 : undefined
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold border border-cyan-500/30 transition shadow-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  Repetir audio
                </button>
                <button
                  onClick={() => handleCopy(partnerMessage, 'partner-text')}
                  className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                  title="Copiar texto"
                >
                  {copiedId === 'partner-text' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-center space-y-1">
              <p className="text-base font-medium text-slate-400">
                Coloca el móvil hacia tu interlocutor
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                Pulsa el botón de abajo o activa "Manos Libres" para traducir en tiempo real.
              </p>
            </div>
          )}
        </div>

        {/* Partner Mic Button */}
        <div className="flex items-center justify-center z-10">
          <button
            onClick={isListeningPartner ? onStopPartnerSpeech : onStartPartnerSpeech}
            className={`relative group flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full transition-all duration-200 shadow-xl ${
              isListeningPartner
                ? 'bg-rose-500 text-white scale-105 shadow-rose-500/50'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/40 hover:scale-105'
            }`}
          >
            {isListeningPartner && (
              <span className="absolute inset-0 rounded-full bg-rose-400/30 radar-ping" />
            )}
            {isListeningPartner ? (
              <MicOff className="w-7 h-7 sm:w-8 sm:h-8" />
            ) : (
              <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
            )}
          </button>
        </div>
      </div>

      {/* Central Control Divider Bar */}
      <div className="bg-slate-950 px-4 py-2 flex items-center justify-between border-y border-slate-800 shadow-inner z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleContinuous}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold transition ${
              isContinuous
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isContinuous ? 'animate-pulse text-emerald-400' : ''}`} />
            <span>{isContinuous ? 'Manos Libres ACTIVO' : 'Modo Mesa / Manos Libres'}</span>
          </button>
        </div>

        <div className="text-center text-xs text-slate-400 font-mono">
          {isSpeaking ? (
            <span className="text-cyan-400 flex items-center gap-1">
              <Volume2 className="w-3.5 h-3.5 animate-bounce" /> Reproduciendo voz
            </span>
          ) : (
            <span className="text-slate-500">Traductor Ya • 2 vías</span>
          )}
        </div>
      </div>

      {/* Bottom Half: User (Facing the phone holder) */}
      <div
        className={`flex-1 relative flex flex-col justify-between p-4 sm:p-6 transition-all duration-300 ${
          isListeningUser
            ? 'bg-gradient-to-t from-emerald-950/40 to-slate-900 border-t-2 border-emerald-500/30'
            : 'bg-slate-900/60'
        }`}
      >
        {/* User Header */}
        <div className="flex items-center justify-between z-10">
          <button
            onClick={onOpenUserLangModal}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 text-slate-100 transition shadow-sm"
          >
            <span className="text-xl">{userLang.flag}</span>
            <span className="font-semibold text-sm">{userLang.name}</span>
            <span className="text-xs text-emerald-400 font-mono">
              {userLang.iso.toUpperCase()}
            </span>
          </button>

          <div className="flex items-center gap-1.5">
            {latestTurn && (
              <button
                onClick={() => onOpenFullScreen(latestTurn)}
                title="Ver en pantalla completa"
                className="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* User Center Content */}
        <div className="my-auto py-2 text-center flex flex-col items-center justify-center min-h-[120px]">
          {isListeningUser ? (
            <div className="space-y-3 animate-fade-in w-full max-w-md">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Escuchando tu voz...
              </div>
              <AudioWaveform
                isActive={true}
                audioLevel={userAudioLevel}
                color="emerald"
                size="lg"
              />
              <p className="text-xl sm:text-2xl font-medium text-slate-200 italic line-clamp-3">
                "{interimText || 'Habla en tu idioma...'}"
              </p>
            </div>
          ) : isTranslating && latestTurn?.speaker === 'partner' ? (
            <div className="space-y-2 animate-pulse">
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Traduciendo al {userLang.name}...</span>
              </div>
              <div className="h-6 w-48 bg-slate-800/80 rounded-md mx-auto" />
            </div>
          ) : userMessage ? (
            <div className="space-y-2 max-w-lg w-full animate-fade-in">
              {latestTurn?.detectedLanguage && latestTurn.speaker === 'user' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 border border-emerald-400/40 rounded-full text-xs text-emerald-200 font-semibold shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
                  <span>Idioma detectado: {latestTurn.detectedLanguage}</span>
                </div>
              )}

              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-50 tracking-tight leading-snug break-words">
                {userMessage}
              </div>

              {userSubtext && (
                <div className="text-sm sm:text-base text-emerald-300/80 font-mono italic">
                  {userSubtext}
                </div>
              )}

              {latestTurn?.nuance && latestTurn.speaker === 'partner' && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-300 mt-1">
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{latestTurn.nuance}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() =>
                    onSpeakText(
                      userMessage,
                      userLang.code,
                      latestTurn?.speaker === 'partner' ? latestTurn?.audioBase64 : undefined
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold border border-emerald-500/30 transition shadow-sm"
                >
                  <Volume2 className="w-4 h-4" />
                  Escuchar de nuevo
                </button>
                <button
                  onClick={() => handleCopy(userMessage, 'user-text')}
                  className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                  title="Copiar texto"
                >
                  {copiedId === 'user-text' ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-center space-y-1">
              <p className="text-base font-medium text-slate-400">
                Habla en tu idioma ({userLang.name})
              </p>
              <p className="text-xs text-slate-500 max-w-xs">
                Pulsa el botón verde para hablar o colócalo en la mesa para diálogo automático.
              </p>
            </div>
          )}
        </div>

        {/* User Mic Button */}
        <div className="flex items-center justify-center z-10">
          <button
            onClick={isListeningUser ? onStopUserSpeech : onStartUserSpeech}
            className={`relative group flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full transition-all duration-200 shadow-xl ${
              isListeningUser
                ? 'bg-rose-500 text-white scale-105 shadow-rose-500/50'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/40 hover:scale-105'
            }`}
          >
            {isListeningUser && (
              <span className="absolute inset-0 rounded-full bg-rose-400/30 radar-ping" />
            )}
            {isListeningUser ? (
              <MicOff className="w-7 h-7 sm:w-8 sm:h-8" />
            ) : (
              <Mic className="w-7 h-7 sm:w-8 sm:h-8" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
