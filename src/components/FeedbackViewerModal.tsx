import React, { useState, useEffect } from 'react';
import {
  X,
  Inbox,
  AlertTriangle,
  Lightbulb,
  Heart,
  RefreshCw,
  Clock,
  Mail,
  Trash2,
} from 'lucide-react';
import { getApiEndpoint } from '../utils/apiConfig';

export interface FeedbackItem {
  id: string;
  type: 'issue' | 'suggestion' | 'praise';
  message: string;
  contact?: string;
  activeLanguagePair?: { from: string; to: string };
  deviceInfo?: string;
  timestamp: number;
}

interface FeedbackViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FeedbackViewerModal: React.FC<FeedbackViewerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const endpoint = getApiEndpoint('/api/feedback');
      const res = await fetch(endpoint);
      const data = await res.json();
      if (res.ok && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        setError('No se pudieron cargar los mensajes.');
      }
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-base">Mensajes Recibidos en el Buzón</h3>
              <p className="text-[11px] text-slate-400">Panel de sugerencias y reportes de usuarios</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchItems}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-cyan-400 rounded-full hover:bg-slate-800 transition disabled:opacity-50"
              title="Actualizar mensajes"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {items.length === 0 && !isLoading ? (
            <div className="text-center py-10 space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-300">El buzón está vacío por ahora</p>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Los mensajes, avisos de error o sugerencias que envíen los usuarios aparecerán registrados aquí en tiempo real.
              </p>
            </div>
          ) : (
            items.map((item) => {
              const isIssue = item.type === 'issue';
              const isPraise = item.type === 'praise';
              const dateStr = item.timestamp
                ? new Date(item.timestamp).toLocaleString()
                : 'Reciente';

              return (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border space-y-2 transition ${
                    isIssue
                      ? 'bg-rose-950/20 border-rose-500/30'
                      : isPraise
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-amber-950/20 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-semibold text-[11px] border ${
                        isIssue
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : isPraise
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {isIssue && <AlertTriangle className="w-3 h-3 text-rose-400" />}
                      {isPraise && <Heart className="w-3 h-3 text-emerald-400" />}
                      {!isIssue && !isPraise && <Lightbulb className="w-3 h-3 text-amber-400" />}
                      <span>
                        {isIssue
                          ? 'Reporte de Error'
                          : isPraise
                          ? 'Felicitación'
                          : 'Sugerencia'}
                      </span>
                    </span>

                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{dateStr}</span>
                    </span>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                    {item.message}
                  </p>

                  {(item.contact || item.activeLanguagePair) && (
                    <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      {item.contact && (
                        <div className="flex items-center gap-1 text-cyan-300 font-mono">
                          <Mail className="w-3 h-3" />
                          <span>{item.contact}</span>
                        </div>
                      )}
                      {item.activeLanguagePair && (
                        <span className="text-slate-400">
                          Idiomas:{' '}
                          <span className="text-slate-200 font-semibold">
                            {item.activeLanguagePair.from} → {item.activeLanguagePair.to}
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
