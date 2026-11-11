import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Copy,
  Check,
  Maximize2,
  Sparkles,
  HelpCircle,
  Clock,
  Mic,
  Trash2,
} from 'lucide-react';
import { ConversationTurn, Language } from '../types/translator';

interface ConversationListProps {
  turns: ConversationTurn[];
  userLang: Language;
  partnerLang: Language;
  isTranslating: boolean;
  activeSpeaker: 'user' | 'partner' | null;
  interimText: string;
  onSpeakText: (text: string, langCode: string, cachedAudio?: string, speed?: number) => void;
  onOpenFullScreen: (turn: ConversationTurn) => void;
  onClearHistory?: () => void;
  fontSize: 'normal' | 'large' | 'huge';
}

export const ConversationList: React.FC<ConversationListProps> = ({
  turns,
  userLang,
  partnerLang,
  isTranslating,
  activeSpeaker,
  interimText,
  onSpeakText,
  onOpenFullScreen,
  onClearHistory,
  fontSize,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [slowAudioId, setSlowAudioId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const textSizes = {
    normal: {
      main: 'text-base sm:text-lg',
      sub: 'text-xs sm:text-sm',
    },
    large: {
      main: 'text-lg sm:text-xl',
      sub: 'text-sm sm:text-base',
    },
    huge: {
      main: 'text-xl sm:text-2xl font-bold',
      sub: 'text-base sm:text-lg',
    },
  };

  const selectedSize = textSizes[fontSize] || textSizes.normal;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {turns.length > 0 && onClearHistory && (
        <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 px-1 animate-fade-in">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Historial guardado ({turns.length} {turns.length === 1 ? 'mensaje' : 'mensajes'})
            </span>
          </div>
          <button
            onClick={onClearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-rose-100 text-xs font-semibold transition shadow-sm"
            title="Borrar todo el historial"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Limpiar historial</span>
          </button>
        </div>
      )}

      {turns.length === 0 && !interimText && !isTranslating && (
        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <Mic className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-100">
              Conversación bidireccional lista
            </h3>
            <p className="text-sm text-slate-400">
              Habla tú o acerca el móvil a la otra persona. Todo lo que digan se traducirá y reproducirá al instante.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full pt-2">
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-left">
              <div className="text-xs text-emerald-400 font-semibold mb-1 flex items-center gap-1">
                <span>{userLang.flag}</span> Tú hablas:
              </div>
              <div className="text-xs text-slate-300 font-medium">{userLang.name}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-left">
              <div className="text-xs text-cyan-400 font-semibold mb-1 flex items-center gap-1">
                <span>{partnerLang.flag}</span> La persona habla:
              </div>
              <div className="text-xs text-slate-300 font-medium">{partnerLang.name}</div>
            </div>
          </div>
        </div>
      )}

      {turns.map((turn, index) => {
        const isUser = turn.speaker === 'user';
        const isLatest = index === 0;
        const speakerLang = isUser ? userLang : partnerLang;
        const targetLang = isUser ? partnerLang : userLang;

        return (
          <div
            key={turn.id}
            className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-fade-in`}
          >
            {/* Speaker Tag */}
            <div
              className={`flex items-center gap-1.5 text-xs mb-1 px-1.5 ${
                isUser ? 'text-emerald-400' : 'text-cyan-400'
              }`}
            >
              <span className="text-sm">{speakerLang.flag}</span>
              <span className="font-semibold">{isUser ? 'Tú' : 'Interlocutor'}</span>
              {turn.detectedLanguage && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold border border-cyan-500/30">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>{turn.detectedLanguage}</span>
                </span>
              )}
              <span className="text-slate-500 font-mono text-[10px]">
                {new Date(turn.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>

            {/* Bubble with Iridescent translating glint when processing */}
            <div
              className={`max-w-[92%] sm:max-w-[80%] rounded-2xl p-4 transition-all shadow-md ${
                isLatest && isTranslating ? 'iridescent-translating-bubble' : ''
              } ${
                isUser
                  ? 'bg-emerald-950/40 border border-emerald-500/30 rounded-tr-sm text-slate-100'
                  : 'bg-slate-900 border border-cyan-500/30 rounded-tl-sm text-slate-100'
              }`}
            >
              {/* Iridescent Translating Indicator */}
              {isLatest && isTranslating && (
                <div className="flex items-center gap-1.5 text-xs font-semibold iridescent-text mb-2 pb-1.5 border-b border-cyan-500/30 animate-pulse">
                  <Sparkles className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Procesando traducción con IA...</span>
                </div>
              )}

              {/* Original Spoken Text */}
              <div className="text-xs text-slate-400 font-medium mb-1 flex items-center justify-between">
                <span>
                  Original (
                  {turn.detectedLanguage
                    ? `Detectado: ${turn.detectedLanguage}`
                    : speakerLang.name}
                  ):
                </span>
              </div>
              <p className="text-sm sm:text-base text-slate-300 mb-3 italic">
                "{turn.originalText}"
              </p>

              {/* Translation Highlight */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
                  <span>Traducción ({targetLang.name}):</span>
                </div>
                <div className={`${selectedSize.main} font-bold text-slate-50 leading-snug`}>
                  {turn.translatedText}
                </div>

                {/* Phonetics */}
                {turn.phonetic && (
                  <div className="mt-1 text-xs sm:text-sm text-cyan-300/80 font-mono italic">
                    Pronunciación: {turn.phonetic}
                  </div>
                )}

                {/* Cultural/idiomatic nuance note */}
                {turn.nuance && (
                  <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{turn.nuance}</span>
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setSlowAudioId(null);
                      onSpeakText(
                        turn.translatedText,
                        targetLang.code,
                        turn.audioBase64,
                        1.0
                      );
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-cyan-300 text-xs font-medium transition"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Escuchar</span>
                  </button>

                  <button
                    onClick={() => {
                      setSlowAudioId(turn.id);
                      onSpeakText(
                        turn.translatedText,
                        targetLang.code,
                        turn.audioBase64,
                        0.75
                      );
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                      slowAudioId === turn.id
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800/60 hover:bg-slate-700 text-slate-400'
                    }`}
                    title="Reproducir a velocidad lenta (0.75x)"
                  >
                    <span>Lento</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(turn.translatedText, turn.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    title="Copiar traducción"
                  >
                    {copiedId === turn.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    onClick={() => onOpenFullScreen(turn)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                    title="Pantalla completa"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Interim live speech bubble */}
      {(interimText || isTranslating) && (
        <div
          className={`flex flex-col ${
            activeSpeaker === 'user' ? 'items-end' : 'items-start'
          } animate-fade-in`}
        >
          <div
            className={`flex items-center gap-1.5 text-xs mb-1 px-1.5 ${
              activeSpeaker === 'user' ? 'text-emerald-400' : 'text-cyan-400'
            }`}
          >
            <span className="text-sm">
              {activeSpeaker === 'user' ? userLang.flag : partnerLang.flag}
            </span>
            <span className="font-semibold">
              {activeSpeaker === 'user' ? 'Tú estás hablando...' : 'Interlocutor hablando...'}
            </span>
          </div>

          <div
            className={`max-w-[85%] rounded-2xl p-4 border ${
              activeSpeaker === 'user'
                ? 'bg-emerald-950/30 border-emerald-500/40'
                : 'bg-slate-900/80 border-cyan-500/40'
            }`}
          >
            {isTranslating ? (
              <div className="flex items-center gap-2 text-cyan-300 text-sm py-1">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Traduciendo al instante...</span>
              </div>
            ) : (
              <p className="text-slate-200 italic font-medium text-base">
                "{interimText || '...'}"
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
