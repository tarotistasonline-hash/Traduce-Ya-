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
  Eye,
  Users,
  Sun,
  Mic,
  SlidersHorizontal,
  Inbox,
  MessageSquarePlus,
  Activity,
  AudioLines,
  Gift,
  Zap,
  Radio,
  Languages,
} from 'lucide-react';
import { TranslatorSettings } from '../types/translator';
import { PWAInstallButton } from './PWAInstallButton';
import { isCreatorUser, setCreatorUser, DAILY_FREE_LIMIT } from '../utils/licenseManager';
import { translateText } from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: TranslatorSettings;
  onUpdateSettings: (newSettings: Partial<TranslatorSettings>) => void;
  onClearHistory: () => void;
  historyCount: number;
  onOpenInstructions?: () => void;
  onOpenFeedback?: () => void;
  onOpenFeedbackViewer?: () => void;
  onOpenAudioDiagnostic?: () => void;
  onOpenPaywall?: () => void;
  isPro?: boolean;
  remainingQuota?: number;
  visitorStats?: {
    totalVisits: number;
    todayVisits: number;
    uniqueVisitors: number;
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onClearHistory,
  historyCount,
  onOpenInstructions,
  onOpenFeedback,
  onOpenFeedbackViewer,
  onOpenAudioDiagnostic,
  onOpenPaywall,
  isPro,
  remainingQuota,
  visitorStats,
}) => {
  const [isCreator, setIsCreator] = useState(isCreatorUser);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [testApiResult, setTestApiResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const handleTestApi = async () => {
    setIsTestingApi(true);
    setTestApiResult(null);
    try {
      const data = await translateText('Hola', 'Spanish', 'English');
      if (data.translatedText) {
        setTestApiResult({
          ok: true,
          message: `¡Traducción exitosa!: "${data.translatedText}" (${data.detectedLanguage || 'Español'})`,
        });
      } else {
        setTestApiResult({
          ok: false,
          message: 'Error en la respuesta del servidor.',
        });
      }
    } catch (e: any) {
      setTestApiResult({
        ok: false,
        message: e?.message || 'No se pudo conectar al servidor.',
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
          {/* Herramienta de Diagnóstico de Calidad de Audio y Micrófono (Primaria al inicio) */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-800/90 border border-cyan-500/40 shadow-lg space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center border border-cyan-500/30">
                  <Activity className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">
                    Diagnóstico de Calidad de Audio y Micrófono
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Comprueba silencio, clipping (saturación) y escucha cómo se oye tu voz.
                  </p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold shrink-0">
                Test en vivo
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              ¿Tu dispositivo no capta la voz o no traduce? Analiza el flujo de audio en tiempo real con osciloscopio, detecta silencio total o saturación y realiza una prueba guiada de 5 segundos.
            </p>

            <button
              type="button"
              onClick={() => {
                if (onOpenAudioDiagnostic) {
                  onClose();
                  onOpenAudioDiagnostic();
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition group"
            >
              <AudioLines className="w-4 h-4 group-hover:scale-110 transition-transform" />
              <span>Abrir Diagnóstico de Micrófono</span>
              <ChevronRight className="w-4 h-4 ml-0.5 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* Aviso importante: Desactivar traductor automático del navegador */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-800/90 border border-amber-500/40 shadow-md space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-500/30 shrink-0">
                  <Languages className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-amber-200 text-sm leading-tight">
                    Desactiva el traductor del navegador
                  </h4>
                  <p className="text-[11px] text-amber-300/80">
                    Muy importante si usas Chrome o Safari
                  </p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold shrink-0">
                Recomendado
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Si tienes activado el <strong className="text-amber-200">traductor automático de tu navegador</strong> o extensiones que traducen páginas completas, es muy frecuente que modifiquen la pantalla en vivo y provoquen errores (como <em>&quot;insertBefore&quot;</em>).
            </p>
            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-amber-500/20 text-[11px] text-slate-300 leading-relaxed">
              💡 <strong className="text-slate-100">Qué hacer:</strong> Toca el icono de traducir en la barra de tu navegador y selecciona <strong className="text-amber-300">&quot;No traducir nunca este sitio&quot;</strong>. Esta app ya incluye su propio motor de traducción simultánea.
            </div>
          </div>

          {/* Frases Gratuitas de Prueba y Pase Ilimitado (Aclaración importante) */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-800 border border-emerald-500/30 shadow-md space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-emerald-300">
                <Gift className="w-4 h-4 text-emerald-400" />
                <span>Frases Gratuitas y Precios</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                {isPro ? 'Pase Ilimitado' : `${remainingQuota ?? DAILY_FREE_LIMIT} de ${DAILY_FREE_LIMIT} gratis`}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-emerald-300">Aclaración:</strong> No se cobra por frase individual. Dispones de <strong>{DAILY_FREE_LIMIT} frases gratuitas diarias</strong> para probar el traductor. Si deseas hablar sin interrupciones ni límites diarios, puedes activar el Pase Ilimitado con un único pago de $5 USD (o equivalente en ARS).
            </p>
            {onOpenPaywall && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPaywall();
                }}
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-amber-500/40 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <span>{isPro ? 'Ver detalles de Pase Ilimitado' : 'Ver frases gratis / Activar Pase ($5 USD)'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Contador de Visitas Reales */}
          {visitorStats && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-850 to-slate-800 border border-cyan-500/30 shadow-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-cyan-300">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-cyan-400 animate-pulse" />
                  <span>Contador de Visitas Reales</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  En vivo
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="text-lg font-black text-white font-mono">{visitorStats.totalVisits.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Total Visitas</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="text-lg font-black text-emerald-400 font-mono">{visitorStats.todayVisits.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Visitas Hoy</p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <p className="text-lg font-black text-purple-400 font-mono">{visitorStats.uniqueVisitors.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400 font-medium">Visitantes Únicos</p>
                </div>
              </div>

              {/* Creator exclusion indicator & control */}
              <div className="pt-2 border-t border-slate-800/90 flex items-center justify-between text-xs">
                <div className="flex items-start gap-1.5 pr-2">
                  <span className="text-base">👑</span>
                  <div>
                    <p className="font-bold text-amber-300 text-[11px] leading-tight">
                      Modo Creador / Pruebas
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {isCreator
                        ? 'Excluido del contador de visitas y con traducciones ilimitadas.'
                        : 'Actívalo para no alterar el contador durante tus pruebas.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isCreator;
                    setCreatorUser(next);
                    setIsCreator(next);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shrink-0 ${
                    isCreator
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {isCreator ? '✓ Excluido (Ilimitado)' : 'Excluirme'}
                </button>
              </div>
            </div>
          )}

          {/* Live Translation Engine Diagnostics */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-cyan-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                <span>Motor de Traducción en Vivo</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Activo
              </span>
            </div>

            <div className="pt-0.5">
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

          {/* Buzón de Sugerencias y Reportes */}
          {onOpenFeedback && (
            <button
              onClick={() => {
                onClose();
                onOpenFeedback();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-amber-950/30 via-slate-800/80 to-slate-800/60 border border-amber-500/30 hover:border-amber-400 text-left transition group shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
                  <MessageSquarePlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100 group-hover:text-amber-200">
                    Buzón de Sugerencias y Reportes
                  </div>
                  <div className="text-xs text-slate-400">
                    Avísanos si algo no funcionó o sugiere mejoras
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-amber-300 group-hover:translate-x-0.5 transition" />
            </button>
          )}

          {/* Ver Mensajes Recibidos en el Buzón (Panel Dueño) */}
          {onOpenFeedbackViewer && (
            <button
              onClick={() => {
                onClose();
                onOpenFeedbackViewer();
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/80 border border-slate-700/60 hover:border-cyan-500/30 text-left transition group text-xs text-slate-300"
            >
              <div className="flex items-center gap-2.5">
                <Inbox className="w-4 h-4 text-cyan-400" />
                <span>Ver mensajes recibidos en el buzón (Administrador)</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-300 transition" />
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

          {/* Recordar Modo Mesa Manos Libres */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50">
            <div className="space-y-0.5 pr-2">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Recordar Modo Mesa Manos Libres</span>
                {settings.continuousListen && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                    Activo
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 leading-relaxed">
                Mantiene activada la escucha continua al abrir la app. Coloca el móvil en la mesa y conversa fluidamente sin tocar botones en cada turno.
              </div>
            </div>
            <button
              onClick={() => onUpdateSettings({ continuousListen: !settings.continuousListen })}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 shrink-0 ${
                settings.continuousListen ? 'bg-emerald-500 justify-end' : 'bg-slate-700 justify-start'
              }`}
              title="Recordar y activar Modo Mesa Manos Libres"
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
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                  Voz de IA ultra-realista
                </div>
                <div className="text-xs text-slate-400">
                  Entonación humana natural o para idiomas sin buena voz local.
                </div>
              </div>
              <button
                onClick={() => onUpdateSettings({ useAiVoice: !settings.useAiVoice })}
                className={`w-12 h-6 shrink-0 flex items-center rounded-full p-1 transition duration-300 ${
                  settings.useAiVoice ? 'bg-purple-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
              </button>
            </div>
            <div className="text-[11px] leading-snug text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
              ⚠️ <span className="font-semibold">No la actives para conversar en tiempo real:</span> agrega ~1–2 s de espera por frase. Dejala apagada para máxima fluidez.
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

          {/* Filtro activo de ruido exterior y aislamiento de voz */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5 pr-2">
                <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-cyan-400" />
                  <span>Filtro de ruido exterior y aislamiento de voz</span>
                  {settings.noiseFilter !== false && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                      Activo
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Aísla las voces de la mesa y cancela el murmullo de restaurantes, platos, tráfico y eco ambiente mediante filtros DSP y supresión de ruido.
                </p>
              </div>
              <button
                onClick={() => onUpdateSettings({ noiseFilter: settings.noiseFilter === false ? true : false })}
                className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 shrink-0 ${
                  settings.noiseFilter !== false ? 'bg-cyan-500 justify-end' : 'bg-slate-700 justify-start'
                }`}
                title="Activar/desactivar filtro de ruido y aislamiento de voz"
              >
                <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition" />
              </button>
            </div>
            {settings.noiseFilter !== false && (
              <div className="pt-2 border-t border-slate-800 flex items-center gap-2 text-[11px] text-cyan-300/90 font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Supresión acústica WebRTC + Filtro pasa-banda vocal (85Hz - 7.5kHz) activados.</span>
              </div>
            )}
          </div>

          {/* Modo de alto contraste para exteriores con luz solar intensa */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-between">
            <div className="space-y-0.5 pr-2">
              <div className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Modo de alto contraste (Luz solar)</span>
              </div>
              <p className="text-xs text-slate-400">
                Texto blanco puro sobre fondo negro absoluto (#000000) para máxima legibilidad bajo el sol.
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ highContrast: !settings.highContrast })}
              className={`w-12 h-6 flex items-center rounded-full p-1 transition duration-300 shrink-0 ${
                settings.highContrast ? 'bg-amber-400 justify-end' : 'bg-slate-700 justify-start'
              }`}
              title="Activar/desactivar modo alto contraste"
            >
              <div className="bg-slate-950 w-4 h-4 rounded-full shadow-md transform transition" />
            </button>
          </div>

          {/* Clear history */}
          <div className="pt-2">
            {showClearConfirm ? (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 space-y-2">
                <p className="text-xs text-rose-200 font-semibold text-center">
                  ¿Borrar todo el historial de la conversación actual?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClearHistory();
                      setShowClearConfirm(false);
                      onClose();
                    }}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition"
                  >
                    Sí, borrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                disabled={historyCount === 0}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-semibold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                <span>Limpiar historial ({historyCount} turnos)</span>
              </button>
            )}
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
