import React, { useState } from 'react';
import {
  X,
  Send,
  MessageSquarePlus,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Heart,
  Loader2,
  Inbox,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { getApiEndpoint } from '../utils/apiConfig';

export type FeedbackType = 'issue' | 'suggestion' | 'praise';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeLanguagePair?: { from: string; to: string };
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  activeLanguagePair,
}) => {
  const [type, setType] = useState<FeedbackType>('issue');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    setSubmitResult(null);

    const payload = {
      type,
      message: message.trim(),
      contact: contact.trim() || undefined,
      activeLanguagePair,
      deviceInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent.slice(0, 150)}` : 'Desconocido',
      url: typeof window !== 'undefined' ? window.location.href : '',
      timestamp: Date.now(),
    };

    try {
      const endpoint = getApiEndpoint('/api/feedback');
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubmitResult({
          ok: true,
          text: '¡Muchas gracias! Tu mensaje ha quedado registrado en el buzón del equipo.',
        });
        setMessage('');
        setContact('');
        setTimeout(() => {
          onClose();
          setSubmitResult(null);
        }, 2500);
      } else {
        setSubmitResult({
          ok: false,
          text: data.error || 'No se pudo enviar el reporte en este momento.',
        });
      }
    } catch (err: any) {
      console.warn('Error sending feedback:', err);
      // Fallback: offer direct mailto if offline or server is unreachable
      const mailtoSubject = encodeURIComponent(`[Buzón Traduce Ya] ${type.toUpperCase()}`);
      const mailtoBody = encodeURIComponent(`${message}\n\nContacto: ${contact || 'No provisto'}\nIdiomas: ${activeLanguagePair?.from} -> ${activeLanguagePair?.to}`);
      window.open(`mailto:tarotistasonline@gmail.com?subject=${mailtoSubject}&body=${mailtoBody}`, '_blank');
      setSubmitResult({
        ok: true,
        text: 'Se abrió tu cliente de correo para enviar tu mensaje directamente a la administradora.',
      });
      setTimeout(() => {
        onClose();
        setSubmitResult(null);
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center">
              <Inbox className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">Buzón de Sugerencias y Reportes</h3>
              <p className="text-[11px] text-slate-400">Ayúdanos a mejorar Traduce Ya</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              ¿Qué tipo de mensaje deseas enviar?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('issue')}
                className={`py-2 px-2 rounded-xl text-xs font-medium border flex flex-col items-center gap-1 transition ${
                  type === 'issue'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span className="text-[11px] font-semibold">Problema o Error</span>
              </button>

              <button
                type="button"
                onClick={() => setType('suggestion')}
                className={`py-2 px-2 rounded-xl text-xs font-medium border flex flex-col items-center gap-1 transition ${
                  type === 'suggestion'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-[11px] font-semibold">Sugerencia</span>
              </button>

              <button
                type="button"
                onClick={() => setType('praise')}
                className={`py-2 px-2 rounded-xl text-xs font-medium border flex flex-col items-center gap-1 transition ${
                  type === 'praise'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                    : 'bg-slate-800/80 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                }`}
              >
                <Heart className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-semibold">Felicitación</span>
              </button>
            </div>
          </div>

          {/* Context tip */}
          {type === 'issue' && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300/90 leading-relaxed">
              ¿La app dejó de responder o no tradujo una frase? Cuéntanos qué estabas intentando traducir para que podamos solucionarlo de inmediato.
            </div>
          )}

          {/* Message Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              {type === 'issue'
                ? 'Describe qué sucedió:'
                : type === 'suggestion'
                ? '¿Qué función o idioma te gustaría agregar?'
                : 'Tu mensaje o experiencia:'}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === 'issue'
                  ? 'Ej: Al intentar traducir de Español a Ruso, la app no reprodujo el audio...'
                  : type === 'suggestion'
                  ? 'Ej: Me gustaría que agreguen un botón de modo oscuro automático...'
                  : 'Ej: Excelente traductor, lo usé en un restaurante y nos entendimos perfecto...'
              }
              rows={4}
              required
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-slate-100 placeholder-slate-500 text-xs resize-none outline-none transition"
            />
          </div>

          {/* Contact Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Tu correo o WhatsApp (opcional):</span>
              <span className="text-[10px] text-slate-500">Para responderte</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="ejemplo@correo.com o +34 600 000 000"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950/80 border border-slate-700 focus:border-cyan-400 text-slate-100 placeholder-slate-500 text-xs outline-none transition"
              />
            </div>
          </div>

          {/* Submit Result Message */}
          {submitResult && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                submitResult.ok
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/50 border-rose-500/40 text-rose-300'
              }`}
            >
              {submitResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span>{submitResult.text}</span>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enviando al buzón...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Enviar Mensaje al Buzón</span>
                </>
              )}
            </button>
          </div>

          <div className="text-[11px] text-center text-slate-500 flex items-center justify-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400/80" />
            <span>Los mensajes se reciben en el buzón seguro de la administradora.</span>
          </div>
        </form>
      </div>
    </div>
  );
};
