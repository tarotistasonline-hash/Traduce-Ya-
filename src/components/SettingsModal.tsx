import React, { useState } from 'react';
import {
  X,
  Volume2,
  Trash2,
  Settings,
  Sparkles,
  Gauge,
  Sliders,
  Type,
  Vibrate,
  HelpCircle,
  ChevronRight,
  Key,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import { TranslatorSettings } from '../types/translator';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TranslatorSettings;
  onUpdateSettings: (newSettings: Partial<TranslatorSettings>) => void;
  onClearHistory: () => void;
  historyCount: number;
  onOpenInstructions?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onClearHistory,
  historyCount,
  onOpenInstructions,
}) => {
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [testApiResult, setTestApiResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setTestApiResult(null);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hola',
          fromLang: 'Spanish',
          toLang: 'English',
        }),
      });
      const data = await res.json();
      if (res.ok && data.translatedText) {
        setTestApiResult({
          ok: true,
          message: `¡Traducción exitosa!: "${data.translatedText}" (${data.detectedLanguage || 'Español'})`,
        });
      } else {
        setTestApiResult({
          ok: false,
          message: data.error || 'Error en la respuesta del servidor.',
        });
      }
    } catch (e: any) {
      setTestApiResult({
        ok: false,
        message: e.message || 'No se pudo conectar al servidor.',
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-lg">Ajustes del Traductor</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Settings Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Gemini API Key Guide & Live Diagnostics */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                <span>Google Gemini API</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Conectada en Servidor
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 text-xs text-slate-300 space-y-1.5">
              <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
                <span>¿Cómo configurar tu propia clave de API?</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                En <strong>Google AI Studio</strong>, las claves de API se administran de forma segura a través del entorno de la plataforma:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300 pl-1">
                <li>Ve al panel superior derecho de AI Studio.</li>
                <li>Abre el panel <strong>Secrets (Secretos)</strong>.</li>
                <li>Verifica que la variable <code className="text-cyan-300 bg-slate-800 px-1 py-0.5 rounded font-mono">GEMINI_API_KEY</code> contenga tu clave de Gemini.</li>
              </ol>
            </div>

            {/* Test Connection Button */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestApi}
                disabled={isTestingApi}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingApi ? 'animate-spin' : ''}`} />
                <span>{isTestingApi ? 'Probando traducción en vivo...' : 'Comprobar estado de traducción'}</span>
              </button>

              {testApiResult && (
                <div
                  className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 border ${
                    testApiResult.ok
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {testApiResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                  )}
                  <span>{testApiResult.message}</span>
                </div>
              )}
            </div>
          </div>
          {/* Instructions Guide Button */}
          {onOpenInstructions && (
            <button
              onClick={() => {
                onClose();
                onOpenInstructions();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-800/80 to-slate-800/60 border border-cyan-500/30 hover:border-cyan-400 text-left transition group shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100 group-hover:text-cyan-200">
                    Instrucciones y Guía de Uso
                  </div>
                  <div className="text-xs text-slate-400">
                    Manual en todos los idiomas para modo mesa y voz
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition" />
            </button>
          )}

          {/* PWA Install Option */}
          <PWAInstallButton variant="settings" />

          {/* Auto Speak Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="space-y-0.5">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                Reproducción de voz automática
              </div>
              <div className="text-xs text-slate-400">
                Pronuncia la traducción inmediatamente en voz alta al terminar de hablar.
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ autoSpeak: !settings.autoSpeak })}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 ${
                settings.autoSpeak ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
              }`}
            >
              <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
            </button>
          </div>

          {/* Voice Speed */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-amber-400" />
              Velocidad de pronunciación
            </div>
            <p className="text-xs text-slate-400">
              Ideal si el idioma extranjero se pronuncia demasiado rápido para entenderlo.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                { label: '0.8x Lento', value: 0.8 },
                { label: '1.0x Normal', value: 1.0 },
                { label: '1.2x Rápido', value: 1.2 },
              ].map((speed) => (
                <button
                  key={speed.value}
                  onClick={() => onUpdateSettings({ voiceSpeed: speed.value })}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                    settings.voiceSpeed === speed.value
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {speed.label}
                </button>
              ))}
            </div>
          </div>

          {/* AI Studio Voice Generator Toggle */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  Voz de IA ultra-realista
                </div>
                <div className="text-xs text-slate-400">
                  Usa Gemini Flash Lite TTS para entonación humana natural.
                </div>
              </div>
              <button
                onClick={() => onUpdateSettings({ useAiVoice: !settings.useAiVoice })}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 ${
                  settings.useAiVoice ? 'bg-purple-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
              </button>
            </div>

            {settings.useAiVoice && (
              <div className="pt-2 border-t border-slate-700/50 space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Voz de IA seleccionada:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['Kore', 'Puck', 'Fenrir', 'Zephyr', 'Charon'].map((v) => (
                    <button
                      key={v}
                      onClick={() => onUpdateSettings({ voiceName: v })}
                      className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium border transition ${
                        settings.voiceName === v
                          ? 'bg-purple-500 text-white border-purple-400'
                          : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Text Font Size */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2">
            <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Type className="w-4 h-4 text-emerald-400" />
              Tamaño del texto de traducción
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Normal', value: 'normal' },
                { label: 'Grande', value: 'large' },
                { label: 'Gigante', value: 'huge' },
              ].map((size) => (
                <button
                  key={size.value}
                  onClick={() => onUpdateSettings({ fontSize: size.value as any })}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold border transition ${
                    settings.fontSize === size.value
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear history */}
          <div className="pt-2">
            <button
              onClick={() => {
                if (window.confirm('¿Deseas borrar todo el historial de la conversación actual?')) {
                  onClearHistory();
                  onClose();
                }
              }}
              disabled={historyCount === 0}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpiar historial ({historyCount} turnos)</span>
            </button>
          </div>

          {/* Privacy and Play Store Compliance */}
          <div className="pt-3 pb-1 text-center border-t border-slate-800/80">
            <a
              href="/privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cyan-400 transition"
            >
              <span>Política de Privacidad (Google Play)</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
