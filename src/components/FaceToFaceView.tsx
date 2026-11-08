import React, { useState } from 'react';
import {
  Volume2,
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
    <div className="flex-1 min-h-0 flex flex-col h-full overflow-hidden select-none">
      {/* Top Half: Partner (Inverted 180° by default for face-to-face table mode) */}
      <div
        className={`flex-1 min-h-0 relative flex flex-col justify-between p-2.5 sm:p-4 transition-all duration-300 border-b border-slate-800 ${
          partnerFlipped ? 'rotate-partner' : ''
        } ${
          isListeningPartner
            ? 'bg-gradient-to-b from-cyan-950/40 to-slate-900 border-cyan-500/30'
            : 'bg-slate-900/60'
        }`}
      >
        {/* Partner Header */}
        <div className="flex items-center justify-between z-10 shrink-0">
          <button
            onClick={onOpenPartnerLangModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 text-slate-100 transition shadow-sm text-xs font-semibold"
          >
            <span className="text-lg">{partnerLang.flag}</span>
            <span>{partnerLang.name}</span>
            <span className="text-[10px] text-cyan-400 font-mono">
              {partnerLang.iso.toUpperCase()}
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPartnerFlipped((prev) => !prev)}
              title={partnerFlipped ? 'Modo lado a lado' : 'Invertir para mesa'}
              className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            {latestTurn && (
              <button
                onClick={() => onOpenFullScreen(latestTurn)}
                title="Ver en pantalla completa"
                className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Partner Center Content */}
        <div className="flex-1 min-h-0 my-auto py-1 px-1 text-center flex flex-col items-center justify-center overflow-y-auto w-full">
          {isListeningPartner ? (
            <div className="space-y-2 animate-fade-in w-full max-w-md py-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[11px] font-medium border border-cyan-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Escuchando a tu interlocutor...
              </div>
              <AudioWaveform
                isActive={true}
                audioLevel={partnerAudioLevel}
                color="blue"
                size="md"
              />
              <p className="text-lg sm:text-xl font-medium text-slate-200 italic line-clamp-2">
                "{interimText || 'Habla ahora...'}"
              </p>
            </div>
          ) : isTranslating && latestTurn?.speaker === 'user' ? (
            <div className="space-y-1.5 animate-pulse py-2">
              <div className="flex items-center justify-center gap-2 text-cyan-400 text-xs sm:text-sm">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Traduciendo al {partnerLang.name}...</span>
              </div>
              <div className="h-4 w-40 bg-slate-800/80 rounded-md mx-auto" />
            </div>
          ) : partnerMessage ? (
            <div className="space-y-1.5 max-w-md w-full animate-fade-in py-1">
              {latestTurn?.detectedLanguage && latestTurn.speaker === 'partner' && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-500/20 border border-cyan-400/40 rounded-full text-[10px] text-cyan-200 font-semibold shadow-sm">
                  <Sparkles className="w-3 h-3 text-cyan-300 animate-pulse" />
                  <span>Idioma detectado: {latestTurn.detectedLanguage}</span>
                </div>
              )}

              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-50 tracking-tight leading-snug break-words">
                {partnerMessage}
              </div>

              {partnerSubtext && (
                <div className="text-xs sm:text-sm text-cyan-300/80 font-mono italic">
                  {partnerSubtext}
                </div>
              )}

              {latestTurn?.nuance && latestTurn.speaker === 'user' && (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[11px] text-amber-300">
                  <HelpCircle className="w-3 h-3" />
                  <span>{latestTurn.nuance}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={() =>
                    onSpeakText(
                      partnerMessage,
                      partnerLang.code,
                      latestTurn?.speaker === 'user' ? latestTurn?.audioBase64 : undefined
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-[11px] font-semibold border border-cyan-500/30 transition shadow-sm"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Repetir audio
                </button>
                <button
                  onClick={() => handleCopy(partnerMessage, 'partner-text')}
                  className="p-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                  title="Copiar texto"
                >
                  {copiedId === 'partner-text' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-center space-y-0.5 py-1">
              <p className="text-sm sm:text-base font-medium text-slate-300">
                Coloca el móvil hacia tu interlocutor
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                Pulsa el botón de abajo o activa "Manos Libres" para hablar.
              </p>
            </div>
          )}
        </div>

        {/* Partner Mic Button */}
        <div className="flex items-center justify-center z-10 shrink-0 pt-1">
          <button
            onClick={isListeningPartner ? onStopPartnerSpeech : onStartPartnerSpeech}
            className={`relative group flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all duration-200 shadow-xl ${
              isListeningPartner
                ? 'bg-rose-500 text-white scale-105 shadow-rose-500/50'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/40 hover:scale-105'
            }`}
          >
            {isListeningPartner && (
              <span className="absolute inset-0 rounded-full bg-rose-400/30 radar-ping" />
            )}
            {isListeningPartner ? (
              <MicOff className="w-6 h-6 sm:w-7 sm:h-7" />
            ) : (
              <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
            )}
          </button>
        </div>
      </div>

      {/* Central Control Divider Bar */}
      <div className="bg-slate-950 px-3 py-1.5 flex items-center justify-between border-y border-slate-800 shadow-inner z-20 shrink-0">
        <button
          onClick={onToggleContinuous}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition ${
            isContinuous
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700/60'
          }`}
        >
          <Radio className={`w-3 h-3 ${isContinuous ? 'animate-pulse text-emerald-400' : ''}`} />
          <span>{isContinuous ? 'Manos Libres ACTIVO' : 'Modo Mesa / Manos Libres'}</span>
        </button>

        <div className="text-center text-[11px] text-slate-400 font-mono">
          {isSpeaking ? (
            <span className="text-cyan-400 flex items-center gap-1">
              <Volume2 className="w-3 h-3 animate-bounce" /> Reproduciendo voz
            </span>
          ) : (
            <span className="text-slate-500">2 vías en vivo</span>
          )}
        </div>
      </div>

      {/* Bottom Half: User (Facing the phone holder) */}
      <div
        className={`flex-1 min-h-0 relative flex flex-col justify-between p-2.5 sm:p-4 transition-all duration-300 ${
          isListeningUser
            ? 'bg-gradient-to-t from-emerald-950/40 to-slate-900 border-t border-emerald-500/30'
            : 'bg-slate-900/60'
        }`}
      >
        {/* User Header */}
        <div className="flex items-center justify-between z-10 shrink-0">
          <button
            onClick={onOpenUserLangModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 text-slate-100 transition shadow-sm text-xs font-semibold"
          >
            <span className="text-lg">{userLang.flag}</span>
            <span>{userLang.name}</span>
            <span className="text-[10px] text-emerald-400 font-mono">
              {userLang.iso.toUpperCase()}
            </span>
          </button>

          <div className="flex items-center gap-1">
            {latestTurn && (
              <button
                onClick={() => onOpenFullScreen(latestTurn)}
                title="Ver en pantalla completa"
                className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* User Center Content */}
        <div className="flex-1 min-h-0 my-auto py-1 px-1 text-center flex flex-col items-center justify-center overflow-y-auto w-full">
          {isListeningUser ? (
            <div className="space-y-2 animate-fade-in w-full max-w-md py-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-medium border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Escuchando tu voz...
              </div>
              <AudioWaveform
                isActive={true}
                audioLevel={userAudioLevel}
                color="emerald"
                size="md"
              />
              <p className="text-lg sm:text-xl font-medium text-slate-200 italic line-clamp-2">
                "{interimText || 'Habla en tu idioma...'}"
              </p>
            </div>
          ) : isTranslating && latestTurn?.speaker === 'partner' ? (
            <div className="space-y-1.5 animate-pulse py-2">
              <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs sm:text-sm">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>Traduciendo al {userLang.name}...</span>
              </div>
              <div className="h-4 w-40 bg-slate-800/80 rounded-md mx-auto" />
            </div>
          ) : userMessage ? (
            <div className="space-y-1.5 max-w-md w-full animate-fade-in py-1">
              {latestTurn?.detectedLanguage && latestTurn.speaker === 'user' && (
                <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 border border-emerald-400/40 rounded-full text-[10px] text-emerald-200 font-semibold shadow-sm">
                  <Sparkles className="w-3 h-3 text-emerald-300 animate-pulse" />
                  <span>Idioma detectado: {latestTurn.detectedLanguage}</span>
                </div>
              )}

              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-50 tracking-tight leading-snug break-words">
                {userMessage}
              </div>

              {userSubtext && (
                <div className="text-xs sm:text-sm text-emerald-300/80 font-mono italic">
                  {userSubtext}
                </div>
              )}

              {latestTurn?.nuance && latestTurn.speaker === 'partner' && (
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[11px] text-amber-300">
                  <HelpCircle className="w-3 h-3" />
                  <span>{latestTurn.nuance}</span>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={() =>
                    onSpeakText(
                      userMessage,
                      userLang.code,
                      latestTurn?.speaker === 'partner' ? latestTurn?.audioBase64 : undefined
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 transition shadow-sm"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Escuchar de nuevo
                </button>
                <button
                  onClick={() => handleCopy(userMessage, 'user-text')}
                  className="p-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
                  title="Copiar texto"
                >
                  {copiedId === 'user-text' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-center space-y-0.5 py-1">
              <p className="text-sm sm:text-base font-medium text-slate-300">
                Habla en tu idioma ({userLang.name})
              </p>
              <p className="text-[11px] text-slate-500 max-w-xs">
                Pulsa el botón verde para hablar o usa "Manos Libres" en mesa.
              </p>
            </div>
          )}
        </div>

        {/* User Mic Button */}
        <div className="flex items-center justify-center z-10 shrink-0 pt-1">
          <button
            onClick={isListeningUser ? onStopUserSpeech : onStartUserSpeech}
            className={`relative group flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full transition-all duration-200 shadow-xl ${
              isListeningUser
                ? 'bg-rose-500 text-white scale-105 shadow-rose-500/50'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/40 hover:scale-105'
            }`}
          >
            {isListeningUser && (
              <span className="absolute inset-0 rounded-full bg-rose-400/30 radar-ping" />
            )}
            {isListeningUser ? (
              <MicOff className="w-6 h-6 sm:w-7 sm:h-7" />
            ) : (
              <Mic className="w-6 h-6 sm:w-7 sm:h-7" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
