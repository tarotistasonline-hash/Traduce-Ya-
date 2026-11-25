import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X, Smartphone, Check, MoreVertical } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { sanitizeExternalUrl } from '../utils/urlSecurity';

interface PWAInstallButtonProps {
  variant?: 'header' | 'settings' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>App instalada en tu dispositivo (Modo PWA activo)</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-cyan-200 text-[11px] sm:text-xs font-bold shadow-sm transition active:scale-95 shrink-0"
          title="Instalar aplicación en tu móvil o PC"
        >
          <Download className="w-3.5 h-3.5 text-cyan-300" />
          <span>Instalar</span>
        </button>
      )}

      {variant === 'settings' && (
        <button
          type="button"
          onClick={handleInstallClick}
          className="w-full flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-cyan-950/40 via-slate-800 to-cyan-950/40 border border-cyan-500/40 hover:border-cyan-400 text-left transition group shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100 group-hover:text-cyan-200">
                Instalar como aplicación móvil (PWA)
              </div>
              <div className="text-xs text-slate-400">
                Accede desde tu pantalla de inicio y consulta tu historial sin internet.
              </div>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 font-semibold shrink-0 ml-2">
            Instalar
          </span>
        </button>
      )}

      {/* Guide Modal for iOS Safari or Android Chrome manual install */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-base">
                  Instalar Traduce Ya en tu pantalla
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-300">
              {(() => {
                let inFrame = false;
                try {
                  inFrame = typeof window !== 'undefined' && window.self !== window.top;
                } catch {
                  inFrame = true;
                }
                if (!inFrame) return null;
                return (
                  <div className="p-3 rounded-xl bg-cyan-950/70 border border-cyan-500/40 space-y-2">
                    <p className="text-xs text-cyan-100 leading-snug">
                      Estás dentro de una vista previa integrada (como AI Studio o WhatsApp). Para poder instalarla, primero ábrela directo en Chrome/Safari:
                    </p>
                    <a
                      href={typeof window !== 'undefined' ? sanitizeExternalUrl(window.location.href, '#') : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition"
                    >
                      Abrir en Chrome / pestaña nueva
                    </a>
                  </div>
                );
              })()}

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/50">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </div>
                <div>
                  <p className="font-medium text-slate-100">
                    {isIOS
                      ? 'En Safari, pulsa el botón Compartir'
                      : 'En Chrome (Android/PC), abre el menú o pulsa Compartir'}
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    {isIOS ? (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-cyan-400 inline" /> Icono en la barra inferior de Safari.
                      </>
                    ) : (
                      <>
                        <MoreVertical className="w-3.5 h-3.5 text-cyan-400 inline" /> Botón de los 3 puntos arriba a la derecha.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/50">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </div>
                <div>
                  <p className="font-medium text-slate-100">
                    Selecciona <strong>&quot;Añadir a pantalla de inicio&quot;</strong> o <strong>&quot;Instalar aplicación&quot;</strong>
                  </p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline" /> Si ya la habías instalado o desinstalado antes, esta opción manual siempre funciona.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/50">
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </div>
                <div>
                  <p className="font-medium text-slate-100">
                    ¡Listo para usar como app!
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Se abrirá a pantalla completa y conservará tu historial sin conexión.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
