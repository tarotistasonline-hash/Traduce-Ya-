import React, { useState } from 'react';
import {
  HelpCircle,
  X,
  SplitSquareVertical,
  Mic,
  Radio,
  Sparkles,
  Maximize2,
  WifiOff,
  Globe,
  Check,
  Volume2,
  Lightbulb,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  INSTRUCTIONS_LOCALES,
  GUIDE_LANGUAGE_OPTIONS,
  InstructionLocale,
} from '../data/instructions';
import { ALL_LANGUAGES } from '../data/languages';
import { translateText } from '../services/geminiService';

interface InstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userLangCode?: string;
  onSpeakSample?: (text: string, langCode: string) => void;
}

export const InstructionsModal: React.FC<InstructionsModalProps> = ({
  isOpen,
  onClose,
  userLangCode = 'es',
  onSpeakSample,
}) => {
  // Infer initial language from user's current selection
  const initialLang = userLangCode.split('-')[0].toLowerCase();
  const defaultSelected = INSTRUCTIONS_LOCALES[initialLang] ? initialLang : 'es';

  const [currentLang, setCurrentLang] = useState<string>(defaultSelected);
  const [customLocale, setCustomLocale] = useState<InstructionLocale | null>(null);
  const [isCustomTranslating, setIsCustomTranslating] = useState(false);
  const [customLangName, setCustomLangName] = useState<string>('');

  if (!isOpen) return null;

  // Active locale content
  const activeLocale: InstructionLocale =
    customLocale || INSTRUCTIONS_LOCALES[currentLang] || INSTRUCTIONS_LOCALES.es;

  const isRTL = currentLang === 'ar';

  const handleSelectPrebuilt = (code: string) => {
    setCustomLocale(null);
    setCurrentLang(code);
  };

  const handleTranslateCustom = async (targetLangName: string, targetIso: string) => {
    setIsCustomTranslating(true);
    setCustomLangName(targetLangName);

    try {
      const baseSpanish = INSTRUCTIONS_LOCALES.es;

      // Translate core texts
      const [titleRes, subRes, tipsTitleRes] = await Promise.all([
        translateText(baseSpanish.modalTitle, 'Español', targetLangName),
        translateText(baseSpanish.modalSubtitle, 'Español', targetLangName),
        translateText(baseSpanish.tipsTitle, 'Español', targetLangName),
      ]);

      // Translate sections
      const translatedSections = await Promise.all(
        baseSpanish.sections.map(async (sec) => {
          const tTitle = await translateText(sec.title, 'Español', targetLangName);
          const tDesc = await translateText(sec.desc, 'Español', targetLangName);
          return {
            ...sec,
            title: tTitle.translatedText,
            desc: tDesc.translatedText,
          };
        })
      );

      // Translate tips
      const translatedTips = await Promise.all(
        baseSpanish.tips.map(async (tip) => {
          const res = await translateText(tip, 'Español', targetLangName);
          return res.translatedText;
        })
      );

      const closeRes = await translateText(baseSpanish.closeBtn, 'Español', targetLangName);

      setCustomLocale({
        modalTitle: titleRes.translatedText,
        modalSubtitle: subRes.translatedText,
        selectLanguageLabel: `Guía en ${targetLangName}`,
        translateCustomLabel: 'Traducido con IA',
        sections: translatedSections,
        tipsTitle: tipsTitleRes.translatedText,
        tips: translatedTips,
        closeBtn: closeRes.translatedText,
      });

      setCurrentLang(targetIso);
    } catch (e) {
      console.warn('Custom guide translation error:', e);
    } finally {
      setIsCustomTranslating(false);
    }
  };

  const getSectionIcon = (iconName: string) => {
    switch (iconName) {
      case 'table':
        return <SplitSquareVertical className="w-5 h-5 text-cyan-400" />;
      case 'mic':
        return <Mic className="w-5 h-5 text-emerald-400" />;
      case 'radio':
        return <Radio className="w-5 h-5 text-amber-400" />;
      case 'sparkles':
        return <Sparkles className="w-5 h-5 text-purple-400" />;
      case 'maximize':
        return <Maximize2 className="w-5 h-5 text-sky-400" />;
      case 'offline':
        return <WifiOff className="w-5 h-5 text-rose-400" />;
      default:
        return <HelpCircle className="w-5 h-5 text-cyan-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className="w-full sm:max-w-2xl bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-300">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg text-slate-100">
                {activeLocale.modalTitle}
              </h2>
              <p className="text-xs text-slate-400">
                {activeLocale.modalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Switcher Bar */}
        <div className="bg-slate-950/80 px-4 py-2.5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>{activeLocale.selectLanguageLabel}:</span>
          </div>

          {/* Quick flags bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {GUIDE_LANGUAGE_OPTIONS.map((opt) => {
              const isSelected = currentLang === opt.code && !customLocale;
              return (
                <button
                  key={opt.code}
                  onClick={() => handleSelectPrebuilt(opt.code)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    isSelected
                      ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/30 font-bold'
                      : 'bg-slate-800/70 hover:bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  <span className="text-sm">{opt.flag}</span>
                  <span>{opt.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Translation with AI to another language dropdown */}
        <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/60 flex items-center justify-between text-xs">
          <span className="text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            {isCustomTranslating
              ? `Traduciendo guía al ${customLangName}...`
              : '¿Prefieres otro idioma? Tradúcelo con IA al instante:'}
          </span>
          <select
            disabled={isCustomTranslating}
            onChange={(e) => {
              const langCode = e.target.value;
              if (!langCode) return;
              const found = ALL_LANGUAGES.find((l) => l.code === langCode);
              if (found) {
                handleTranslateCustom(found.name, found.iso);
              }
            }}
            className="bg-slate-800 text-cyan-300 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            defaultValue=""
          >
            <option value="" disabled>
              Elegir entre 50+ idiomas...
            </option>
            {ALL_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name} ({l.nativeName})
              </option>
            ))}
          </select>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {isCustomTranslating ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3 text-center">
              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-200">
                Traduciendo instrucciones al {customLangName}...
              </p>
              <p className="text-xs text-slate-400 max-w-xs">
                Generando una traducción natural mediante Gemini para todo el manual.
              </p>
            </div>
          ) : (
            <>
              {/* Sections Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeLocale.sections.map((section, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0">
                          {getSectionIcon(section.iconName)}
                        </div>
                        {section.badge && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {section.badge}
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-sm text-slate-100 mb-1">
                        {section.title}
                      </h4>
                      <p className="text-xs text-slate-300/90 leading-relaxed">
                        {section.desc}
                      </p>
                    </div>

                    {/* Audio preview button */}
                    {onSpeakSample && (
                      <div className="pt-2.5 mt-2 border-t border-slate-700/40 flex justify-end">
                        <button
                          onClick={() => onSpeakSample(section.desc, currentLang)}
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition"
                          title="Escuchar audio"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Escuchar</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Tips Box */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-800/70 to-cyan-500/10 border border-amber-500/30 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span>{activeLocale.tipsTitle}</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {activeLocale.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-amber-400 font-bold shrink-0">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-cyan-500/20"
          >
            {activeLocale.closeBtn}
          </button>
        </div>
      </div>
    </div>
  );
};
