import React, { useState } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  ExternalLink,
  Key,
  ShieldCheck,
  Zap,
  Globe2,
  Volume2,
  Settings,
  Gift,
  Copy,
  Check,
  Send,
  Mail,
  Loader2,
  CreditCard,
} from 'lucide-react';
import {
  DAILY_FREE_LIMIT,
  activateWithCode,
  setCreatorUser,
  isCreatorUser,
  getPaymentConfig,
  savePaymentConfig,
  PRIVATE_CUSTOMER_CODES,
  PaymentConfig,
} from '../utils/licenseManager';
import { getApiEndpoint } from '../utils/apiConfig';

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
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(() => getPaymentConfig());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Payment confirmation / request code drawer
  const [showPaidForm, setShowPaidForm] = useState(false);
  const [payerContact, setPayerContact] = useState('');
  const [payerDetails, setPayerDetails] = useState('PayPal ($5 USD)');
  const [isSendingNotice, setIsSendingNotice] = useState(false);
  const [noticeResult, setNoticeResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Owner config drawer
  const [showConfigLink, setShowConfigLink] = useState(false);
  const [linkSavedMsg, setLinkSavedMsg] = useState(false);

  if (!isOpen) return null;

  const freeRemaining = Math.max(0, DAILY_FREE_LIMIT - usedToday);
  const isLimitReached = freeRemaining === 0;
  const isOwner = isCreatorUser();

  const isPaypalLink = paymentConfig.paypalAccount.trim().startsWith('http');
  const isArsLink = paymentConfig.arsTarget.trim().startsWith('http');

  const handleCopy = (value: string, field: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleApplyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');

    if (!code.trim()) {
      setCodeError('Por favor ingresa tu código de activación.');
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

  const handleSendPaymentNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payerContact.trim()) return;

    setIsSendingNotice(true);
    setNoticeResult(null);

    try {
      const endpoint = getApiEndpoint('/api/feedback');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          contact: payerContact.trim(),
          message: `SOLICITUD DE CÓDIGO PRO ($5 USD / ARS)\nMedio / Comprobante: ${payerDetails.trim()}\nContacto del comprador: ${payerContact.trim()}`,
          url: typeof window !== 'undefined' ? window.location.href : '',
          timestamp: Date.now(),
        }),
      });

      if (res.ok) {
        setNoticeResult({
          ok: true,
          text: '¡Aviso recibido! Verificaremos tu transferencia y te enviaremos tu código de activación a la brevedad.',
        });
        setPayerContact('');
      } else {
        setNoticeResult({
          ok: false,
          text: `No se pudo enviar automáticamente. Escríbenos a ${paymentConfig.contactEmail} con tu comprobante.`,
        });
      }
    } catch {
      setNoticeResult({
        ok: false,
        text: `Error de conexión. Por favor escribe a ${paymentConfig.contactEmail} para recibir tu código.`,
      });
    } finally {
      setIsSendingNotice(false);
    }
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = savePaymentConfig(paymentConfig);
    setPaymentConfig(updated);
    setLinkSavedMsg(true);
    setTimeout(() => setLinkSavedMsg(false), 2500);
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
        <div className="flex items-center gap-2 mb-2 pr-8 flex-wrap">
          {isLimitReached ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Límite gratuito diario completado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Gift className="w-3.5 h-3.5 text-emerald-400" />
              {freeRemaining} de {DAILY_FREE_LIMIT} consultas gratis hoy
            </span>
          )}
          <span className="text-xs text-slate-400 font-mono">
            {usedToday} / {DAILY_FREE_LIMIT} usadas
          </span>
        </div>

        {/* Main Title & Price */}
        <h2 className="text-2xl font-bold tracking-tight text-white mt-1">
          {isLimitReached ? (
            <>
              Desbloquea el <span className="text-amber-400">Pase Ilimitado</span>
            </>
          ) : (
            <>
              ¡Tienes <span className="text-emerald-400">{DAILY_FREE_LIMIT} consultas gratis</span>!
            </>
          )}
        </h2>

        {/* Price Callout Card */}
        <div className="my-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-slate-800/90 to-cyan-500/15 border border-amber-400/40 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-amber-300 font-bold">
              Pase Ilimitado Permanente
            </p>
            <p className="text-xs text-slate-300">
              Pago único · Sin suscripciones mensuales
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xl font-black text-amber-300 leading-none">
              {paymentConfig.usdPriceLabel}
            </p>
            <p className="text-[10px] text-slate-300 mt-1">
              {paymentConfig.arsPriceLabel}
            </p>
          </div>
        </div>

        {/* IMPORTANT CLARIFICATION BOX */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/50 via-slate-850 to-cyan-950/50 border border-emerald-500/30 text-emerald-100 text-xs space-y-1.5 my-3">
          <div className="flex items-center gap-2 font-bold text-emerald-300">
            <Gift className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Sin cobros por cada frase traducida</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-200">
            Tienes <strong>{DAILY_FREE_LIMIT} traducciones gratuitas cada día</strong> para probar la app sin tarjeta. Con el Pase Ilimitado hablas sin límites cuando quieras.
          </p>
        </div>

        {/* Benefits List */}
        <div className="my-3 space-y-2 bg-slate-800/50 border border-slate-700/60 rounded-2xl p-3">
          <div className="flex items-center gap-2.5 text-xs">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-slate-200"><strong>Traducciones ilimitadas</strong> sin cortes en tus viajes o charlas</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs">
            <Volume2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-200"><strong>Voz natural y acento nativo</strong> en más de 100 idiomas</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs">
            <Globe2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="text-slate-200"><strong>Modo Mesa Manos Libres</strong> cara a cara en tiempo real</span>
          </div>
        </div>

        {/* Payment Steps (PayPal Personal & ARS Transfer) */}
        <div className="my-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
            <CreditCard className="w-4 h-4 text-cyan-400" />
            <span>¿Cómo abonar y obtener tu código? (2 pasos)</span>
          </div>

          {/* Step 1: Transfer options */}
          <div className="space-y-2 text-xs">
            <p className="text-[11px] font-semibold text-slate-300">
              1. Transfiere {paymentConfig.usdPriceLabel} ({paymentConfig.arsPriceLabel}):
            </p>

            {/* PayPal Personal option */}
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-blue-300">PayPal Personal (USD)</p>
                <p className="text-xs text-slate-200 font-mono truncate">
                  {paymentConfig.paypalAccount}
                </p>
              </div>
              {isPaypalLink ? (
                <a
                  href={paymentConfig.paypalAccount}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-200 text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                >
                  <span>Ir a PayPal</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCopy(paymentConfig.paypalAccount, 'paypal')}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 text-blue-200 text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                >
                  {copiedField === 'paypal' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copiar email</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Pesos ARG option */}
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-cyan-300">Pesos Argentinos (Transferencia / MP)</p>
                <p className="text-xs text-slate-300 font-mono truncate">
                  {paymentConfig.arsTarget ? paymentConfig.arsTarget : 'Solicitar Alias / Link en el paso 2'}
                </p>
              </div>
              {paymentConfig.arsTarget && (
                isArsLink ? (
                  <a
                    href={paymentConfig.arsTarget}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                  >
                    <span>Pagar</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCopy(paymentConfig.arsTarget, 'ars')}
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-[11px] font-bold flex items-center gap-1 shrink-0 transition"
                  >
                    {copiedField === 'ars' ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copiar Alias</span>
                      </>
                    )}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Step 2: Confirm Payment & Request Code */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowPaidForm(!showPaidForm)}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition active:scale-[0.98]"
            >
              <Send className="w-3.5 h-3.5" />
              <span>2. Ya aboné / Pedir mi código de desbloqueo</span>
            </button>

            {showPaidForm && (
              <form onSubmit={handleSendPaymentNotice} className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 space-y-2.5 animate-fade-in">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Indícanos tu <strong>correo o WhatsApp</strong> y el comprobante o nombre de la transferencia para enviarte tu código al instante:
                </p>
                <input
                  type="text"
                  required
                  value={payerContact}
                  onChange={(e) => setPayerContact(e.target.value)}
                  placeholder="Tu email o WhatsApp para recibir el código"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                <input
                  type="text"
                  value={payerDetails}
                  onChange={(e) => setPayerDetails(e.target.value)}
                  placeholder="Ej: PayPal $5 USD - Comprobante #..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={isSendingNotice || !payerContact.trim()}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isSendingNotice ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <span>Enviar aviso y pedir código</span>
                    )}
                  </button>
                  <a
                    href={`mailto:${paymentConfig.contactEmail}?subject=${encodeURIComponent('Comprobante Traduce Ya PRO ($5 USD)')}&body=${encodeURIComponent(`Hola, acabo de abonar el Pase Ilimitado (${payerDetails}). Mi contacto es: ${payerContact}`)}`}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1"
                    title="Enviar por correo directo"
                  >
                    <Mail className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Email</span>
                  </a>
                </div>
                {noticeResult && (
                  <p className={`text-[11px] leading-relaxed ${noticeResult.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {noticeResult.text}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>

        {/* Continue free button if remaining */}
        {!isLimitReached && (
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <Gift className="w-4 h-4" />
            <span>Seguir probando gratis ({freeRemaining} disponibles hoy)</span>
          </button>
        )}

        {/* Divider */}
        <div className="relative my-4 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative px-3 bg-slate-900 text-xs text-slate-400 uppercase tracking-wider">
            ¿Ya tienes tu código?
          </span>
        </div>

        {/* Code Activation Form (No leaked code example!) */}
        <form onSubmit={handleApplyCode} className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ingresa tu código de activación"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors uppercase font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-colors active:scale-95"
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
            <span>¿Eres la Creadora / Administradora?</span>
          </p>
          <p className="text-[11px] text-slate-300 leading-tight">
            Activa el Modo Creador para traducir sin límites y quedar excluida del contador de visitas.
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
            <span>Activar Modo Creador (Ilimitado)</span>
          </button>
        </div>

        {/* Footer info & owner link config toggle */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Cupo gratuito diario renovable</span>
          </span>

          <button
            type="button"
            onClick={() => setShowConfigLink(!showConfigLink)}
            className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
            title="Configurar datos de cobro (Dueño)"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Datos de cobro</span>
          </button>
        </div>

        {/* Owner Settings drawer */}
        {showConfigLink && (
          <div className="mt-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5 text-xs">
            <p className="font-semibold text-slate-200">
              🛠️ Configuración de Cobro (Vista previa en este dispositivo):
            </p>
            <form onSubmit={handleSaveConfig} className="space-y-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-0.5">
                  Email de PayPal o enlace PayPal.me:
                </label>
                <input
                  type="text"
                  value={paymentConfig.paypalAccount}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, paypalAccount: e.target.value })}
                  placeholder="tu-correo@gmail.com o https://paypal.me/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-0.5">
                  Alias / CVU / Link en Pesos Argentinos:
                </label>
                <input
                  type="text"
                  value={paymentConfig.arsTarget}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, arsTarget: e.target.value })}
                  placeholder="Ej: mi.alias.mp o https://mpago.la/..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400">
                  Para fijarlos globalmente, compárteme tu Alias/PayPal.me.
                </span>
                <button
                  type="submit"
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shrink-0"
                >
                  Guardar
                </button>
              </div>
            </form>
            {linkSavedMsg && (
              <p className="text-emerald-400 text-xs">¡Datos guardados en este dispositivo!</p>
            )}

            {isOwner && (
              <div className="pt-2 border-t border-slate-800 space-y-1">
                <p className="text-[11px] font-bold text-amber-300">
                  🔑 Tus códigos privados para entregar al confirmar pago:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIVATE_CUSTOMER_CODES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCopy(c, c)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-amber-500/30 font-mono text-[10px] text-amber-200"
                      title="Copiar código"
                    >
                      {copiedField === c ? '✓ Copiado' : c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
