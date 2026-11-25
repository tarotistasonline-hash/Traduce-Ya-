import React, { useState } from 'react';
import {
  X,
  Sparkles,
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
  Mail,
  Loader2,
  CreditCard,
  Receipt,
  CheckCircle2,
  Lock,
  Plus,
  Fingerprint,
} from 'lucide-react';
import {
  FREE_TRIAL_LIMIT,
  activateLicenseCode,
  setProSessionToken,
  isAdminAuthenticated,
  fetchAdminStatus,
  claimAdminPasscode,
  loginAdminWithPasscode,
  isBiometricSupported,
  hasLocalBiometricRegistered,
  registerAdminBiometric,
  loginAdminWithBiometric,
  generateCustomerCode,
  fetchCustomerCodes,
  getPaymentConfig,
  savePaymentConfig,
  PaymentConfig,
  AdminStatusResponse,
  getUserApiKey,
  setUserApiKey,
} from '../utils/licenseManager';
import { getApiEndpoint } from '../utils/apiConfig';
import { isValidHttpUrl, sanitizeEmail, sanitizeExternalUrl } from '../utils/urlSecurity';

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
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig>(() => getPaymentConfig());
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Mercado Pago Operation Number verification state
  const [operationId, setOperationId] = useState('');
  const [submittedOpId, setSubmittedOpId] = useState('');
  const [payerContact, setPayerContact] = useState('');
  const [isVerifyingOp, setIsVerifyingOp] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState<{
    type: 'success' | 'pending' | 'error';
    text: string;
  } | null>(null);

  // Optional private code fallback toggle
  const [showCodeBox, setShowCodeBox] = useState(false);
  const [code, setCode] = useState('');
  const [isApplyingCode, setIsApplyingCode] = useState(false);
  const [codeError, setCodeError] = useState('');

  // Verified Admin auth state
  const [isOwner, setIsOwner] = useState(isAdminAuthenticated);
  const [adminStatus, setAdminStatus] = useState<AdminStatusResponse | null>(null);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [bioStatusMsg, setBioStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  // Custom API key visitor input toggle
  const [showApiKeyBox, setShowApiKeyBox] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getUserApiKey());
  const [apiKeySavedMsg, setApiKeySavedMsg] = useState(false);
  const [apiKeyError, setApiKeyError] = useState('');

  // Owner config drawer
  const [showConfigLink, setShowConfigLink] = useState(false);
  const [linkSavedMsg, setLinkSavedMsg] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setIsOwner(isAdminAuthenticated());
    fetchAdminStatus().then((status) => {
      if (!active) return;
      setAdminStatus(status);
      setIsOwner(status.isAuthenticated);
      if (status.isAuthenticated) {
        fetchCustomerCodes().then((res) => {
          if (active && res.ok && res.codes) {
            setGeneratedCodes(res.codes);
          }
        });
      }
    });
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const freeRemaining = Math.max(0, FREE_TRIAL_LIMIT - usedToday);
  const isLimitReached = freeRemaining === 0;

  const safeArsHref = isValidHttpUrl(paymentConfig.arsTarget)
    ? sanitizeExternalUrl(paymentConfig.arsTarget, '#')
    : '#';
  const isArsLink = safeArsHref !== '#';

  const safePaypalHref = isValidHttpUrl(paymentConfig.paypalAccount)
    ? sanitizeExternalUrl(paymentConfig.paypalAccount, '#')
    : '#';
  const isPaypalLink = safePaypalHref !== '#';

  const safeContactEmail = sanitizeEmail(paymentConfig.contactEmail);

  const handleCopy = (value: string, field: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleVerifyOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = operationId.trim().replace(/\D/g, '');
    if (cleaned.length < 6) {
      setVerifyFeedback({
        type: 'error',
        text: 'Ingresa el número de operación completo de tu comprobante de Mercado Pago (solo números).',
      });
      return;
    }

    setSubmittedOpId(cleaned);
    setIsVerifyingOp(true);
    setVerifyFeedback(null);

    try {
      const endpoint = getApiEndpoint('/api/verify-mercadopago');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationId: cleaned,
          contact: payerContact.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.verified && typeof data.proToken === 'string') {
        setProSessionToken(data.proToken);
        setVerifyFeedback({
          type: 'success',
          text: data.message || '¡Pago verificado! Pase Ilimitado activado.',
        });
        setTimeout(() => {
          onActivated();
          onClose();
        }, 900);
        return;
      }

      if (res.ok && data.pendingManualReview) {
        setVerifyFeedback({
          type: 'pending',
          text:
            data.message ||
            `¡Registramos tu número de operación (#${cleaned})! Envíanos este comprobante a ${safeContactEmail} y te responderemos enseguida con tu código de activación.`,
        });
        setOperationId('');
        return;
      }

      if (res.status >= 500) {
        setVerifyFeedback({
          type: 'pending',
          text: `Recibimos tu número de operación (#${cleaned}). Por favor envíanoslo por correo a ${safeContactEmail} para confirmarlo en Mercado Pago y enviarte tu código de activación.`,
        });
        return;
      }

      setVerifyFeedback({
        type: 'error',
        text: data.error || 'No se pudo validar ese número de operación. Verifica tu comprobante.',
      });
    } catch {
      setVerifyFeedback({
        type: 'pending',
        text: `Para activar tu pase enseguida, envíanos tu número de operación (#${cleaned}) a ${safeContactEmail}.`,
      });
    } finally {
      setIsVerifyingOp(false);
    }
  };

  const handleApplyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError('');

    if (!code.trim()) {
      setCodeError('Por favor ingresa tu código de activación.');
      return;
    }

    setIsApplyingCode(true);
    try {
      const result = await activateLicenseCode(code);
      if (result.ok) {
        if (result.role === 'admin') {
          setIsOwner(true);
        }
        onActivated();
        onClose();
      } else {
        setCodeError(result.error || 'Código no válido. Verifica que esté bien escrito.');
      }
    } finally {
      setIsApplyingCode(false);
    }
  };

  const handleBiometricLogin = async () => {
    setIsAdminLoading(true);
    setAdminError('');
    try {
      const res = await loginAdminWithBiometric();
      if (res.ok) {
        setIsOwner(true);
        onActivated();
        onClose();
      } else {
        setAdminError(res.error || 'No se pudo verificar la huella digital.');
      }
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleRegisterBiometric = async () => {
    setIsAdminLoading(true);
    setBioStatusMsg(null);
    try {
      const res = await registerAdminBiometric();
      if (res.ok) {
        setAdminStatus((prev) => (prev ? { ...prev, hasBiometricCred: true } : prev));
        setBioStatusMsg({
          ok: true,
          text: '¡Huella digital / Face ID vinculada correctamente!',
        });
      } else {
        setBioStatusMsg({
          ok: false,
          text: res.error || 'No se pudo vincular la huella digital.',
        });
      }
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleAdminPasscodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    const trimmed = adminPasscode.trim();
    if (!trimmed) {
      setAdminError('Ingresa tu código secreto de 6 números.');
      return;
    }
    if (adminStatus?.needsSetup && !/^\d{6}$/.test(trimmed)) {
      setAdminError('Para configurarlo por primera vez, ingresa exactamente 6 números.');
      return;
    }
    setIsAdminLoading(true);
    try {
      const res = adminStatus?.needsSetup
        ? await claimAdminPasscode(trimmed)
        : await loginAdminWithPasscode(trimmed);
      if (res.ok) {
        setIsOwner(true);
        setAdminPasscode('');
        onActivated();
        onClose();
      } else {
        setAdminError(res.error || 'Código incorrecto.');
      }
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const res = await generateCustomerCode();
      if (res.ok && res.code) {
        setGeneratedCodes((prev) => res.codes || [res.code!, ...prev]);
        handleCopy(res.code, res.code);
      }
    } finally {
      setIsGeneratingCode(false);
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
              Prueba gratuita completada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <Gift className="w-3.5 h-3.5 text-emerald-400" />
              {freeRemaining} de {FREE_TRIAL_LIMIT} frases gratis disponibles
            </span>
          )}
          <span className="text-xs text-slate-400 font-mono">
            {usedToday} / {FREE_TRIAL_LIMIT} usadas
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
              ¡Tienes <span className="text-emerald-400">{FREE_TRIAL_LIMIT} frases gratis</span> de prueba!
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

        {/* Payment + Instant Operation Verification */}
        <div className="my-3 p-3.5 rounded-2xl bg-slate-950/75 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
            <CreditCard className="w-4 h-4 text-cyan-400" />
            <span>Activa tu Pase en 2 pasos con Mercado Pago</span>
          </div>

          {/* Step 1: Pay with Mercado Pago */}
          <div className="space-y-2 text-xs">
            <p className="text-[11px] font-semibold text-slate-300">
              1. Realiza el pago único de {paymentConfig.usdPriceLabel} ({paymentConfig.arsPriceLabel}):
            </p>

            <div className="p-3 rounded-xl bg-slate-900 border border-cyan-500/30 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-bold text-cyan-300">Mercado Pago</p>
                <p className="text-[11px] text-slate-300 truncate">
                  Tarjeta, dinero en cuenta o transferencia
                </p>
              </div>
              {paymentConfig.arsTarget && (
                isArsLink ? (
                  <a
                    href={safeArsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0 transition shadow-md shadow-cyan-500/20"
                  >
                    <span>Pagar ahora</span>
                    <ExternalLink className="w-3.5 h-3.5" />
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

            {/* Optional PayPal if enabled later by owner */}
            {paymentConfig.paypalAccount.trim() && (
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-blue-300">PayPal Personal (USD)</p>
                  <p className="text-xs text-slate-200 font-mono truncate">
                    {paymentConfig.paypalAccount}
                  </p>
                </div>
                {isPaypalLink ? (
                  <a
                    href={safePaypalHref}
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
            )}
          </div>

          {/* Step 2: Enter Mercado Pago Operation Number */}
          <form onSubmit={handleVerifyOperation} className="space-y-2 pt-1 border-t border-slate-800/80">
            <label className="text-[11px] font-semibold text-slate-200 block">
              2. Ingresa tu <span className="text-amber-300">Número de operación</span> de Mercado Pago para desbloquear:
            </label>
            <div className="relative">
              <Receipt className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
              <input
                type="text"
                inputMode="numeric"
                value={operationId}
                onChange={(e) => setOperationId(e.target.value)}
                placeholder="Ej: 12345678901 (figura en tu comprobante)"
                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 font-mono outline-none transition"
              />
            </div>

            <input
              type="text"
              value={payerContact}
              onChange={(e) => setPayerContact(e.target.value)}
              placeholder="Tu email o WhatsApp (opcional, para respaldo)"
              className="w-full bg-slate-900 border border-slate-700/80 focus:border-cyan-400 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
            />

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isVerifyingOp || !operationId.trim()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition active:scale-[0.98] disabled:opacity-50"
              >
                {isVerifyingOp ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verificando pago...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verificar operación y desbloquear</span>
                  </>
                )}
              </button>
              <a
                href={`mailto:${safeContactEmail}?subject=${encodeURIComponent('Comprobante Traduce Ya PRO')}&body=${encodeURIComponent(`Hola, acabo de abonar el Pase Ilimitado. Mi número de operación de Mercado Pago es: ${operationId || submittedOpId || '[pegar número]'}. Mi contacto: ${payerContact}`)}`}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 shrink-0"
                title={`Enviar comprobante a ${safeContactEmail}`}
              >
                <Mail className="w-3.5 h-3.5 text-cyan-400" />
              </a>
            </div>

            {verifyFeedback && (
              <div
                className={`p-3 rounded-xl text-[11px] leading-relaxed border space-y-2 ${
                  verifyFeedback.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : verifyFeedback.type === 'pending'
                    ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-100'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                }`}
              >
                <p>{verifyFeedback.text}</p>
                {verifyFeedback.type === 'pending' && (
                  <a
                    href={`mailto:${safeContactEmail}?subject=${encodeURIComponent(`Comprobante Traduce Ya PRO - Op #${submittedOpId || operationId}`)}&body=${encodeURIComponent(`Hola, acabo de abonar el Pase Ilimitado.\nNúmero de operación de Mercado Pago: ${submittedOpId || operationId || '[pegar número]'}\nMi contacto para recibir el código: ${payerContact || '(responder a este correo)'}`)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Enviar comprobante a {safeContactEmail}</span>
                  </a>
                )}
              </div>
            )}

            <p className="text-[10px] text-slate-400 leading-snug">
              ¿Ya pagaste? Envía el número de operación a{' '}
              <a
                href={`mailto:${safeContactEmail}?subject=${encodeURIComponent('Comprobante Traduce Ya PRO')}&body=${encodeURIComponent(`Hola, acabo de abonar el Pase Ilimitado. Mi número de operación de Mercado Pago es: ${operationId || submittedOpId || '[pegar número]'}. Mi contacto: ${payerContact}`)}`}
                className="text-cyan-300 underline hover:text-white"
              >
                {safeContactEmail}
              </a>{' '}
              para recibir tu código de activación.
            </p>
          </form>
        </div>

        {/* Continue free button if remaining */}
        {!isLimitReached && (
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
          >
            <Gift className="w-4 h-4" />
            <span>Seguir probando gratis ({freeRemaining} restantes)</span>
          </button>
        )}

        {/* Secondary Code / Creator Access Collapsible */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2.5">
          <button
            type="button"
            onClick={() => setShowCodeBox(!showCodeBox)}
            className="w-full text-center text-xs text-slate-400 hover:text-cyan-300 transition flex items-center justify-center gap-1.5"
          >
            <Key className="w-3.5 h-3.5" />
            <span>¿Ya tienes un código especial o eres la administradora?</span>
          </button>

          {showCodeBox && (
            <div className="space-y-3 animate-fade-in">
              <form onSubmit={handleApplyCode} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ingresa tu código de activación"
                    className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 uppercase font-mono"
                  />
                  <button
                    type="submit"
                    disabled={isApplyingCode}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    {isApplyingCode ? 'Validando...' : 'Activar'}
                  </button>
                </div>
                {codeError && (
                  <p className="text-xs text-rose-400 pl-1">{codeError}</p>
                )}
              </form>

              <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-cyan-500/10 border border-amber-500/30 space-y-2">
                <p className="text-xs text-amber-300 font-semibold flex items-center justify-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Acceso Verificado Administradora</span>
                </p>

                {isOwner ? (
                  <div className="space-y-2">
                    <p className="text-[11px] text-emerald-300 text-center font-medium">
                      ✓ Sesión verificada como administradora activa.
                    </p>
                    {isBiometricSupported() && (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          disabled={isAdminLoading}
                          onClick={handleRegisterBiometric}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                        >
                          {isAdminLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Fingerprint className="w-4 h-4 text-emerald-400" />
                          )}
                          <span>
                            {hasLocalBiometricRegistered() || adminStatus?.hasBiometricCred
                              ? 'Actualizar Huella Digital / Face ID'
                              : 'Vincular Huella Digital / Face ID'}
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
                  </div>
                ) : (
                  <div className="space-y-2">
                    {isBiometricSupported() &&
                      (hasLocalBiometricRegistered() || adminStatus?.hasBiometricCred) && (
                        <button
                          type="button"
                          disabled={isAdminLoading}
                          onClick={handleBiometricLogin}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
                        >
                          {isAdminLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Fingerprint className="w-4 h-4 text-emerald-400" />
                          )}
                          <span>Ingresar con Huella Digital / Face ID</span>
                        </button>
                      )}

                    <form onSubmit={handleAdminPasscodeSubmit} className="space-y-1.5">
                      <label className="block text-[10px] text-slate-400">
                        {adminStatus?.needsSetup
                          ? 'Primera vez: crea tu código secreto de 6 números:'
                          : 'Ingresa tu código secreto de 6 números:'}
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          inputMode="numeric"
                          pattern={adminStatus?.needsSetup ? '[0-9]{6}' : undefined}
                          maxLength={adminStatus?.needsSetup ? 6 : 32}
                          value={adminPasscode}
                          onChange={(e) => setAdminPasscode(e.target.value)}
                          placeholder={
                            adminStatus?.needsSetup
                              ? 'Crear código (6 números)'
                              : '•••••• (6 números)'
                          }
                          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono tracking-widest"
                        />
                        <button
                          type="submit"
                          disabled={isAdminLoading}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition disabled:opacity-50 shrink-0"
                        >
                          {adminStatus?.needsSetup ? 'Crear código' : 'Entrar'}
                        </button>
                      </div>
                    </form>

                    {adminError && (
                      <p className="text-[11px] text-rose-400 text-center">{adminError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Custom API Key Collapsible for visitors */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2.5">
          <button
            type="button"
            onClick={() => setShowApiKeyBox(!showApiKeyBox)}
            className="w-full text-center text-xs text-indigo-300 hover:text-indigo-200 transition flex items-center justify-center gap-1.5 font-semibold"
          >
            <Key className="w-3.5 h-3.5 text-indigo-400" />
            <span>¿Tienes tu propia clave gratuita de Gemini (Google AI Studio)?</span>
          </button>

          {showApiKeyBox && (
            <div className="space-y-2.5 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 animate-fade-in text-xs">
              <p className="text-slate-300">
                Ingresa tu propia API Key para tener traducciones ilimitadas sin costo y sin consumir la cuota pública de la app.
              </p>
              <div className="space-y-2">
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-indigo-500/40 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-mono"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const res = setUserApiKey(apiKeyInput);
                      if (!res.ok) {
                        setApiKeyError(res.error || 'Formato inválido de API Key.');
                        setApiKeySavedMsg(false);
                        return;
                      }
                      setApiKeyError('');
                      setApiKeySavedMsg(true);
                      setTimeout(() => {
                        setApiKeySavedMsg(false);
                        onActivated();
                        onClose();
                      }, 1000);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
                  >
                    Usar mi clave (Ilimitado)
                  </button>
                  {getUserApiKey() && (
                    <button
                      type="button"
                      onClick={() => {
                        setUserApiKey('');
                        setApiKeyInput('');
                        setApiKeyError('');
                        setApiKeySavedMsg(false);
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 font-medium transition"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {apiKeyError && (
                  <p className="text-[11px] text-rose-400 font-medium text-center">
                    {apiKeyError}
                  </p>
                )}
                {apiKeySavedMsg && (
                  <p className="text-[11px] text-emerald-400 font-medium text-center">
                    ✅ ¡Clave aplicada! Pase ilimitado activado con tu API Key.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer info & verified owner config toggle */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Prueba gratuita única de {FREE_TRIAL_LIMIT} frases</span>
          </span>

          {isOwner && (
            <button
              type="button"
              onClick={() => setShowConfigLink(!showConfigLink)}
              className="flex items-center gap-1 text-amber-300 hover:text-amber-200 transition-colors"
              title="Configurar datos de cobro y códigos (Administradora)"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Panel Administradora</span>
            </button>
          )}
        </div>

        {/* Verified Owner Settings drawer */}
        {isOwner && showConfigLink && (
          <div className="mt-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2.5 text-xs">
            <p className="font-semibold text-slate-200">
              🛠️ Configuración de Cobro (Administradora):
            </p>
            <form onSubmit={handleSaveConfig} className="space-y-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-0.5">
                  Link o Alias de Mercado Pago:
                </label>
                <input
                  type="text"
                  value={paymentConfig.arsTarget}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, arsTarget: e.target.value })}
                  placeholder="https://mpago.la/224fBsf"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-0.5">
                  Email de PayPal o enlace PayPal.me (opcional, vacío = oculto):
                </label>
                <input
                  type="text"
                  value={paymentConfig.paypalAccount}
                  onChange={(e) => setPaymentConfig({ ...paymentConfig, paypalAccount: e.target.value })}
                  placeholder="Opcional (ej: https://paypal.me/...)"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400">
                  Verificación automática activa al configurar MERCADOPAGO_ACCESS_TOKEN.
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

            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold text-amber-300">
                  🔑 Generar código único para comprador:
                </p>
                <button
                  type="button"
                  disabled={isGeneratingCode}
                  onClick={handleGenerateCode}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition disabled:opacity-50"
                >
                  <Plus className="w-3 h-3" />
                  <span>{isGeneratingCode ? 'Generando...' : 'Nuevo código'}</span>
                </button>
              </div>

              {generatedCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {generatedCodes.slice(0, 8).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCopy(c, c)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-amber-500/30 font-mono text-[10px] text-amber-200"
                      title="Copiar código generado"
                    >
                      {copiedField === c ? '✓ Copiado' : c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
