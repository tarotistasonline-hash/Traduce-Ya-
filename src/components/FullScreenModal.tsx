import React from 'react';
import { X, Volume2, RotateCcw } from 'lucide-react';
import { ConversationTurn } from '../types/translator';

interface FullScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  turn: ConversationTurn | null;
  onSpeak: (text: string, langCode: string, cachedAudio?: string) => void;
}

export const FullScreenModal: React.FC<FullScreenModalProps> = ({
  isOpen,
  onClose,
  turn,
  onSpeak,
}) => {
  if (!isOpen || !turn) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between p-6 sm:p-10 animate-fade-in text-slate-100 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-cyan-400 font-mono font-semibold">
          Modo Presentación • Muestra esta pantalla
        </div>
        <button
          onClick={onClose}
          className="p-3 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Main Massive Translated Text */}
      <div className="my-auto text-center space-y-6 max-w-3xl mx-auto w-full">
        <div className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-tight break-words">
          {turn.translatedText}
        </div>

        {turn.phonetic && (
          <div className="text-xl sm:text-2xl text-cyan-300 font-mono">
            [{turn.phonetic}]
          </div>
        )}

        <div className="pt-6 border-t border-slate-800/80 max-w-lg mx-auto">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
            <span>Original dicho:</span>
            {turn.detectedLanguage && (
              <span className="text-cyan-400 font-semibold lowercase tracking-normal">
                (detectado: {turn.detectedLanguage})
              </span>
            )}
          </div>
          <div className="text-lg text-slate-400 italic">"{turn.originalText}"</div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => onSpeak(turn.translatedText, turn.targetLang, turn.audioBase64)}
          className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-lg shadow-xl shadow-cyan-500/30 transition hover:scale-105 active:scale-95"
        >
          <Volume2 className="w-6 h-6" />
          <span>Pronunciar en voz alta</span>
        </button>
      </div>
    </div>
  );
};
