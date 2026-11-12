import React, { useState } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  Lock,
  ExternalLink,
  Key,
  ShieldCheck,
  Zap,
  Globe2,
  Volume2,
  ArrowRight,
  Settings,
} from 'lucide-react';
import {
  DAILY_FREE_LIMIT,
  getPaymentUrl,
  setPaymentUrl,
  activateWithCode,
  VALID_ACTIVATION_CODES,
  setCreatorUser,
  isCreatorUser,
} from '../utils/licenseManager';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onActivated: () => void;
  usedToday: number;
}

export const PaywallModal: React.FC<PaywallModalProps> = ({
  isOpen,
  onClose,
  onActivated,
  usedToday,
}) => {
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [showConfigLink, setShowConfigLink] = useState(false);
  const [customLinkInput, setCustomLinkInput] = useState(getPaymentUrl());
  const [linkSavedMsg, setLinkSavedMsg] = useState(false);

  if (!isOpen) return null;

  const currentPaymentUrl = getPaymentUrl();

  const handleApplyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');

    if (!code.trim()) {
      setCodeError('Por favor ingresa un código.');
      return;
    }

    const success = activateWithCode(code);
    if (success) {
      onActivated();
      onClose();
    } else {
      setCodeError('Código no válido. Verifica que esté bien escrito.');
    }
  };

  const handleSaveCustomLink = (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentUrl(customLinkInput);
    setLinkSavedMsg(true);
    setTimeout(() => setLinkSavedMsg(false), 2500);
  };

  const handleOpenPaymentLink = () => {
    window.open(currentPaymentUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-6 shadow-2xl text-white max-h-[92vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            Límite diario alcanzado
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {usedToday} / {DAILY_FREE_LIMIT} usadas hoy
          </span>
        </div>

        {/* Main Title */}
        <h2 className="text-2xl font-bold tracking-tight text-white mt-1">
          Desbloquea el <span className="text-amber-400">Pase Ilimitado</span>
        </h2>
        <p className="text-slate-300 text-sm mt-1.5 leading-relaxed">
          Has completado tus {DAILY_FREE_LIMIT} traducciones de cortesía de hoy. Para continuar conversando sin interrupciones, activa el acceso ilimitado.
        </p>

        {/* Benefits List */}
        <div className="my-5 space-y-2.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Traducciones ilimitadas</p>
              <p className="text-xs text-slate-400">Sin límite diario ni pausas en tus conversaciones.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Voz natural en alta fidelidad</p>
              <p className="text-xs text-slate-400">Pronunciación fluida como un hablante nativo.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
              <Globe2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Más de 100 idiomas</p>
              <p className="text-xs text-slate-400">Traducción bidireccional cara a cara para viajes y trabajo.</p>
            </div>
          </div>
        </div>

        {/* Primary CTA: Payment Link */}
        <div className="space-y-2">
          <button
            onClick={handleOpenPaymentLink}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
          >
            <span>Obtener Pase Ilimitado</span>
            <ExternalLink className="w-4 h-4" />
          </button>

          <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Pago seguro con tarjeta, débito o dinero en cuenta
          </p>
        </div>

        {/* Divider */}
        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative px-3 bg-slate-900 text-xs text-slate-400 uppercase tracking-wider">
            ¿Ya compraste o tienes código?
          </span>
        </div>

        {/* Code Activation Form */}
        <form onSubmit={handleApplyCode} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ingresar código de activación"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors uppercase font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-medium text-sm transition-colors active:scale-95"
            >
              Activar
            </button>
          </div>

          {codeError && (
            <p className="text-xs text-rose-400 pl-1">{codeError}</p>
          )}
        </form>

        {/* Creator Access Shortcut */}
        <div className="mt-4 p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-cyan-500/10 border border-amber-500/30 text-center space-y-1.5">
          <p className="text-xs text-amber-300 font-semibold flex items-center justify-center gap-1.5">
            <span>👑</span>
            <span>¿Eres el Creador / Administrador?</span>
          </p>
          <p className="text-[11px] text-slate-300 leading-tight">
            Activa el Modo Creador para traducir sin límites y quedar excluido del contador de visitas durante tus pruebas.
          </p>
          <button
            type="button"
            onClick={() => {
              setCreatorUser(true);
              onActivated();
              onClose();
            }}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-bold border border-amber-500/40 transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
          >
            <span>Activar Modo Creador (Ilimitado y Excluido de Visitas)</span>
          </button>
        </div>

        {/* Footer info & owner link config toggle */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Se renuevan mañana a las 00:00</span>

          <button
            onClick={() => setShowConfigLink(!showConfigLink)}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Configurar Link de Pago (Dueño)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configurar Link</span>
          </button>
        </div>

        {/* Owner Settings drawer (collapsible) */}
        {showConfigLink && (
          <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
            <p className="font-semibold text-slate-300">
              🛠️ Configuración de tu Link de Pago (Solo para ti):
            </p>
            <p className="text-slate-400 text-[11px]">
              Pega aquí el enlace de pago de tu Mercado Pago, PayPal o pasarela para que tus clientes paguen directo:
            </p>
            <form onSubmit={handleSaveCustomLink} className="space-y-2">
              <input
                type="url"
                value={customLinkInput}
                onChange={(e) => setCustomLinkInput(e.target.value)}
                placeholder="https://mpago.la/... o https://paypal.me/..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Código maestro incluido: <strong className="text-amber-400">TRADUCEYA</strong>
                </span>
                <button
                  type="submit"
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs"
                >
                  Guardar
                </button>
              </div>
            </form>
            {linkSavedMsg && (
              <p className="text-emerald-400 text-xs">¡Enlace de pago guardado correctamente!</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
