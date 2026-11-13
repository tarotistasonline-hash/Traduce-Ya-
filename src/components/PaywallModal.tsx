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
  Settings,
  Gift,
  HelpCircle,
} from 'lucide-react';
import {
  DAILY_FREE_LIMIT,
  getPaymentUrl,
  setPaymentUrl,
  activateWithCode,
  setCreatorUser,
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
  const freeRemaining = Math.max(0, DAILY_FREE_LIMIT - usedToday);
  const isLimitReached = freeRemaining === 0;

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
      setCodeError('Código no válido. Verifica que esté bien escrito (ej: TRADUCEYA).');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl text-white max-h-[92vh] overflow-y-auto">
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
          {isLimitReached ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Límite gratuito diario completado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Gift className="w-3.5 h-3.5 text-emerald-400" />
              {freeRemaining} de {DAILY_FREE_LIMIT} consultas gratis disponibles
            </span>
          )}
          <span className="text-xs text-slate-400 font-mono">
            {usedToday} / {DAILY_FREE_LIMIT} usadas hoy
          </span>
        </div>

        {/* Main Title */}
        <h2 className="text-2xl font-bold tracking-tight text-white mt-1">
          {isLimitReached ? (
            <>
              Desbloquea el <span className="text-amber-400">Pase Ilimitado</span>
            </>
          ) : (
            <>
              ¡Tienes <span className="text-emerald-400">2 consultas gratis</span>!
            </>
          )}
        </h2>

        {/* IMPORTANT CLARIFICATION BOX (Resolves fear of pay-per-query) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-slate-850 to-cyan-950/60 border border-emerald-500/40 text-emerald-100 text-xs space-y-2 my-3 shadow-lg">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-300">
            <Gift className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Aclaración importante: ¡No pagas por cada consulta!</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-200">
            Al entrar cuentas con <strong>2 consultas 100% gratuitas de prueba</strong> para conversar y evaluar la app con total libertad y sin ingresar ninguna tarjeta.
          </p>
          <div className="pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-200/90 space-y-1">
            <p className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                <strong>Prueba sin costo:</strong> No hay cobros ocultos ni pagos individuales por frase o mensaje.
              </span>
            </p>
            <p className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
              <span>
                <strong>Pase Ilimitado opcional:</strong> Si te gusta y quieres hablar horas seguidas en viajes o reuniones, puedes obtener el acceso ilimitado permanente con un pago único.
              </span>
            </p>
          </div>
        </div>

        {/* Benefits List */}
        <div className="my-4 space-y-2.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3.5">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Traducciones ilimitadas</p>
              <p className="text-xs text-slate-400">Sin límite diario ni cortes en medio de tus conversaciones.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 mt-0.5">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Voz natural con acento nativo</p>
              <p className="text-xs text-slate-400">Pronunciación fluida que tu interlocutor entenderá con facilidad.</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 mt-0.5">
              <Globe2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Más de 100 idiomas en vivo</p>
              <p className="text-xs text-slate-400">Modo mesa cara a cara y manos libres bidireccional.</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {!isLimitReached && (
            <button
              onClick={onClose}
              className="w-full py-3 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
            >
              <Gift className="w-4 h-4" />
              <span>Continuar probando gratis ({freeRemaining} disponibles)</span>
            </button>
          )}

          <button
            onClick={handleOpenPaymentLink}
            className={`w-full py-3.5 px-4 rounded-2xl ${
              isLimitReached
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40'
            } font-bold text-sm flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]`}
          >
            <span>Obtener Pase Ilimitado (Pago Único, sin cobros por consulta)</span>
            <ExternalLink className="w-4 h-4" />
          </button>

          <p className="text-[11px] text-center text-slate-400 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Pago seguro con tarjeta, débito o dinero en cuenta
          </p>
        </div>

        {/* Divider */}
        <div className="relative my-5 text-center">
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
                placeholder="Ingresar código (ej: TRADUCEYA)"
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
        <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Las consultas de cortesía se renuevan diariamente</span>

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

