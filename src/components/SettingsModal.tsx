import React, { useRef, useState } from 'react';
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
  EyeOff,
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
  Lock,
  LogIn,
  LogOut,
  Loader2,
  Fingerprint,
} from 'lucide-react';
import { TranslatorSettings } from '../types/translator';

import {
  FREE_TRIAL_LIMIT,
  getUserApiKey,
  setUserApiKey,
  isAdminAuthenticated,
  fetchAdminStatus,
  claimAdminPasscode,
  loginAdminWithPasscode,
  isBiometricSupported,
  hasLocalBiometricRegistered,
  registerAdminBiometric,
  loginAdminWithBiometric,
  clearAdminSession,
  getAnalyticsOptOut,
  setAnalyticsOptOut,
  AdminStatusResponse,
} from '../utils/licenseManager';
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
  onAdminStatusChange?: () => void;
  onProStatusChange?: () => void;
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
  onAdminStatusChange,
  onProStatusChange,
  isPro,
  remainingQuota,
  visitorStats,
}) => {
  const [isAdmin, setIsAdmin] = useState(isAdminAuthenticated);
  const [adminStatus, setAdminStatus] = useState<AdminStatusResponse | null>(null);
  const [showAdminLoginBox, setShowAdminLoginBox] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [showPinDigits, setShowPinDigits] = useState(false);
  const [pinShakeKey, setPinShakeKey] = useState(0);
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);
  const [adminAuthError, setAdminAuthError] = useState<{
    title: string;
    detail: string;
    highlightEmptyOnly?: boolean;
  } | null>(null);
  const [bioStatusMsg, setBioStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [analyticsOptOut, setAnalyticsOptOutState] = useState(getAnalyticsOptOut);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [userApiKeyInput, setUserApiKeyInput] = useState(getUserApiKey());
  const [savedApiKeyMsg, setSavedApiKeyMsg] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [testApiResult, setTestApiResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsAdmin(isAdminAuthenticated());
    fetchAdminStatus().then((status) => {
      if (!active) return;
      setAdminStatus(status);
      setIsAdmin(status.isAuthenticated);
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const resetPinForm = (focusFirst = false) => {
    setPinDigits(['', '', '', '', '', '']);
    setAdminAuthError(null);
    if (focusFirst) {
      setTimeout(() => pinInputRefs.current[0]?.focus(), 20);
    }
  };

  const triggerPinError = (title: string, detail: string, highlightEmptyOnly = false) => {
    setAdminAuthError({ title, detail, highlightEmptyOnly });
    setPinShakeKey((k) => k + 1);
  };

  const handleBiometricLogin = async () => {
    setAdminAuthLoading(true);
    setAdminAuthError(null);
    try {
      const result = await loginAdminWithBiometric();
      if (result.ok) {
        setIsAdmin(true);
        setShowAdminLoginBox(false);
        resetPinForm();
        onAdminStatusChange?.();
        onProStatusChange?.();
      } else {
        triggerPinError(
          'No se pudo validar la huella',
          result.error || 'No se pudo verificar la huella digital.'
        );
      }
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handleRegisterBiometric = async () => {
    setAdminAuthLoading(true);
    setBioStatusMsg(null);
    try {
      const result = await registerAdminBiometric();
      if (result.ok) {
        setAdminStatus((prev) => (prev ? { ...prev, hasBiometricCred: true } : prev));
        setBioStatusMsg({
          ok: true,
          text: '¡Huella digital / Face ID vinculada! La próxima vez podrás entrar con un toque.',
        });
      } else {
        setBioStatusMsg({
          ok: false,
          text: result.error || 'No se pudo vincular la huella digital.',
        });
      }
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const submitSixDigitCode = async (code: string) => {
    if (adminAuthLoading) return;
    if (!/^\d{6}$/.test(code)) {
      const remaining = 6 - code.length;
      triggerPinError(
        'Código incompleto',
        remaining > 0
          ? `Ingresa los 6 números para continuar (te faltan ${remaining}).`
          : 'El código debe contener exactamente 6 números del 0 al 9.',
        true
      );
      const firstEmptyIdx = pinDigits.findIndex((d) => !d);
      if (firstEmptyIdx >= 0) {
        pinInputRefs.current[firstEmptyIdx]?.focus();
      }
      return;
    }

    setAdminAuthLoading(true);
    setAdminAuthError(null);
    try {
      const result = adminStatus?.needsSetup
        ? await claimAdminPasscode(code)
        : await loginAdminWithPasscode(code);
      if (result.ok) {
        setIsAdmin(true);
        resetPinForm();
        setShowAdminLoginBox(false);
        setAdminStatus((prev) =>
          prev ? { ...prev, needsSetup: false, hasClaimedPasscode: true, isAuthenticated: true } : prev
        );
        onAdminStatusChange?.();
        onProStatusChange?.();
      } else {
        triggerPinError(
          'Código incorrecto',
          result.error || 'El código de 6 dígitos no coincide. Revisa los números e inténtalo nuevamente.'
        );
        setTimeout(() => {
          pinInputRefs.current[5]?.focus();
          pinInputRefs.current[5]?.select();
        }, 30);
      }
    } finally {
      setAdminAuthLoading(false);
    }
  };

  const handlePasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSixDigitCode(pinDigits.join(''));
  };

  const handleDigitChange = (idx: number, rawValue: string) => {
    if (adminAuthLoading) return;
    const onlyDigits = rawValue.replace(/\D/g, '');

    if (rawValue !== '' && onlyDigits === '') {
      triggerPinError('Solo números', 'Cada casilla acepta únicamente dígitos del 0 al 9.', false);
      return;
    }

    setAdminAuthError(null);

    if (onlyDigits.length === 2 && pinDigits[idx].length === 1) {
      const replacementDigit = onlyDigits[0] === pinDigits[idx] ? onlyDigits[1] : onlyDigits[0];
      const next = [...pinDigits];
      next[idx] = replacementDigit;
      setPinDigits(next);
      if (idx < 5) {
        pinInputRefs.current[idx + 1]?.focus();
      }
      if (!adminStatus?.needsSetup && next.every((d) => /^\d$/.test(d))) {
        void submitSixDigitCode(next.join(''));
      }
      return;
    }

    if (onlyDigits.length > 1) {
      const next = [...pinDigits];
      const chars = onlyDigits.slice(0, 6 - idx).split('');
      chars.forEach((ch, offset) => {
        next[idx + offset] = ch;
      });
      setPinDigits(next);
      const nextFocus = Math.min(5, idx + chars.length);
      pinInputRefs.current[nextFocus]?.focus();
      if (!adminStatus?.needsSetup && next.every((d) => /^\d$/.test(d))) {
        void submitSixDigitCode(next.join(''));
      }
      return;
    }

    const next = [...pinDigits];
    next[idx] = onlyDigits;
    setPinDigits(next);

    if (onlyDigits && idx < 5) {
      pinInputRefs.current[idx + 1]?.focus();
    }

    if (onlyDigits && !adminStatus?.needsSetup && next.every((d) => /^\d$/.test(d))) {
      void submitSixDigitCode(next.join(''));
    }
  };

  const handleDigitKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (adminAuthLoading) return;
    if (e.key === 'Backspace') {
      setAdminAuthError(null);
      if (pinDigits[idx]) {
        const next = [...pinDigits];
        next[idx] = '';
        setPinDigits(next);
      } else if (idx > 0) {
        const next = [...pinDigits];
        next[idx - 1] = '';
        setPinDigits(next);
        pinInputRefs.current[idx - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      pinInputRefs.current[idx - 1]?.focus();
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && idx < 5) {
      pinInputRefs.current[idx + 1]?.focus();
      e.preventDefault();
    }
  };

  const handleDigitPaste = (idx: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (adminAuthLoading) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) {
      triggerPinError('Formato inválido', 'El texto pegado no contiene números.');
      return;
    }
    setAdminAuthError(null);
    const next = [...pinDigits];
    const chars = pasted.slice(0, 6).split('');
    const startIdx = pasted.length >= 6 ? 0 : idx;
    chars.forEach((ch, offset) => {
      if (startIdx + offset < 6) {
        next[startIdx + offset] = ch;
      }
    });
    setPinDigits(next);
    const targetIdx = Math.min(5, startIdx + chars.length - 1);
    pinInputRefs.current[targetIdx]?.focus();
    if (!adminStatus?.needsSetup && next.every((d) => /^\d$/.test(d))) {
      void submitSixDigitCode(next.join(''));
    }
  };

  const handleAdminLogout = () => {
    clearAdminSession();
    setIsAdmin(false);
    resetPinForm();
    setBioStatusMsg(null);
    onAdminStatusChange?.();
    onProStatusChange?.();
  };

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
                {isPro ? 'Pase Ilimitado' : `${remainingQuota ?? FREE_TRIAL_LIMIT} de ${FREE_TRIAL_LIMIT} gratis`}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-emerald-300">Aclaración:</strong> No se cobra por frase individual. Dispones de <strong>{FREE_TRIAL_LIMIT} frases gratuitas de prueba por única vez</strong> para probar el traductor. Si deseas hablar sin interrupciones ni límites, puedes activar el Pase Ilimitado con un único pago de $5 USD (o equivalente en ARS).
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

          {/* Custom User Gemini API Key Card */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-800 border border-indigo-500/30 shadow-md space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-indigo-300">
                <Key className="w-4 h-4 text-indigo-400" />
                <span>Usa tu propia API Key de Gemini (Gratis)</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold">
                Ilimitado
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Si tienes tu propia clave gratuita de Google AI Studio, ingrésala aquí para tener <strong>traducciones ilimitadas con tu propia cuota</strong> sin agotar la clave pública de la app.
            </p>
            <div className="p-2.5 rounded-xl bg-slate-950/75 border border-indigo-500/25 text-[11px] text-slate-300 space-y-1.5 leading-relaxed">
              <p className="font-semibold text-indigo-200">¿Dónde encontrar tu clave gratis en 30 segundos?</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300">
                <li>
                  Abre{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-300 hover:text-indigo-200 underline font-semibold inline-flex items-center gap-0.5"
                  >
                    Google AI Studio (aistudio.google.com/apikey)
                    <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  e inicia sesión con tu cuenta de Google.
                </li>
                <li>Toca el botón azul <strong>&quot;Create API key&quot;</strong> (Crear clave de API).</li>
                <li>Copia el código que empieza con <code className="text-indigo-200">AIza...</code>, pégalo abajo y toca <strong>Guardar</strong>.</li>
              </ol>
            </div>
            <div className="space-y-2">
              <input
                type="password"
                placeholder="AIzaSy..."
                value={userApiKeyInput}
                onChange={(e) => setUserApiKeyInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const result = setUserApiKey(userApiKeyInput);
                    if (!result.ok) {
                      setApiKeyError(result.error || 'Formato de API Key inválido.');
                      setSavedApiKeyMsg(false);
                      return;
                    }
                    setApiKeyError(null);
                    setSavedApiKeyMsg(true);
                    onProStatusChange?.();
                    setTimeout(() => setSavedApiKeyMsg(false), 3000);
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-sm"
                >
                  Guardar y usar mi clave
                </button>
                {getUserApiKey() && (
                  <button
                    type="button"
                    onClick={() => {
                      setUserApiKey('');
                      setUserApiKeyInput('');
                      setApiKeyError(null);
                      setSavedApiKeyMsg(false);
                      onProStatusChange?.();
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 text-xs font-medium transition"
                  >
                    Borrar
                  </button>
                )}
              </div>
              {apiKeyError && (
                <p className="text-[11px] text-rose-400 font-medium text-center">
                  {apiKeyError}
                </p>
              )}
              {savedApiKeyMsg && (
                <p className="text-[11px] text-emerald-400 font-medium text-center">
                  ✅ ¡Clave guardada! Traducciones ilimitadas activadas en este dispositivo.
                </p>
              )}
            </div>
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

              {/* Analytics exclusion toggle (does NOT grant Pro/Admin) */}
              <div className="pt-2 border-t border-slate-800/90 flex items-center justify-between text-xs gap-2">
                <div>
                  <p className="font-semibold text-slate-200 text-[11px] leading-tight">
                    No contar este dispositivo en visitas
                  </p>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    Solo omite tu propia visita en las estadísticas públicas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !analyticsOptOut;
                    setAnalyticsOptOut(next);
                    setAnalyticsOptOutState(next);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border shrink-0 ${
                    analyticsOptOut
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {analyticsOptOut ? '✓ Excluido' : 'Excluir visita'}
                </button>
              </div>

              {/* Verified Admin / Owner Authentication */}
              <div className="pt-2 border-t border-slate-800/90 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-start gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-amber-300 text-[11px] leading-tight">
                        Acceso Administradora
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {isAdmin
                          ? 'Sesión verificada activa (Buzón privado y acceso ilimitado).'
                          : 'Acceso privado con código de 6 números o huella digital.'}
                      </p>
                    </div>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={handleAdminLogout}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition flex items-center gap-1 shrink-0"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>Cerrar sesión</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminLoginBox((prev) => {
                          const next = !prev;
                          if (next) {
                            resetPinForm(true);
                          } else {
                            setAdminAuthError(null);
                          }
                          return next;
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border bg-slate-800 text-amber-300 border-amber-500/30 hover:bg-slate-700 transition flex items-center gap-1 shrink-0"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>{showAdminLoginBox ? 'Ocultar' : 'Ingresar'}</span>
                    </button>
                  )}
                </div>

                {isAdmin && isBiometricSupported() && (
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-emerald-500/25 space-y-1.5">
                    <button
                      type="button"
                      disabled={adminAuthLoading}
                      onClick={handleRegisterBiometric}
                      className="w-full py-2 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                      {adminAuthLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Fingerprint className="w-4 h-4 text-emerald-400" />
                      )}
                      <span>
                        {hasLocalBiometricRegistered() || adminStatus?.hasBiometricCred
                          ? 'Actualizar Huella Digital / Face ID en este dispositivo'
                          : 'Vincular Huella Digital / Face ID para entrar sin código'}
                      </span>
                    </button>
                    {bioStatusMsg && (
                      <p
                        className={`text-[11px] text-center ${
                          bioStatusMsg.ok ? 'text-emerald-300' : 'text-rose-400'
                        }`}
                      >
                        {bioStatusMsg.text}
                      </p>
                    )}
                  </div>
                )}

                {!isAdmin && showAdminLoginBox && (
                  <div
                    className={`p-3 rounded-xl border transition-colors space-y-3 ${
                      adminAuthError
                        ? 'bg-rose-950/25 border-rose-500/70 shadow-lg shadow-rose-950/30'
                        : 'bg-slate-950/85 border-amber-500/30'
                    }`}
                  >
                    {isBiometricSupported() &&
                      (hasLocalBiometricRegistered() || adminStatus?.hasBiometricCred) && (
                        <button
                          type="button"
                          disabled={adminAuthLoading}
                          onClick={handleBiometricLogin}
                          className="w-full py-2 px-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                        >
                          {adminAuthLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Fingerprint className="w-4 h-4 text-emerald-400" />
                          )}
                          <span>Ingresar con Huella Digital / Face ID</span>
                        </button>
                      )}

                    <form
                      onSubmit={handlePasscodeSubmit}
                      className={`space-y-2.5 ${
                        isBiometricSupported() &&
                        (hasLocalBiometricRegistered() || adminStatus?.hasBiometricCred)
                          ? 'pt-2 border-t border-slate-800'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-semibold text-slate-200">
                          {adminStatus?.needsSetup
                            ? 'Primera vez: crea tu código de 6 dígitos'
                            : 'Validación de acceso (6 dígitos)'}
                        </label>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                              adminAuthError
                                ? 'text-rose-300 bg-rose-500/15 border-rose-500/40'
                                : pinDigits.filter(Boolean).length === 6
                                ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40'
                                : 'text-slate-400 bg-slate-900 border-slate-700'
                            }`}
                          >
                            {pinDigits.filter(Boolean).length}/6
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowPinDigits((v) => !v)}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                            title={showPinDigits ? 'Ocultar dígitos' : 'Ver dígitos'}
                            aria-label={showPinDigits ? 'Ocultar dígitos' : 'Ver dígitos'}
                          >
                            {showPinDigits ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* 6-Digit PIN Boxes */}
                      <div
                        key={pinShakeKey}
                        className={`grid grid-cols-6 gap-1.5 ${
                          adminAuthError ? 'animate-pin-shake' : ''
                        }`}
                      >
                        {pinDigits.map((digit, idx) => {
                          const isBoxError =
                            Boolean(adminAuthError) &&
                            (!adminAuthError?.highlightEmptyOnly || !digit);
                          return (
                            <input
                              key={idx}
                              ref={(el) => {
                                pinInputRefs.current[idx] = el;
                              }}
                              type={showPinDigits ? 'text' : 'password'}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={6}
                              autoComplete="one-time-code"
                              disabled={adminAuthLoading}
                              value={digit}
                              onChange={(e) => handleDigitChange(idx, e.target.value)}
                              onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                              onPaste={(e) => handleDigitPaste(idx, e)}
                              onFocus={(e) => e.target.select()}
                              aria-label={`Dígito ${idx + 1} de 6`}
                              aria-invalid={isBoxError}
                              placeholder="•"
                              className={`w-full h-10 text-center text-base font-mono font-bold rounded-xl border transition-all focus:outline-none disabled:opacity-50 ${
                                isBoxError
                                  ? 'bg-rose-950/60 border-rose-500 text-rose-100 placeholder-rose-400/70 ring-2 ring-rose-500/30 focus:border-rose-400'
                                  : digit
                                  ? 'bg-slate-900 border-amber-400/70 text-amber-200 focus:border-amber-300 focus:ring-2 focus:ring-amber-400/30'
                                  : 'bg-slate-900 border-slate-700 text-white placeholder-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/25'
                              }`}
                            />
                          );
                        })}
                      </div>

                      {adminAuthError && (
                        <div
                          role="alert"
                          aria-live="assertive"
                          className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-950/75 border border-rose-500/60 text-rose-200 text-[11px] leading-snug"
                        >
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-bold text-rose-300">{adminAuthError.title}</p>
                            <p>{adminAuthError.detail}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-1.5">
                        {pinDigits.some(Boolean) && (
                          <button
                            type="button"
                            disabled={adminAuthLoading}
                            onClick={() => resetPinForm(true)}
                            className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition disabled:opacity-50"
                          >
                            Limpiar
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={adminAuthLoading}
                          className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 ${
                            adminAuthError
                              ? 'bg-rose-500 hover:bg-rose-400 text-white'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          }`}
                        >
                          {adminAuthLoading ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Verificando código...</span>
                            </>
                          ) : (
                            <span>
                              {adminStatus?.needsSetup
                                ? 'Guardar código de 6 dígitos'
                                : 'Verificar código'}
                            </span>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
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

          {/* Ver Mensajes Recibidos en el Buzón (Solo Administradora Verificada) */}
          {onOpenFeedbackViewer && isAdmin && (
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

          {/* Browser Translation Notice */}
          <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1">
            <div className="text-xs font-semibold text-cyan-300">Modo Navegador Directo</div>
            <div className="text-[11px] text-slate-400">
              La app está diseñada para usarse directamente en el navegador sin instalaciones. Cuenta con protección <code className="text-cyan-200">notranslate</code> integrada para evitar interferencias del traductor automático del navegador.
            </div>
          </div>

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
