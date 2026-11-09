import React, { useState } from 'react';
import { X, Send, Keyboard, Sparkles } from 'lucide-react';
import { Language } from '../types/translator';

interface TextInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLang: Language;
  partnerLang: Language;
  onSubmitText: (text: string, speaker: 'user' | 'partner') => void;
  defaultSpeaker?: 'user' | 'partner';
}

export const TextInputModal: React.FC<TextInputModalProps> = ({
  isOpen,
  onClose,
  userLang,
  partnerLang,
  onSubmitText,
  defaultSpeaker = 'user',
}) => {
  const [speaker, setSpeaker] = useState<'user' | 'partner'>(defaultSpeaker);
  const [text, setText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmitText(trimmed, speaker);
    setText('');
    onClose();
  };

  const currentLang = speaker === 'user' ? userLang : partnerLang;
  const targetLang = speaker === 'user' ? partnerLang : userLang;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Keyboard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                Escribir para traducir
              </h3>
              <p className="text-[11px] text-slate-400">
                Útil para escribir texto o probar traducción directa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Speaker Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
              ¿Quién dice esta frase?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSpeaker('user')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition ${
                  speaker === 'user'
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span className="text-xl">{userLang.flag}</span>
                <div>
                  <div className="text-xs font-bold leading-tight">Tú hablas</div>
                  <div className="text-[10px] opacity-80">{userLang.name}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSpeaker('partner')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition ${
                  speaker === 'partner'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <span className="text-xl">{partnerLang.flag}</span>
                <div>
                  <div className="text-xs font-bold leading-tight">Interlocutor</div>
                  <div className="text-[10px] opacity-80">{partnerLang.name}</div>
                </div>
              </button>
            </div>
          </div>

          {/* Text Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-slate-300 font-medium">
                Texto en {currentLang.name}:
              </label>
              <span className="text-[11px] text-cyan-400 font-mono">
                → {targetLang.name}
              </span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Escribe aquí lo que deseas decir en ${currentLang.name}...`}
              rows={3}
              className="w-full bg-slate-950/80 border border-slate-700/80 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition resize-none"
              autoFocus
            />
          </div>

          {/* Quick sample chips */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              Ejemplos rápidos para probar:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                speaker === 'user' ? 'Hola, ¿cómo estás?' : 'Hello, how can I help you?',
                speaker === 'user' ? '¿Cuánto cuesta esto?' : 'Where is the nearest pharmacy?',
                speaker === 'user' ? 'Muchas gracias por todo' : 'Nice to meet you',
              ].map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setText(sample)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition border border-slate-700/50"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!text.trim()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-cyan-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Traducir ahora</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
