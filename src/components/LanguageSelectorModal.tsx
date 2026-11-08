import React, { useState, useMemo } from 'react';
import { Search, X, Check, Globe, Sparkles } from 'lucide-react';
import { Language } from '../types/translator';
import { POPULAR_LANGUAGES, ALL_LANGUAGES, AUTO_DETECT_LANGUAGE } from '../data/languages';

interface LanguageSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguage: Language;
  onSelect: (language: Language) => void;
  title: string;
  allowAutoDetect?: boolean;
}

export const LanguageSelectorModal: React.FC<LanguageSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedLanguage,
  onSelect,
  title,
  allowAutoDetect = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLanguages = useMemo(() => {
    if (!searchTerm.trim()) return ALL_LANGUAGES;
    const term = searchTerm.toLowerCase().trim();
    return ALL_LANGUAGES.filter(
      (lang) =>
        lang.name.toLowerCase().includes(term) ||
        lang.nativeName.toLowerCase().includes(term) ||
        lang.iso.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  const showAutoDetect = useMemo(() => {
    if (!allowAutoDetect) return false;
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      'auto'.includes(term) ||
      'detectar'.includes(term) ||
      'detect'.includes(term) ||
      'automático'.includes(term) ||
      'identificar'.includes(term)
    );
  }, [allowAutoDetect, searchTerm]);

  if (!isOpen) return null;

  const isAutoSelected = selectedLanguage.code === AUTO_DETECT_LANGUAGE.code;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-lg">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-slate-800">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar idioma o 'auto'..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {/* Prominent Auto-Detect Option */}
          {showAutoDetect && (
            <div className="mb-2">
              <button
                onClick={() => {
                  onSelect(AUTO_DETECT_LANGUAGE);
                  onClose();
                }}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition text-left border ${
                  isAutoSelected
                    ? 'bg-gradient-to-r from-cyan-500/20 via-purple-500/15 to-cyan-500/20 border-cyan-400/60 shadow-lg shadow-cyan-500/10'
                    : 'bg-gradient-to-r from-slate-800/90 via-slate-800/60 to-purple-950/20 border-purple-500/30 hover:border-cyan-500/50 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center text-slate-950 shadow-md">
                    <Sparkles className="w-5 h-5 text-slate-950 animate-pulse" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      <span>Detectar idioma</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/40 text-purple-300 font-semibold">
                        AUTO
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Identifica el idioma al empezar a hablar
                    </div>
                  </div>
                </div>

                {isAutoSelected && (
                  <div className="w-6 h-6 rounded-full bg-cyan-400 flex items-center justify-center text-slate-950">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}
              </button>
            </div>
          )}

          {!searchTerm && (
            <div className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Idiomas Disponibles
            </div>
          )}

          {(!searchTerm ? POPULAR_LANGUAGES : filteredLanguages).map((lang) => {
            const isSelected = selectedLanguage.code === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => {
                  onSelect(lang);
                  onClose();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl transition text-left ${
                  isSelected
                    ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-300'
                    : 'hover:bg-slate-800/70 text-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-label={lang.name}>
                    {lang.flag}
                  </span>
                  <div>
                    <div className="font-medium text-sm text-slate-100 flex items-center gap-2">
                      {lang.name}
                      <span className="text-xs text-slate-400 font-normal">
                        ({lang.iso.toUpperCase()})
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{lang.nativeName}</div>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}

          {filteredLanguages.length === 0 && !showAutoDetect && (
            <div className="py-8 text-center text-sm text-slate-400">
              No se encontraron idiomas para "{searchTerm}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
